import { createHash, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { InventoryItem, SaleTransaction, StockMovement } from '@/lib/pos/types';
import { getPosPool } from '@/lib/server/pos-db';
import {
  assertPermission,
  assertWritePermission,
  assertTenantPlanPermission,
  assertSameOrigin,
  errorResponse,
  HttpError,
  requireAuth,
} from '@/lib/server/security';
import { upsertTenantInventoryIndex, upsertTenantSaleIndex } from '@/lib/server/tenant-indexes';

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    assertWritePermission(auth, 'refunds');
    await assertTenantPlanPermission(auth.tenantId, 'refunds');
    const body = (await request.json()) as Record<string, unknown>;
    const saleId = typeof body.saleId === 'string' ? body.saleId : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!saleId || reason.length < 3) {
      throw new HttpError(400, 'Sale and refund reason are required', 'VALIDATION_ERROR');
    }
    const operationId = typeof body.operationId === 'string' ? body.operationId : randomUUID();
    const idempotencyKey = `refund:${operationId}`;
    const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const client = await getPosPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `sales-reset:${auth.tenantId}`,
      ]);
      const claim = await client.query(
        `INSERT INTO pos_idempotency_keys
          (tenant_id, idempotency_key, operation_type, request_hash)
         VALUES ($1, $2, 'refund', $3)
         ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING idempotency_key`,
        [auth.tenantId, idempotencyKey, hash]
      );
      if (claim.rowCount === 0) {
        const replay = await client.query(
          `SELECT request_hash, response_body FROM pos_idempotency_keys
           WHERE tenant_id = $1 AND idempotency_key = $2 FOR UPDATE`,
          [auth.tenantId, idempotencyKey]
        );
        if (replay.rows[0]?.request_hash !== hash || !replay.rows[0]?.response_body) {
          throw new HttpError(
            409,
            'Refund command conflicts with an existing operation',
            'IDEMPOTENCY_CONFLICT'
          );
        }
        await client.query('COMMIT');
        return NextResponse.json(replay.rows[0].response_body);
      }
      const saleResult = await client.query(
        `SELECT data FROM pos_tenant_sales
         WHERE tenant_id = $1 AND (id = $2 OR transaction_id = $2) FOR UPDATE`,
        [auth.tenantId, saleId]
      );
      const sale = saleResult.rows[0]?.data as SaleTransaction | undefined;
      if (!sale) throw new HttpError(404, 'Sale was not found', 'SALE_NOT_FOUND');
      if (sale.status !== 'completed') {
        throw new HttpError(409, 'Only completed sales can be refunded', 'REFUND_CONFLICT');
      }
      const inventoryResult = await client.query(
        `SELECT * FROM pos_tenant_inventory
         WHERE tenant_id = $1 AND id = ANY($2::text[]) ORDER BY id FOR UPDATE`,
        [auth.tenantId, sale.items.map((item) => item.inventoryItemId)]
      );
      if (
        inventoryResult.rows.length !== new Set(sale.items.map((item) => item.inventoryItemId)).size
      ) {
        throw new HttpError(409, 'A refunded product no longer exists', 'INVENTORY_CONFLICT');
      }
      const byId = new Map(inventoryResult.rows.map((row) => [row.id as string, row]));
      const branchName = typeof sale.branch === 'string' && sale.branch.trim() ? sale.branch.trim() : 'Main Store';
      const branchResult = await client.query(
        `SELECT * FROM pos_branch_inventory
         WHERE tenant_id = $1 AND branch = $2 AND inventory_item_id = ANY($3::text[])
         ORDER BY inventory_item_id FOR UPDATE`,
        [auth.tenantId, branchName, sale.items.map((item) => item.inventoryItemId)]
      );
      const branchById = new Map(
        branchResult.rows.map((row) => [row.inventory_item_id as string, row])
      );
      if (branchName !== 'Main Store' && branchById.size !== new Set(sale.items.map((item) => item.inventoryItemId)).size) {
        throw new HttpError(409, 'The sale branch stock record is missing; refund was not posted', 'INVENTORY_CONFLICT');
      }
      const now = new Date().toISOString();
      const updates: InventoryItem[] = [];
      const movements: StockMovement[] = [];
      for (const line of sale.items) {
        const baseRow = byId.get(line.inventoryItemId);
        if (!baseRow) continue;
        const branchRow = branchById.get(line.inventoryItemId);
        const row = branchRow && branchName !== 'Main Store'
          ? {
              ...baseRow,
              current_qty: branchRow.current_qty,
              unit_cost: branchRow.unit_cost,
              selling_price: branchRow.selling_price,
              stock_status: branchRow.data?.stockStatus ?? baseRow.stock_status,
              data: { ...(baseRow.data as Record<string, unknown>), ...(branchRow.data as Record<string, unknown>) },
            }
          : baseRow;
        const existingUpdate = updates.find((item) => item.id === line.inventoryItemId);
        const before = existingUpdate ? existingUpdate.currentQty : Number(row.current_qty);
        const restoredQuantity = line.quantity * (line.unitsPerSale ?? 1);
        const after = before + restoredQuantity;
        const updated: InventoryItem = {
          ...(row.data as InventoryItem),
          currentQty: after,
          stockStatus: after > 0 && row.stock_status === 'out' ? 'in-stock' : row.stock_status,
          updatedAt: now,
        };
        const updateIndex = updates.findIndex((item) => item.id === updated.id);
        if (updateIndex >= 0) updates[updateIndex] = updated;
        else updates.push(updated);
        movements.push({
          id: `move-${operationId}-${line.id}`,
          operationId,
          inventoryItemId: line.inventoryItemId,
          productName: line.name,
          sku: line.sku,
          barcode: line.barcode,
          batchLot: line.batchLot,
          type: 'refund',
          quantityDelta: restoredQuantity,
          quantityBefore: before,
          quantityAfter: after,
          unitCost: line.unitCost,
          unitPrice: line.unitPrice,
          referenceId: sale.id,
          referenceLabel: sale.transactionId,
          reason,
          createdAt: now,
          createdBy: auth.user.name,
          syncStatus: 'synced',
        });
      }
      const refunded: SaleTransaction = { ...sale, status: 'refunded', syncStatus: 'synced' };
      for (const updated of updates) {
        if (branchName === 'Main Store') {
          await client.query(
            `UPDATE pos_tenant_records SET data = $3::jsonb,
              version = version + 1, updated_at = now()
             WHERE tenant_id = $1 AND store_name = 'inventory' AND record_id = $2`,
            [auth.tenantId, updated.id, JSON.stringify(updated)]
          );
          await upsertTenantInventoryIndex(client, auth.tenantId, { ...updated });
          if (branchById.has(updated.id)) {
            await client.query(
              `UPDATE pos_branch_inventory
               SET current_qty = $1, unit_cost = $2, selling_price = $3, data = $4::jsonb,
                   version = version + 1, updated_at = now()
               WHERE tenant_id = $5 AND branch = 'Main Store' AND inventory_item_id = $6`,
              [updated.currentQty, updated.unitCost, updated.sellingPrice, JSON.stringify(updated), auth.tenantId, updated.id]
            );
          }
        } else {
          await client.query(
            `UPDATE pos_branch_inventory
             SET current_qty = $1, data = $2::jsonb, version = version + 1, updated_at = now()
             WHERE tenant_id = $3 AND branch = $4 AND inventory_item_id = $5`,
            [updated.currentQty, JSON.stringify(updated), auth.tenantId, branchName, updated.id]
          );
        }
      }
      // A refund puts the exact piece quantity back into a new FIFO batch. We do
      // not guess which historical batch supplied a multi-batch sale.
      for (const line of sale.items) {
        const unitsPerSale = Math.max(1, Number(line.unitsPerSale) || 1);
        const quantity = line.quantity * unitsPerSale;
        const batchId = `batch-refund-${operationId}-${line.id}`;
        const returnedBatch = {
          id: batchId,
          productId: line.inventoryItemId,
          productName: line.name,
          sku: line.sku,
          barcode: line.barcode,
          quantityReceived: quantity,
          quantityRemaining: quantity,
          unitCost: Number(line.unitCost) / unitsPerSale,
          sellingPrice: Number(line.unitPrice),
          expiryDate: line.expiryDate,
          supplier: '',
          supplierPhone: '',
          invoiceNumber: '',
          receivedAt: now,
          status: 'active',
        };
        await client.query(
          `INSERT INTO pos_tenant_records (tenant_id, store_name, record_id, data)
           VALUES ($1, 'stockBatches', $2, $3::jsonb)`,
          [auth.tenantId, batchId, JSON.stringify(returnedBatch)]
        );
      }
      await client.query(
        `UPDATE pos_tenant_records SET data = $3::jsonb,
          version = version + 1, updated_at = now()
         WHERE tenant_id = $1 AND store_name = 'sales' AND record_id = $2`,
        [auth.tenantId, sale.id, JSON.stringify(refunded)]
      );
      await upsertTenantSaleIndex(client, auth.tenantId, { ...refunded });
      for (const movement of movements) {
        await client.query(
          `INSERT INTO pos_tenant_records (tenant_id, store_name, record_id, data)
           VALUES ($1, 'stockMovements', $2, $3::jsonb)`,
          [auth.tenantId, movement.id, JSON.stringify(movement)]
        );
      }
      const responseBody = { sale: refunded, inventory: updates, stockMovements: movements };
      await client.query(
        `UPDATE pos_idempotency_keys SET response_status = 200, response_body = $3::jsonb,
          completed_at = now() WHERE tenant_id = $1 AND idempotency_key = $2`,
        [auth.tenantId, idempotencyKey, JSON.stringify(responseBody)]
      );
      await client.query(
        `INSERT INTO pos_audit_log
          (tenant_id, user_id, action, entity_type, entity_id, operation_id, after_data, metadata)
         VALUES ($1, $2, 'sale.refunded', 'sale', $3, $4, $5::jsonb, $6::jsonb)`,
        [
          auth.tenantId,
          auth.user.id,
          sale.id,
          operationId,
          JSON.stringify(refunded),
          JSON.stringify({ reason }),
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
