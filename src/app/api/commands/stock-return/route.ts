import { createHash, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { InventoryItem, SaleTransaction, StockMovement } from '@/lib/pos/types';
import { computeStockStatus } from '@/lib/pos/stock';
import { getPosPool } from '@/lib/server/pos-db';
import { upsertTenantInventoryIndex, upsertTenantSaleIndex } from '@/lib/server/tenant-indexes';
import {
  assertSameOrigin,
  assertTenantActive,
  assertTenantPlanPermission,
  assertPermission,
  errorResponse,
  HttpError,
  requireAuth,
} from '@/lib/server/security';

function positive(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new HttpError(400, `${label} must be greater than zero`, 'VALIDATION_ERROR');
  }
  return parsed;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function money(value: number): number {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2));
}

type ReturnableLine = SaleTransaction['items'][number] & {
  originalQuantity?: number;
  originalLineTotal?: number;
  originalDiscountAmount?: number;
  originalTaxAmount?: number;
  returnedQuantity?: number;
};

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    assertTenantActive(auth);
    assertPermission(auth, 'adjust-stock');
    await assertTenantPlanPermission(auth.tenantId, 'adjust-stock');

    const body = (await request.json()) as Record<string, unknown>;
    const productId = text(body.productId);
    const reason = text(body.reason);
    const notes = text(body.notes);
    const quantity = positive(body.quantity, 'Return quantity');
    const operationId = /^[A-Za-z0-9:_-]{8,160}$/.test(String(body.operationId ?? ''))
      ? String(body.operationId)
      : randomUUID();
    const idempotencyKey = `stock-return:${operationId}`;
    if (!productId || reason.length < 3) {
      throw new HttpError(400, 'Product and return reason are required', 'VALIDATION_ERROR');
    }

    const client = await getPosPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `stock-return:${auth.tenantId}:${productId}`,
      ]);

      const requestHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
      const claim = await client.query(
        `INSERT INTO pos_idempotency_keys
          (tenant_id, idempotency_key, operation_type, request_hash)
         VALUES ($1, $2, 'stock-return', $3)
         ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
         RETURNING idempotency_key`,
        [auth.tenantId, idempotencyKey, requestHash]
      );
      if (claim.rowCount === 0) {
        const replay = await client.query(
          `SELECT request_hash, response_body FROM pos_idempotency_keys
           WHERE tenant_id = $1 AND idempotency_key = $2 FOR UPDATE`,
          [auth.tenantId, idempotencyKey]
        );
        if (replay.rows[0]?.request_hash !== requestHash || !replay.rows[0]?.response_body) {
          throw new HttpError(409, 'Return command conflicts with an existing operation', 'IDEMPOTENCY_CONFLICT');
        }
        await client.query('COMMIT');
        return NextResponse.json(replay.rows[0].response_body);
      }

      const salesResult = await client.query(
        `SELECT id, data FROM pos_tenant_sales
         WHERE tenant_id = $1
           AND status = 'completed'
           AND data->'items' @> jsonb_build_array(jsonb_build_object('inventoryItemId', $2))
         ORDER BY timestamp DESC, id DESC
         FOR UPDATE`,
        [auth.tenantId, productId]
      );
      const inventoryResult = await client.query(
        `SELECT * FROM pos_tenant_inventory
         WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [auth.tenantId, productId]
      );
      const inventoryRow = inventoryResult.rows[0];
      if (!inventoryRow) throw new HttpError(404, 'Product was not found', 'PRODUCT_NOT_FOUND');

      let remaining = quantity;
      const updatedSales: SaleTransaction[] = [];
      const returnedItems: { saleId: string; quantity: number; stockQuantity: number; amount: number }[] = [];
      let restoredStockQuantity = 0;
      for (const row of salesResult.rows) {
        if (remaining <= 0) break;
        const sale = row.data as SaleTransaction;
        const lines = Array.isArray(sale.items) ? sale.items as ReturnableLine[] : [];
        let saleReturnedAmount = 0;
        let saleReturnedGross = 0;
        let saleReturnedDiscount = 0;
        let saleReturnedTax = 0;
        let saleReturnedQuantity = 0;
        const nextItems = lines.map((line) => {
          if (line.inventoryItemId !== productId || remaining <= 0 || line.quantity <= 0) return line;
          const originalQuantity = Number(line.originalQuantity ?? (line.quantity + (line.returnedQuantity ?? 0)));
          const originalLineTotal = Number(line.originalLineTotal ?? line.lineTotal);
          const originalDiscountAmount = Number(
            line.originalDiscountAmount ?? line.discountAmount ??
              (line.unitPrice * originalQuantity * (line.discount / 100))
          );
          const originalTaxAmount = Number(line.originalTaxAmount ?? line.taxAmount ?? 0);
          const returnedQuantity = Math.min(remaining, line.quantity);
          const nextQuantity = line.quantity - returnedQuantity;
          const unitsPerSale = Math.max(1, Number(line.unitsPerSale) || 1);
          const returnedStockQuantity = returnedQuantity * unitsPerSale;
          const lineReturnTotal = money((originalLineTotal / Math.max(1, originalQuantity)) * returnedQuantity);
          const lineReturnGross = money(line.unitPrice * returnedQuantity);
          const lineReturnDiscount = money((originalDiscountAmount / Math.max(1, originalQuantity)) * returnedQuantity);
          const lineReturnTax = money((originalTaxAmount / Math.max(1, originalQuantity)) * returnedQuantity);
          remaining -= returnedQuantity;
          saleReturnedQuantity += returnedQuantity;
          saleReturnedAmount += lineReturnTotal + (line.taxMode === 'exclusive' ? lineReturnTax : 0);
          saleReturnedGross += lineReturnGross;
          saleReturnedDiscount += lineReturnDiscount;
          saleReturnedTax += lineReturnTax;
          restoredStockQuantity += returnedStockQuantity;
          returnedItems.push({ saleId: sale.id, quantity: returnedQuantity, stockQuantity: returnedStockQuantity, amount: lineReturnTotal + (line.taxMode === 'exclusive' ? lineReturnTax : 0) });
          return {
            ...line,
            quantity: nextQuantity,
            originalQuantity,
            originalLineTotal,
            originalDiscountAmount,
            originalTaxAmount,
            returnedQuantity: Number(line.returnedQuantity ?? 0) + returnedQuantity,
            lineTotal: money((originalLineTotal / Math.max(1, originalQuantity)) * nextQuantity),
            discountAmount: money((originalDiscountAmount / Math.max(1, originalQuantity)) * nextQuantity),
            taxAmount: money((originalTaxAmount / Math.max(1, originalQuantity)) * nextQuantity),
          };
        });
        if (!saleReturnedQuantity) continue;
        const oldGrandTotal = Number(sale.grandTotal) || 0;
        const nextGrandTotal = money(Math.max(0, oldGrandTotal - saleReturnedAmount));
        const nextBreakdown = sale.paymentBreakdown
          ? Object.fromEntries(
              Object.entries(sale.paymentBreakdown).map(([method, amount]) => [
                method,
                money(Number(amount) * (oldGrandTotal > 0 ? nextGrandTotal / oldGrandTotal : 0)),
              ])
            )
          : undefined;
        const nextSale: SaleTransaction = {
          ...sale,
          items: nextItems,
          subtotal: money(Math.max(0, sale.subtotal - saleReturnedGross)),
          discountTotal: money(Math.max(0, sale.discountTotal - saleReturnedDiscount)),
          taxAmount: money(Math.max(0, sale.taxAmount - saleReturnedTax)),
          grandTotal: nextGrandTotal,
          amountPaid: sale.paymentMethod === 'credit' ? 0 : money(Math.max(0, Number(sale.amountPaid ?? oldGrandTotal) - saleReturnedAmount)),
          amountDue: sale.paymentMethod === 'credit' ? money(Math.max(0, Number(sale.amountDue ?? oldGrandTotal) - saleReturnedAmount)) : 0,
          paymentBreakdown: nextBreakdown,
          cashTendered: sale.cashTendered === undefined ? undefined : money(Math.max(0, sale.cashTendered - saleReturnedAmount)),
          changeGiven: sale.changeGiven === undefined ? undefined : 0,
          status: nextItems.every((line) => line.quantity <= 0) ? 'refunded' : 'completed',
          paymentStatus: sale.paymentMethod === 'credit'
            ? (nextGrandTotal <= 0 ? 'paid' : nextSaleStatus(nextGrandTotal, sale))
            : 'paid',
          returnedTotal: money(Number((sale as SaleTransaction & { returnedTotal?: number }).returnedTotal ?? 0) + saleReturnedAmount),
          returns: [
            ...((sale as SaleTransaction & { returns?: unknown[] }).returns ?? []),
            { id: operationId, productId, quantity: saleReturnedQuantity, amount: saleReturnedAmount, reason, notes, returnedAt: new Date().toISOString(), returnedBy: auth.user.name },
          ],
        } as SaleTransaction;
        updatedSales.push(nextSale);
      }
      if (remaining > 0) {
        throw new HttpError(409, `Only ${quantity - remaining} of this product is available to return from completed sales`, 'RETURN_QUANTITY_EXCEEDS_SALES');
      }

      const current = inventoryRow.data as InventoryItem;
      const beforeQty = Number(inventoryRow.current_qty);
      const afterQty = beforeQty + restoredStockQuantity;
      const now = new Date().toISOString();
      const updated: InventoryItem = {
        ...current,
        currentQty: afterQty,
        stockStatus: computeStockStatus(afterQty, current.reorderLevel, current.expiryDate),
        updatedAt: now,
      };
      for (const sale of updatedSales) {
        await client.query(
          `UPDATE pos_tenant_records SET data = $3::jsonb, version = version + 1, updated_at = now()
           WHERE tenant_id = $1 AND store_name = 'sales' AND record_id = $2`,
          [auth.tenantId, sale.id, JSON.stringify(sale)]
        );
        await upsertTenantSaleIndex(client, auth.tenantId, sale as unknown as Record<string, unknown> & { id: string });
      }
      await client.query(
        `UPDATE pos_tenant_records SET data = $3::jsonb, version = version + 1, updated_at = now()
         WHERE tenant_id = $1 AND store_name = 'inventory' AND record_id = $2`,
        [auth.tenantId, productId, JSON.stringify(updated)]
      );
      await upsertTenantInventoryIndex(client, auth.tenantId, updated as unknown as Record<string, unknown> & { id: string });
      const movement: StockMovement = {
        id: `move-${operationId}`,
        operationId,
        inventoryItemId: productId,
        productName: current.name,
        sku: current.sku,
        barcode: current.barcode,
        batchLot: current.batchLot,
        type: 'return',
        quantityDelta: restoredStockQuantity,
        quantityBefore: beforeQty,
        quantityAfter: afterQty,
        unitCost: current.unitCost,
        unitPrice: current.sellingPrice,
        referenceId: updatedSales[0]?.id ?? productId,
        referenceLabel: updatedSales.length === 1 ? updatedSales[0].transactionId : `${updatedSales.length} sales`,
        reason: notes ? `${reason} — ${notes}` : reason,
        createdAt: now,
        createdBy: auth.user.name,
        syncStatus: 'synced',
      };
      await client.query(
        `INSERT INTO pos_tenant_records (tenant_id, store_name, record_id, data)
         VALUES ($1, 'stockMovements', $2, $3::jsonb)`,
        [auth.tenantId, movement.id, JSON.stringify(movement)]
      );
      await client.query(
        `INSERT INTO pos_audit_log
          (tenant_id, user_id, action, entity_type, entity_id, operation_id, after_data, metadata)
         VALUES ($1, $2, 'sale.returned', 'inventory', $3, $4, $5::jsonb, $6::jsonb)`,
        [auth.tenantId, auth.user.id, productId, operationId, JSON.stringify(updated), JSON.stringify({ quantity, restoredStockQuantity, reason, returnedItems })]
      );
      const responseBody = { inventory: updated, movement, sales: updatedSales, returnedItems, returnedQuantity: quantity, restoredStockQuantity };
      await client.query(
        `UPDATE pos_idempotency_keys SET response_status = 200, response_body = $3::jsonb, completed_at = now()
         WHERE tenant_id = $1 AND idempotency_key = $2`,
        [auth.tenantId, idempotencyKey, JSON.stringify(responseBody)]
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

function nextSaleStatus(nextGrandTotal: number, sale: SaleTransaction): 'unpaid' | 'partial' | 'paid' {
  const paid = Number(sale.amountPaid ?? 0);
  return paid <= 0 ? 'unpaid' : paid < nextGrandTotal ? 'partial' : 'paid';
}
