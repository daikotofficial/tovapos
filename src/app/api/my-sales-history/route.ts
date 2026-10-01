import { NextRequest, NextResponse } from 'next/server';
import { getPosPool } from '@/lib/server/pos-db';
import {
  assertSameOrigin,
  assertTenantActive,
  assertTenantPlanPermission,
  assertPermission,
  errorResponse,
  HttpError,
  requireAuth,
} from '@/lib/server/security';

function validDate(value: string | null, label: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, `${label} must be a valid date`, 'INVALID_DATE');
  }
  return value;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    assertTenantActive(auth);
    assertPermission(auth, 'checkout');
    await assertTenantPlanPermission(auth.tenantId, 'checkout');

    const params = request.nextUrl.searchParams;
    const from = validDate(params.get('from'), 'Start date');
    const to = validDate(params.get('to'), 'End date');
    if (from && to && from > to) {
      throw new HttpError(400, 'Start date cannot be after end date', 'INVALID_DATE_RANGE');
    }

    const values: unknown[] = [auth.tenantId, auth.user.id, auth.user.name];
    const where = [
      'tenant_id = $1',
      "(data->>'cashierId' = $2 OR (data->>'cashierId' IS NULL AND data->>'cashier' = $3))",
    ];
    if (from) {
      values.push(from);
      where.push(`timestamp >= $${values.length}::date`);
    }
    if (to) {
      values.push(to);
      where.push(`timestamp < ($${values.length}::date + interval '1 day')`);
    }
    const summaryResult = await getPosPool().query(
      `SELECT
         COALESCE(SUM(grand_total), 0)::numeric AS total,
         COALESCE(SUM(CASE
           WHEN payment_method = 'cash' THEN grand_total
           WHEN payment_method = 'split' THEN COALESCE((data->'paymentBreakdown'->>'cash')::numeric, 0)
           ELSE 0
         END), 0)::numeric AS cash,
         COALESCE(SUM(CASE
           WHEN payment_method = 'card' THEN grand_total
           WHEN payment_method = 'split' THEN COALESCE((data->'paymentBreakdown'->>'card')::numeric, 0)
           ELSE 0
         END), 0)::numeric AS card,
         COALESCE(SUM(CASE
           WHEN payment_method = 'bank-transfer' THEN grand_total
           WHEN payment_method = 'split' THEN COALESCE((data->'paymentBreakdown'->>'bank-transfer')::numeric, 0)
           ELSE 0
         END), 0)::numeric AS transfer,
         COALESCE(SUM(CASE
           WHEN payment_method = 'split' THEN grand_total
             - COALESCE((data->'paymentBreakdown'->>'cash')::numeric, 0)
             - COALESCE((data->'paymentBreakdown'->>'card')::numeric, 0)
             - COALESCE((data->'paymentBreakdown'->>'bank-transfer')::numeric, 0)
           WHEN payment_method IN ('cash', 'card', 'bank-transfer') THEN 0
           ELSE grand_total
         END), 0)::numeric AS other
       FROM pos_tenant_sales
       WHERE ${where.join(' AND ')}`,
      values,
    );

    values.push(500);
    const result = await getPosPool().query(
      `SELECT data
       FROM pos_tenant_sales
       WHERE ${where.join(' AND ')}
       ORDER BY timestamp DESC, id DESC
       LIMIT $${values.length}`,
      values,
    );

    const summary = summaryResult.rows[0] ?? {};
    return NextResponse.json({
      rows: result.rows.map((row) => row.data),
      limit: 500,
      summary: {
        total: Number(summary.total ?? 0),
        cash: Number(summary.cash ?? 0),
        card: Number(summary.card ?? 0),
        transfer: Number(summary.transfer ?? 0),
        other: Number(summary.other ?? 0),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  assertSameOrigin(request);
  return GET(request);
}
