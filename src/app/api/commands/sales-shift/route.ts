import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import {
  assertWritePermission,
  assertSameOrigin,
  assertTenantActive,
  errorResponse,
  HttpError,
  requireAuth,
} from '@/lib/server/security';
import { getPosPool } from '@/lib/server/pos-db';

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function currentBusinessDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.POS_TIMEZONE ?? 'Africa/Lagos',
  }).format(new Date());
}

function cents(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function amountFromCents(value: number): number {
  return value / 100;
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9:_-]{8,160}$/.test(value);
}

type PeriodBoundary = { value: string; dateOnly: boolean };

function validPeriodBoundary(value: unknown, label: string): PeriodBoundary | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new HttpError(400, `${label} is invalid`, 'VALIDATION_ERROR');
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    throw new HttpError(400, `${label} must use YYYY-MM-DDTHH:mm`, 'VALIDATION_ERROR');
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText ?? 0);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw new HttpError(400, `${label} is invalid`, 'VALIDATION_ERROR');
  }
  return {
    value: `${yearText}-${monthText}-${dayText}T${hourText}:${minuteText}:${secondText ?? '00'}`,
    dateOnly: false,
  };
}

function assertPeriod(from: PeriodBoundary | null, to: PeriodBoundary | null): void {
  if (!from || !to) {
    throw new HttpError(400, 'Closing period start and end are required', 'VALIDATION_ERROR');
  }
  if (from.value >= to.value) {
    throw new HttpError(400, 'Closing period start must be before its end', 'VALIDATION_ERROR');
  }
}

function assertSameBusinessDate(
  businessDate: string,
  from: PeriodBoundary | null,
  to: PeriodBoundary | null
): void {
  if (from && from.value.slice(0, 10) !== businessDate) {
    throw new HttpError(
      400,
      "Closing period start must use today's business date",
      'VALIDATION_ERROR'
    );
  }
  if (to && to.value.slice(0, 10) !== businessDate) {
    throw new HttpError(
      400,
      "Closing period end must use today's business date",
      'VALIDATION_ERROR'
    );
  }
}

function appendPeriodFilter(
  values: unknown[],
  where: string[],
  from: PeriodBoundary,
  to: PeriodBoundary,
  column = 'timestamp'
): void {
  const timezone = process.env.POS_TIMEZONE ?? 'Africa/Lagos';
  values.push(from.value);
  const fromParam = `$${values.length}`;
  values.push(timezone);
  where.push(`${column} >= (${fromParam}::timestamp AT TIME ZONE $${values.length})`);
  values.push(to.value);
  const toParam = `$${values.length}`;
  values.push(timezone);
  where.push(`${column} < (${toParam}::timestamp AT TIME ZONE $${values.length})`);
}

function collectedFromSale(data: Record<string, unknown>): number {
  if (data.amountPaid !== undefined && data.amountPaid !== null) {
    const amountPaid = Number(data.amountPaid);
    if (Number.isFinite(amountPaid) && amountPaid >= 0) return amountPaid;
  }
  return Number(data.grandTotal ?? 0);
}

function normalizeCashPayouts(value: unknown, recordedBy: string) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100) {
    throw new HttpError(400, 'Cash payouts are invalid', 'VALIDATION_ERROR');
  }
  return value.map((entry) => {
    const payout = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null;
    const purpose = typeof payout?.purpose === 'string' ? payout.purpose.trim() : '';
    const amount = Number(payout?.amount);
    const method = payout?.method;
    if (
      !purpose ||
      purpose.length > 160 ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !['cash', 'card', 'bank-transfer'].includes(method as string) ||
      amount > 1_000_000_000_000 ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-8
    ) {
      throw new HttpError(
        400,
        'Each cash payout needs a purpose and an amount greater than zero',
        'VALIDATION_ERROR'
      );
    }
    return {
      id: randomUUID(),
      purpose,
      amount,
      method: method as 'cash' | 'card' | 'bank-transfer',
      recordedAt: new Date().toISOString(),
      recordedBy,
    };
  });
}

