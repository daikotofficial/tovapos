import { NextRequest, NextResponse } from 'next/server';
import { getPosPool } from '@/lib/server/pos-db';
import { getSubscriptionPlan } from '@/lib/pos/subscription';
import type { Permission } from '@/lib/pos/types';
import { hashPasswordServer } from '@/lib/server/password';
import {
  assertPermission,
  assertAnyPermission,
  assertSameOrigin,
  assertTenantActive,
  assertTenantPlanPermission,
  errorResponse,
  HttpError,
  publicUser,
  requireAuth,
} from '@/lib/server/security';
import {
  upsertTenantExpenseIndex,
  upsertTenantInventoryIndex,
  upsertTenantSaleIndex,
} from '@/lib/server/tenant-indexes';
import type { AuthContext } from '@/lib/server/security';

const STORE_NAMES = new Set([
  'inventory',
  'stockMovements',
  'sales',
  'users',
  'customers',
  'vendors',
  'expenses',
  'settings',
]);

type PosRecord = Record<string, unknown> & { id?: unknown };
type InventoryCursor = { name: string; id: string };

const READ_PERMISSIONS: Partial<Record<string, Permission[]>> = {
  inventory: ['inventory', 'checkout', 'reports'],
  stockMovements: ['inventory', 'reports'],
  users: ['users'],
  customers: ['customers', 'checkout'],
  vendors: ['vendors', 'inventory'],
  expenses: ['expenses', 'reports'],
};

const WRITE_PERMISSIONS: Partial<Record<string, Permission>> = {
  inventory: 'adjust-stock',
  stockMovements: 'adjust-stock',
  sales: 'checkout',
  users: 'users',
  customers: 'customers',
  vendors: 'vendors',
  expenses: 'expenses',
  settings: 'settings',
};

function getStoreName(request: NextRequest): string {
  const storeName = request.nextUrl.searchParams.get('store') ?? '';
  if (!STORE_NAMES.has(storeName)) {
    throw new HttpError(400, 'Unknown POS store', 'UNKNOWN_STORE');
  }
  return storeName;
}

function prepareRecordForStorage(record: PosRecord): PosRecord {
  const { _expectedUpdatedAt, ...storedRecord } = record;
  return storedRecord;
}

function encodeCursor(cursor: InventoryCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(value: string | null): InventoryCursor | null {
  if (!value) return null;

  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    if (
      decoded &&
      typeof decoded === 'object' &&
      typeof (decoded as InventoryCursor).name === 'string' &&
      typeof (decoded as InventoryCursor).id === 'string'
    ) {
      return decoded as InventoryCursor;
    }
  } catch {
    return null;
  }

  return null;
}

function clampLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(1, Math.min(500, Math.floor(parsed)));
}

