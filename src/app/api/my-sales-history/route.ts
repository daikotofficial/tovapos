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
    values.push(500);
    const result = await getPosPool().query(
      `SELECT data
       FROM pos_tenant_sales
       WHERE ${where.join(' AND ')}
       ORDER BY timestamp DESC, id DESC
       LIMIT $${values.length}`,
      values,
    );

    return NextResponse.json({ rows: result.rows.map((row) => row.data), limit: 500 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  assertSameOrigin(request);
  return GET(request);
}
