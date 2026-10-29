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

type DateBoundary = { value: string; dateOnly: boolean };

function validDateBoundary(value: string | null, label: string): DateBoundary | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) {
    throw new HttpError(400, `${label} must be a valid date and time`, 'INVALID_DATE');
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText ?? 0);
  const minute = Number(minuteText ?? 0);
  const second = Number(secondText ?? 0);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    throw new HttpError(400, `${label} must be a valid date and time`, 'INVALID_DATE');
  }
  return {
    value: `${yearText}-${monthText}-${dayText}${hourText ? `T${hourText}:${minuteText}:${secondText ?? '00'}` : ''}`,
    dateOnly: !hourText,
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    assertTenantActive(auth);
    assertPermission(auth, 'checkout');
    await assertTenantPlanPermission(auth.tenantId, 'checkout');

    const params = request.nextUrl.searchParams;
    const from = validDateBoundary(params.get('from'), 'Start date');
    const to = validDateBoundary(params.get('to'), 'End date');
    const comparableBoundary = (boundary: DateBoundary, end: boolean) => {
      if (!boundary.dateOnly || !end) return boundary.value;
      const date = new Date(`${boundary.value}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + 1);
      return `${date.toISOString().slice(0, 10)}T00:00:00`;
    };
    if (from && to && comparableBoundary(from, false) >= comparableBoundary(to, true)) {
      throw new HttpError(400, 'Start date cannot be after end date', 'INVALID_DATE_RANGE');
    }

    const values: unknown[] = [auth.tenantId, auth.user.id, auth.user.name];
    const reportTimezone = process.env.POS_TIMEZONE ?? 'Africa/Lagos';
    const where = [
      'tenant_id = $1',
      "(data->>'cashierId' = $2 OR (data->>'cashierId' IS NULL AND data->>'cashier' = $3))",
    ];
    if (from) {
      values.push(from.value);
      const fromParam = `$${values.length}`;
      values.push(reportTimezone);
      if (from.dateOnly) {
        where.push(`timestamp >= (${fromParam}::date::timestamp AT TIME ZONE $${values.length})`);
      } else {
        where.push(`timestamp >= (${fromParam}::timestamp AT TIME ZONE $${values.length})`);
      }
    }
    if (to) {
      values.push(to.value);
      const toParam = `$${values.length}`;
      values.push(reportTimezone);
      if (to.dateOnly) {
        where.push(
          `timestamp < ((${toParam}::date + 1)::timestamp AT TIME ZONE $${values.length})`
        );
      } else {
        where.push(`timestamp < (${toParam}::timestamp AT TIME ZONE $${values.length})`);
      }
    }
    const summaryResult = await getPosPool().query(
      `SELECT
         COALESCE(SUM(COALESCE(NULLIF(data->>'grandTotal', '')::numeric, grand_total)), 0)::numeric AS total,
         COALESCE(SUM(CASE
           WHEN COALESCE(NULLIF(data->>'paymentMethod', ''), payment_method) = 'cash' THEN COALESCE(NULLIF(data->>'grandTotal', '')::numeric, grand_total)
           WHEN COALESCE(NULLIF(data->>'paymentMethod', ''), payment_method) = 'split' THEN COALESCE((data->'paymentBreakdown'->>'cash')::numeric, 0)
           ELSE 0
         END), 0)::numeric AS cash,
         COALESCE(SUM(CASE
           WHEN COALESCE(NULLIF(data->>'paymentMethod', ''), payment_method) = 'card' THEN COALESCE(NULLIF(data->>'grandTotal', '')::numeric, grand_total)
           WHEN COALESCE(NULLIF(data->>'paymentMethod', ''), payment_method) = 'split' THEN COALESCE((data->'paymentBreakdown'->>'card')::numeric, 0)
           ELSE 0
         END), 0)::numeric AS card,
         COALESCE(SUM(CASE
           WHEN COALESCE(NULLIF(data->>'paymentMethod', ''), payment_method) = 'bank-transfer' THEN COALESCE(NULLIF(data->>'grandTotal', '')::numeric, grand_total)
           WHEN COALESCE(NULLIF(data->>'paymentMethod', ''), payment_method) = 'split' THEN COALESCE((data->'paymentBreakdown'->>'bank-transfer')::numeric, 0)
           ELSE 0
         END), 0)::numeric AS transfer,
         COALESCE(SUM(CASE
           WHEN COALESCE(NULLIF(data->>'paymentMethod', ''), payment_method) = 'split' THEN COALESCE(NULLIF(data->>'grandTotal', '')::numeric, grand_total)
             - COALESCE((data->'paymentBreakdown'->>'cash')::numeric, 0)
             - COALESCE((data->'paymentBreakdown'->>'card')::numeric, 0)
             - COALESCE((data->'paymentBreakdown'->>'bank-transfer')::numeric, 0)
           WHEN COALESCE(NULLIF(data->>'paymentMethod', ''), payment_method) IN ('cash', 'card', 'bank-transfer') THEN 0
           ELSE COALESCE(NULLIF(data->>'grandTotal', '')::numeric, grand_total)
         END), 0)::numeric AS other
       FROM pos_tenant_sales
       WHERE ${where.join(' AND ')}`,
      values
    );

    values.push(500);
    const result = await getPosPool().query(
      `SELECT data
       FROM pos_tenant_sales
       WHERE ${where.join(' AND ')}
       ORDER BY timestamp DESC, id DESC
       LIMIT $${values.length}`,
      values
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