function clampOffset(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function authAllows(auth: AuthContext, permission: Permission): boolean {
  return (
    auth.user.role === 'owner' ||
    auth.user.role === 'super-admin' ||
    auth.user.permissions.includes(permission)
  );
}

function protectSaleFinancials(data: Record<string, unknown>, auth: AuthContext) {
  if (authAllows(auth, 'view-cost-price')) return data;
  const items = Array.isArray(data.items)
    ? data.items.map((item) => (item && typeof item === 'object' ? { ...item, unitCost: 0 } : item))
    : data.items;
  return { ...data, items };
}

function protectInventoryFinancials(data: Record<string, unknown>, auth: AuthContext) {
  if (authAllows(auth, 'view-cost-price')) return data;
  const { unitCost: _unitCost, profitMargin: _profitMargin, ...safe } = data;
  return { ...safe, unitCost: 0, profitMargin: 0 };
}

async function getInventoryMetrics(request: NextRequest, auth: AuthContext) {
  const expiryAlertDays = Math.max(
    0,
    Math.min(3650, Math.floor(Number(request.nextUrl.searchParams.get('expiryAlertDays')) || 30))
  );
  const result = await getPosPool().query(
    `
    SELECT
      count(*)::bigint AS total_products,
      coalesce(sum(current_qty), 0)::float8 AS total_units,
      count(*) FILTER (WHERE stock_status IN ('low', 'critical'))::bigint AS low_stock,
      count(*) FILTER (WHERE stock_status = 'critical')::bigint AS critical_stock,
      count(*) FILTER (WHERE stock_status = 'out')::bigint AS out_of_stock,
      count(*) FILTER (WHERE stock_status = 'expired' OR expiry_date < current_date)::bigint AS expired,
      count(*) FILTER (
        WHERE expiry_date >= current_date
          AND expiry_date <= current_date + ($1::int * interval '1 day')
      )::bigint AS expiring_soon,
      coalesce(sum(current_qty * unit_cost), 0)::float8 AS total_value,
      coalesce(sum(current_qty * (selling_price - unit_cost)), 0)::float8 AS potential_profit
    FROM pos_tenant_inventory
    WHERE tenant_id = $2
    `,
    [expiryAlertDays, auth.tenantId]
  );
  const row = result.rows[0] ?? {};

  return NextResponse.json({
    totalProducts: Number(row.total_products ?? 0),
    totalUnits: Number(row.total_units ?? 0),
    lowStock: Number(row.low_stock ?? 0),
    criticalStock: Number(row.critical_stock ?? 0),
    outOfStock: Number(row.out_of_stock ?? 0),
    expired: Number(row.expired ?? 0),
    expiringSoon: Number(row.expiring_soon ?? 0),
    totalValue: authAllows(auth, 'view-cost-price') ? Number(row.total_value ?? 0) : 0,
    potentialProfit: authAllows(auth, 'view-profit') ? Number(row.potential_profit ?? 0) : 0,
  });
}

function appendDateRange(
  params: URLSearchParams,
  column: string,
  values: unknown[],
  where: string[],
  dateCast = false
): void {
  const from = params.get('from');
  if (from) {
    values.push(from);
    where.push(`${column} >= $${values.length}::date`);
  }
  const to = params.get('to');
  if (to) {
    values.push(to);
    where.push(
      dateCast
        ? `${column} <= $${values.length}::date`
        : `${column} < ($${values.length}::date + interval '1 day')`
    );
  }
}

async function getReportRows(request: NextRequest, auth: AuthContext) {
  assertPermission(auth, 'reports');
  const params = request.nextUrl.searchParams;
  const report = params.get('report') ?? 'sales';
  const limit = clampLimit(params.get('limit'));
  const offset = clampOffset(params.get('offset'));
  if (report === 'refunds') assertPermission(auth, 'refunds');
  if (report === 'credit-sales') assertPermission(auth, 'credit-sales');
  if (report === 'expenses') assertPermission(auth, 'expenses');
  const values: unknown[] = [auth.tenantId];
  const where: string[] = ['tenant_id = $1'];

  if (
    report === 'sales' ||
    report === 'credit-sales' ||
    report === 'refunds' ||
    report === 'voided'
  ) {
    appendDateRange(params, 'timestamp', values, where);
    if (report === 'sales') where.push("status = 'completed'");
    if (report === 'credit-sales') {
      where.push("status = 'completed'");
      where.push("(payment_method = 'credit' OR amount_due > 0)");
    }
    if (report === 'refunds') where.push("status = 'refunded'");
    if (report === 'voided') where.push("status = 'voided'");
    values.push(limit, offset);
    const result = await getPosPool().query(
      `
      SELECT data
      FROM pos_tenant_sales
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY timestamp DESC, id DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values
    );
    return NextResponse.json({
      rows: result.rows.map((row) => protectSaleFinancials(row.data, auth)),
      limit,
      offset,
    });
  }

  if (report === 'expenses') {
    appendDateRange(params, 'incurred_at', values, where, true);
    where.push("status = 'recorded'");
    values.push(limit, offset);
    const result = await getPosPool().query(
      `
      SELECT data
      FROM pos_tenant_expenses
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY incurred_at DESC, id DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values
    );
    return NextResponse.json({ rows: result.rows.map((row) => row.data), limit, offset });
  }

  if (report === 'sales-by-product') {
    appendDateRange(params, 'sold_at', values, where);
    values.push(limit, offset);
    const result = await getPosPool().query(
      `
      SELECT
        inventory_item_id AS "inventoryItemId",
        product_name AS name,
        coalesce(sum(quantity), 0)::float8 AS qty,
        coalesce(sum(line_total), 0)::float8 AS revenue,
        coalesce(sum(gross_profit), 0)::float8 AS profit
      FROM pos_tenant_sale_items
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY inventory_item_id, product_name
      ORDER BY revenue DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values
    );
    return NextResponse.json({
      rows: result.rows.map((row) => ({
        ...row,
        profit: authAllows(auth, 'view-profit') ? Number(row.profit ?? 0) : 0,
      })),
      limit,
      offset,
    });
  }

  if (report === 'sales-by-category') {
    appendDateRange(params, 'sold_at', values, where);
    values.push(limit, offset);
    const result = await getPosPool().query(
      `
      SELECT
        category,
        coalesce(sum(quantity), 0)::float8 AS qty,
        coalesce(sum(line_total), 0)::float8 AS revenue,
        coalesce(sum(gross_profit), 0)::float8 AS profit
      FROM pos_tenant_sale_items
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY category
      ORDER BY revenue DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values
    );
    return NextResponse.json({
      rows: result.rows.map((row) => ({
        ...row,
        profit: authAllows(auth, 'view-profit') ? Number(row.profit ?? 0) : 0,
      })),
      limit,
      offset,
    });
  }

  if (report === 'payment-methods') {
    appendDateRange(params, 'timestamp', values, where);
    values.push(limit, offset);
    const result = await getPosPool().query(
      `
      SELECT
        payment_method AS method,
        count(*)::bigint AS count,
        coalesce(sum(grand_total) FILTER (WHERE payment_method <> 'credit'), 0)::float8 AS collected,
        coalesce(sum(amount_due), 0)::float8 AS receivable,
        coalesce(sum(grand_total), 0)::float8 AS total
      FROM pos_tenant_sales
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY payment_method
      ORDER BY total DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values
    );
    return NextResponse.json({ rows: result.rows, limit, offset });
  }

  return NextResponse.json({ rows: [], limit, offset });
}

async function getSalesMetrics(request: NextRequest, auth: AuthContext) {
  const params = request.nextUrl.searchParams;
  const values: unknown[] = [auth.tenantId];
  const salesWhere: string[] = ['tenant_id = $1'];
  appendDateRange(params, 'timestamp', values, salesWhere);
  const rangeSql = `WHERE ${salesWhere.join(' AND ')}`;
  const salesResult = await getPosPool().query(
    `
    SELECT
      count(*) FILTER (WHERE status = 'completed')::bigint AS completed_count,
      count(*) FILTER (WHERE status = 'refunded')::bigint AS refunded_count,
      count(*) FILTER (WHERE status = 'voided')::bigint AS voided_count,
      coalesce(sum(grand_total) FILTER (WHERE status = 'completed'), 0)::float8 AS revenue,
      coalesce(sum(gross_profit) FILTER (WHERE status = 'completed'), 0)::float8 AS gross_profit,
      coalesce(sum(amount_due) FILTER (WHERE status = 'completed'), 0)::float8 AS receivables,
      coalesce(sum(grand_total) FILTER (WHERE status = 'completed' AND payment_method = 'cash'), 0)::float8 AS cash_sales,
      coalesce(sum(grand_total) FILTER (WHERE status = 'completed' AND payment_method <> 'cash'), 0)::float8 AS non_cash_sales
    FROM pos_tenant_sales
    ${rangeSql}
    `,
    values
  );

  const expenseValues: unknown[] = [auth.tenantId];
  const expenseWhere: string[] = ['tenant_id = $1'];
  appendDateRange(params, 'incurred_at', expenseValues, expenseWhere, true);
  const expenseRangeSql = `WHERE ${expenseWhere.join(' AND ')}`;
  const expenseResult = await getPosPool().query(
    `
    SELECT coalesce(sum(amount) FILTER (WHERE status = 'recorded'), 0)::float8 AS expenses
    FROM pos_tenant_expenses
    ${expenseRangeSql}
    `,
    expenseValues
  );
  const expenseCategoryWhere = expenseRangeSql
    ? `${expenseRangeSql} AND status = 'recorded'`
    : "WHERE status = 'recorded'";
  const expenseCategoriesResult = await getPosPool().query(
    `
    SELECT
      category,
      coalesce(sum(amount), 0)::float8 AS amount
    FROM pos_tenant_expenses
    ${expenseCategoryWhere}
    GROUP BY category
    ORDER BY amount DESC
    LIMIT 10
    `,
    expenseValues
  );

  const topProductValues: unknown[] = [auth.tenantId];
  const topProductWhere: string[] = ['tenant_id = $1'];
  appendDateRange(params, 'sold_at', topProductValues, topProductWhere);
  const topProductRangeSql = `WHERE ${topProductWhere.join(' AND ')}`;
  const topProductsResult = await getPosPool().query(
    `
    SELECT
      inventory_item_id AS "inventoryItemId",
      product_name AS name,
      coalesce(sum(quantity), 0)::float8 AS qty,
      coalesce(sum(line_total), 0)::float8 AS revenue,
      coalesce(sum(gross_profit), 0)::float8 AS profit
    FROM pos_tenant_sale_items
    ${topProductRangeSql}
    GROUP BY inventory_item_id, product_name
    ORDER BY revenue DESC
    LIMIT 10
    `,
    topProductValues
  );

  const sales = salesResult.rows[0] ?? {};
  const expenses = Number(expenseResult.rows[0]?.expenses ?? 0);
  const canViewProfit = authAllows(auth, 'view-profit');
  const canViewExpenses = authAllows(auth, 'expenses');
  const grossProfit = canViewProfit ? Number(sales.gross_profit ?? 0) : 0;
  return NextResponse.json({
    completedCount: Number(sales.completed_count ?? 0),
    refundedCount: Number(sales.refunded_count ?? 0),
    voidedCount: Number(sales.voided_count ?? 0),
    revenue: Number(sales.revenue ?? 0),
    grossProfit,
    expenses: canViewExpenses ? expenses : 0,
    netProfit: canViewProfit && canViewExpenses ? grossProfit - expenses : 0,
    receivables: Number(sales.receivables ?? 0),
    cashSales: Number(sales.cash_sales ?? 0),
    nonCashSales: Number(sales.non_cash_sales ?? 0),
    topProducts: topProductsResult.rows.map((row) => ({
      ...row,
      profit: canViewProfit ? Number(row.profit ?? 0) : 0,
    })),
    expenseCategories: canViewExpenses
      ? expenseCategoriesResult.rows.map((row) => [row.category, Number(row.amount ?? 0)])
      : [],
  });
}

async function getSalesPage(request: NextRequest, auth: AuthContext) {
  const limit = clampLimit(request.nextUrl.searchParams.get('limit'));
  const offset = clampOffset(request.nextUrl.searchParams.get('offset'));
  const result = await getPosPool().query(
    `
    SELECT data
    FROM pos_tenant_sales
    WHERE tenant_id = $1
    ORDER BY timestamp DESC, id DESC
    LIMIT $2 OFFSET $3
    `,
    [auth.tenantId, limit, offset]
  );
  return NextResponse.json(result.rows.map((row) => protectSaleFinancials(row.data, auth)));
}

async function getExpensesPage(request: NextRequest, tenantId: string) {
  const limit = clampLimit(request.nextUrl.searchParams.get('limit'));
  const offset = clampOffset(request.nextUrl.searchParams.get('offset'));
  const result = await getPosPool().query(
    `
    SELECT data
    FROM pos_tenant_expenses
    WHERE tenant_id = $1
    ORDER BY incurred_at DESC, id DESC
    LIMIT $2 OFFSET $3
    `,
    [tenantId, limit, offset]
  );
  return NextResponse.json(result.rows.map((row) => row.data));
}

async function getInventoryPage(request: NextRequest, auth: AuthContext) {
  const params = request.nextUrl.searchParams;
  if (params.get('metrics') === 'true') {
    return getInventoryMetrics(request, auth);
  }

  const scan = params.get('scan')?.trim();
  if (scan) {
    const result = await getPosPool().query(
      `
      SELECT data
      FROM pos_tenant_inventory
      WHERE tenant_id = $1
        AND (
          lower(sku) = lower($2)
          OR lower(coalesce(barcode, '')) = lower($2)
          OR lower(name) = lower($2)
          OR lower(name) LIKE '%' || lower($2) || '%'
        )
      ORDER BY
        CASE
          WHEN lower(sku) = lower($2) THEN 0
          WHEN lower(coalesce(barcode, '')) = lower($2) THEN 1
          WHEN lower(name) = lower($2) THEN 2
          ELSE 3
        END,
        lower(name) ASC,
        id ASC
      LIMIT 1
      `,
      [auth.tenantId, scan]
    );

    return NextResponse.json({
      item: result.rows[0]?.data ? protectInventoryFinancials(result.rows[0].data, auth) : null,
    });
  }

  const ids = params.get('ids');
  if (ids) {
    const inventoryIds = ids
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 500);
    const result = await getPosPool().query(
      `
      SELECT data
      FROM pos_tenant_inventory
      WHERE tenant_id = $1 AND id = ANY($2::text[])
      ORDER BY lower(name) ASC, id ASC
      `,
      [auth.tenantId, inventoryIds]
    );

    return NextResponse.json(result.rows.map((row) => protectInventoryFinancials(row.data, auth)));
  }

  const limit = clampLimit(params.get('limit'));
  const offset = clampOffset(params.get('offset'));
  const cursor = decodeCursor(params.get('cursor'));
  const values: unknown[] = [auth.tenantId];
  const where: string[] = ['tenant_id = $1'];

  const q = params.get('q')?.trim();
  if (q) {
    values.push(q);
    const index = values.length;
    where.push(`
      (
        to_tsvector(
          'simple',
          coalesce(name, '') || ' ' ||
          coalesce(generic_name, '') || ' ' ||
          coalesce(sku, '') || ' ' ||
          coalesce(barcode, '') || ' ' ||
          coalesce(batch_lot, '')
        ) @@ plainto_tsquery('simple', $${index})
        OR lower(name) LIKE '%' || lower($${index}) || '%'
        OR lower(generic_name) LIKE '%' || lower($${index}) || '%'
        OR lower(sku) LIKE lower($${index}) || '%'
        OR lower(coalesce(barcode, '')) LIKE lower($${index}) || '%'
        OR lower(batch_lot) LIKE '%' || lower($${index}) || '%'
      )
    `);
  }

  const category = params.get('category');
  if (category && category !== 'all') {
    values.push(category);
    where.push(`category = $${values.length}`);
  }

  const supplier = params.get('supplier');
  if (supplier && supplier !== 'all') {
    values.push(supplier);
    where.push(`supplier = $${values.length}`);
  }

  const status = params.get('status');
  if (status && status !== 'all') {
    if (status === 'low-stock') {
      where.push("stock_status IN ('low', 'critical')");
    } else if (status === 'alerts') {
      const expiryAlertDays = Math.max(
        0,
        Math.min(3650, Number(params.get('expiryAlertDays')) || 30)
      );
      values.push(expiryAlertDays);
      where.push(`
        (
          stock_status IN ('low', 'critical', 'out', 'expired')
          OR (
            expiry_date >= current_date
            AND expiry_date <= current_date + ($${values.length}::int * interval '1 day')
          )
        )
      `);
    } else if (status === 'expiring-soon') {
      const expiryAlertDays = Math.max(
        0,
        Math.min(3650, Number(params.get('expiryAlertDays')) || 30)
      );
      values.push(expiryAlertDays);
      where.push(`
        expiry_date >= current_date
        AND expiry_date <= current_date + ($${values.length}::int * interval '1 day')
      `);
    } else {
      values.push(status);
      where.push(`stock_status = $${values.length}`);
    }
  }

  if (cursor && !params.has('offset')) {
    values.push(cursor.name.toLowerCase(), cursor.id);
    where.push(`(lower(name), id) > ($${values.length - 1}, $${values.length})`);
  }

  values.push(limit + 1);
  const limitIndex = values.length;
  if (params.has('offset')) values.push(offset);
  const offsetSql = params.has('offset') ? `OFFSET $${limitIndex + 1}` : '';
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await getPosPool().query(
    `
    SELECT data, lower(name) AS cursor_name, id
    FROM pos_tenant_inventory
    ${whereSql}
    ORDER BY lower(name) ASC, id ASC
    LIMIT $${limitIndex}
    ${offsetSql}
    `,
    values
  );

  const rows = result.rows.slice(0, limit);
  const last = rows[rows.length - 1];
  const total =
    params.get('includeTotal') === 'true'
      ? Number(
          (
            await getPosPool().query(
              `SELECT count(*)::bigint AS total FROM pos_tenant_inventory ${whereSql}`,
              values.slice(0, params.has('offset') ? -2 : -1)
            )
          ).rows[0]?.total ?? 0
        )
      : undefined;

  return NextResponse.json({
    items: rows.map((row) => protectInventoryFinancials(row.data, auth)),
    nextCursor:
      result.rows.length > limit && last
        ? encodeCursor({ name: last.cursor_name, id: last.id })
        : null,
    limit,
    total,
  });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const storeName = getStoreName(request);
    const planFeature = WRITE_PERMISSIONS[storeName];
    if (planFeature && storeName !== 'users') {
      await assertTenantPlanPermission(auth.tenantId, planFeature);
    }
    const permission = READ_PERMISSIONS[storeName];
    if (storeName === 'users') {
      if (
        auth.user.role !== 'owner' &&
        auth.user.role !== 'super-admin' &&
        !auth.user.permissions.includes('users')
      ) {
        return NextResponse.json([auth.user]);
      }
      const users = await getPosPool().query(
        `SELECT * FROM pos_app_users WHERE tenant_id = $1 ORDER BY lower(name), id`,
        [auth.tenantId]
      );
      return NextResponse.json(users.rows.map(publicUser));
    }
    if (permission) assertAnyPermission(auth, permission);
    if (
      storeName === 'inventory' &&
      (request.nextUrl.searchParams.has('limit') ||
        request.nextUrl.searchParams.has('cursor') ||
        request.nextUrl.searchParams.has('scan') ||
        request.nextUrl.searchParams.has('ids') ||
        request.nextUrl.searchParams.has('metrics') ||
        request.nextUrl.searchParams.has('offset') ||
        request.nextUrl.searchParams.has('q') ||
        request.nextUrl.searchParams.has('category') ||
        request.nextUrl.searchParams.has('supplier') ||
        request.nextUrl.searchParams.has('status'))
    ) {
      return await getInventoryPage(request, auth);
    }
    if (storeName === 'sales' && request.nextUrl.searchParams.get('metrics') === 'true') {
      assertAnyPermission(auth, ['dashboard', 'reports']);
      return await getSalesMetrics(request, auth);
    }
    if (storeName === 'sales' && request.nextUrl.searchParams.has('report')) {
      return await getReportRows(request, auth);
    }
    if (storeName === 'sales' && request.nextUrl.searchParams.has('limit')) {
      assertAnyPermission(auth, ['reports', 'credit-sales', 'refunds']);
      return await getSalesPage(request, auth);
    }
    if (storeName === 'sales') {
      assertAnyPermission(auth, ['reports', 'credit-sales', 'refunds']);
    }
    if (storeName === 'expenses' && request.nextUrl.searchParams.has('limit')) {
      return await getExpensesPage(request, auth.tenantId);
    }

    const result = await getPosPool().query(
      `SELECT data FROM pos_tenant_records
       WHERE tenant_id = $1 AND store_name = $2 ORDER BY updated_at DESC`,
      [auth.tenantId, storeName]
    );

    return NextResponse.json(result.rows.map((row) => row.data));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    assertTenantActive(auth);
    const storeName = getStoreName(request);
    if (['inventory', 'stockMovements', 'sales'].includes(storeName)) {
      throw new HttpError(
        405,
        'Inventory and sales must use validated command endpoints',
        'COMMAND_ENDPOINT_REQUIRED'
      );
    }
    const permission = WRITE_PERMISSIONS[storeName];
    if (permission) {
      assertPermission(auth, permission);
      await assertTenantPlanPermission(auth.tenantId, permission);
    }
    const body = await request.json();
    let records = (Array.isArray(body) ? body : [body]) as PosRecord[];
    if (records.length === 0 || records.length > 500) {
      throw new HttpError(400, 'Write batch must contain 1 to 500 records', 'VALIDATION_ERROR');
    }

    if (storeName === 'users') {
      const savedUsers = [];
      for (const record of records) {
        if (!record?.id || typeof record.id !== 'string') {
          throw new HttpError(400, 'User id is required', 'VALIDATION_ERROR');
        }
        const email = typeof record.email === 'string' ? record.email.trim().toLowerCase() : '';
        const name = typeof record.name === 'string' ? record.name.trim() : '';
        if (!email || !name)
          throw new HttpError(400, 'User name and email are required', 'VALIDATION_ERROR');
        const existing = await getPosPool().query(
          `SELECT * FROM pos_app_users WHERE tenant_id = $1 AND id = $2`,
          [auth.tenantId, record.id]
        );
        const current = existing.rows[0];
        const emailConflict = await getPosPool().query(
          `SELECT 1 FROM pos_app_users
           WHERE lower(email) = $1
             AND NOT (tenant_id = $2 AND id = $3)
           LIMIT 1`,
          [email, auth.tenantId, record.id]
        );
        if (emailConflict.rowCount) {
          throw new HttpError(409, 'An account already uses this email address', 'DUPLICATE_EMAIL');
        }
        const allowedRoles = new Set([
          'super-admin',
          'owner',
          'manager',
          'cashier',
          'inventory',
          'accountant',
          'expense-clerk',
          'auditor',
          'viewer',
        ]);
        const requestedRole =
          typeof record.role === 'string' && allowedRoles.has(record.role)
            ? record.role
            : 'cashier';
        const actingUserIsAdmin = ['owner', 'super-admin'].includes(auth.user.role);
        const protectedRoles = ['owner', 'super-admin', 'manager'];
        if (
          !actingUserIsAdmin &&
          (protectedRoles.includes(requestedRole) || protectedRoles.includes(current?.role))
        ) {
          throw new HttpError(
            403,
            'Only an owner can create or modify owner or manager accounts',
            'ADMIN_ROLE_REQUIRED'
          );
        }
        const requestedPermissions = Array.isArray(record.permissions)
          ? record.permissions.filter(
              (permission): permission is Permission =>
                typeof permission === 'string' &&
                permission !== 'sync-logs' &&
                getSubscriptionPlan('delux').permissions.includes(permission as Permission)
            )
          : [];
        if (
          !actingUserIsAdmin &&
          requestedPermissions.some((permission) => !auth.user.permissions.includes(permission))
        ) {
          throw new HttpError(
            403,
            'You cannot grant permissions that your own account does not have',
            'PERMISSION_ESCALATION_FORBIDDEN'
          );
        }
        const newPassword = typeof record.newPassword === 'string' ? record.newPassword : '';
        if (!current && newPassword.length < 10) {
          throw new HttpError(
            400,
            'New users require a password of at least 10 characters',
            'WEAK_PASSWORD'
          );
        }
        const passwordHash = newPassword
          ? await hashPasswordServer(newPassword)
          : current?.password_hash;
        const pin = typeof record.pin === 'string' ? record.pin.trim() : '';
        const pinHash = pin ? await hashPasswordServer(pin) : (current?.pin_hash ?? null);
        const saved = await getPosPool().query(
          `INSERT INTO pos_app_users (
            tenant_id, id, name, email, phone, role, permissions, status, branch,
            pin_hash, password_hash, password_updated_at, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, nullif($9, ''), $10, $11,
            CASE WHEN $12 THEN now() ELSE NULL END, now(), now())
          ON CONFLICT (tenant_id, id) DO UPDATE SET
            name = EXCLUDED.name,
            email = EXCLUDED.email,
            phone = EXCLUDED.phone,
            role = EXCLUDED.role,
            permissions = EXCLUDED.permissions,
            status = EXCLUDED.status,
            branch = EXCLUDED.branch,
            pin_hash = EXCLUDED.pin_hash,
            password_hash = EXCLUDED.password_hash,
            password_updated_at = CASE WHEN $12 THEN now() ELSE pos_app_users.password_updated_at END,
            updated_at = now()
          RETURNING *`,
          [
            auth.tenantId,
            record.id,
            name,
            email,
            typeof record.phone === 'string' ? record.phone.trim() : '',
            requestedRole,
            JSON.stringify(requestedPermissions),
            record.status === 'suspended' ? 'suspended' : 'active',
            typeof record.branch === 'string' ? record.branch : '',
            pinHash,
            passwordHash,
            Boolean(newPassword),
          ]
        );
        savedUsers.push(publicUser(saved.rows[0]));
      }
      return NextResponse.json({ ok: true, users: savedUsers });
    }

    const client = await getPosPool().connect();

    try {
      await client.query('BEGIN');
      if (storeName === 'settings') {
        const existing = await client.query(
          `SELECT data FROM pos_tenant_records
           WHERE tenant_id = $1 AND store_name = 'settings' AND record_id = 'settings' LIMIT 1`,
          [auth.tenantId]
        );
        const currentSettings = existing.rows[0]?.data;
        records = records.map((record) => ({
          ...record,
          subscriptionPlanId:
            currentSettings?.subscriptionPlanId ?? record.subscriptionPlanId ?? 'starter',
          subscriptionStatus:
            currentSettings?.subscriptionStatus ?? record.subscriptionStatus ?? 'active',
          subscriptionRenewsAt:
            currentSettings?.subscriptionRenewsAt ?? record.subscriptionRenewsAt,
        }));
      }

      if (storeName === 'inventory') {
        const settingsResult = await client.query(
          `SELECT data FROM pos_tenant_records
           WHERE tenant_id = $1 AND store_name = 'settings' AND record_id = 'settings' LIMIT 1`,
          [auth.tenantId]
        );
        const plan = getSubscriptionPlan(settingsResult.rows[0]?.data?.subscriptionPlanId);
        if (plan.productLimit) {
          const existingInventory = await client.query(
            'SELECT count(*)::bigint AS product_count FROM pos_tenant_inventory WHERE tenant_id = $1',
            [auth.tenantId]
          );
          const currentProductCount = Number(existingInventory.rows[0]?.product_count ?? 0);
          const incomingIds = Array.from(
            new Set(records.flatMap((record) => (typeof record.id === 'string' ? [record.id] : [])))
          );
          const existingIncoming = await client.query(
            `
            SELECT id
            FROM pos_tenant_inventory
            WHERE tenant_id = $1 AND id = ANY($2::text[])
            `,
            [auth.tenantId, incomingIds]
          );
          const existingIncomingIds = new Set<string>(
            existingIncoming.rows.map((row) => row.id as string)
          );
          const newProductCount = incomingIds.filter((id) => !existingIncomingIds.has(id)).length;
          if (currentProductCount + newProductCount > plan.productLimit) {
            throw new Error(
              `${plan.name} allows ${plan.productLimit.toLocaleString()} distinct product/batch records. Stock quantities do not count toward this limit.`
            );
          }
        }
      }

      for (const record of records) {
        if (!record?.id || typeof record.id !== 'string') {
          throw new Error('POS record is missing an id');
        }

        if (storeName === 'inventory' && typeof record._expectedUpdatedAt === 'string') {
          const existing = await client.query(
            `
            SELECT data->>'updatedAt' AS updated_at
            FROM pos_tenant_records
            WHERE tenant_id = $1 AND store_name = 'inventory' AND record_id = $2
            FOR UPDATE
            `,
            [auth.tenantId, record.id]
          );
          const currentUpdatedAt = existing.rows[0]?.updated_at;
          if (currentUpdatedAt && currentUpdatedAt !== record._expectedUpdatedAt) {
            throw new Error(
              'Inventory changed while this transaction was being processed. Reload stock and try again.'
            );
          }
        }

        const storedRecord = prepareRecordForStorage(record);
        await client.query(
          `
          INSERT INTO pos_tenant_records (tenant_id, store_name, record_id, data)
          VALUES ($1, $2, $3, $4::jsonb)
          ON CONFLICT (tenant_id, store_name, record_id)
          DO UPDATE SET data = EXCLUDED.data,
            version = pos_tenant_records.version + 1, updated_at = now()
          `,
          [auth.tenantId, storeName, record.id, JSON.stringify(storedRecord)]
        );

        if (storeName === 'inventory') {
          await upsertTenantInventoryIndex(
            client,
            auth.tenantId,
            storedRecord as PosRecord & { id: string }
          );
        }
        if (storeName === 'sales') {
          await upsertTenantSaleIndex(
            client,
            auth.tenantId,
            storedRecord as PosRecord & { id: string }
          );
        }
        if (storeName === 'expenses') {
          await upsertTenantExpenseIndex(
            client,
            auth.tenantId,
            storedRecord as PosRecord & { id: string }
          );
        }
      }
      await client.query(
        `INSERT INTO pos_audit_log
          (tenant_id, user_id, action, entity_type, metadata)
         VALUES ($1, $2, 'records.upserted', $3, $4::jsonb)`,
        [auth.tenantId, auth.user.id, storeName, JSON.stringify({ count: records.length })]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    assertTenantActive(auth);
    const storeName = getStoreName(request);
    if (storeName === 'sales' || storeName === 'stockMovements') {
      throw new HttpError(405, 'Financial records cannot be directly deleted', 'DELETE_FORBIDDEN');
    }
    if (storeName === 'inventory') assertPermission(auth, 'delete-product');
    const permission = WRITE_PERMISSIONS[storeName];
    if (permission && storeName !== 'inventory') {
      assertPermission(auth, permission);
      await assertTenantPlanPermission(auth.tenantId, permission);
    }
    const { id } = await request.json();
    if (!id || typeof id !== 'string') {
      throw new Error('POS record id is required');
    }

    if (storeName === 'users') {
      if (id === auth.user.id) {
        throw new HttpError(400, 'You cannot delete your active account', 'SELF_DELETE');
      }
      const target = await getPosPool().query(
        'SELECT role FROM pos_app_users WHERE tenant_id = $1 AND id = $2',
        [auth.tenantId, id]
      );
      const actingUserIsAdmin = ['owner', 'super-admin'].includes(auth.user.role);
      if (
        !actingUserIsAdmin &&
        ['owner', 'super-admin', 'manager'].includes(target.rows[0]?.role)
      ) {
        throw new HttpError(
          403,
          'Only an owner can delete owner or manager accounts',
          'ADMIN_ROLE_REQUIRED'
        );
      }
      if (['owner', 'super-admin'].includes(target.rows[0]?.role)) {
        const remaining = await getPosPool().query(
          `SELECT count(*)::int AS count FROM pos_app_users
           WHERE tenant_id = $1 AND id <> $2 AND status = 'active'
             AND role IN ('owner', 'super-admin')`,
          [auth.tenantId, id]
        );
        if (Number(remaining.rows[0]?.count ?? 0) < 1) {
          throw new HttpError(400, 'At least one active owner must remain', 'LAST_OWNER');
        }
      }
      await getPosPool().query('DELETE FROM pos_app_users WHERE tenant_id = $1 AND id = $2', [
        auth.tenantId,
        id,
      ]);
      return NextResponse.json({ ok: true });
    }

    const client = await getPosPool().connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `DELETE FROM pos_tenant_records
         WHERE tenant_id = $1 AND store_name = $2 AND record_id = $3`,
        [auth.tenantId, storeName, id]
      );
      if (storeName === 'inventory') {
        await client.query('DELETE FROM pos_tenant_inventory WHERE tenant_id = $1 AND id = $2', [
          auth.tenantId,
          id,
        ]);
      }
      if (storeName === 'sales') {
        await client.query('DELETE FROM pos_tenant_sales WHERE tenant_id = $1 AND id = $2', [
          auth.tenantId,
          id,
        ]);
      }
      if (storeName === 'expenses') {
        await client.query('DELETE FROM pos_tenant_expenses WHERE tenant_id = $1 AND id = $2', [
          auth.tenantId,
          id,
        ]);
      }
      await client.query(
        `INSERT INTO pos_audit_log
          (tenant_id, user_id, action, entity_type, entity_id)
         VALUES ($1, $2, 'record.deleted', $3, $4)`,
        [auth.tenantId, auth.user.id, storeName, id]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
