import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(`${process.cwd()}/package.json`);
const { Client } = require('pg');
const fileEnv = fs.existsSync('.env')
  ? Object.fromEntries(
      fs
        .readFileSync('.env', 'utf8')
        .split(/\r?\n/)
        .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
        .map((line) => {
          const index = line.indexOf('=');
          return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, '')];
        })
    )
  : {};
const databaseUrl = process.env.DATABASE_URL || fileEnv.DATABASE_URL;
const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
const stamp = Date.now();
const tenantIds = [];

if (!databaseUrl) throw new Error('DATABASE_URL is required for integration-test cleanup');

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { Origin: baseUrl, ...(options.headers ?? {}) },
  });
  return { response, body: await response.json() };
}

async function register(label) {
  const result = await request('/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': `192.0.2.${label}-${stamp}`,
    },
    body: JSON.stringify({
      businessName: `Security Test ${label} ${stamp}`,
      ownerName: `Owner ${label}`,
      email: `security-${label}-${stamp}@example.test`,
      phone: '08000000000',
      password: 'Strong!Audit123',
    }),
  });
  assert.equal(result.response.status, 201);
  tenantIds.push(result.body.tenant.id);
  const unverifiedLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `security-${label}-${stamp}@example.test`,
      password: 'Strong!Audit123',
      remember: false,
    }),
  });
  assert.equal(unverifiedLogin.response.status, 403);
  assert.equal(unverifiedLogin.body.code, 'EMAIL_NOT_VERIFIED');
  await cleanupClient.query(
    'UPDATE pos_app_users SET email_verified_at = now() WHERE tenant_id = $1',
    [result.body.tenant.id]
  );
  const verifiedLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `security-${label}-${stamp}@example.test`,
      password: 'Strong!Audit123',
      remember: false,
    }),
  });
  assert.equal(verifiedLogin.response.status, 200);
  return {
    cookie: verifiedLogin.response.headers.get('set-cookie').split(';')[0],
    tenant: result.body.tenant,
  };
}

