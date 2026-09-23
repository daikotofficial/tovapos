import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { getSubscriptionPlan, type SubscriptionPlanId } from '@/lib/pos/subscription';
import { deliverAffiliateEvent, queueAffiliateSubscription } from './affiliate';
import { getPosPool } from './pos-db';
import { ensureSecuritySchema } from './security-schema';
import { HttpError } from './security';

export type BillingCycle = 'monthly' | 'yearly';
export type PaidPlanId = Exclude<SubscriptionPlanId, 'delux'>;

const PAYSTACK_URL = 'https://api.paystack.co';
const PAYSTACK_CHANNELS = [
  'card',
  'bank',
  'ussd',
  'qr',
  'mobile_money',
  'bank_transfer',
  'eft',
] as const;

function secret(): string {
  const value = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!value || value.length < 20) {
    throw new HttpError(503, 'Paystack billing is not configured yet.', 'PAYMENTS_NOT_CONFIGURED');
  }
  return value;
}

export function planPriceMinor(planId: PaidPlanId, cycle: BillingCycle): number {
  const plan = getSubscriptionPlan(planId);
  if (typeof plan.monthlyPrice !== 'number') {
    throw new HttpError(400, 'This plan requires a custom quote.', 'CUSTOM_PLAN');
  }
  const naira = cycle === 'yearly' ? Math.round(plan.monthlyPrice * 12 * 0.95) : plan.monthlyPrice;
  return naira * 100;
}

async function paystackRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${PAYSTACK_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret()}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: T;
  } | null;
  if (!response.ok || !body?.status || !body.data) {
    throw new HttpError(
      502,
      body?.message || 'Paystack could not complete the request.',
      'PAYSTACK_ERROR'
    );
  }
  return body.data;
}

export async function initializePaystackCheckout(input: {
  tenantId: string;
  email: string;
  businessName: string;
  planId: PaidPlanId;
  billingCycle: BillingCycle;
  callbackUrl: string;
}) {
  await ensureSecuritySchema();
  const reference = `tovapos-${input.tenantId}-${randomUUID()}`;
  const amountMinor = planPriceMinor(input.planId, input.billingCycle);
  const data = await paystackRequest<{
    authorization_url: string;
    access_code: string;
    reference: string;
  }>('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      amount: amountMinor,
      currency: 'NGN',
      channels: [...PAYSTACK_CHANNELS],
      reference,
      callback_url: input.callbackUrl,
      metadata: {
        product: 'tovapos',
        tenantId: input.tenantId,
        planId: input.planId,
        billingCycle: input.billingCycle,
        businessName: input.businessName,
        paymentType: 'one_time_subscription_payment',
      },
    }),
  });
  await getPosPool().query(
    `INSERT INTO pos_paystack_transactions
      (reference, tenant_id, plan_id, billing_cycle, amount_minor, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (reference) DO NOTHING`,
    [
      reference,
      input.tenantId,
      input.planId,
      input.billingCycle,
      amountMinor,
      JSON.stringify({ paymentType: 'one_time_subscription_payment' }),
    ]
  );
  return { ...data, reference, amountMinor };
}

export async function verifyPaystackReference(reference: string) {
  if (!/^tovapos-[A-Za-z0-9_-]{8,220}$/.test(reference)) {
    throw new HttpError(400, 'Payment reference is invalid.', 'INVALID_REFERENCE');
  }
  return paystackRequest<{
    status: string;
    reference: string;
    amount: number;
    currency: string;
    paid_at?: string;
    customer?: { email?: string; customer_code?: string };
    subscription?: { subscription_code?: string };
  }>(`/transaction/verify/${encodeURIComponent(reference)}`, { method: 'GET' });
}

