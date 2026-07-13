import type { PoolClient } from 'pg';
import { HttpError } from './security';

type RecordData = Record<string, unknown> & { id: string };

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function number(value: unknown, label: string, minimum = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    throw new HttpError(400, `${label} is invalid`, 'VALIDATION_ERROR');
  }
  return parsed;
}

function array(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object'
      )
    : [];
}

function saleProfit(items: Record<string, unknown>[]): number {
  return items.reduce((sum, item) => {
    const quantity = number(item.quantity, 'Sale item quantity', Number.MIN_VALUE);
    const unitPrice = number(item.unitPrice, 'Sale item price');
    const unitCost = number(item.unitCost, 'Sale item cost');
    const discount = number(item.discount, 'Sale item discount');
    if (discount > 100)
      throw new HttpError(400, 'Sale item discount is invalid', 'VALIDATION_ERROR');
    return sum + (unitPrice * (1 - discount / 100) - unitCost) * quantity;
  }, 0);
}

export async function upsertTenantInventoryIndex(
  client: PoolClient,
  tenantId: string,
  record: RecordData
): Promise<void> {
  const quantity = number(record.currentQty, 'Inventory quantity');
  await client.query(
    `INSERT INTO pos_tenant_inventory (
      tenant_id, id, name, generic_name, sku, barcode, category, supplier, batch_lot,
      current_qty, reorder_level, unit_cost, selling_price, expiry_date, product_status,
      stock_status, data, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, nullif($6, ''), $7, $8, $9,
      $10, $11, $12, $13, nullif($14, '')::date, $15, $16, $17::jsonb,
      coalesce(nullif($18, '')::timestamptz, now())
    )
    ON CONFLICT (tenant_id, id) DO UPDATE SET
      name = EXCLUDED.name,
      generic_name = EXCLUDED.generic_name,
      sku = EXCLUDED.sku,
      barcode = EXCLUDED.barcode,
      category = EXCLUDED.category,
      supplier = EXCLUDED.supplier,
      batch_lot = EXCLUDED.batch_lot,
      current_qty = EXCLUDED.current_qty,
      reorder_level = EXCLUDED.reorder_level,
      unit_cost = EXCLUDED.unit_cost,
      selling_price = EXCLUDED.selling_price,
      expiry_date = EXCLUDED.expiry_date,
      product_status = EXCLUDED.product_status,
      stock_status = EXCLUDED.stock_status,
      version = pos_tenant_inventory.version + 1,
      data = EXCLUDED.data,
      updated_at = EXCLUDED.updated_at`,
    [
      tenantId,
      record.id,
      text(record.name),
      text(record.genericName),
      text(record.sku),
      text(record.barcode),
      text(record.category),
      text(record.supplier),
      text(record.batchLot),
      quantity,
      number(record.reorderLevel, 'Reorder level'),
      number(record.unitCost, 'Unit cost'),
      number(record.sellingPrice, 'Selling price'),
      text(record.expiryDate),
      text(record.productStatus, 'active'),
      text(record.stockStatus, quantity === 0 ? 'out' : 'in-stock'),
      JSON.stringify(record),
      text(record.updatedAt),
    ]
  );
}

export async function upsertTenantSaleIndex(
  client: PoolClient,
  tenantId: string,
  record: RecordData
): Promise<void> {
  const items = array(record.items);
  if (items.length === 0) throw new HttpError(400, 'A sale must contain items', 'VALIDATION_ERROR');
  const timestamp = text(record.timestamp, new Date().toISOString());
  await client.query(
    `INSERT INTO pos_tenant_sales (
      tenant_id, id, transaction_id, timestamp, cashier, customer_name, status,
      payment_method, payment_status, subtotal, discount_total, tax_amount, grand_total,
      amount_paid, amount_due, gross_profit, item_count, data, updated_at
    ) VALUES (
      $1, $2, $3, $4::timestamptz, $5, nullif($6, ''), $7,
      $8, nullif($9, ''), $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, now()
    )
    ON CONFLICT (tenant_id, id) DO UPDATE SET
      transaction_id = EXCLUDED.transaction_id,
      status = EXCLUDED.status,
      payment_method = EXCLUDED.payment_method,
      payment_status = EXCLUDED.payment_status,
      amount_paid = EXCLUDED.amount_paid,
      amount_due = EXCLUDED.amount_due,
      data = EXCLUDED.data,
      updated_at = now()`,
    [
      tenantId,
      record.id,
      text(record.transactionId, record.id),
      timestamp,
      text(record.cashier),
      text(record.customerName),
      text(record.status, 'completed'),
      text(record.paymentMethod, 'cash'),
      text(record.paymentStatus),
      number(record.subtotal, 'Subtotal'),
      number(record.discountTotal, 'Discount total'),
      number(record.taxAmount, 'Tax amount'),
      number(record.grandTotal, 'Grand total'),
      number(record.amountPaid, 'Amount paid'),
      number(record.amountDue, 'Amount due'),
      saleProfit(items),
      items.length,
      JSON.stringify(record),
    ]
  );
  await client.query('DELETE FROM pos_tenant_sale_items WHERE tenant_id = $1 AND sale_id = $2', [
    tenantId,
    record.id,
  ]);
  for (const [index, item] of items.entries()) {
    const quantity = number(item.quantity, 'Sale item quantity', Number.MIN_VALUE);
    const unitPrice = number(item.unitPrice, 'Sale item price');
    const unitCost = number(item.unitCost, 'Sale item cost');
    const discount = number(item.discount, 'Sale item discount');
    const lineTotal = number(item.lineTotal, 'Sale item total');
    await client.query(
      `INSERT INTO pos_tenant_sale_items (
        tenant_id, id, sale_id, inventory_item_id, product_name, sku, category,
        quantity, unit_price, unit_cost, discount, line_total, gross_profit, sold_at, data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::timestamptz, $15::jsonb)`,
      [
        tenantId,
        text(item.id, `${record.id}-${index}`),
        record.id,
        text(item.inventoryItemId, text(item.productId)),
        text(item.name),
        text(item.sku),
        text(item.category),
        quantity,
        unitPrice,
        unitCost,
        discount,
        lineTotal,
        (unitPrice * (1 - discount / 100) - unitCost) * quantity,
        timestamp,
        JSON.stringify(item),
      ]
    );
  }
}

export async function upsertTenantExpenseIndex(
  client: PoolClient,
  tenantId: string,
  record: RecordData
): Promise<void> {
  await client.query(
    `INSERT INTO pos_tenant_expenses (
      tenant_id, id, expense_id, title, category, amount, payment_method, vendor_name,
      recorded_by, status, incurred_at, data, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, nullif($8, ''), $9, $10,
      coalesce(nullif($11, '')::date, current_date), $12::jsonb, now())
    ON CONFLICT (tenant_id, id) DO UPDATE SET
      title = EXCLUDED.title,
      category = EXCLUDED.category,
      amount = EXCLUDED.amount,
      payment_method = EXCLUDED.payment_method,
      vendor_name = EXCLUDED.vendor_name,
      recorded_by = EXCLUDED.recorded_by,
      status = EXCLUDED.status,
      incurred_at = EXCLUDED.incurred_at,
      data = EXCLUDED.data,
      updated_at = now()`,
    [
      tenantId,
      record.id,
      text(record.expenseId, record.id),
      text(record.title),
      text(record.category),
      number(record.amount, 'Expense amount'),
      text(record.paymentMethod, 'cash'),
      text(record.vendorName),
      text(record.recordedBy),
      text(record.status, 'recorded'),
      text(record.incurredAt),
      JSON.stringify(record),
    ]
  );
}
