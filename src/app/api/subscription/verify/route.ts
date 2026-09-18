import { NextRequest, NextResponse } from 'next/server';
import { finalizePaystackPayment, verifyPaystackReference } from '@/lib/server/paystack';
import { assertSameOrigin, errorResponse, requireAuth, HttpError } from '@/lib/server/security';
import { getPosPool } from '@/lib/server/pos-db';

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    const body = (await request.json()) as { reference?: unknown };
    const reference = typeof body.reference === 'string' ? body.reference : '';
    const ownership = await getPosPool().query(
      `SELECT 1 FROM pos_paystack_transactions WHERE reference = $1 AND tenant_id = $2 LIMIT 1`,
      [reference, auth.tenantId]
    );
    if (!ownership.rowCount) throw new HttpError(404, 'Payment transaction was not found.', 'TRANSACTION_NOT_FOUND');
    const payment = await verifyPaystackReference(reference);
    const result = await finalizePaystackPayment(reference, payment);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
