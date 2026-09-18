import { NextRequest, NextResponse } from 'next/server';
import { initializePaystackCheckout, type BillingCycle, type PaidPlanId } from '@/lib/server/paystack';
import { assertSameOrigin, errorResponse, HttpError, requireAuth } from '@/lib/server/security';
import { getPosPool } from '@/lib/server/pos-db';

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    const body = (await request.json()) as Record<string, unknown>;
    const planId = body.planId;
    const billingCycle = body.billingCycle;
    if (planId !== 'starter' && planId !== 'pro') throw new HttpError(400, 'Choose a supported paid plan.', 'INVALID_PLAN');
    if (billingCycle !== 'monthly' && billingCycle !== 'yearly') throw new HttpError(400, 'Choose monthly or yearly billing.', 'INVALID_BILLING_CYCLE');
    const result = await getPosPool().query(
      `SELECT data FROM pos_tenant_records WHERE tenant_id = $1 AND store_name = 'settings' AND record_id = 'settings' LIMIT 1`,
      [auth.tenantId]
    );
    const settings = (result.rows[0]?.data || {}) as Record<string, unknown>;
    const callback = process.env.PAYSTACK_CALLBACK_URL?.trim() || `${request.nextUrl.origin}/settings?payment=callback`;
    const callbackUrl = new URL(callback);
    callbackUrl.searchParams.set('payment', 'callback');
    const checkout = await initializePaystackCheckout({
      tenantId: auth.tenantId,
      email: auth.user.email || String(settings.email || ''),
      businessName: String(settings.businessName || auth.tenantName),
      planId: planId as PaidPlanId,
      billingCycle: billingCycle as BillingCycle,
      callbackUrl: callbackUrl.toString(),
    });
    return NextResponse.json({ ok: true, ...checkout });
  } catch (error) {
    return errorResponse(error);
  }
}
