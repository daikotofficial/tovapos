import { createHash, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { CreditPaymentMethod, SaleTransaction } from '@/lib/pos/types';
import { getPosPool } from '@/lib/server/pos-db';
import {
  assertPermission,
  assertTenantPlanPermission,
  assertSameOrigin,
  errorResponse,
  HttpError,
  requireAuth,
} from '@/lib/server/security';
import { upsertTenantSaleIndex } from '@/lib/server/tenant-indexes';

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    assertPermission(auth, 'credit-sales');
    await assertTenantPlanPermission(auth.tenantId, 'credit-sales');
    const body = (await request.json()) as Record<string, unknown>;
    const saleId = typeof body.saleId === 'string' ? body.saleId : '';
    const amount = Number(body.amount);
    if (!saleId || !Number.isFinite(amount) || amount <= 0) {
      throw new HttpError(400, 'Sale and positive payment amount are required', 'VALIDATION_ERROR');
    }
    const operationId = typeof body.operationId === 'string' ? body.operationId : randomUUID();
    const idempotencyKey = `credit-payment:${operationId}`;
    const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const client = await getPosPool().connect();
    try {
      await client.query('BEGIN');
      const claim = await client.query(
        `INSERT INTO pos_idempotency_keys
          (tenant_id, idempotency_key, operation_type, request_hash)
         VALUES ($1, $2, 'credit-payment', $3)
         ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING idempotency_key`,
        [auth.tenantId, idempotencyKey, hash]
      );
      if (claim.rowCount === 0) {
        const replay = await client.query(
          `SELECT request_hash, response_status, response_body FROM pos_idempotency_keys
           WHERE tenant_id = $1 AND idempotency_key = $2 FOR UPDATE`,
          [auth.tenantId, idempotencyKey]
        );
        if (replay.rows[0]?.request_hash !== hash || !replay.rows[0]?.response_body) {
          throw new HttpError(
            409,
            'Credit payment command conflicts with an existing operation',
            'IDEMPOTENCY_CONFLICT'
          );
        }
        await client.query('COMMIT');
        return NextResponse.json(replay.rows[0].response_body);
      }
      const result = await client.query(
        `SELECT data FROM pos_tenant_sales
         WHERE tenant_id = $1 AND (id = $2 OR transaction_id = $2) FOR UPDATE`,
        [auth.tenantId, saleId]
      );
      const sale = result.rows[0]?.data as SaleTransaction | undefined;
      if (!sale || sale.status !== 'completed') {
        throw new HttpError(404, 'Completed credit sale was not found', 'SALE_NOT_FOUND');
      }
      const due = Number(sale.amountDue ?? 0);
      if (due <= 0 || amount > due) {
        throw new HttpError(
          409,
          'Payment exceeds or has no outstanding balance',
          'PAYMENT_CONFLICT'
        );
      }
      const now = new Date().toISOString();
      const nextDue = Number((due - amount).toFixed(2));
      const method =
        typeof body.method === 'string' &&
        ['cash', 'card', 'mobile', 'bank-transfer', 'split'].includes(body.method)
          ? (body.method as CreditPaymentMethod)
          : 'cash';
      const updated: SaleTransaction = {
        ...sale,
        amountPaid: Number((Number(sale.amountPaid ?? 0) + amount).toFixed(2)),
        amountDue: nextDue,
        paymentStatus: nextDue === 0 ? 'paid' : 'partial',
        creditPayments: [
          ...(sale.creditPayments ?? []),
          {
            id: `credit-payment-${operationId}`,
            amount,
            method,
            recordedAt: now,
            recordedBy: auth.user.name,
            notes: typeof body.notes === 'string' ? body.notes.trim() : undefined,
          },
        ],
        syncStatus: 'synced',
      };
      await client.query(
        `UPDATE pos_tenant_records SET data = $3::jsonb,
          version = version + 1, updated_at = now()
         WHERE tenant_id = $1 AND store_name = 'sales' AND record_id = $2`,
        [auth.tenantId, sale.id, JSON.stringify(updated)]
      );
      await upsertTenantSaleIndex(client, auth.tenantId, { ...updated });
      const responseBody = { sale: updated };
      await client.query(
        `UPDATE pos_idempotency_keys SET response_status = 200, response_body = $3::jsonb,
          completed_at = now() WHERE tenant_id = $1 AND idempotency_key = $2`,
        [auth.tenantId, idempotencyKey, JSON.stringify(responseBody)]
      );
      await client.query(
        `INSERT INTO pos_audit_log
          (tenant_id, user_id, action, entity_type, entity_id, operation_id, after_data, metadata)
         VALUES ($1, $2, 'credit.payment-recorded', 'sale', $3, $4, $5::jsonb, $6::jsonb)`,
        [
          auth.tenantId,
          auth.user.id,
          sale.id,
          operationId,
          JSON.stringify(updated),
          JSON.stringify({ amount }),
        ]
      );
      await client.query('COMMIT');
      return NextResponse.json(responseBody);
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
