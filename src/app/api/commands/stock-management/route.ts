import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { InventoryCodeAlias, InventoryItem, StockBatch, StockMovement } from '@/lib/pos/types';
import { computeStockStatus } from '@/lib/pos/stock';
import { getPosPool } from '@/lib/server/pos-db';
import { upsertTenantInventoryIndex } from '@/lib/server/tenant-indexes';
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
  if (!Number.isFinite(parsed) || parsed <= 0) throw new HttpError(400, `${label} must be greater than zero`, 'VALIDATION_ERROR');
  return parsed;
}

function nonNegative(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new HttpError(400, `${label} is invalid`, 'VALIDATION_ERROR');
  return parsed;
}

function date(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, `${label} is invalid`, 'VALIDATION_ERROR');
  }
  return value;
}

function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }

function aliasList(value: unknown, kind: 'sku' | 'barcode'): InventoryCodeAlias[] {
  return Array.isArray(value)
    ? value.filter((item): item is InventoryCodeAlias => Boolean(item) && typeof item === 'object' && (item as InventoryCodeAlias).kind === kind && typeof (item as InventoryCodeAlias).code === 'string')
    : [];
}

async function authorize(request: NextRequest) {
  assertSameOrigin(request);
  const auth = await requireAuth(request);
  assertTenantActive(auth);
  assertPermission(auth, 'adjust-stock');
  await assertTenantPlanPermission(auth.tenantId, 'adjust-stock');
  return auth;
}

async function loadBatches(tenantId: string, productId: string): Promise<StockBatch[]> {
  const result = await getPosPool().query(
    `SELECT data FROM pos_tenant_records WHERE tenant_id = $1 AND store_name = 'stockBatches' AND data->>'productId' = $2 ORDER BY data->>'receivedAt' ASC`,
    [tenantId, productId]
  );
  return result.rows.map((row) => row.data as StockBatch);
}


