import { createHash, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { InventoryItem, StockMovement } from '@/lib/pos/types';
import { getPosPool } from '@/lib/server/pos-db';
import {
  assertPermission,
  assertSameOrigin,
  errorResponse,
  HttpError,
  requireAuth,
} from '@/lib/server/security';
import { upsertTenantInventoryIndex } from '@/lib/server/tenant-indexes';

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    assertPermission(auth, 'adjust-stock');
    const body = (await request.json()) as Record<string, unknown>;
    const product = body.product as InventoryItem | undefined;
    if (!product?.id || !product.name?.trim() || !product.sku?.trim()) {
      throw new HttpError(400, 'Product id, name, and SKU are required', 'VALIDATION_ERROR');
    }
    const quantityDelta = Number(body.quantityDelta ?? 0);
    if (!Number.isFinite(quantityDelta)) {
      throw new HttpError(400, 'Stock quantity change is invalid', 'VALIDATION_ERROR');
    }
    const operationId =
      typeof body.operationId === 'string' && /^[A-Za-z0-9:_-]{8,160}$/.test(body.operationId)
        ? body.operationId
        : randomUUID();
    const idempotencyKey =
      typeof body.idempotencyKey === 'string' && body.idempotencyKey.length <= 240
        ? body.idempotencyKey
        : `stock:${operationId}`;
    const requestHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const client = await getPosPool().connect();
    try {
      await client.query('BEGIN');
      const claimed = await client.query(
        `INSERT INTO pos_idempotency_keys
          (tenant_id, idempotency_key, operation_type, request_hash)
         VALUES ($1, $2, 'stock-adjustment', $3)
         ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING idempotency_key`,
        [auth.tenantId, idempotencyKey, requestHash]
      );
      if (claimed.rowCount === 0) {
        const previous = await client.query(
          `SELECT request_hash, response_status, response_body FROM pos_idempotency_keys
           WHERE tenant_id = $1 AND idempotency_key = $2 FOR UPDATE`,
          [auth.tenantId, idempotencyKey]
        );
        const row = previous.rows[0];
        if (!row || row.request_hash !== requestHash) {
          throw new HttpError(
            409,
            'Idempotency key was reused with different data',
            'IDEMPOTENCY_CONFLICT'
          );
        }
        if (!row.response_body) {
          throw new HttpError(
            409,
            'Stock operation is already processing',
            'OPERATION_IN_PROGRESS'
          );
        }
        await client.query('COMMIT');
        return NextResponse.json(row.response_body, { status: row.response_status ?? 200 });
      }

      const existingResult = await client.query(
        `SELECT * FROM pos_tenant_inventory
         WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [auth.tenantId, product.id]
      );
      const existing = existingResult.rows[0];
      if (!existing) assertPermission(auth, 'add-product');
      const before = existing ? Number(existing.current_qty) : 0;
      const after = before + quantityDelta;
      if (after < 0) {
        throw new HttpError(
          409,
          'Stock adjustment would make quantity negative',
          'INSUFFICIENT_STOCK'
        );
      }
      const now = new Date().toISOString();
      const saved: InventoryItem = {
        ...(existing ? (existing.data as InventoryItem) : product),
        ...product,
        currentQty: after,
        stockStatus: after === 0 ? 'out' : product.stockStatus,
        updatedAt: now,
      };
      const movement: StockMovement | null =
        quantityDelta === 0
          ? null
          : {
              id: `move-${operationId}-${product.id}`,
              operationId,
              inventoryItemId: product.id,
              productName: saved.name,
              sku: saved.sku,
              barcode: saved.barcode,
              batchLot: saved.batchLot,
              type: existing ? 'adjustment' : 'restock',
              quantityDelta,
              quantityBefore: before,
              quantityAfter: after,
              unitCost: saved.unitCost,
              unitPrice: saved.sellingPrice,
              referenceId: saved.id,
              referenceLabel: existing ? 'Stock adjustment' : 'Initial product stock',
              reason:
                typeof body.reason === 'string' && body.reason.trim()
                  ? body.reason.trim()
                  : existing
                    ? 'Manual inventory quantity update'
                    : 'Initial stock entered with product',
              createdAt: now,
              createdBy: auth.user.name,
              syncStatus: 'synced',
            };
      await client.query(
        `INSERT INTO pos_tenant_records (tenant_id, store_name, record_id, data)
         VALUES ($1, 'inventory', $2, $3::jsonb)
         ON CONFLICT (tenant_id, store_name, record_id) DO UPDATE SET
           data = EXCLUDED.data, version = pos_tenant_records.version + 1, updated_at = now()`,
        [auth.tenantId, saved.id, JSON.stringify(saved)]
      );
      await upsertTenantInventoryIndex(client, auth.tenantId, { ...saved });
      if (movement) {
        await client.query(
          `INSERT INTO pos_tenant_records (tenant_id, store_name, record_id, data)
           VALUES ($1, 'stockMovements', $2, $3::jsonb)
           ON CONFLICT (tenant_id, store_name, record_id) DO NOTHING`,
          [auth.tenantId, movement.id, JSON.stringify(movement)]
        );
      }
      const responseBody = { inventory: saved, stockMovement: movement };
      await client.query(
        `UPDATE pos_idempotency_keys SET response_status = 200, response_body = $3::jsonb,
          completed_at = now() WHERE tenant_id = $1 AND idempotency_key = $2`,
        [auth.tenantId, idempotencyKey, JSON.stringify(responseBody)]
      );
      await client.query(
        `INSERT INTO pos_audit_log
          (tenant_id, user_id, action, entity_type, entity_id, operation_id, after_data, metadata)
         VALUES ($1, $2, 'stock.adjusted', 'inventory', $3, $4, $5::jsonb, $6::jsonb)`,
        [
          auth.tenantId,
          auth.user.id,
          saved.id,
          operationId,
          JSON.stringify(saved),
          JSON.stringify({ quantityBefore: before, quantityDelta, quantityAfter: after }),
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