function payoutTotals(value: unknown) {
  const totals: Record<string, number> = { cash: 0, card: 0, 'bank-transfer': 0 };
  if (!Array.isArray(value)) return totals;
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const payout = entry as Record<string, unknown>;
    const method =
      payout.method === 'card' || payout.method === 'bank-transfer' ? payout.method : 'cash';
    const amount = Number(payout.amount ?? 0);
    if (Number.isFinite(amount) && amount > 0) totals[method] += amount;
  }
  return totals;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    assertTenantActive(auth);
    assertWritePermission(auth, 'checkout');
    const businessDate = request.nextUrl.searchParams.get('businessDate') ?? '';
    if (!validDate(businessDate) || businessDate !== currentBusinessDate())
      throw new HttpError(400, 'Business date is invalid or not today', 'VALIDATION_ERROR');
    const result = await getPosPool().query(
      `SELECT data FROM pos_tenant_records
       WHERE tenant_id = $1 AND store_name = 'salesShifts'
         AND data->>'userId' = $2 AND data->>'businessDate' = $3
       LIMIT 1`,
      [auth.tenantId, auth.user.id, businessDate]
    );
    const shift = result.rows[0]?.data as Record<string, unknown> | undefined;
    if (!shift) return NextResponse.json(null);
    const periodFrom = validPeriodBoundary(
      request.nextUrl.searchParams.get('from'),
      'Period start'
    );
    const periodTo = validPeriodBoundary(request.nextUrl.searchParams.get('to'), 'Period end');
    if (periodFrom || periodTo) {
      assertPeriod(periodFrom, periodTo);
      assertSameBusinessDate(businessDate, periodFrom, periodTo);
    }
    const values: unknown[] = [auth.tenantId, auth.user.id, shift.id];
    const salesWhere = [
      'tenant_id = $1',
      "status = 'completed'",
      "data->>'cashierId' = $2",
      "data->>'shiftId' = $3",
    ];
    if (periodFrom && periodTo) appendPeriodFilter(values, salesWhere, periodFrom, periodTo);
    const sales = await getPosPool().query(
      `SELECT data FROM pos_tenant_sales
       WHERE ${salesWhere.join(' AND ')}`,
      values
    );
    const shiftSalesCount = periodFrom
      ? Number(
          (
            await getPosPool().query(
              `SELECT count(*)::bigint AS count FROM pos_tenant_sales
               WHERE tenant_id = $1 AND status = 'completed'
                 AND data->>'cashierId' = $2 AND data->>'shiftId' = $3`,
              [auth.tenantId, auth.user.id, shift.id]
            )
          ).rows[0]?.count ?? 0
        )
      : sales.rows.length;
    const paymentBreakdown: Record<string, number> = {
      cash: 0,
      card: 0,
      'bank-transfer': 0,
      mobile: 0,
      credit: 0,
    };
    for (const row of sales.rows) {
      const data = row.data as Record<string, unknown>;
      if (
        data.paymentMethod === 'split' &&
        data.paymentBreakdown &&
        typeof data.paymentBreakdown === 'object'
      ) {
        for (const [method, amount] of Object.entries(
          data.paymentBreakdown as Record<string, unknown>
        )) {
          paymentBreakdown[method] = (paymentBreakdown[method] ?? 0) + Number(amount ?? 0);
        }
      } else {
        const method = typeof data.paymentMethod === 'string' ? data.paymentMethod : 'cash';
        paymentBreakdown[method] = (paymentBreakdown[method] ?? 0) + collectedFromSale(data);
      }
    }
    const totalSales = sales.rows.reduce((sum, row) => sum + Number(row.data?.grandTotal ?? 0), 0);
    const cashSales = paymentBreakdown.cash ?? 0;
    const cashPayouts = Array.isArray(shift.cashPayouts) ? shift.cashPayouts : [];
    const payoutTotalByMethod = payoutTotals(cashPayouts);
    const payoutTotal = Object.values(payoutTotalByMethod).reduce((sum, amount) => sum + amount, 0);
    const netPaymentBreakdown = { ...paymentBreakdown };
    for (const method of ['cash', 'card', 'bank-transfer']) {
      netPaymentBreakdown[method] = Math.max(
        0,
        (paymentBreakdown[method] ?? 0) - (payoutTotalByMethod[method] ?? 0)
      );
    }
    return NextResponse.json({
      ...shift,
      closingPeriodFrom: periodFrom?.value,
      closingPeriodTo: periodTo?.value,
      periodComplete: sales.rows.length === shiftSalesCount,
      periodSalesCount: sales.rows.length,
      shiftSalesCount,
      totalSales,
      cashSales,
      paymentBreakdown,
      cashPayouts,
      payoutTotal,
      payoutTotalByMethod,
      netPaymentBreakdown,
      expectedCash: amountFromCents(
        cents(shift.openingCash) + cents(cashSales) - cents(payoutTotalByMethod.cash)
      ),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    assertTenantActive(auth);
    assertWritePermission(auth, 'checkout');
    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action;
    const businessDate = body.businessDate;
    if (
      (action !== 'open' && action !== 'close') ||
      !validDate(businessDate) ||
      businessDate !== currentBusinessDate()
    ) {
      throw new HttpError(400, 'Shift action or business date is invalid', 'VALIDATION_ERROR');
    }
    const requestedShiftId = typeof body.shiftId === 'string' ? body.shiftId : '';
    const shiftId =
      action === 'close' && validId(requestedShiftId)
        ? requestedShiftId
        : `shift-${auth.user.id}-${businessDate}`;
    const client = await getPosPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `sales-shift:${auth.tenantId}:${auth.user.id}:${businessDate}`,
      ]);
      const existing = await client.query(
        `SELECT record_id, data FROM pos_tenant_records
         WHERE tenant_id = $1 AND store_name = 'salesShifts'
           AND data->>'userId' = $2 AND data->>'businessDate' = $3
         ORDER BY CASE WHEN data->>'status' = 'open' THEN 0 ELSE 1 END,
                  data->>'openedAt' DESC, record_id DESC
         LIMIT 1 FOR UPDATE`,
        [auth.tenantId, auth.user.id, businessDate]
      );
      if (action === 'open') {
        if (existing.rows[0]?.data?.status === 'open')
          throw new HttpError(409, 'Sales is already open for today', 'SHIFT_ALREADY_EXISTS');
        const openingCash = Number(body.openingCash);
        const openingPurpose =
          typeof body.openingPurpose === 'string' ? body.openingPurpose.trim() : '';
        if (!Number.isFinite(openingCash) || openingCash < 0 || !openingPurpose) {
          throw new HttpError(
            400,
            'Opening cash and handover purpose are required',
            'VALIDATION_ERROR'
          );
        }
        const shift = {
          id: existing.rows[0] ? `shift-${auth.user.id}-${businessDate}-${randomUUID()}` : shiftId,
          businessDate,
          userId: auth.user.id,
          userName: auth.user.name,
          openingCash,
          openingPurpose,
          openedAt: new Date().toISOString(),
          status: 'open' as const,
        };
        await client.query(
          `INSERT INTO pos_tenant_records (tenant_id, store_name, record_id, data)
           VALUES ($1, 'salesShifts', $2, $3::jsonb)`,
          [auth.tenantId, shift.id, JSON.stringify(shift)]
        );
        await client.query(
          `INSERT INTO pos_audit_log (tenant_id, user_id, action, entity_type, entity_id, after_data)
           VALUES ($1, $2, 'sales.opened', 'salesShift', $3, $4::jsonb)`,
          [auth.tenantId, auth.user.id, shift.id, JSON.stringify(shift)]
        );
        await client.query('COMMIT');
        return NextResponse.json(shift, { status: 201 });
      }

      const shift = existing.rows[0]?.data as Record<string, unknown> | undefined;
      if (shift?.id === shiftId && shift.userId === auth.user.id && shift.status === 'closed') {
        await client.query('COMMIT');
        return NextResponse.json(shift);
      }
      if (
        !shift ||
        shift.id !== shiftId ||
        shift.userId !== auth.user.id ||
        shift.status !== 'open'
      ) {
        throw new HttpError(
          409,
          'This sales shift is not open for the signed-in user',
          'SHIFT_NOT_OPEN'
        );
      }
      const closingCash = Number(body.closingCash);
      if (!Number.isFinite(closingCash) || closingCash < 0) {
        throw new HttpError(400, 'Closing cash is invalid', 'VALIDATION_ERROR');
      }
      const periodFrom = validPeriodBoundary(body.periodFrom, 'Closing period start');
      const periodTo = validPeriodBoundary(body.periodTo, 'Closing period end');
      assertPeriod(periodFrom, periodTo);
      if (!periodFrom || !periodTo) {
        throw new HttpError(400, 'Closing period is required', 'VALIDATION_ERROR');
      }
      assertSameBusinessDate(businessDate, periodFrom, periodTo);
      const sales = await client.query(
        `SELECT data FROM pos_tenant_sales
         WHERE tenant_id = $1 AND status = 'completed'
           AND data->>'cashierId' = $2 AND data->>'shiftId' = $3
           AND timestamp >= ($4::timestamp AT TIME ZONE $5)
           AND timestamp < ($6::timestamp AT TIME ZONE $5)`,
        [
          auth.tenantId,
          auth.user.id,
          shiftId,
          periodFrom.value,
          process.env.POS_TIMEZONE ?? 'Africa/Lagos',
          periodTo.value,
        ]
      );
      const shiftSalesCount = Number(
        (
          await client.query(
            `SELECT count(*)::bigint AS count FROM pos_tenant_sales
             WHERE tenant_id = $1 AND status = 'completed'
               AND data->>'cashierId' = $2 AND data->>'shiftId' = $3`,
            [auth.tenantId, auth.user.id, shiftId]
          )
        ).rows[0]?.count ?? 0
      );
      if (sales.rows.length !== shiftSalesCount) {
        throw new HttpError(
          409,
          'The selected closing period does not include every sale in this shift.',
          'INCOMPLETE_CLOSING_PERIOD'
        );
      }
      const totalSales = sales.rows.reduce(
        (sum, row) => sum + Number(row.data?.grandTotal ?? 0),
        0
      );
      const paymentBreakdown: Record<string, number> = {
        cash: 0,
        card: 0,
        'bank-transfer': 0,
        mobile: 0,
        credit: 0,
      };
      for (const row of sales.rows) {
        const data = row.data as Record<string, unknown>;
        if (
          data.paymentMethod === 'split' &&
          data.paymentBreakdown &&
          typeof data.paymentBreakdown === 'object'
        ) {
          for (const [method, amount] of Object.entries(
            data.paymentBreakdown as Record<string, unknown>
          )) {
            paymentBreakdown[method] = (paymentBreakdown[method] ?? 0) + Number(amount ?? 0);
          }
        } else {
          const method = typeof data.paymentMethod === 'string' ? data.paymentMethod : 'cash';
          paymentBreakdown[method] = (paymentBreakdown[method] ?? 0) + collectedFromSale(data);
        }
      }
      const cashSales = paymentBreakdown.cash ?? 0;
      const cashPayouts = normalizeCashPayouts(body.cashPayouts, auth.user.id);
      const payoutTotalByMethod = payoutTotals(cashPayouts);
      const availableByMethod = {
        cash: Number(shift.openingCash ?? 0) + cashSales,
        card: paymentBreakdown.card ?? 0,
        'bank-transfer': paymentBreakdown['bank-transfer'] ?? 0,
      };
      for (const method of ['cash', 'card', 'bank-transfer'] as const) {
        if (payoutTotalByMethod[method] > availableByMethod[method]) {
          throw new HttpError(
            400,
            `The ${method === 'bank-transfer' ? 'transfer' : method} payout is greater than the amount available`,
            'VALIDATION_ERROR'
          );
        }
      }
      const payoutTotal = Object.values(payoutTotalByMethod).reduce(
        (sum, amount) => sum + amount,
        0
      );
      const expectedCashCents =
        cents(shift.openingCash) + cents(cashSales) - cents(payoutTotalByMethod.cash);
      const expectedCash = amountFromCents(expectedCashCents);
      if (cents(closingCash) !== expectedCashCents) {
        throw new HttpError(
          409,
          'Cash does not balance. Sales cannot be closed until the count matches expected cash.',
          'CASH_OUT_OF_BALANCE'
        );
      }
      const closed = {
        ...shift,
        closingPeriodFrom: periodFrom.value,
        closingPeriodTo: periodTo.value,
        periodComplete: true,
        periodSalesCount: sales.rows.length,
        shiftSalesCount,
        totalSales,
        cashSales,
        paymentBreakdown,
        cashPayouts,
        payoutTotal,
        payoutTotalByMethod,
        netPaymentBreakdown: Object.fromEntries(
          Object.entries(paymentBreakdown).map(([method, amount]) => [
            method,
            Math.max(0, amount - (payoutTotalByMethod[method] ?? 0)),
          ])
        ),
        expectedCash,
        closingCash,
        cashVariance: 0,
        closedAt: new Date().toISOString(),
        status: 'closed' as const,
      };
      await client.query(
        `UPDATE pos_tenant_records SET data = $3::jsonb, version = version + 1, updated_at = now()
         WHERE tenant_id = $1 AND store_name = 'salesShifts' AND record_id = $2`,
        [auth.tenantId, shiftId, JSON.stringify(closed)]
      );
      await client.query(
        `INSERT INTO pos_audit_log (tenant_id, user_id, action, entity_type, entity_id, after_data)
         VALUES ($1, $2, 'sales.closed', 'salesShift', $3, $4::jsonb)`,
        [auth.tenantId, auth.user.id, shiftId, JSON.stringify(closed)]
      );
      await client.query('COMMIT');
      return NextResponse.json(closed);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return errorResponse(error);
  }
}