export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    const productId = text(request.nextUrl.searchParams.get('productId'));
    if (!productId) throw new HttpError(400, 'Product is required', 'VALIDATION_ERROR');
    return NextResponse.json({ batches: await loadBatches(auth.tenantId, productId) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action === 'return' ? 'return' : body.action === 'receive' ? 'receive' : '';
    if (!action) throw new HttpError(400, 'Stock action is invalid', 'VALIDATION_ERROR');
    const productId = text(body.productId);
    if (!productId) throw new HttpError(400, 'Product is required', 'VALIDATION_ERROR');
    const client = await getPosPool().connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT * FROM pos_tenant_inventory WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [auth.tenantId, productId]
      );
      const row = result.rows[0];
      if (!row) throw new HttpError(404, 'Product was not found', 'NOT_FOUND');
      const current = row.data as InventoryItem;
      const beforeQty = Number(row.current_qty);
      const beforeCost = Number(row.unit_cost);
      const beforeValue = beforeQty * beforeCost;
      const now = new Date().toISOString();
      const batches = await loadBatches(auth.tenantId, productId);
      let updated: InventoryItem;
      let batch: StockBatch;
      let quantityDelta: number;
      let reason: string;

      if (action === 'receive') {
        const quantity = positive(body.quantity, 'Quantity received');
        const unitCost = positive(body.unitCost, 'Purchase/cost price');
        const sellingPrice = body.sellingPrice === undefined || body.sellingPrice === '' ? Number(row.selling_price) : nonNegative(body.sellingPrice, 'Selling price');
        const expiryDate = date(body.expiryDate, 'Expiry date');
        const sku = text(body.sku) || current.sku;
        const barcode = text(body.barcode) || current.barcode || undefined;
        const activeCodes = new Set<string>();
        const allRows = await client.query(`SELECT id, sku, barcode, data FROM pos_tenant_inventory WHERE tenant_id = $1`, [auth.tenantId]);
        for (const candidate of allRows.rows) {
          if (candidate.id === productId) continue;
          activeCodes.add(String(candidate.sku || '').toLowerCase());
          if (candidate.barcode) activeCodes.add(String(candidate.barcode).toLowerCase());
          for (const alias of [...aliasList(candidate.data?.skuAliases, 'sku'), ...aliasList(candidate.data?.barcodeAliases, 'barcode')]) if (alias.active) activeCodes.add(alias.code.toLowerCase());
        }
        const currentSkuAliases = aliasList(current.skuAliases, 'sku');
        const currentBarcodeAliases = aliasList(current.barcodeAliases, 'barcode');
        for (const code of [sku, barcode].filter(Boolean) as string[]) {
          if (activeCodes.has(code.toLowerCase())) throw new HttpError(409, `SKU/barcode ${code} is already active on another product`, 'DUPLICATE_CODE');
        }
        const batchId = `batch-${randomUUID()}`;
        batch = { id: batchId, productId, productName: current.name, sku, barcode, quantityReceived: quantity, quantityRemaining: quantity, unitCost, sellingPrice, expiryDate, supplier: text(body.supplier) || current.supplier, receivedAt: now, status: 'active' };
        const weightedCost = (beforeValue + quantity * unitCost) / (beforeQty + quantity);
        const skuAliases = [...currentSkuAliases.filter((alias) => alias.code.toLowerCase() !== sku.toLowerCase()), ...(sku === current.sku ? [] : [{ code: sku, kind: 'sku' as const, batchId, active: true, addedAt: now }])];
        const barcodeAliases = [...currentBarcodeAliases.filter((alias) => alias.code.toLowerCase() !== String(barcode || '').toLowerCase()), ...(barcode && barcode !== current.barcode ? [{ code: barcode, kind: 'barcode' as const, batchId, active: true, addedAt: now }] : [])];
        updated = { ...current, currentQty: beforeQty + quantity, unitCost: weightedCost, sellingPrice, expiryDate, skuAliases, barcodeAliases, lastRestocked: now.slice(0, 10), stockStatus: computeStockStatus(beforeQty + quantity, current.reorderLevel, expiryDate), updatedAt: now };
        quantityDelta = quantity; reason = 'Stock received';
      } else {
        const quantity = positive(body.quantity, 'Return quantity');
        const batchId = text(body.batchId);
        const selected = batches.find((candidate) => candidate.id === batchId && candidate.status === 'active');
        if (!selected) throw new HttpError(400, 'Select an active stock batch', 'BATCH_REQUIRED');
        if (quantity > selected.quantityRemaining) throw new HttpError(409, 'Return quantity exceeds remaining batch stock', 'INSUFFICIENT_STOCK');
        if (quantity > beforeQty) throw new HttpError(409, 'Return quantity exceeds available stock', 'INSUFFICIENT_STOCK');
        const afterQty = beforeQty - quantity;
        const afterValue = beforeValue - quantity * selected.unitCost;
        const weightedCost = afterQty > 0 ? Math.max(0, afterValue / afterQty) : 0;
        selected.quantityRemaining -= quantity;
        selected.status = selected.quantityRemaining === 0 ? 'returned' : 'active';
        batch = selected;
        const skuAliases = aliasList(current.skuAliases, 'sku').map((alias) => alias.batchId === batchId && selected.quantityRemaining === 0 ? { ...alias, active: false, inactivatedAt: now } : alias);
        const barcodeAliases = aliasList(current.barcodeAliases, 'barcode').map((alias) => alias.batchId === batchId && selected.quantityRemaining === 0 ? { ...alias, active: false, inactivatedAt: now } : alias);
        updated = { ...current, currentQty: afterQty, unitCost: weightedCost, skuAliases, barcodeAliases, stockStatus: computeStockStatus(afterQty, current.reorderLevel, current.expiryDate), updatedAt: now };
        quantityDelta = -quantity; reason = text(body.reason) || 'Stock returned';
      }
      await client.query(`INSERT INTO pos_tenant_records (tenant_id, store_name, record_id, data) VALUES ($1, 'stockBatches', $2, $3::jsonb) ON CONFLICT (tenant_id, store_name, record_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [auth.tenantId, batch.id, JSON.stringify(batch)]);
      await upsertTenantInventoryIndex(client, auth.tenantId, updated as unknown as Record<string, unknown> & { id: string });
      const movement: StockMovement = { id: `move-${randomUUID()}`, operationId: `stock-${randomUUID()}`, inventoryItemId: productId, productName: current.name, sku: batch.sku, barcode: batch.barcode, batchLot: current.batchLot, type: action === 'receive' ? 'receive' : 'return', quantityDelta, quantityBefore: beforeQty, quantityAfter: updated.currentQty, unitCost: batch.unitCost, unitPrice: batch.sellingPrice, referenceId: batch.id, referenceLabel: action === 'receive' ? 'Stock receipt' : 'Supplier return', reason, batchId: batch.id, valueBefore: beforeValue, valueAfter: updated.currentQty * updated.unitCost, createdAt: now, createdBy: auth.user.name, syncStatus: 'synced' };
      await client.query(`INSERT INTO pos_tenant_records (tenant_id, store_name, record_id, data) VALUES ($1, 'stockMovements', $2, $3::jsonb) ON CONFLICT (tenant_id, store_name, record_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [auth.tenantId, movement.id, JSON.stringify(movement)]);
      await client.query(`INSERT INTO pos_audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, $3, 'inventory', $4, $5::jsonb)`, [auth.tenantId, auth.user.id, action === 'receive' ? 'stock.received' : 'stock.returned', productId, JSON.stringify({ beforeQty, afterQty: updated.currentQty, beforeValue, afterValue: updated.currentQty * updated.unitCost, batch, movement, notes: text(body.notes), sku: batch.sku, barcode: batch.barcode })]);
      await client.query('COMMIT');
      return NextResponse.json({ inventory: updated, batch, movement });
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  } catch (error) { return errorResponse(error); }
}
