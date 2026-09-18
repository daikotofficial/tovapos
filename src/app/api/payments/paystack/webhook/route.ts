import { NextRequest, NextResponse } from 'next/server';
import { finalizePaystackPayment, isValidPaystackSignature } from '@/lib/server/paystack';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  try {
    if (!isValidPaystackSignature(rawBody, request.headers.get('x-paystack-signature'))) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    const body = JSON.parse(rawBody) as { event?: string; data?: { reference?: string; status?: string; amount?: number; currency?: string; paid_at?: string; customer?: { customer_code?: string }; subscription?: { subscription_code?: string } } };
    if (body.event !== 'charge.success' || !body.data?.reference) return NextResponse.json({ received: true });
    await finalizePaystackPayment(body.data.reference, {
      status: String(body.data.status || ''),
      amount: Number(body.data.amount || 0),
      currency: String(body.data.currency || ''),
      paid_at: body.data.paid_at,
      customer: body.data.customer,
      subscription: body.data.subscription,
    });
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Paystack webhook processing failed', error);
    return NextResponse.json({ error: 'Webhook could not be processed' }, { status: 500 });
  }
}
