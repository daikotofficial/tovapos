import { createHash, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type {
  InventoryItem,
  WarehouseLedgerEntry,
  WarehouseLocation,
  WarehouseStock,
  WarehouseTransfer,
  WarehouseTransferLine,
} from '@/lib/pos/types';
import { computeStockStatus, computeWeightedAverageUnitCost } from '@/lib/pos/stock';
import {
  calculateProcessingUnitCost,
  validateReceiptQuantities,
} from '@/lib/pos/warehouse-rules.mjs';
import { getPosPool } from '@/lib/server/pos-db';
import {
  assertSameOrigin,
  assertTenantActive,
  assertTenantPlanPermission,
  assertWritePermission,
  errorResponse,
  HttpError,
  requireAuth,
} from '@/lib/server/security';

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const positive = (value: unknown, label: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new HttpError(400, `${label} must be greater than zero`, 'VALIDATION_ERROR');
  return parsed;
};
const nonNegative = (value: unknown, label: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0)
    throw new HttpError(400, `${label} is invalid`, 'VALIDATION_ERROR');
  return parsed;
};
const dateOnly = (value: unknown, label: string): string => {
  const parsed = text(value);
  if (!parsed) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed))
    throw new HttpError(400, `${label} must be a valid date`, 'VALIDATION_ERROR');
  const date = new Date(`${parsed}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== parsed)
    throw new HttpError(400, `${label} must be a valid date`, 'VALIDATION_ERROR');
  return parsed;
};
const operationId = (value: unknown): string =>
  /^[A-Za-z0-9:_-]{8,160}$/.test(String(value ?? '')) ? String(value) : randomUUID();

async function authFor(
  request: NextRequest,
  write = false,
  permission: Parameters<typeof assertWritePermission>[1] = 'warehouse-view'
) {
  if (write) assertSameOrigin(request);
  const auth = await requireAuth(request);
  assertTenantActive(auth);
  await assertTenantPlanPermission(auth.tenantId, permission);
  if (write) assertWritePermission(auth, permission);
  return auth;
}

function locationFromRow(row: Record<string, unknown>): WarehouseLocation {
  return {
    id: String(row.id),
    name: String(row.name),
    kind: row.kind as WarehouseLocation['kind'],
    branch: row.branch ? String(row.branch) : undefined,
    active: Boolean(row.active),
    createdAt: new Date(String(row.created_at)).toISOString(),
    createdBy: String(row.created_by),
  };
}

function stockFromRow(row: Record<string, unknown>): WarehouseStock {
  return {
    id: String(row.id),
    locationId: String(row.location_id),
    productId: String(row.product_id),
    productName: String(row.product_name),
    sku: String(row.sku),
    batchLot: String(row.batch_lot),
    quantity: Number(row.quantity),
    unit: String(row.unit),
    unitCost: Number(row.unit_cost),
    sellingPrice: row.selling_price == null ? undefined : Number(row.selling_price),
    expiryDate: row.expiry_date ? String(row.expiry_date).slice(0, 10) : undefined,
    state: row.state as WarehouseStock['state'],
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function ledgerFromRow(row: Record<string, unknown>): WarehouseLedgerEntry {
  return {
    id: String(row.id),
    operationId: String(row.operation_id),
    referenceId: String(row.reference_id),
    locationId: String(row.location_id),
    productId: String(row.product_id),
    productName: String(row.product_name),
    sku: String(row.sku),
    batchLot: String(row.batch_lot),
    type: row.entry_type as WarehouseLedgerEntry['type'],
    quantityDelta: Number(row.quantity_delta),
    balanceAfter: Number(row.balance_after),
    unit: String(row.unit),
    unitCost: Number(row.unit_cost),
    performedBy: String(row.performed_by_name),
    performedByUserId: String(row.performed_by),
    performedByRole: row.performed_by_role as WarehouseLedgerEntry['performedByRole'],
    reason: String(row.reason),
    metadata: row.metadata as Record<string, unknown>,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

async function ensureDefaultLocations(
  tenantId: string,
  userId: string,
  userName: string
): Promise<void> {
  await getPosPool().query(
    `INSERT INTO pos_warehouse_locations (tenant_id, id, name, kind, branch, created_by, created_by_name)
     VALUES ($1, 'warehouse-main', 'Main Warehouse', 'warehouse', 'Main Warehouse', $2, $3),
            ($1, 'store-main', 'Main Store', 'store', 'Main Store', $2, $3)
     ON CONFLICT (tenant_id, id) DO NOTHING`,
    [tenantId, userId, userName]
  );
  await getPosPool().query(
    `UPDATE pos_warehouse_locations
     SET branch = CASE id WHEN 'store-main' THEN 'Main Store' WHEN 'warehouse-main' THEN 'Main Warehouse' ELSE branch END,
         updated_at = now()
     WHERE tenant_id=$1 AND id IN ('store-main', 'warehouse-main') AND branch IS NULL`,
    [tenantId]
  );
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authFor(request);
    await ensureDefaultLocations(auth.tenantId, auth.user.id, auth.user.name);
    const pool = getPosPool();
    const [locations, stock, transfers, ledger, audits] = await Promise.all([
      pool.query(
        `SELECT * FROM pos_warehouse_locations WHERE tenant_id = $1 AND active = true ORDER BY kind, name`,
        [auth.tenantId]
      ),
      pool.query(
        `SELECT * FROM pos_warehouse_stock WHERE tenant_id = $1 AND quantity > 0 ORDER BY updated_at DESC LIMIT 500`,
        [auth.tenantId]
      ),
      pool.query(
        `SELECT data FROM pos_warehouse_transfers WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 200`,
        [auth.tenantId]
      ),
      pool.query(
        `SELECT * FROM pos_warehouse_ledger WHERE tenant_id = $1 ORDER BY created_at DESC, id DESC LIMIT 500`,
        [auth.tenantId]
      ),
      pool.query(
        `SELECT id, action, entity_type AS "entityType", entity_id AS "entityId", operation_id AS "operationId", user_id AS "userId", metadata, before_data AS "beforeData", after_data AS "afterData", created_at AS "createdAt"
         FROM pos_audit_log
         WHERE tenant_id=$1 AND entity_type LIKE 'warehouse%'
         ORDER BY created_at DESC, id DESC LIMIT 500`,
        [auth.tenantId]
      ),
    ]);
    return NextResponse.json({
      locations: locations.rows.map(locationFromRow),
      stock: stock.rows.map(stockFromRow),
      transfers: transfers.rows.map((row) => row.data as WarehouseTransfer),
      ledger: ledger.rows.map(ledgerFromRow),
      audits: audits.rows,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = text(body.action);
    const permission =
      action === 'receive-transfer'
        ? 'warehouse-receive-transfer'
        : action === 'create-transfer' || action === 'dispatch'
          ? 'warehouse-dispatch'
          : action === 'process'
            ? 'warehouse-process'
            : action === 'approve-transfer' || action === 'create-location'
              ? 'warehouse-approve'
              : 'warehouse-receive';
    const auth = await authFor(request, true, permission);
    const opId = operationId(body.operationId);
    const requestHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const client = await getPosPool().connect();
    try {
      await client.query('BEGIN');
      const claimed = await client.query(
        `INSERT INTO pos_idempotency_keys (tenant_id, idempotency_key, operation_type, request_hash)
         VALUES ($1, $2, 'warehouse', $3) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING idempotency_key`,
        [auth.tenantId, `warehouse:${opId}`, requestHash]
      );
      if (claimed.rowCount === 0) {
        const replay = await client.query(
          `SELECT request_hash, response_status, response_body FROM pos_idempotency_keys WHERE tenant_id = $1 AND idempotency_key = $2 FOR UPDATE`,
          [auth.tenantId, `warehouse:${opId}`]
        );
        const previous = replay.rows[0];
        if (!previous || previous.request_hash !== requestHash)
          throw new HttpError(
            409,
            'Warehouse operation conflicts with an existing operation',
            'IDEMPOTENCY_CONFLICT'
          );
        if (!previous.response_body)
          throw new HttpError(
            409,
            'Warehouse operation is already processing',
            'OPERATION_IN_PROGRESS'
          );
        await client.query('COMMIT');
        return NextResponse.json(previous.response_body, {
          status: previous.response_status ?? 200,
        });
      }

      if (action === 'create-location') {
        const name = text(body.name);
        const kind = text(body.kind);
        if (!name || !['warehouse', 'store'].includes(kind))
          throw new HttpError(400, 'Location name and type are required', 'VALIDATION_ERROR');
        const branch = text(body.branch) || (kind === 'warehouse' ? name : '');
        if (kind === 'store' && !branch)
          throw new HttpError(400, 'A store location needs a branch name', 'VALIDATION_ERROR');
        const id = `loc-${randomUUID()}`;
        const result = await client.query(
          `INSERT INTO pos_warehouse_locations (tenant_id, id, name, kind, branch, created_by, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [auth.tenantId, id, name, kind, branch, auth.user.id, auth.user.name]
        );
        const response = { location: locationFromRow(result.rows[0]) };
        await client.query(
          `INSERT INTO pos_audit_log (tenant_id,user_id,action,entity_type,entity_id,operation_id,metadata) VALUES ($1,$2,'warehouse.location.created','warehouse_location',$3,$4,$5::jsonb)`,
          [
            auth.tenantId,
            auth.user.id,
            id,
            opId,
            JSON.stringify({
              ...response.location,
              performedByName: auth.user.name,
              performedByRole: auth.user.role,
            }),
          ]
        );
        await client.query(
          `UPDATE pos_idempotency_keys SET response_status=201,response_body=$3::jsonb,completed_at=now() WHERE tenant_id=$1 AND idempotency_key=$2`,
          [auth.tenantId, `warehouse:${opId}`, JSON.stringify(response)]
        );
        await client.query('COMMIT');
        return NextResponse.json(response, { status: 201 });
      }

      if (action === 'receive') {
        const locationId = text(body.locationId);
        const productId = text(body.productId);
        const quantity = positive(body.quantity, 'Quantity');
        const location = (
          await client.query(
            `SELECT * FROM pos_warehouse_locations WHERE tenant_id=$1 AND id=$2 AND active=true FOR SHARE`,
            [auth.tenantId, locationId]
          )
        ).rows[0];
        if (!location || location.kind !== 'warehouse')
          throw new HttpError(
            400,
            'Goods can only be received into a warehouse location',
            'INVALID_LOCATION'
          );
        const product = (
          await client.query(
            `SELECT * FROM pos_tenant_inventory WHERE tenant_id=$1 AND id=$2 FOR SHARE`,
            [auth.tenantId, productId]
          )
        ).rows[0];
        if (!product) throw new HttpError(404, 'Product was not found', 'PRODUCT_NOT_FOUND');
        const current = product.data as InventoryItem;
        const batchLot =
          text(body.batchLot) || current.batchLot || `WH-${randomUUID().slice(0, 8)}`;
        const unit = text(body.unit) || current.unitOfMeasurement || 'unit';
        const unitCost = positive(body.unitCost, 'Unit cost');
        const expiryDate = dateOnly(body.expiryDate, 'Expiry date') || current.expiryDate || null;
        const existingStock = (
          await client.query(
            `SELECT * FROM pos_warehouse_stock
             WHERE tenant_id=$1 AND location_id=$2 AND product_id=$3 AND batch_lot=$4 AND state='available'
             FOR UPDATE`,
            [auth.tenantId, locationId, productId, batchLot]
          )
        ).rows[0];
        const stockId = existingStock?.id || `wstock-${randomUUID()}`;
        const existingQuantity = existingStock ? Number(existingStock.quantity) : 0;
        const existingCost = existingStock ? Number(existingStock.unit_cost) : 0;
        const resultingCost = existingStock
          ? computeWeightedAverageUnitCost(existingQuantity, existingCost, quantity, unitCost)
          : unitCost;
        const stockResult = existingStock
          ? await client.query(
              `UPDATE pos_warehouse_stock
               SET quantity=$1,unit=$2,unit_cost=$3,expiry_date=$4,version=version+1,updated_at=now()
               WHERE tenant_id=$5 AND id=$6
               RETURNING *`,
              [existingQuantity + quantity, unit, resultingCost, expiryDate, auth.tenantId, stockId]
            )
          : await client.query(
              `INSERT INTO pos_warehouse_stock (tenant_id,id,location_id,product_id,product_name,sku,batch_lot,quantity,unit,unit_cost,selling_price,expiry_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
              [
                auth.tenantId,
                stockId,
                locationId,
                productId,
                current.name,
                current.sku,
                batchLot,
                quantity,
                unit,
                unitCost,
                null,
                expiryDate,
              ]
            );
        const ledger = await client.query(
          `INSERT INTO pos_warehouse_ledger (tenant_id,operation_id,reference_id,location_id,product_id,product_name,sku,batch_lot,entry_type,quantity_delta,balance_after,unit,unit_cost,performed_by,performed_by_name,performed_by_role,reason,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'receipt',$9,$9,$10,$11,$12,$13,$14,$15,$16::jsonb) RETURNING *`,
          [
            auth.tenantId,
            opId,
            stockId,
            locationId,
            productId,
            current.name,
            current.sku,
            batchLot,
            quantity,
            unit,
            resultingCost,
            auth.user.id,
            auth.user.name,
            auth.user.role,
            text(body.reason) || 'Warehouse receipt',
            JSON.stringify({
              vendor: text(body.vendor),
              invoiceNumber: text(body.invoiceNumber),
              quantityReceived: quantity,
              previousQuantity: existingQuantity,
              previousUnitCost: existingStock ? existingCost : undefined,
              performedByName: auth.user.name,
              performedByRole: auth.user.role,
            }),
          ]
        );
        const response = {
          stock: stockFromRow(stockResult.rows[0]),
          ledger: ledgerFromRow(ledger.rows[0]),
        };
        await client.query(
          `INSERT INTO pos_audit_log (tenant_id,user_id,action,entity_type,entity_id,operation_id,before_data,after_data,metadata) VALUES ($1,$2,'warehouse.received','warehouse_stock',$3,$4,$5::jsonb,$6::jsonb,$7::jsonb)`,
          [
            auth.tenantId,
            auth.user.id,
            stockId,
            opId,
            JSON.stringify({ quantity: existingQuantity, unitCost: existingCost }),
            JSON.stringify(response.stock),
            JSON.stringify({
              reason: text(body.reason) || 'Warehouse receipt',
              performedByName: auth.user.name,
              performedByRole: auth.user.role,
              vendor: text(body.vendor),
              invoiceNumber: text(body.invoiceNumber),
            }),
          ]
        );
        await client.query(
          `UPDATE pos_idempotency_keys SET response_status=201,response_body=$3::jsonb,completed_at=now() WHERE tenant_id=$1 AND idempotency_key=$2`,
          [auth.tenantId, `warehouse:${opId}`, JSON.stringify(response)]
        );
        await client.query('COMMIT');
        return NextResponse.json(response, { status: 201 });
      }

      if (action === 'process') {
        const locationId = text(body.locationId);
        const inputLines = Array.isArray(body.inputLines)
          ? (body.inputLines as Record<string, unknown>[])
          : [];
        const outputLines = Array.isArray(body.outputLines)
          ? (body.outputLines as Record<string, unknown>[])
          : [];
        const location = (
          await client.query(
            `SELECT kind, branch, name FROM pos_warehouse_locations WHERE tenant_id=$1 AND id=$2 AND active=true FOR SHARE`,
            [auth.tenantId, locationId]
          )
        ).rows[0];
        if (!location || location.kind !== 'warehouse')
          throw new HttpError(
            400,
            'Processing must happen at a warehouse location',
            'INVALID_LOCATION'
          );
        if (!inputLines.length || !outputLines.length)
          throw new HttpError(400, 'Processing needs input and output lines', 'VALIDATION_ERROR');
        const inputKeys = new Set<string>();
        for (const input of inputLines) {
          const key = `${text(input.productId)}\u0000${text(input.batchLot)}`;
          if (inputKeys.has(key))
            throw new HttpError(
              400,
              'Processing cannot contain duplicate input product batches',
              'DUPLICATE_PROCESSING_LINE'
            );
          inputKeys.add(key);
        }
        const outputKeys = new Set<string>();
        for (const output of outputLines) {
          const batchLot = text(output.batchLot);
          if (!batchLot) continue;
          const key = `${text(output.productId)}\u0000${batchLot}`;
          if (outputKeys.has(key))
            throw new HttpError(
              400,
              'Processing cannot contain duplicate output product batches',
              'DUPLICATE_PROCESSING_LINE'
            );
          outputKeys.add(key);
        }
        const totalOutputQuantity = outputLines.reduce(
          (total, line) => total + positive(line.quantity, 'Output quantity'),
          0
        );
        const processingCost = nonNegative(body.processingCost ?? 0, 'Processing cost');
        const lossQuantity = nonNegative(body.lossQuantity ?? 0, 'Loss quantity');
        let totalInputCost = 0;
        const auditInputs: Record<string, unknown>[] = [];
        for (const input of inputLines) {
          const productId = text(input.productId);
          const batchLot = text(input.batchLot);
          const quantity = positive(input.quantity, 'Input quantity');
          const stock = (
            await client.query(
              `SELECT * FROM pos_warehouse_stock WHERE tenant_id=$1 AND location_id=$2 AND product_id=$3 AND batch_lot=$4 AND state='available' FOR UPDATE`,
              [auth.tenantId, locationId, productId, batchLot]
            )
          ).rows[0];
          if (!stock || Number(stock.quantity) < quantity)
            throw new HttpError(
              409,
              `Insufficient stock for ${productId} / ${batchLot}`,
              'INSUFFICIENT_WAREHOUSE_STOCK'
            );
          const balance = Number(stock.quantity) - quantity;
          totalInputCost += quantity * Number(stock.unit_cost);
          await client.query(
            `UPDATE pos_warehouse_stock SET quantity=$1,version=version+1,updated_at=now() WHERE tenant_id=$2 AND id=$3`,
            [balance, auth.tenantId, stock.id]
          );
          await client.query(
            `INSERT INTO pos_warehouse_ledger (tenant_id,operation_id,reference_id,location_id,product_id,product_name,sku,batch_lot,entry_type,quantity_delta,balance_after,unit,unit_cost,performed_by,performed_by_name,performed_by_role,reason,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'processing-input',$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)`,
            [
              auth.tenantId,
              opId,
              opId,
              locationId,
              productId,
              String(stock.product_name),
              String(stock.sku),
              batchLot,
              -quantity,
              balance,
              String(stock.unit),
              Number(stock.unit_cost),
              auth.user.id,
              auth.user.name,
              auth.user.role,
              'Processing input consumed',
              JSON.stringify({ processingCost, performedByName: auth.user.name }),
            ]
          );
          auditInputs.push({ productId, batchLot, quantity, unitCost: Number(stock.unit_cost) });
        }
        if (lossQuantity > 0) {
          const lossInput = auditInputs[0];
          const lossStock = (
            await client.query(
              `SELECT * FROM pos_warehouse_stock
               WHERE tenant_id=$1 AND location_id=$2 AND product_id=$3 AND batch_lot=$4 AND state='available'
               FOR SHARE`,
              [auth.tenantId, locationId, lossInput.productId, lossInput.batchLot]
            )
          ).rows[0];
          if (!lossStock)
            throw new HttpError(
              409,
              'Unable to record processing loss against the consumed stock',
              'PROCESSING_LOSS_STOCK_NOT_FOUND'
            );
          await client.query(
            `INSERT INTO pos_warehouse_ledger (tenant_id,operation_id,reference_id,location_id,product_id,product_name,sku,batch_lot,entry_type,quantity_delta,balance_after,unit,unit_cost,performed_by,performed_by_name,performed_by_role,reason,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'processing-loss',0,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)`,
            [
              auth.tenantId,
              opId,
              opId,
              locationId,
              lossInput.productId,
              String(lossStock.product_name),
              String(lossStock.sku),
              lossInput.batchLot,
              Number(lossStock.quantity),
              String(lossStock.unit),
              Number(lossStock.unit_cost),
              auth.user.id,
              auth.user.name,
              auth.user.role,
              'Processing loss recorded',
              JSON.stringify({
                lossQuantity,
                lossUnit: String(lossStock.unit),
                performedByName: auth.user.name,
                performedByRole: auth.user.role,
              }),
            ]
          );
        }
        const outputUnitCost = calculateProcessingUnitCost(
          totalInputCost,
          processingCost,
          totalOutputQuantity
        );
        const auditOutputs: Record<string, unknown>[] = [];
        for (const output of outputLines) {
          const productId = text(output.productId);
          const product = (
            await client.query(
              `SELECT * FROM pos_tenant_inventory WHERE tenant_id=$1 AND id=$2 FOR SHARE`,
              [auth.tenantId, productId]
            )
          ).rows[0];
          if (!product)
            throw new HttpError(
              404,
              `Output product ${productId} was not found`,
              'PRODUCT_NOT_FOUND'
            );
          const quantity = positive(output.quantity, 'Output quantity');
          const batchLot = text(output.batchLot) || `PROC-${randomUUID().slice(0, 8)}`;
          const unit =
            text(output.unit) ||
            String((product.data as InventoryItem).unitOfMeasurement || 'unit');
          const unitCost =
            nonNegative(output.unitCost ?? outputUnitCost, 'Output unit cost') || outputUnitCost;
          const stockId = `wstock-${randomUUID()}`;
          await client.query(
            `INSERT INTO pos_warehouse_stock (tenant_id,id,location_id,product_id,product_name,sku,batch_lot,quantity,unit,unit_cost,selling_price,expiry_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (tenant_id,location_id,product_id,batch_lot,state) DO UPDATE SET quantity=pos_warehouse_stock.quantity+EXCLUDED.quantity,unit_cost=EXCLUDED.unit_cost,version=pos_warehouse_stock.version+1,updated_at=now()`,
            [
              auth.tenantId,
              stockId,
              locationId,
              productId,
              String(product.name),
              String(product.sku),
              batchLot,
              quantity,
              unit,
              unitCost,
              output.sellingPrice == null
                ? null
                : nonNegative(output.sellingPrice, 'Selling price'),
              dateOnly(output.expiryDate, 'Output expiry date') || null,
            ]
          );
          const balance = Number(
            (
              await client.query(
                `SELECT quantity FROM pos_warehouse_stock WHERE tenant_id=$1 AND location_id=$2 AND product_id=$3 AND batch_lot=$4 AND state='available' FOR SHARE`,
                [auth.tenantId, locationId, productId, batchLot]
              )
            ).rows[0].quantity
          );
          await client.query(
            `INSERT INTO pos_warehouse_ledger (tenant_id,operation_id,reference_id,location_id,product_id,product_name,sku,batch_lot,entry_type,quantity_delta,balance_after,unit,unit_cost,performed_by,performed_by_name,performed_by_role,reason,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'processing-output',$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)`,
            [
              auth.tenantId,
              opId,
              opId,
              locationId,
              productId,
              String(product.name),
              String(product.sku),
              batchLot,
              quantity,
              balance,
              unit,
              unitCost,
              auth.user.id,
              auth.user.name,
              auth.user.role,
              'Processing output created',
              JSON.stringify({
                totalInputCost,
                processingCost,
                totalOutputQuantity,
                outputUnitCost,
              }),
            ]
          );
          auditOutputs.push({ productId, batchLot, quantity, unit, unitCost });
        }
        const response = {
          operationId: opId,
          inputLines: auditInputs,
          outputLines: auditOutputs,
          totalInputCost,
          processingCost,
          lossQuantity,
          performedBy: auth.user.name,
        };
        await client.query(
          `INSERT INTO pos_audit_log (tenant_id,user_id,action,entity_type,entity_id,operation_id,after_data,metadata) VALUES ($1,$2,'warehouse.processing.completed','warehouse_processing',$3,$4,$5::jsonb,$6::jsonb)`,
          [
            auth.tenantId,
            auth.user.id,
            opId,
            opId,
            JSON.stringify(response),
            JSON.stringify({ performedByName: auth.user.name, performedByRole: auth.user.role }),
          ]
        );
        await client.query(
          `UPDATE pos_idempotency_keys SET response_status=201,response_body=$3::jsonb,completed_at=now() WHERE tenant_id=$1 AND idempotency_key=$2`,
          [auth.tenantId, `warehouse:${opId}`, JSON.stringify(response)]
        );
        await client.query('COMMIT');
        return NextResponse.json(response, { status: 201 });
      }

      if (action === 'approve-transfer') {
        const transferId = text(body.transferId);
        const transferRow = (
          await client.query(
            `SELECT * FROM pos_warehouse_transfers WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
            [auth.tenantId, transferId]
          )
        ).rows[0];
        if (!transferRow) throw new HttpError(404, 'Transfer was not found', 'TRANSFER_NOT_FOUND');
        const transfer = transferRow.data as WarehouseTransfer;
        if (transfer.status !== 'requested') {
          throw new HttpError(
            409,
            'Only requested transfers can be approved',
            'INVALID_TRANSFER_STATE'
          );
        }
        transfer.status = 'approved';
        transfer.approvedBy = auth.user.id;
        transfer.approvedAt = new Date().toISOString();
        await client.query(
          `UPDATE pos_warehouse_transfers SET status='approved',data=$1::jsonb,updated_at=now() WHERE tenant_id=$2 AND id=$3`,
          [JSON.stringify(transfer), auth.tenantId, transfer.id]
        );
        await client.query(
          `INSERT INTO pos_audit_log (tenant_id,user_id,action,entity_type,entity_id,operation_id,after_data,metadata) VALUES ($1,$2,'warehouse.transfer.approved','warehouse_transfer',$3,$4,$5::jsonb,$6::jsonb)`,
          [
            auth.tenantId,
            auth.user.id,
            transfer.id,
            opId,
            JSON.stringify(transfer),
            JSON.stringify({ performedByName: auth.user.name, performedByRole: auth.user.role }),
          ]
        );
        const response = { transfer };
        await client.query(
          `UPDATE pos_idempotency_keys SET response_status=200,response_body=$3::jsonb,completed_at=now() WHERE tenant_id=$1 AND idempotency_key=$2`,
          [auth.tenantId, `warehouse:${opId}`, JSON.stringify(response)]
        );
        await client.query('COMMIT');
        return NextResponse.json(response);
      }

      if (action === 'create-transfer') {
        const fromLocationId = text(body.fromLocationId);
        const toLocationId = text(body.toLocationId);
        const rawLines = Array.isArray(body.lines) ? body.lines : [];
        if (
          !fromLocationId ||
          !toLocationId ||
          fromLocationId === toLocationId ||
          rawLines.length === 0
        )
          throw new HttpError(
            400,
            'Source, destination, and at least one line are required',
            'VALIDATION_ERROR'
          );
        const locations = await client.query(
          `SELECT id,kind FROM pos_warehouse_locations WHERE tenant_id=$1 AND id = ANY($2::text[]) AND active=true FOR SHARE`,
          [auth.tenantId, [fromLocationId, toLocationId]]
        );
        if (locations.rowCount !== 2)
          throw new HttpError(400, 'Both locations must be active', 'INVALID_LOCATION');
        const kindById = new Map(locations.rows.map((row) => [String(row.id), String(row.kind)]));
        if (kindById.get(fromLocationId) !== 'warehouse' || kindById.get(toLocationId) !== 'store')
          throw new HttpError(
            400,
            'Transfers must move stock from a warehouse to a selling store',
            'INVALID_TRANSFER_ROUTE'
          );
        const lines: WarehouseTransferLine[] = rawLines.map((value, index) => {
          const line = value as Record<string, unknown>;
          return {
            id: `line-${index + 1}-${randomUUID().slice(0, 8)}`,
            productId: text(line.productId),
            productName: text(line.productName),
            sku: text(line.sku),
            batchLot: text(line.batchLot),
            quantityRequested: positive(line.quantity, `Line ${index + 1} quantity`),
            quantityDispatched: 0,
            quantityReceived: 0,
            quantityRejected: 0,
            unit: text(line.unit) || 'unit',
            unitCost: nonNegative(line.unitCost, `Line ${index + 1} cost`),
            sellingPrice:
              line.sellingPrice == null
                ? undefined
                : nonNegative(line.sellingPrice, `Line ${index + 1} selling price`),
            expiryDate: dateOnly(line.expiryDate, `Line ${index + 1} expiry date`) || undefined,
          };
        });
        if (lines.some((line) => !line.productId))
          throw new HttpError(400, 'Every transfer line needs a product', 'VALIDATION_ERROR');
        const transferKeys = new Set<string>();
        for (const line of lines) {
          const key = `${line.productId}\u0000${line.batchLot}`;
          if (transferKeys.has(key))
            throw new HttpError(
              400,
              'A transfer cannot contain duplicate product batches',
              'DUPLICATE_TRANSFER_LINE'
            );
          transferKeys.add(key);
        }
        const id = `transfer-${randomUUID()}`;
        const transferNumber = `TRF-${Date.now().toString(36).toUpperCase()}`;
        const transfer: WarehouseTransfer = {
          id,
          transferNumber,
          fromLocationId,
          toLocationId,
          status: 'requested',
          lines,
          requestedBy: auth.user.id,
          requestedAt: new Date().toISOString(),
          notes: text(body.notes) || undefined,
        };
        await client.query(
          `INSERT INTO pos_warehouse_transfers (tenant_id,id,transfer_number,from_location_id,to_location_id,status,data,requested_by,requested_by_name) VALUES ($1,$2,$3,$4,$5,'requested',$6::jsonb,$7,$8)`,
          [
            auth.tenantId,
            id,
            transferNumber,
            fromLocationId,
            toLocationId,
            JSON.stringify(transfer),
            auth.user.id,
            auth.user.name,
          ]
        );
        await client.query(
          `INSERT INTO pos_audit_log (tenant_id,user_id,action,entity_type,entity_id,operation_id,after_data,metadata) VALUES ($1,$2,'warehouse.transfer.requested','warehouse_transfer',$3,$4,$5::jsonb,$6::jsonb)`,
          [
            auth.tenantId,
            auth.user.id,
            id,
            opId,
            JSON.stringify(transfer),
            JSON.stringify({ performedByName: auth.user.name, performedByRole: auth.user.role }),
          ]
        );
        const response = { transfer };
        await client.query(
          `UPDATE pos_idempotency_keys SET response_status=201,response_body=$3::jsonb,completed_at=now() WHERE tenant_id=$1 AND idempotency_key=$2`,
          [auth.tenantId, `warehouse:${opId}`, JSON.stringify(response)]
        );
        await client.query('COMMIT');
        return NextResponse.json(response, { status: 201 });
      }

      if (action === 'dispatch') {
        const transferId = text(body.transferId);
        const transferRow = (
          await client.query(
            `SELECT * FROM pos_warehouse_transfers WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
            [auth.tenantId, transferId]
          )
        ).rows[0];
        if (!transferRow) throw new HttpError(404, 'Transfer was not found', 'TRANSFER_NOT_FOUND');
        const transfer = transferRow.data as WarehouseTransfer;
        if (transfer.status !== 'approved')
          throw new HttpError(
            409,
            'A transfer must be approved before it can be dispatched',
            'TRANSFER_APPROVAL_REQUIRED'
          );
        const nextLines = [...transfer.lines];
        for (const line of nextLines) {
          const quantity = line.quantityRequested;
          const stock = (
            await client.query(
              `SELECT * FROM pos_warehouse_stock WHERE tenant_id=$1 AND location_id=$2 AND product_id=$3 AND batch_lot=$4 AND state='available' FOR UPDATE`,
              [auth.tenantId, transfer.fromLocationId, line.productId, line.batchLot]
            )
          ).rows[0];
          if (!stock || Number(stock.quantity) < quantity)
            throw new HttpError(
              409,
              `${line.productName || line.productId} does not have enough warehouse stock`,
              'INSUFFICIENT_WAREHOUSE_STOCK'
            );
          const balance = Number(stock.quantity) - quantity;
          await client.query(
            `UPDATE pos_warehouse_stock SET quantity=$1,version=version+1,updated_at=now() WHERE tenant_id=$2 AND id=$3`,
            [balance, auth.tenantId, stock.id]
          );
          await client.query(
            `INSERT INTO pos_warehouse_ledger (tenant_id,operation_id,reference_id,location_id,product_id,product_name,sku,batch_lot,entry_type,quantity_delta,balance_after,unit,unit_cost,performed_by,performed_by_name,performed_by_role,reason,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'dispatch',$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)`,
            [
              auth.tenantId,
              opId,
              transfer.id,
              transfer.fromLocationId,
              line.productId,
              line.productName,
              line.sku,
              line.batchLot,
              -quantity,
              balance,
              line.unit,
              Number(stock.unit_cost),
              auth.user.id,
              auth.user.name,
              auth.user.role,
              'Released for transfer',
              JSON.stringify({
                transferNumber: transfer.transferNumber,
                destination: transfer.toLocationId,
              }),
            ]
          );
          line.quantityDispatched = quantity;
        }
        transfer.status = 'dispatched';
        transfer.dispatchedBy = auth.user.id;
        transfer.dispatchedAt = new Date().toISOString();
        transfer.lines = nextLines;
        await client.query(
          `UPDATE pos_warehouse_transfers SET status='dispatched',data=$1::jsonb,updated_at=now() WHERE tenant_id=$2 AND id=$3`,
          [JSON.stringify(transfer), auth.tenantId, transfer.id]
        );
        await client.query(
          `INSERT INTO pos_audit_log (tenant_id,user_id,action,entity_type,entity_id,operation_id,after_data,metadata)
           VALUES ($1,$2,'warehouse.transfer.dispatched','warehouse_transfer',$3,$4,$5::jsonb,$6::jsonb)`,
          [
            auth.tenantId,
            auth.user.id,
            transfer.id,
            opId,
            JSON.stringify(transfer),
            JSON.stringify({
              transferNumber: transfer.transferNumber,
              destination: transfer.toLocationId,
              performedByName: auth.user.name,
              performedByRole: auth.user.role,
            }),
          ]
        );
        const response = { transfer };
        await client.query(
          `UPDATE pos_idempotency_keys SET response_status=200,response_body=$3::jsonb,completed_at=now() WHERE tenant_id=$1 AND idempotency_key=$2`,
          [auth.tenantId, `warehouse:${opId}`, JSON.stringify(response)]
        );
        await client.query('COMMIT');
        return NextResponse.json(response);
      }

      if (action === 'receive-transfer') {
        const transferId = text(body.transferId);
        const transferRow = (
          await client.query(
            `SELECT * FROM pos_warehouse_transfers WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
            [auth.tenantId, transferId]
          )
        ).rows[0];
        if (!transferRow) throw new HttpError(404, 'Transfer was not found', 'TRANSFER_NOT_FOUND');
        const transfer = transferRow.data as WarehouseTransfer;
        if (!['dispatched', 'partially-received'].includes(transfer.status))
          throw new HttpError(
            409,
            'This transfer is not ready to receive',
            'INVALID_TRANSFER_STATE'
          );
        const destination = (
          await client.query(
            `SELECT kind, branch, name FROM pos_warehouse_locations WHERE tenant_id=$1 AND id=$2 AND active=true FOR SHARE`,
            [auth.tenantId, transfer.toLocationId]
          )
        ).rows[0];
        if (!destination)
          throw new HttpError(404, 'Destination location was not found', 'INVALID_LOCATION');
        const userBranch = auth.user.branch?.trim();
        const isPrivileged = ['owner', 'super-admin', 'manager'].includes(auth.user.role);
        if (
          userBranch &&
          !isPrivileged &&
          destination.branch &&
          destination.branch !== userBranch
        ) {
          throw new HttpError(
            403,
            'You can only receive transfers assigned to your branch',
            'BRANCH_ACCESS_DENIED'
          );
        }
        const receivedLines = Array.isArray(body.lines)
          ? (body.lines as Record<string, unknown>[])
          : [];
        if (!receivedLines.length)
          throw new HttpError(
            400,
            'Receipt quantities must be explicitly provided for each line',
            'RECEIPT_LINES_REQUIRED'
          );
        const expectedLineIds = new Set(transfer.lines.map((line) => line.id));
        const submittedLineIds = receivedLines.map((line) => text(line.lineId));
        if (
          submittedLineIds.some((lineId) => !expectedLineIds.has(lineId)) ||
          new Set(submittedLineIds).size !== submittedLineIds.length
        )
          throw new HttpError(
            400,
            'Receipt contains an invalid or duplicate line',
            'INVALID_RECEIPT'
          );
        const nextLines = [...transfer.lines];
        for (const line of nextLines) {
          const input = receivedLines.find((candidate) => text(candidate.lineId) === line.id);
          const accepted = input ? nonNegative(input.accepted, 'Accepted quantity') : 0;
          const rejected = input ? nonNegative(input.rejected, 'Rejected quantity') : 0;
          const remaining = line.quantityDispatched - line.quantityReceived - line.quantityRejected;
          try {
            validateReceiptQuantities(remaining, accepted, rejected);
          } catch {
            throw new HttpError(
              400,
              `Received quantity exceeds dispatched quantity for ${line.productName}`,
              'INVALID_RECEIPT'
            );
          }
          if (accepted === 0 && rejected === 0) continue;
          const stockId = `wstock-${randomUUID()}`;
          let balance = 0;
          if (accepted > 0) {
            if (destination.kind !== 'store') {
              await client.query(
                `INSERT INTO pos_warehouse_stock (tenant_id,id,location_id,product_id,product_name,sku,batch_lot,quantity,unit,unit_cost,selling_price,expiry_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (tenant_id,location_id,product_id,batch_lot,state) DO UPDATE SET quantity=pos_warehouse_stock.quantity+EXCLUDED.quantity,version=pos_warehouse_stock.version+1,updated_at=now()`,
                [
                  auth.tenantId,
                  stockId,
                  transfer.toLocationId,
                  line.productId,
                  line.productName,
                  line.sku,
                  line.batchLot,
                  accepted,
                  line.unit,
                  line.unitCost,
                  line.sellingPrice ?? null,
                  line.expiryDate ?? null,
                ]
              );
              balance = Number(
                (
                  await client.query(
                    `SELECT quantity FROM pos_warehouse_stock WHERE tenant_id=$1 AND location_id=$2 AND product_id=$3 AND batch_lot=$4 AND state='available' FOR SHARE`,
                    [auth.tenantId, transfer.toLocationId, line.productId, line.batchLot]
                  )
                ).rows[0].quantity
              );
            }
            if (destination.kind === 'store') {
              const productRow = (
                await client.query(
                  `SELECT * FROM pos_tenant_inventory WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
                  [auth.tenantId, line.productId]
                )
              ).rows[0];
              if (!productRow)
                throw new HttpError(
                  409,
                  `${line.productName || line.productId} is not configured in POS inventory`,
                  'POS_PRODUCT_NOT_FOUND'
                );
              const current = productRow.data as InventoryItem;
              const branch = String(destination.branch || destination.name);
              const branchRow = (
                await client.query(
                  `SELECT * FROM pos_branch_inventory WHERE tenant_id=$1 AND branch=$2 AND inventory_item_id=$3 FOR UPDATE`,
                  [auth.tenantId, branch, line.productId]
                )
              ).rows[0];
              const beforeQty = branchRow
                ? Number(branchRow.current_qty)
                : branch === 'Main Store'
                  ? Number(productRow.current_qty)
                  : 0;
              const beforeCost = branchRow
                ? Number(branchRow.unit_cost)
                : Number(productRow.unit_cost);
              const resultingCost = computeWeightedAverageUnitCost(
                beforeQty,
                beforeCost,
                accepted,
                line.unitCost
              );
              if (resultingCost <= 0)
                throw new HttpError(
                  409,
                  `Cannot calculate a valid cost for ${line.productName}`,
                  'INVALID_INVENTORY_COST'
                );
              const sellingPrice =
                line.sellingPrice ??
                (branchRow ? Number(branchRow.selling_price) : Number(productRow.selling_price));
              const expiryDate = line.expiryDate || current.expiryDate;
              const now = new Date().toISOString();
              const updated: InventoryItem = {
                ...current,
                currentQty: beforeQty + accepted,
                unitCost: resultingCost,
                sellingPrice,
                expiryDate,
                lastRestocked: now.slice(0, 10),
                stockStatus: computeStockStatus(
                  beforeQty + accepted,
                  current.reorderLevel,
                  expiryDate
                ),
                updatedAt: now,
              };
              await client.query(
                `INSERT INTO pos_branch_inventory (tenant_id,branch,inventory_item_id,current_qty,unit_cost,selling_price,data) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT (tenant_id,branch,inventory_item_id) DO UPDATE SET current_qty=EXCLUDED.current_qty,unit_cost=EXCLUDED.unit_cost,selling_price=EXCLUDED.selling_price,data=EXCLUDED.data,version=pos_branch_inventory.version+1,updated_at=now()`,
                [
                  auth.tenantId,
                  branch,
                  line.productId,
                  updated.currentQty,
                  updated.unitCost,
                  updated.sellingPrice,
                  JSON.stringify(updated),
                ]
              );
              if (branch === 'Main Store') {
                await client.query(
                  `UPDATE pos_tenant_inventory SET current_qty=$1,unit_cost=$2,selling_price=$3,expiry_date=$4,stock_status=$5,data=$6::jsonb,version=version+1,updated_at=now() WHERE tenant_id=$7 AND id=$8`,
                  [
                    updated.currentQty,
                    updated.unitCost,
                    updated.sellingPrice,
                    updated.expiryDate || null,
                    updated.stockStatus,
                    JSON.stringify(updated),
                    auth.tenantId,
                    line.productId,
                  ]
                );
              }
              await client.query(
                `INSERT INTO pos_audit_log (tenant_id,user_id,action,entity_type,entity_id,operation_id,before_data,after_data,metadata) VALUES ($1,$2,'warehouse.transfer.added-to-pos','inventory',$3,$4,$5::jsonb,$6::jsonb,$7::jsonb)`,
                [
                  auth.tenantId,
                  auth.user.id,
                  line.productId,
                  opId,
                  JSON.stringify({ branch, currentQty: beforeQty, unitCost: beforeCost }),
                  JSON.stringify({
                    branch,
                    currentQty: updated.currentQty,
                    unitCost: updated.unitCost,
                    sellingPrice: updated.sellingPrice,
                  }),
                  JSON.stringify({
                    transferNumber: transfer.transferNumber,
                    locationId: transfer.toLocationId,
                    branch,
                    performedByName: auth.user.name,
                    performedByRole: auth.user.role,
                  }),
                ]
              );
              balance = updated.currentQty;
            }
            await client.query(
              `INSERT INTO pos_warehouse_ledger (tenant_id,operation_id,reference_id,location_id,product_id,product_name,sku,batch_lot,entry_type,quantity_delta,balance_after,unit,unit_cost,performed_by,performed_by_name,performed_by_role,reason,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'transfer-receipt',$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)`,
              [
                auth.tenantId,
                opId,
                transfer.id,
                transfer.toLocationId,
                line.productId,
                line.productName,
                line.sku,
                line.batchLot,
                accepted,
                balance,
                line.unit,
                line.unitCost,
                auth.user.id,
                auth.user.name,
                auth.user.role,
                'Transfer received',
                JSON.stringify({
                  transferNumber: transfer.transferNumber,
                  rejected,
                  notes: text(input?.notes),
                }),
              ]
            );
            if (rejected > 0) {
              await client.query(
                `INSERT INTO pos_warehouse_ledger (tenant_id,operation_id,reference_id,location_id,product_id,product_name,sku,batch_lot,entry_type,quantity_delta,balance_after,unit,unit_cost,performed_by,performed_by_name,performed_by_role,reason,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'rejection',0,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)`,
                [
                  auth.tenantId,
                  opId,
                  transfer.id,
                  transfer.toLocationId,
                  line.productId,
                  line.productName,
                  line.sku,
                  line.batchLot,
                  balance,
                  line.unit,
                  line.unitCost,
                  auth.user.id,
                  auth.user.name,
                  auth.user.role,
                  'Transfer quantity rejected at destination',
                  JSON.stringify({
                    rejected,
                    notes: text(input?.notes),
                    transferNumber: transfer.transferNumber,
                  }),
                ]
              );
            }
          }
          if (accepted === 0 && rejected > 0) {
            await client.query(
              `INSERT INTO pos_warehouse_ledger (tenant_id,operation_id,reference_id,location_id,product_id,product_name,sku,batch_lot,entry_type,quantity_delta,balance_after,unit,unit_cost,performed_by,performed_by_name,performed_by_role,reason,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'rejection',0,0,$9,$10,$11,$12,$13,$14,$15::jsonb)`,
              [
                auth.tenantId,
                opId,
                transfer.id,
                transfer.toLocationId,
                line.productId,
                line.productName,
                line.sku,
                line.batchLot,
                line.unit,
                line.unitCost,
                auth.user.id,
                auth.user.name,
                auth.user.role,
                'Transfer quantity rejected at destination',
                JSON.stringify({
                  rejected,
                  notes: text(input?.notes),
                  transferNumber: transfer.transferNumber,
                }),
              ]
            );
          }
          line.quantityReceived += accepted;
          line.quantityRejected += rejected;
        }
        const complete = nextLines.every(
          (line) => line.quantityReceived + line.quantityRejected >= line.quantityDispatched
        );
        transfer.status = complete ? 'received' : 'partially-received';
        transfer.receivedBy = auth.user.id;
        transfer.receivedAt = new Date().toISOString();
        transfer.lines = nextLines;
        await client.query(
          `UPDATE pos_warehouse_transfers SET status=$1,data=$2::jsonb,updated_at=now() WHERE tenant_id=$3 AND id=$4`,
          [transfer.status, JSON.stringify(transfer), auth.tenantId, transfer.id]
        );
        await client.query(
          `INSERT INTO pos_audit_log (tenant_id,user_id,action,entity_type,entity_id,operation_id,after_data,metadata)
           VALUES ($1,$2,'warehouse.transfer.received','warehouse_transfer',$3,$4,$5::jsonb,$6::jsonb)`,
          [
            auth.tenantId,
            auth.user.id,
            transfer.id,
            opId,
            JSON.stringify(transfer),
            JSON.stringify({
              transferNumber: transfer.transferNumber,
              destination: transfer.toLocationId,
              status: transfer.status,
              performedByName: auth.user.name,
              performedByRole: auth.user.role,
            }),
          ]
        );
        const response = { transfer };
        await client.query(
          `UPDATE pos_idempotency_keys SET response_status=200,response_body=$3::jsonb,completed_at=now() WHERE tenant_id=$1 AND idempotency_key=$2`,
          [auth.tenantId, `warehouse:${opId}`, JSON.stringify(response)]
        );
        await client.query('COMMIT');
        return NextResponse.json(response);
      }
      throw new HttpError(400, 'Warehouse action is invalid', 'VALIDATION_ERROR');
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
