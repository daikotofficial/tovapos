import { createHash, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type {
  BusinessSettings,
  Customer,
  InventoryItem,
  PaymentBreakdown,
  SaleTransaction,
  StockMovement,
} from '@/lib/pos/types';
import { calculateSaleLine, money } from '@/lib/pos/sale-calculations';
import { loyaltyEarnedForSale, loyaltyRedemption } from '@/lib/pos/loyalty';
import { getPosPool } from '@/lib/server/pos-db';
import {
  assertPermission,
  assertTenantActive,
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
  saleUnit: 'piece' | 'pack' | 'carton';
}

function parsePaymentBreakdown(
  value: unknown,
  paymentMethod: string
): PaymentBreakdown | undefined {
  if (paymentMethod !== 'split') return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Split payment amounts are required', 'VALIDATION_ERROR');
  }
  const allowed = ['cash', 'card', 'mobile', 'bank-transfer'] as const;
  const breakdown: PaymentBreakdown = {};
  let count = 0;
  for (const method of allowed) {
    const amount = Number((value as Record<string, unknown>)[method] ?? 0);
    if (
      !Number.isFinite(amount) ||
      amount < 0 ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-8
    ) {
      throw new HttpError(400, 'Split payment amount is invalid', 'VALIDATION_ERROR');
    }
    if (amount > 0) {
      breakdown[method] = money(amount);
      count += 1;
    }
  }
  if (count < 2)
    throw new HttpError(400, 'Split payment requires at least two methods', 'VALIDATION_ERROR');
  return breakdown;
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
    const saleUnit = item.saleUnit === 'carton' ? 'carton' : item.saleUnit === 'pack' ? 'pack' : 'piece';
    if (
      !inventoryItemId ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(discount) ||
      discount < 0 ||
      discount > 100 ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0 ||
      Math.abs(unitPrice * 100 - Math.round(unitPrice * 100)) > 1e-8
    ) {
      throw new HttpError(
        400,
        'Sale item quantity, price, or discount is invalid',
        'VALIDATION_ERROR'
      );
    }
    const existing = aggregated.get(inventoryItemId);
    if (existing) {
      if (existing.saleUnit !== saleUnit || existing.unitPrice !== unitPrice) {
        throw new HttpError(400, 'A product cannot be sold with mixed units in one sale', 'VALIDATION_ERROR');
      }
      existing.quantity += quantity;
    } else aggregated.set(inventoryItemId, { inventoryItemId, quantity, discount, unitPrice, saleUnit });
  }
  return [...aggregated.values()];
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    assertTenantActive(auth);
    assertPermission(auth, 'checkout');
    await assertTenantPlanPermission(auth.tenantId, 'checkout');
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
    const paymentBreakdown = parsePaymentBreakdown(body.paymentBreakdown, paymentMethod);
    if (
      !['cash', 'card', 'mobile', 'bank-transfer', 'split', 'credit'].includes(paymentMethod) ||
      !Number.isFinite(cashTendered) ||
      cashTendered < 0 ||
      Math.abs(cashTendered * 100 - Math.round(cashTendered * 100)) > 1e-8
    ) {
      throw new HttpError(400, 'Payment method or tendered amount is invalid', 'VALIDATION_ERROR');
    }
    if (paymentMethod === 'credit') {
      assertPermission(auth, 'credit-sales');
      await assertTenantPlanPermission(auth.tenantId, 'credit-sales');
    }
    const customerName =
      typeof body.customerName === 'string' ? body.customerName.trim() : 'Walk-in Customer';
    const loyaltyPointsToRedeem = Math.max(0, Number(body.loyaltyPointsToRedeem ?? 0) || 0);
    const requestHash = commandHash({
      operationId,
      idempotencyKey,
      items,
      paymentMethod,
      cashTendered,
      paymentBreakdown,
      customerName,
      loyaltyPointsToRedeem,
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
      if (inventoryResult.rows.length !== new Set(items.map((item) => item.inventoryItemId)).size) {
        throw new HttpError(409, 'One or more products no longer exist', 'INVENTORY_CONFLICT');
      }
      const inventoryById = new Map(inventoryResult.rows.map((row) => [row.id as string, row]));
      const now = new Date().toISOString();
      let subtotal = 0;
      let discountTotal = 0;
      let taxAmount = 0;
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
        if (requested.discount > 0 && settings.allowCashierDiscounts === false) {
          assertPermission(auth, 'give-discount');
        }
        if (
          settings.allowSellingBelowCost === false &&
          requested.unitPrice < Number(row.unit_cost) * (requested.saleUnit === 'piece' ? 1 : Math.max(1, Number((row.data as InventoryItem).packQuantity) || 1))
        ) {
          throw new HttpError(409, `${row.name} cannot be sold below cost`, 'BELOW_COST_FORBIDDEN');
        }
        const productData = row.data as InventoryItem;
        const packConfigured = Boolean(productData.packPricingEnabled && Number(productData.packPrice) > 0 && Number(productData.packQuantity) >= 1);
        if (requested.saleUnit !== 'piece' && !packConfigured) {
          throw new HttpError(409, `${row.name} has no ${requested.saleUnit} price configured`, 'PACK_PRICE_NOT_CONFIGURED');
        }
        const unitsPerSale = requested.saleUnit === 'piece' ? 1 : Math.floor(Number(productData.packQuantity));
        const canonicalPrice = requested.saleUnit === 'piece' ? Number(row.selling_price) : Number(productData.packPrice);
        const canOverridePrice = ['owner', 'super-admin', 'manager'].includes(auth.user.role);
        if (!canOverridePrice && requested.unitPrice !== canonicalPrice) {
          throw new HttpError(403, 'The selected unit price is no longer valid', 'PRICE_MISMATCH');
        }
        const stockQuantity = requested.quantity * unitsPerSale;
        if (Number(row.current_qty) < stockQuantity) {
          throw new HttpError(409, `${row.name} has insufficient stock`, 'INSUFFICIENT_STOCK');
        }
        const defaultTaxRate = Math.max(0, Number(settings.taxRate) || 0);
        const calculated = calculateSaleLine(
          {
            unitPrice: requested.unitPrice,
            quantity: requested.quantity,
            discount: requested.discount,
            taxApplicable: Boolean(productData.taxApplicable || Number(productData.taxRate) > 0),
            taxRate: Number(productData.taxRate) || 0,
            taxMode: productData.taxMode ?? settings.taxMode ?? 'exclusive',
          },
          defaultTaxRate
        );
        subtotal = money(subtotal + calculated.gross);
        discountTotal = money(discountTotal + calculated.discountAmount);
        taxAmount = money(taxAmount + calculated.taxAmount);
        const nextQuantity = Number(row.current_qty) - stockQuantity;
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
          unitCost: Number(row.unit_cost) * unitsPerSale,
          saleUnit: requested.saleUnit,
          unitsPerSale,
          discount: requested.discount,
          lineTotal: calculated.lineTotal,
          discountAmount: calculated.discountAmount,
          taxApplicable: calculated.taxApplicable,
          taxRate: calculated.taxRate,
          taxMode: calculated.taxMode,
          taxAmount: calculated.taxAmount,
          requiresApproval: Boolean(row.data?.requiresApproval),
          isControlled: Boolean(row.data?.isControlled),
          category: row.category,
        };
      });

      // Consume receipt batches FIFO. Historical batches stay in the ledger; aliases are
      // only deactivated once the stock belonging to their batch is exhausted.
      for (const updated of updatedInventory) {
        const requested = items.find((item) => item.inventoryItemId === updated.id);
        if (!requested) continue;
        const unitsPerSale = requested.saleUnit === 'piece' ? 1 : Math.max(1, Number(updated.packQuantity) || 1);
        let remainingToAllocate = requested.quantity * unitsPerSale;
        const batchRows = await client.query(
          `SELECT record_id, data FROM pos_tenant_records
           WHERE tenant_id = $1 AND store_name = 'stockBatches'
             AND data->>'productId' = $2 AND data->>'status' = 'active'
             AND coalesce((data->>'quantityRemaining')::numeric, 0) > 0
           ORDER BY data->>'receivedAt' ASC, record_id ASC FOR UPDATE`,
          [auth.tenantId, updated.id]
        );
        for (const batchRow of batchRows.rows) {
          if (remainingToAllocate <= 0) break;
          const batch = batchRow.data as { id: string; quantityRemaining: number; status: string };
          const allocated = Math.min(remainingToAllocate, Number(batch.quantityRemaining));
          const nextRemaining = Number(batch.quantityRemaining) - allocated;
          const nextBatch = { ...batch, quantityRemaining: nextRemaining, status: nextRemaining === 0 ? 'exhausted' : 'active' };
          await client.query(
            `UPDATE pos_tenant_records SET data = $3::jsonb, version = version + 1, updated_at = now()
             WHERE tenant_id = $1 AND store_name = 'stockBatches' AND record_id = $2`,
            [auth.tenantId, batchRow.record_id, JSON.stringify({ ...batchRow.data, ...nextBatch })]
          );
          if (nextRemaining === 0) {
            updated.skuAliases = (updated.skuAliases ?? []).map((alias) => alias.batchId === batch.id ? { ...alias, active: false, inactivatedAt: now } : alias);
            updated.barcodeAliases = (updated.barcodeAliases ?? []).map((alias) => alias.batchId === batch.id ? { ...alias, active: false, inactivatedAt: now } : alias);
          }
          remainingToAllocate -= allocated;
        }
      }

      const taxable = money(subtotal - discountTotal);
      const grandTotal = money(taxable + taxAmount);
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
      let sale: SaleTransaction = {
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
        paymentBreakdown,
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
          quantityDelta: -(requested.quantity * (requested.saleUnit === 'piece' ? 1 : Math.max(1, Math.floor(Number((inventoryById.get(updated.id).data as InventoryItem).packQuantity) || 1)))),
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
          const loyaltySettings = settings as BusinessSettings;
          const loyalty = loyaltyRedemption(
            customer,
            loyaltyPointsToRedeem,
            grandTotal,
            loyaltySettings,
            paymentMethod
          );
          const earned = loyaltyEarnedForSale(grandTotal, loyaltySettings, paymentMethod);
          updatedCustomer = {
            ...customer,
            totalSpend:
              paymentMethod === 'credit'
                ? customer.totalSpend
                : money(Number(customer.totalSpend ?? 0) + grandTotal),
            loyaltyPoints: Math.max(
              0,
              Number(customer.loyaltyPoints ?? 0) - loyalty.points + earned
            ),
            updatedAt: now,
          };
          sale = {
            ...sale,
            amountPaid: paymentMethod === 'credit' ? 0 : money(grandTotal - loyalty.credit),
            changeGiven:
              paymentMethod === 'cash'
                ? Math.max(0, money(cashTendered - grandTotal + loyalty.credit))
                : 0,
            loyaltyPointsEarned: earned,
            loyaltyPointsRedeemed: loyalty.points,
            loyaltyCreditAmount: loyalty.credit,
          };
          await client.query(
            `UPDATE pos_tenant_records SET data = $3::jsonb,
               version = version + 1, updated_at = now()
             WHERE tenant_id = $1 AND store_name = 'customers' AND record_id = $2`,
            [auth.tenantId, customerResult.rows[0].record_id, JSON.stringify(updatedCustomer)]
          );
        } else if (loyaltyPointsToRedeem > 0) {
          throw new HttpError(
            400,
            'A valid customer is required to redeem loyalty points',
            'LOYALTY_CUSTOMER_REQUIRED'
          );
        }
      }

      if (loyaltyPointsToRedeem > 0 && !updatedCustomer) {
        throw new HttpError(
          400,
          'A valid customer is required to redeem loyalty points',
          'LOYALTY_CUSTOMER_REQUIRED'
        );
      }

      if (paymentMethod === 'split' && paymentBreakdown) {
        const splitTotal = money(
          Object.values(paymentBreakdown).reduce((sum, amount) => sum + (amount ?? 0), 0)
        );
        const expected = Number(sale.amountPaid ?? grandTotal);
        if (splitTotal !== expected) {
          throw new HttpError(
            400,
            'Split payment amounts must equal the amount due',
            'VALIDATION_ERROR'
          );
        }
      }

      if (paymentMethod === 'cash' && cashTendered < Number(sale.amountPaid ?? grandTotal)) {
        throw new HttpError(400, 'Cash tendered is less than the sale total', 'VALIDATION_ERROR');
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