function expiryForCycle(cycle: BillingCycle, paidAt: Date): Date {
  const next = new Date(paidAt);
  if (cycle === 'yearly') next.setUTCFullYear(next.getUTCFullYear() + 1);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

export async function finalizePaystackPayment(
  reference: string,
  data: {
    status: string;
    amount: number;
    currency: string;
    paid_at?: string;
    customer?: { customer_code?: string };
    subscription?: { subscription_code?: string };
  }
): Promise<{ tenantId: string; expiresAt: string; alreadyProcessed: boolean }> {
  if (data.status !== 'success')
    throw new HttpError(400, 'Paystack payment was not successful.', 'PAYMENT_NOT_SUCCESSFUL');
  await ensureSecuritySchema();
  const client = await getPosPool().connect();
  try {
    await client.query('BEGIN');
    const transaction = await client.query(
      `SELECT * FROM pos_paystack_transactions WHERE reference = $1 FOR UPDATE`,
      [reference]
    );
    const row = transaction.rows[0];
    if (!row)
      throw new HttpError(404, 'Payment transaction was not found.', 'TRANSACTION_NOT_FOUND');
    if (
      String(data.currency).toUpperCase() !== 'NGN' ||
      Number(data.amount) !== Number(row.amount_minor)
    ) {
      throw new HttpError(
        400,
        'The verified payment amount does not match this plan.',
        'PAYMENT_MISMATCH'
      );
    }
    if (row.status === 'success' && row.expires_at) {
      await client.query('COMMIT');
      return {
        tenantId: row.tenant_id,
        expiresAt: new Date(row.expires_at).toISOString(),
        alreadyProcessed: true,
      };
    }
    const paidAt = data.paid_at ? new Date(data.paid_at) : new Date();
    const expiresAt = expiryForCycle(row.billing_cycle as BillingCycle, paidAt);
    const settingsResult = await client.query(
      `SELECT data FROM pos_tenant_records WHERE tenant_id = $1 AND store_name = 'settings' AND record_id = 'settings' FOR UPDATE`,
      [row.tenant_id]
    );
    const settings = (settingsResult.rows[0]?.data || {}) as Record<string, unknown>;
    const customer = await client.query(
      `SELECT name, email FROM pos_app_users WHERE tenant_id = $1 AND role = 'owner' ORDER BY created_at LIMIT 1`,
      [row.tenant_id]
    );
    const owner = customer.rows[0];
    const nextSettings = {
      ...settings,
      subscriptionPlanId: row.plan_id,
      subscriptionStatus: 'active',
      subscriptionBillingCycle: row.billing_cycle,
      subscriptionRenewsAt: expiresAt.toISOString(),
      paystackCustomerCode: data.customer?.customer_code || settings.paystackCustomerCode,
      paystackSubscriptionCode:
        data.subscription?.subscription_code || settings.paystackSubscriptionCode,
      updatedAt: new Date().toISOString(),
    };
    await client.query(
      `UPDATE pos_tenant_records SET data = $2::jsonb, version = version + 1, updated_at = now()
       WHERE tenant_id = $1 AND store_name = 'settings' AND record_id = 'settings'`,
      [row.tenant_id, JSON.stringify(nextSettings)]
    );
    await client.query(
      `UPDATE pos_paystack_transactions
       SET status = 'success', customer_code = $2, subscription_code = $3,
           paid_at = $4, expires_at = $5, updated_at = now()
       WHERE reference = $1`,
      [
        reference,
        data.customer?.customer_code || null,
        data.subscription?.subscription_code || null,
        paidAt,
        expiresAt,
      ]
    );
    const referralCode =
      typeof settings.affiliateReferralCode === 'string' ? settings.affiliateReferralCode : '';
    if (referralCode && owner) {
      const eventId = await queueAffiliateSubscription(client, {
        tenantId: row.tenant_id,
        referralCode,
        customerName: String(owner.name || ''),
        companyName: String(settings.businessName || ''),
        email: String(owner.email || settings.email || ''),
        amountMinor: Number(row.amount_minor),
        currency: 'NGN',
        subscriptionExpiresAt: expiresAt.toISOString(),
        paymentReference: reference,
      });
      await client.query('COMMIT');
      void deliverAffiliateEvent(eventId);
      return {
        tenantId: row.tenant_id,
        expiresAt: expiresAt.toISOString(),
        alreadyProcessed: false,
      };
    }
    await client.query('COMMIT');
    return { tenantId: row.tenant_id, expiresAt: expiresAt.toISOString(), alreadyProcessed: false };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function isValidPaystackSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = createHmac('sha512', secret()).update(rawBody).digest('hex');
  const supplied = Buffer.from(signature, 'utf8');
  const actual = Buffer.from(expected, 'utf8');
  return supplied.length === actual.length && timingSafeEqual(supplied, actual);
}
