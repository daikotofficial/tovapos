import { createHash, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { Customer, InventoryItem, SaleTransaction, StockMovement } from '@/lib/pos/types';
import { getPosPool } from '@/lib/server/pos-db';
import {
  assertPermission,
  assertTenantPlanPermission,
  assertSameOrigin,
  errorResponse,
  HttpError,
  requireAuth,
} from '@/lib/server/security';
import { upsertTenantInventoryIndex, upsertTenantSaleIndex } from '@/lib/server/tenant-indexes';

interface SaleCommandItem {
  inventoryItemId: string;
  quantity: number;
  discount: number;
  unitPrice: number;
}

function money(value: number): number {
  return Number(value.toFixed(2));
}

function commandHash(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

function parseItems(value: unknown): SaleCommandItem[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new HttpError(400, 'A sale must contain 1 to 100 items', 'VALIDATION_ERROR');
  }
  const aggregated = new Map<string, SaleCommandItem>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') {
      throw new HttpError(400, 'Sale item is invalid', 'VALIDATION_ERROR');
    }
    const item = raw as Record<string, unknown>;
    const inventoryItemId = typeof item.inventoryItemId === 'string' ? item.inventoryItemId : '';
    const quantity = Number(item.quantity);
    const discount = Number(item.discount ?? 0);
    const unitPrice = Number(item.unitPrice);
    if (
      !inventoryItemId ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(discount) ||
      discount < 0 ||
      discount > 100 ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0
    ) {
      throw new HttpError(
        400,
        'Sale item quantity, price, or discount is invalid',
        'VALIDATION_ERROR'
      );
    }
    const existing = aggregated.get(inventoryItemId);
    if (existing) existing.quantity += quantity;
    else aggregated.set(inventoryItemId, { inventoryItemId, quantity, discount, unitPrice });
  }
  return [...aggregated.values()];
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    assertPermission(auth, 'checkout');
    const body = (await request.json()) as Record<string, unknown>;
    const operationId =
      typeof body.operationId === 'string' && /^[A-Za-z0-9:_-]{8,160}$/.test(body.operationId)
        ? body.operationId
        : randomUUID();
    const idempotencyKey =
      typeof body.idempotencyKey === 'string' && body.idempotencyKey.length <= 240
        ? body.idempotencyKey
        : `sale:${operationId}`;
    const items = parseItems(body.items);
    const paymentMethod = typeof body.paymentMethod === 'string' ? body.paymentMethod : 'cash';
    const cashTendered = Number(body.cashTendered ?? 0);
    if (
      !['cash', 'card', 'mobile', 'bank-transfer', 'split', 'credit'].includes(paymentMethod) ||
      !Number.isFinite(cashTendered) ||
      cashTendered < 0
    ) {
      throw new HttpError(400, 'Payment method or tendered amount is invalid', 'VALIDATION_ERROR');
    }
    if (paymentMethod === 'credit') {
      assertPermission(auth, 'credit-sales');
      await assertTenantPlanPermission(auth.tenantId, 'credit-sales');
    }
    const customerName =
      typeof body.customerName === 'string' ? body.customerName.trim() : 'Walk-in Customer';
    const requestHash = commandHash({
      operationId,
      idempotencyKey,
      items,
      paymentMethod,
      cashTendered,
      customerName,
    });
    const client = await getPosPool().connect();
    try {
      await client.query('BEGIN');
      const claimed = await client.query(
        `INSERT INTO pos_idempotency_keys
          (tenant_id, idempotency_key, operation_type, request_hash)
         VALUES ($1, $2, 'sale', $3)
         ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
         RETURNING idempotency_key`,
        [auth.tenantId, idempotencyKey, requestHash]
      );
      if (claimed.rowCount === 0) {
        const previous = await client.query(
          `SELECT request_hash, response_status, response_body
           FROM pos_idempotency_keys WHERE tenant_id = $1 AND idempotency_key = $2 FOR UPDATE`,
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
          throw new HttpError(409, 'This sale is already being processed', 'OPERATION_IN_PROGRESS');
        }
        await client.query('COMMIT');
        return NextResponse.json(row.response_body, { status: row.response_status ?? 200 });
      }

      const settingsResult = await client.query(
        `SELECT data FROM pos_tenant_records
         WHERE tenant_id = $1 AND store_name = 'settings' AND record_id = 'settings'`,
        [auth.tenantId]
      );
      const settings = settingsResult.rows[0]?.data ?? {};
      const inventoryResult = await client.query(
        `SELECT * FROM pos_tenant_inventory
         WHERE tenant_id = $1 AND id = ANY($2::text[])
         ORDER BY id FOR UPDATE`,
        [auth.tenantId, items.map((item) => item.inventoryItemId)]
      );
      if (inventoryResult.rows.length !== items.length) {
        throw new HttpError(409, 'One or more products no longer exist', 'INVENTORY_CONFLICT');
      }
      const inventoryById = new Map(inventoryResult.rows.map((row) => [row.id as string, row]));
      const now = new Date().toISOString();
      let subtotal = 0;
      let discountTotal = 0;
      let taxAmount = 0;
      let exclusiveTaxAmount = 0;
      const updatedInventory: InventoryItem[] = [];

      const lineItems = items.map((requested) => {
        const row = inventoryById.get(requested.inventoryItemId);
        if (!row) throw new HttpError(409, 'Product no longer exists', 'INVENTORY_CONFLICT');
        if (row.product_status !== 'active') {
          throw new HttpError(409, `${row.name} is not active`, 'PRODUCT_NOT_SELLABLE');
        }
        if (
          row.expiry_date &&
          new Date(row.expiry_date).getTime() < new Date().setHours(0, 0, 0, 0)
        ) {
          throw new HttpError(409, `${row.name} is expired`, 'PRODUCT_EXPIRED');
        }
        if (Number(row.current_qty) < requested.quantity) {
          throw new HttpError(409, `${row.name} has insufficient stock`, 'INSUFFICIENT_STOCK');
        }
        const canOverridePrice = ['owner', 'super-admin', 'manager'].includes(auth.user.role);
        const canonicalPrice = Number(row.selling_price);
        if (!canOverridePrice && requested.unitPrice !== canonicalPrice) {
          throw new HttpError(
            403,
            'Price override requires manager access',
            'PRICE_OVERRIDE_FORBIDDEN'
          );
        }
        if (requested.discount > 0 && settings.allowCashierDiscounts === false) {
          assertPermission(auth, 'give-discount');
        }
        if (
          settings.allowSellingBelowCost === false &&
          requested.unitPrice < Number(row.unit_cost)
        ) {
          throw new HttpError(409, `${row.name} cannot be sold below cost`, 'BELOW_COST_FORBIDDEN');
        }
        const gross = money(requested.unitPrice * requested.quantity);
        const discountAmount = money(gross * (requested.discount / 100));
        const lineTotal = money(gross - discountAmount);
        const productData = row.data as InventoryItem;
        const productTaxRate = Math.max(0, Number(productData.taxRate) || 0);
        const defaultTaxRate = Math.max(0, Number(settings.taxRate) || 0);
        const taxApplies = Boolean(productData.taxApplicable || productTaxRate > 0);
        const lineTaxRate = taxApplies ? productTaxRate || defaultTaxRate : 0;
        const lineTaxMode = productData.taxMode ?? settings.taxMode ?? 'exclusive';
        const lineTaxAmount = lineTaxRate <= 0 ? 0 : money(gross * (lineTaxRate / 100));
        subtotal = money(subtotal + gross);
        discountTotal = money(discountTotal + discountAmount);
        taxAmount = money(taxAmount + lineTaxAmount);
        if (lineTaxMode === 'exclusive') {
          exclusiveTaxAmount = money(exclusiveTaxAmount + lineTaxAmount);
        }
        const nextQuantity = Number(row.current_qty) - requested.quantity;
        updatedInventory.push({
          ...productData,
          currentQty: nextQuantity,
          stockStatus: nextQuantity === 0 ? 'out' : row.stock_status,
          updatedAt: now,
        });
        return {
          id: `line-${operationId}-${row.id}`,
          inventoryItemId: row.id,
          productId: row.id,
          name: row.name,
          genericName: row.generic_name,
          sku: row.sku,
          barcode: row.barcode || undefined,
          batchLot: row.batch_lot,
          expiryDate: row.expiry_date ? String(row.expiry_date).slice(0, 10) : '',
          quantity: requested.quantity,
          unitPrice: requested.unitPrice,
          unitCost: Number(row.unit_cost),
          discount: requested.discount,
          lineTotal,
          discountAmount,
          taxApplicable: taxApplies,
          taxRate: lineTaxRate,
          taxMode: lineTaxMode,
          taxAmount: lineTaxAmount,
          requiresApproval: Boolean(row.data?.requiresApproval),
          isControlled: Boolean(row.data?.isControlled),
          category: row.category,
        };
      });

      const taxable = money(subtotal - discountTotal);
      const grandTotal = money(taxable + exclusiveTaxAmount);
      const receipt = await client.query(
        `INSERT INTO pos_receipt_sequences (tenant_id, next_number)
         VALUES ($1, 2)
         ON CONFLICT (tenant_id) DO UPDATE
           SET next_number = pos_receipt_sequences.next_number + 1
         RETURNING next_number - 1 AS receipt_number`,
        [auth.tenantId]
      );
      const receiptPrefix =
        typeof settings.receiptPrefix === 'string' ? settings.receiptPrefix : 'TXN';
      const transactionId = `${receiptPrefix}-${String(receipt.rows[0].receipt_number).padStart(8, '0')}`;
      const sale: SaleTransaction = {
        id: `sale-${operationId}`,
        transactionId,
        items: lineItems,
        subtotal,
        discountTotal,
        taxAmount,
        grandTotal,
        paymentMethod: paymentMethod as SaleTransaction['paymentMethod'],
        paymentStatus: paymentMethod === 'credit' ? 'unpaid' : 'paid',
        amountPaid: paymentMethod === 'credit' ? 0 : grandTotal,
        amountDue: paymentMethod === 'credit' ? grandTotal : 0,
        cashTendered,
        changeGiven: Math.max(0, money(cashTendered - grandTotal)),
        customerName,
        timestamp: now,
        cashier: auth.user.name,
        status: 'completed',
        syncStatus: 'synced',
      };
      const movements: StockMovement[] = updatedInventory.map((updated) => {
        const requested = items.find((item) => item.inventoryItemId === updated.id)!;
        const before = Number(inventoryById.get(updated.id).current_qty);
        return {
          id: `move-${operationId}-${updated.id}`,
          operationId,
          inventoryItemId: updated.id,
          productName: updated.name,
          sku: updated.sku,
          barcode: updated.barcode,
          batchLot: updated.batchLot,
          type: 'sale',
          quantityDelta: -requested.quantity,
          quantityBefore: before,
          quantityAfter: updated.currentQty,
          unitCost: updated.unitCost,
          unitPrice: requested.unitPrice,
          referenceId: sale.id,
          referenceLabel: transactionId,
          reason: 'Atomic POS checkout',
          createdAt: now,
          createdBy: auth.user.name,
          syncStatus: 'synced',
        };
      });

      let updatedCustomer: Customer | null = null;
      if (customerName && customerName.toLowerCase() !== 'walk-in customer') {
        const customerResult = await client.query(
          `SELECT record_id, data FROM pos_tenant_records
           WHERE tenant_id = $1 AND store_name = 'customers'
             AND (lower(data->>'name') = lower($2) OR data->>'phone' = $2)
           ORDER BY record_id LIMIT 1 FOR UPDATE`,
          [auth.tenantId, customerName]
        );
        if (customerResult.rows[0]) {
          const customer = customerResult.rows[0].data as Customer;
          updatedCustomer = {
            ...customer,
            totalSpend:
              paymentMethod === 'credit'
                ? customer.totalSpend
                : money(Number(customer.totalSpend ?? 0) + grandTotal),
            loyaltyPoints:
              paymentMethod === 'credit'
                ? customer.loyaltyPoints
                : Number(customer.loyaltyPoints ?? 0) + Math.floor(grandTotal / 100),
            updatedAt: now,
          };
          await client.query(
            `UPDATE pos_tenant_records SET data = $3::jsonb,
               version = version + 1, updated_at = now()
             WHERE tenant_id = $1 AND store_name = 'customers' AND record_id = $2`,
            [auth.tenantId, customerResult.rows[0].record_id, JSON.stringify(updatedCustomer)]
          );
        }
      }

      for (const updated of updatedInventory) {
        await client.query(
          `INSERT INTO pos_tenant_records (tenant_id, store_name, record_id, data)
           VALUES ($1, 'inventory', $2, $3::jsonb)
           ON CONFLICT (tenant_id, store_name, record_id) DO UPDATE SET
             data = EXCLUDED.data, version = pos_tenant_records.version + 1, updated_at = now()`,
          [auth.tenantId, updated.id, JSON.stringify(updated)]
        );
        await upsertTenantInventoryIndex(client, auth.tenantId, { ...updated });
      }
      await client.query(
        `INSERT INTO pos_tenant_records (tenant_id, store_name, record_id, data)
         VALUES ($1, 'sales', $2, $3::jsonb)`,
        [auth.tenantId, sale.id, JSON.stringify(sale)]
      );
      await upsertTenantSaleIndex(client, auth.tenantId, { ...sale });
      for (const movement of movements) {
        await client.query(
          `INSERT INTO pos_tenant_records (tenant_id, store_name, record_id, data)
           VALUES ($1, 'stockMovements', $2, $3::jsonb)`,
          [auth.tenantId, movement.id, JSON.stringify(movement)]
        );
      }
      const responseBody = {
        sale,
        inventory: updatedInventory,
        stockMovements: movements,
        customer: updatedCustomer,
      };
      await client.query(
        `UPDATE pos_idempotency_keys SET response_status = 201, response_body = $3::jsonb,
          completed_at = now() WHERE tenant_id = $1 AND idempotency_key = $2`,
        [auth.tenantId, idempotencyKey, JSON.stringify(responseBody)]
      );
      await client.query(
        `INSERT INTO pos_audit_log
          (tenant_id, user_id, action, entity_type, entity_id, operation_id, after_data)
         VALUES ($1, $2, 'sale.completed', 'sale', $3, $4, $5::jsonb)`,
        [auth.tenantId, auth.user.id, sale.id, operationId, JSON.stringify(sale)]
      );
      await client.query('COMMIT');
      return NextResponse.json(responseBody, { status: 201 });
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
