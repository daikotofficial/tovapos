import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import {
  assertPermission,
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
  return new Intl.DateTimeFormat('en-CA', { timeZone: process.env.POS_TIMEZONE ?? 'Africa/Lagos' }).format(new Date());
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9:_-]{8,160}$/.test(value);
}

function cashFromSale(data: Record<string, unknown>): number {
  if (data.paymentMethod === 'cash') return Number(data.grandTotal ?? 0);
  if (data.paymentMethod === 'split') {
    const breakdown = data.paymentBreakdown;
    return breakdown && typeof breakdown === 'object'
      ? Number((breakdown as Record<string, unknown>).cash ?? 0)
      : 0;
  }
  return 0;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    assertTenantActive(auth);
    assertPermission(auth, 'checkout');
    const businessDate = request.nextUrl.searchParams.get('businessDate') ?? '';
    if (!validDate(businessDate) || businessDate !== currentBusinessDate()) throw new HttpError(400, 'Business date is invalid or not today', 'VALIDATION_ERROR');
    const result = await getPosPool().query(
      `SELECT data FROM pos_tenant_records
       WHERE tenant_id = $1 AND store_name = 'salesShifts'
         AND data->>'userId' = $2 AND data->>'businessDate' = $3
       LIMIT 1`,
      [auth.tenantId, auth.user.id, businessDate]
    );
    const shift = result.rows[0]?.data as Record<string, unknown> | undefined;
    if (!shift) return NextResponse.json(null);
    const sales = await getPosPool().query(
      `SELECT data FROM pos_tenant_records
       WHERE tenant_id = $1 AND store_name = 'sales'
         AND data->>'status' = 'completed'
         AND data->>'cashierId' = $2
         AND data->>'shiftId' = $3`,
      [auth.tenantId, auth.user.id, shift.id]
    );
    const paymentBreakdown: Record<string, number> = { cash: 0, card: 0, 'bank-transfer': 0, mobile: 0, credit: 0 };
    for (const row of sales.rows) {
      const data = row.data as Record<string, unknown>;
      if (data.paymentMethod === 'split' && data.paymentBreakdown && typeof data.paymentBreakdown === 'object') {
        for (const [method, amount] of Object.entries(data.paymentBreakdown as Record<string, unknown>)) {
          paymentBreakdown[method] = (paymentBreakdown[method] ?? 0) + Number(amount ?? 0);
        }
      } else {
        const method = typeof data.paymentMethod === 'string' ? data.paymentMethod : 'cash';
        paymentBreakdown[method] = (paymentBreakdown[method] ?? 0) + Number(data.grandTotal ?? 0);
      }
    }
    const totalSales = sales.rows.reduce((sum, row) => sum + Number(row.data?.grandTotal ?? 0), 0);
    const cashSales = paymentBreakdown.cash ?? 0;
    return NextResponse.json({
      ...shift,
      totalSales,
      cashSales,
      paymentBreakdown,
      expectedCash: Number(shift.openingCash ?? 0) + cashSales,
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
    assertPermission(auth, 'checkout');
    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action;
    const businessDate = body.businessDate;
    if ((action !== 'open' && action !== 'close') || !validDate(businessDate) || businessDate !== currentBusinessDate()) {
      throw new HttpError(400, 'Shift action or business date is invalid', 'VALIDATION_ERROR');
    }
    const shiftId = `shift-${auth.user.id}-${businessDate}`;
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
         LIMIT 1 FOR UPDATE`,
        [auth.tenantId, auth.user.id, businessDate]
      );
      if (action === 'open') {
        if (existing.rows[0]) throw new HttpError(409, 'Sales has already been opened or closed for today', 'SHIFT_ALREADY_EXISTS');
        const openingCash = Number(body.openingCash);
        const openingPurpose = typeof body.openingPurpose === 'string' ? body.openingPurpose.trim() : '';
        if (!Number.isFinite(openingCash) || openingCash < 0 || !openingPurpose) {
          throw new HttpError(400, 'Opening cash and handover purpose are required', 'VALIDATION_ERROR');
        }
        const shift = {
          id: shiftId,
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
          [auth.tenantId, shiftId, JSON.stringify(shift)]
        );
        await client.query(
          `INSERT INTO pos_audit_log (tenant_id, user_id, action, entity_type, entity_id, after_data)
           VALUES ($1, $2, 'sales.opened', 'salesShift', $3, $4::jsonb)`,
          [auth.tenantId, auth.user.id, shiftId, JSON.stringify(shift)]
        );
        await client.query('COMMIT');
        return NextResponse.json(shift, { status: 201 });
      }

      const shift = existing.rows[0]?.data as Record<string, unknown> | undefined;
      if (shiftId !== `shift-${auth.user.id}-${businessDate}`) throw new HttpError(409, 'Shift ownership is invalid', 'SHIFT_NOT_OPEN');
      if (!shift || shift.userId !== auth.user.id || shift.status !== 'open') {
        throw new HttpError(409, 'This sales shift is not open for the signed-in user', 'SHIFT_NOT_OPEN');
      }
      const closingCash = Number(body.closingCash);
      if (!Number.isFinite(closingCash) || closingCash < 0) {
        throw new HttpError(400, 'Closing cash is invalid', 'VALIDATION_ERROR');
      }
      const sales = await client.query(
        `SELECT data FROM pos_tenant_records
         WHERE tenant_id = $1 AND store_name = 'sales'
           AND data->>'status' = 'completed'
           AND data->>'cashierId' = $2
           AND data->>'shiftId' = $3`,
        [auth.tenantId, auth.user.id, shiftId]
      );
      const totalSales = sales.rows.reduce((sum, row) => sum + Number(row.data?.grandTotal ?? 0), 0);
      const cashSales = sales.rows.reduce((sum, row) => sum + cashFromSale(row.data), 0);
      const expectedCash = Number(shift.openingCash ?? 0) + cashSales;
      if (Math.abs(closingCash - expectedCash) > 0.005) {
        throw new HttpError(409, 'Cash does not balance. Sales cannot be closed until the count matches expected cash.', 'CASH_OUT_OF_BALANCE');
      }
      const closed = {
        ...shift,
        totalSales,
        cashSales,
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