async function authenticated(path, cookie, body, method = body ? 'POST' : 'GET') {
  return request(path, {
    method,
    headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const cleanupClient = new Client({ connectionString: databaseUrl });
await cleanupClient.connect();
try {
  const health = await request('/api/health');
  assert.equal(health.response.status, 200);
  assert.equal(health.body.status, 'ok');
  assert.equal(health.body.database, 'ok');

  const unauthenticated = await request('/api/pos-store?store=users');
  assert.equal(unauthenticated.response.status, 401);
  assert.equal(unauthenticated.body.code, 'UNAUTHENTICATED');

  const [companyA, companyB] = await Promise.all([register('a'), register('b')]);
  assert.notEqual(companyA.tenant.slug, companyB.tenant.slug);
  const duplicateOwnerRegistration = await request('/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': `192.0.2.duplicate-${stamp}`,
    },
    body: JSON.stringify({
      businessName: `Duplicate Security Test ${stamp}`,
      ownerName: 'Duplicate Owner',
      email: `security-a-${stamp}@example.test`,
      phone: '08000000000',
      password: 'Strong!Audit123',
    }),
  });
  assert.equal(duplicateOwnerRegistration.response.status, 409);
  assert.equal(duplicateOwnerRegistration.body.code, 'ACCOUNT_EXISTS');
  let duplicateEmailError;
  try {
    await cleanupClient.query(
      `UPDATE pos_app_users target
       SET email = source.email
       FROM pos_app_users source
       WHERE target.tenant_id = $2 AND source.tenant_id = $1`,
      [companyA.tenant.id, companyB.tenant.id]
    );
  } catch (error) {
    duplicateEmailError = error;
  }
  assert.equal(duplicateEmailError?.code, '23505');
  assert.equal(duplicateEmailError?.constraint, 'pos_app_users_global_email_unique');
  const verificationUser = await cleanupClient.query(
    'SELECT id FROM pos_app_users WHERE tenant_id = $1 LIMIT 1',
    [companyB.tenant.id]
  );
  const verificationToken = randomBytes(32).toString('base64url');
  await cleanupClient.query(
    'UPDATE pos_app_users SET email_verified_at = NULL WHERE tenant_id = $1 AND id = $2',
    [companyB.tenant.id, verificationUser.rows[0].id]
  );
  await cleanupClient.query(
    `INSERT INTO pos_email_verification_tokens
      (id, tenant_id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, now() + interval '24 hours')`,
    [
      randomUUID(),
      companyB.tenant.id,
      verificationUser.rows[0].id,
      createHash('sha256').update(verificationToken).digest('hex'),
    ]
  );
  const verification = await request('/api/auth/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: verificationToken }),
  });
  assert.equal(verification.response.status, 200);
  const verificationReplay = await request('/api/auth/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: verificationToken }),
  });
  assert.equal(verificationReplay.response.status, 400);
  assert.equal(verificationReplay.body.code, 'INVALID_VERIFICATION_TOKEN');
  const emailOnlyLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `security-a-${stamp}@example.test`,
      password: 'Strong!Audit123',
      remember: false,
    }),
  });
  assert.equal(emailOnlyLogin.response.status, 200);
  assert.equal(emailOnlyLogin.body.tenant.id, companyA.tenant.id);
  const nativeLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      Origin: baseUrl,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      email: `security-a-${stamp}@example.test`,
      password: 'Strong!Audit123',
    }),
  });
  assert.equal(nativeLogin.status, 303);
  assert.equal(nativeLogin.headers.get('location'), `${baseUrl}/dashboard`);
  const nativeCookie = nativeLogin.headers.get('set-cookie').split(';')[0];
  const nativeSession = await authenticated('/api/auth/session', nativeCookie);
  assert.equal(nativeSession.response.status, 200);
  assert.equal(nativeSession.body.tenant.id, companyA.tenant.id);
  const unknownLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `missing-${stamp}@example.test`,
      password: 'Wrong!Password123',
      remember: false,
    }),
  });
  assert.equal(unknownLogin.response.status, 401);
  assert.match(unknownLogin.body.error, /email or password is incorrect/i);
  const sharedId = `shared-product-${stamp}`;
  const product = (name) => ({
    id: sharedId,
    name,
    genericName: '',
    sku: `SHARED-SKU-${stamp}`,
    barcode: '',
    category: 'General',
    supplier: '',
    batchLot: '',
    currentQty: 5,
    reorderLevel: 1,
    unitCost: 2,
    sellingPrice: 10,
    expiryDate: '',
    productStatus: 'active',
    stockStatus: 'in-stock',
    updatedAt: new Date().toISOString(),
  });
  const writes = await Promise.all([
    authenticated('/api/commands/stock-adjustment', companyA.cookie, {
      operationId: `create-a-${stamp}`,
      idempotencyKey: `create-a:${stamp}`,
      product: product('Company A Product'),
      quantityDelta: 5,
    }),
    authenticated('/api/commands/stock-adjustment', companyB.cookie, {
      operationId: `create-b-${stamp}`,
      idempotencyKey: `create-b:${stamp}`,
      product: product('Company B Product'),
      quantityDelta: 5,
    }),
  ]);
  assert.deepEqual(
    writes.map((result) => result.response.status),
    [200, 200]
  );
  const [readA, readB, usersA] = await Promise.all([
    authenticated(`/api/pos-store?store=inventory&ids=${sharedId}`, companyA.cookie),
    authenticated(`/api/pos-store?store=inventory&ids=${sharedId}`, companyB.cookie),
    authenticated('/api/pos-store?store=users', companyA.cookie),
  ]);
  assert.equal(readA.body[0].name, 'Company A Product');
  assert.equal(readB.body[0].name, 'Company B Product');
  assert.equal(
    usersA.body.some(
      (user) => user.passwordHash || user.passwordSalt || user.newPassword || user.pin
    ),
    false
  );

  await cleanupClient.query(
    `UPDATE pos_tenant_records
     SET data = jsonb_set(data, '{subscriptionPlanId}', '"pro"'::jsonb, true)
     WHERE tenant_id = $1 AND store_name = 'settings' AND record_id = 'settings'`,
    [companyA.tenant.id]
  );
  const cashierEmail = `cashier-${stamp}@example.test`;
  const cashierCreate = await authenticated(
    '/api/pos-store?store=users',
    companyA.cookie,
    {
      id: `cashier-${stamp}`,
      name: 'Restricted Cashier',
      email: cashierEmail,
      role: 'cashier',
      permissions: ['dashboard', 'checkout'],
      status: 'active',
      pin: '',
      newPassword: 'Strong!Cashier123',
      createdAt: new Date().toISOString(),
    },
    'PUT'
  );
  assert.equal(cashierCreate.response.status, 200);
  const deviceOnlyQueue = await authenticated('/api/pos-store?store=syncQueue', companyA.cookie);
  assert.equal(deviceOnlyQueue.response.status, 400);
  assert.equal(deviceOnlyQueue.body.code, 'UNKNOWN_STORE');

  const managerEmail = `manager-${stamp}@example.test`;
  const managerCreate = await authenticated(
    '/api/pos-store?store=users',
    companyA.cookie,
    {
      id: `manager-${stamp}`,
      name: 'Delegated Manager',
      email: managerEmail,
      role: 'manager',
      permissions: ['users'],
      status: 'active',
      pin: '',
      newPassword: 'Strong!Manager123',
      createdAt: new Date().toISOString(),
    },
    'PUT'
  );
  assert.equal(managerCreate.response.status, 200);
  const managerLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: managerEmail, password: 'Strong!Manager123', remember: false }),
  });
  assert.equal(managerLogin.response.status, 200);
  const managerCookie = managerLogin.response.headers.get('set-cookie').split(';')[0];
  const privilegeEscalation = await authenticated(
    '/api/pos-store?store=users',
    managerCookie,
    {
      id: `escalation-${stamp}`,
      name: 'Escalation Attempt',
      email: `escalation-${stamp}@example.test`,
      role: 'cashier',
      permissions: ['refunds'],
      status: 'active',
      pin: '',
      newPassword: 'Strong!Escalation123',
      createdAt: new Date().toISOString(),
    },
    'PUT'
  );
  assert.equal(privilegeEscalation.response.status, 403);
  assert.equal(privilegeEscalation.body.code, 'PERMISSION_ESCALATION_FORBIDDEN');
  const cashierLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: cashierEmail,
      password: 'Strong!Cashier123',
      remember: false,
    }),
  });
  assert.equal(cashierLogin.response.status, 200);
  const cashierCookie = cashierLogin.response.headers.get('set-cookie').split(';')[0];
  const [cashierRawSales, cashierSalesReport, cashierMetrics] = await Promise.all([
    authenticated('/api/pos-store?store=sales&limit=10', cashierCookie),
    authenticated('/api/pos-store?store=sales&report=sales&limit=10', cashierCookie),
    authenticated('/api/pos-store?store=sales&metrics=true', cashierCookie),
  ]);
  assert.equal(cashierRawSales.response.status, 403);
  assert.equal(cashierSalesReport.response.status, 403);
  assert.equal(cashierMetrics.response.status, 200);
  assert.equal(cashierMetrics.body.grossProfit, 0);
  assert.equal(cashierMetrics.body.expenses, 0);
  assert.equal(cashierMetrics.body.netProfit, 0);
  const forbiddenCreditSale = await authenticated('/api/commands/sale', cashierCookie, {
    operationId: `cashier-credit-${stamp}`,
    idempotencyKey: `cashier-credit:${stamp}`,
    items: [{ inventoryItemId: sharedId, quantity: 1, discount: 0, unitPrice: 10 }],
    paymentMethod: 'credit',
    cashTendered: 0,
  });
  assert.equal(forbiddenCreditSale.response.status, 403);
  assert.equal(forbiddenCreditSale.body.code, 'FORBIDDEN');
  const changedPassword = 'Changed!Cashier456';
  const passwordChange = await authenticated('/api/auth/change-password', cashierCookie, {
    currentPassword: 'Strong!Cashier123',
    newPassword: changedPassword,
  });
  assert.equal(passwordChange.response.status, 200);
  const oldCashierLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: cashierEmail,
      password: 'Strong!Cashier123',
      remember: false,
    }),
  });
  assert.equal(oldCashierLogin.response.status, 401);
  const changedCashierLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: cashierEmail,
      password: changedPassword,
      remember: false,
    }),
  });
  assert.equal(changedCashierLogin.response.status, 200);

  const companyBUser = await cleanupClient.query(
    'SELECT id, email FROM pos_app_users WHERE tenant_id = $1 LIMIT 1',
    [companyB.tenant.id]
  );
  const resetToken = randomBytes(32).toString('base64url');
  await cleanupClient.query(
    `INSERT INTO pos_password_reset_tokens
      (id, tenant_id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, now() + interval '30 minutes')`,
    [
      randomUUID(),
      companyB.tenant.id,
      companyBUser.rows[0].id,
      createHash('sha256').update(resetToken).digest('hex'),
    ]
  );
  const resetPassword = 'Reset!Owner789';
  const completedReset = await request('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: resetToken, password: resetPassword }),
  });
  assert.equal(completedReset.response.status, 200);
  const resetReplay = await request('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: resetToken, password: 'Another!Owner789' }),
  });
  assert.equal(resetReplay.response.status, 400);
  assert.equal(resetReplay.body.code, 'INVALID_RESET_TOKEN');
  const revokedCompanyBSession = await authenticated('/api/auth/session', companyB.cookie);
  assert.equal(revokedCompanyBSession.response.status, 401);
  const resetLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: companyBUser.rows[0].email,
      password: resetPassword,
      remember: false,
    }),
  });
  assert.equal(resetLogin.response.status, 200);

  const forbiddenRefund = await authenticated('/api/commands/refund', cashierCookie, {
    operationId: `cashier-refund-${stamp}`,
    saleId: 'not-authorized',
    reason: 'Permission regression check',
  });
  assert.equal(forbiddenRefund.response.status, 403);
  assert.equal(forbiddenRefund.body.code, 'FORBIDDEN');

  const commands = Array.from({ length: 10 }, (_, index) => ({
    operationId: `sale-${stamp}-${index}`,
    idempotencyKey: `sale:${stamp}:${index}`,
    items: [{ inventoryItemId: sharedId, quantity: 1, discount: 0, unitPrice: 10 }],
    paymentMethod: 'cash',
    cashTendered: 10,
  }));
  const sales = await Promise.all(
    commands.map((command) => authenticated('/api/commands/sale', companyA.cookie, command))
  );
  assert.equal(sales.filter((result) => result.response.status === 201).length, 5);
  assert.equal(sales.filter((result) => result.response.status === 409).length, 5);
  const acceptedIndex = sales.findIndex((result) => result.response.status === 201);
  const replay = await authenticated(
    '/api/commands/sale',
    companyA.cookie,
    commands[acceptedIndex]
  );
  assert.equal(replay.response.status, 201);
  assert.equal(replay.body.sale.transactionId, sales[acceptedIndex].body.sale.transactionId);
  const finalStock = await authenticated(
    `/api/pos-store?store=inventory&ids=${sharedId}`,
    companyA.cookie
  );
  assert.equal(finalStock.body[0].currentQty, 0);

  // Simulate the ordered replay of 20 sales accumulated during a short outage.
  const replayProductId = `offline-replay-${stamp}`;
  const replayProduct = {
    ...product('Offline Replay Product'),
    id: replayProductId,
    sku: `OFFLINE-REPLAY-${stamp}`,
    currentQty: 30,
  };
  const replayProductCreate = await authenticated(
    '/api/commands/stock-adjustment',
    companyA.cookie,
    {
      operationId: `offline-product-${stamp}`,
      idempotencyKey: `offline-product:${stamp}`,
      product: replayProduct,
      quantityDelta: 30,
    }
  );
  assert.equal(replayProductCreate.response.status, 200);
  const offlineSales = [];
  for (let index = 0; index < 20; index += 1) {
    offlineSales.push(
      await authenticated('/api/commands/sale', companyA.cookie, {
        operationId: `offline-sale-${stamp}-${index}`,
        idempotencyKey: `offline-sale:${stamp}:${index}`,
        items: [{ inventoryItemId: replayProductId, quantity: 1, discount: 0, unitPrice: 10 }],
        paymentMethod: 'cash',
        cashTendered: 10,
      })
    );
  }
  assert.equal(
    offlineSales.every((result) => result.response.status === 201),
    true
  );
  assert.equal(new Set(offlineSales.map((result) => result.body.sale.transactionId)).size, 20);
  const replayFinalStock = await authenticated(
    `/api/pos-store?store=inventory&ids=${replayProductId}`,
    companyA.cookie
  );
  assert.equal(replayFinalStock.body[0].currentQty, 10);

  // Ten concurrent stock-manager deltas serialize on the tenant/product row.
  const concurrentStockId = `concurrent-stock-${stamp}`;
  const concurrentProduct = {
    ...product('Concurrent Stock Product'),
    id: concurrentStockId,
    sku: `CONCURRENT-STOCK-${stamp}`,
    currentQty: 0,
  };
  const stockCreate = await authenticated('/api/commands/stock-adjustment', companyA.cookie, {
    operationId: `stock-product-${stamp}`,
    idempotencyKey: `stock-product:${stamp}`,
    product: concurrentProduct,
    quantityDelta: 0,
  });
  assert.equal(stockCreate.response.status, 200);
  const stockAdds = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      authenticated('/api/commands/stock-adjustment', companyA.cookie, {
        operationId: `stock-add-${stamp}-${index}`,
        idempotencyKey: `stock-add:${stamp}:${index}`,
        product: concurrentProduct,
        quantityDelta: 1,
      })
    )
  );
  assert.equal(
    stockAdds.every((result) => result.response.status === 200),
    true
  );
  const concurrentFinalStock = await authenticated(
    `/api/pos-store?store=inventory&ids=${concurrentStockId}`,
    companyA.cookie
  );
  assert.equal(concurrentFinalStock.body[0].currentQty, 10);

  const directWrite = await authenticated(
    '/api/pos-store?store=inventory',
    companyA.cookie,
    product('Bypass attempt'),
    'PUT'
  );
  assert.equal(directWrite.response.status, 405);
  assert.equal(directWrite.body.code, 'COMMAND_ENDPOINT_REQUIRED');
  const logout = await authenticated('/api/auth/logout', cashierCookie, {}, 'POST');
  assert.equal(logout.response.status, 200);
  assert.match(logout.response.headers.get('set-cookie') ?? '', /tovapos_session=;/);
  const loggedOutSession = await authenticated('/api/auth/session', cashierCookie);
  assert.equal(loggedOutSession.response.status, 401);
  console.log(
    'Health, security, tenant isolation, email verification, password recovery, password change, logout revocation, cashier role enforcement, 20-sale replay, idempotency, and stock concurrency checks passed.'
  );
} finally {
  if (tenantIds.length) {
    await cleanupClient.query('DELETE FROM pos_tenants WHERE id = ANY($1::text[])', [tenantIds]);
  }
  await cleanupClient.end();
}
