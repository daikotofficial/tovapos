import { Pool, PoolClient } from 'pg';

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function getPosPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  return pool;
}

export async function ensurePosSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPosPool()
      .query(
        `
        CREATE TABLE IF NOT EXISTS pos_records (
          store_name text NOT NULL,
          record_id text NOT NULL,
          data jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (store_name, record_id)
        );

        CREATE INDEX IF NOT EXISTS pos_records_store_name_idx
          ON pos_records (store_name);

        CREATE TABLE IF NOT EXISTS pos_inventory (
          id text PRIMARY KEY,
          name text NOT NULL,
          generic_name text NOT NULL DEFAULT '',
          sku text NOT NULL,
          barcode text,
          category text NOT NULL DEFAULT '',
          supplier text NOT NULL DEFAULT '',
          batch_lot text NOT NULL DEFAULT '',
          current_qty numeric NOT NULL DEFAULT 0,
          reorder_level numeric NOT NULL DEFAULT 0,
          unit_cost numeric NOT NULL DEFAULT 0,
          selling_price numeric NOT NULL DEFAULT 0,
          expiry_date date,
          product_status text NOT NULL DEFAULT 'active',
          stock_status text NOT NULL DEFAULT 'in-stock',
          data jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS pos_inventory_sku_unique_idx
          ON pos_inventory (lower(sku))
          WHERE sku <> '';

        CREATE UNIQUE INDEX IF NOT EXISTS pos_inventory_barcode_unique_idx
          ON pos_inventory (lower(barcode))
          WHERE barcode IS NOT NULL AND barcode <> '';

        CREATE INDEX IF NOT EXISTS pos_inventory_name_id_idx
          ON pos_inventory (lower(name), id);

        CREATE INDEX IF NOT EXISTS pos_inventory_category_idx
          ON pos_inventory (category);

        CREATE INDEX IF NOT EXISTS pos_inventory_supplier_idx
          ON pos_inventory (supplier);

        CREATE INDEX IF NOT EXISTS pos_inventory_stock_status_idx
          ON pos_inventory (stock_status);

        CREATE INDEX IF NOT EXISTS pos_inventory_product_status_idx
          ON pos_inventory (product_status);

        CREATE INDEX IF NOT EXISTS pos_inventory_expiry_date_idx
          ON pos_inventory (expiry_date);

        CREATE INDEX IF NOT EXISTS pos_inventory_search_idx
          ON pos_inventory
          USING gin (
            to_tsvector(
              'simple',
              coalesce(name, '') || ' ' ||
              coalesce(generic_name, '') || ' ' ||
              coalesce(sku, '') || ' ' ||
              coalesce(barcode, '') || ' ' ||
              coalesce(batch_lot, '')
            )
          );

        INSERT INTO pos_inventory (
          id,
          name,
          generic_name,
          sku,
          barcode,
          category,
          supplier,
          batch_lot,
          current_qty,
          reorder_level,
          unit_cost,
          selling_price,
          expiry_date,
          product_status,
          stock_status,
          data,
          created_at,
          updated_at
        )
        SELECT
          record_id,
          data->>'name',
          coalesce(data->>'genericName', ''),
          coalesce(data->>'sku', ''),
          nullif(data->>'barcode', ''),
          coalesce(data->>'category', ''),
          coalesce(data->>'supplier', ''),
          coalesce(data->>'batchLot', ''),
          coalesce(nullif(data->>'currentQty', '')::numeric, 0),
          coalesce(nullif(data->>'reorderLevel', '')::numeric, 0),
          coalesce(nullif(data->>'unitCost', '')::numeric, 0),
          coalesce(nullif(data->>'sellingPrice', '')::numeric, 0),
          nullif(data->>'expiryDate', '')::date,
          coalesce(data->>'productStatus', 'active'),
          coalesce(data->>'stockStatus', 'in-stock'),
          data,
          created_at,
          updated_at
        FROM pos_records
        WHERE store_name = 'inventory'
          AND data ? 'name'
        ON CONFLICT (id) DO UPDATE SET
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
          data = EXCLUDED.data,
          updated_at = EXCLUDED.updated_at;

        CREATE TABLE IF NOT EXISTS pos_sales (
          id text PRIMARY KEY,
          transaction_id text NOT NULL,
          timestamp timestamptz NOT NULL,
          cashier text NOT NULL DEFAULT '',
          customer_name text,
          status text NOT NULL DEFAULT 'completed',
          payment_method text NOT NULL DEFAULT 'cash',
          payment_status text,
          subtotal numeric NOT NULL DEFAULT 0,
          discount_total numeric NOT NULL DEFAULT 0,
          tax_amount numeric NOT NULL DEFAULT 0,
          grand_total numeric NOT NULL DEFAULT 0,
          amount_paid numeric NOT NULL DEFAULT 0,
          amount_due numeric NOT NULL DEFAULT 0,
          gross_profit numeric NOT NULL DEFAULT 0,
          item_count integer NOT NULL DEFAULT 0,
          data jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS pos_sale_items (
          id text PRIMARY KEY,
          sale_id text NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
          inventory_item_id text NOT NULL,
          product_name text NOT NULL DEFAULT '',
          sku text NOT NULL DEFAULT '',
          category text NOT NULL DEFAULT '',
          quantity numeric NOT NULL DEFAULT 0,
          unit_price numeric NOT NULL DEFAULT 0,
          unit_cost numeric NOT NULL DEFAULT 0,
          discount numeric NOT NULL DEFAULT 0,
          line_total numeric NOT NULL DEFAULT 0,
          gross_profit numeric NOT NULL DEFAULT 0,
          sold_at timestamptz NOT NULL,
          data jsonb NOT NULL
        );

        CREATE INDEX IF NOT EXISTS pos_sales_timestamp_idx
          ON pos_sales (timestamp DESC);

        CREATE INDEX IF NOT EXISTS pos_sales_status_timestamp_idx
          ON pos_sales (status, timestamp DESC);

        CREATE INDEX IF NOT EXISTS pos_sales_payment_method_idx
          ON pos_sales (payment_method);

        CREATE INDEX IF NOT EXISTS pos_sales_cashier_idx
          ON pos_sales (cashier);

        CREATE INDEX IF NOT EXISTS pos_sale_items_sale_id_idx
          ON pos_sale_items (sale_id);

        CREATE INDEX IF NOT EXISTS pos_sale_items_inventory_item_id_idx
          ON pos_sale_items (inventory_item_id);

        CREATE INDEX IF NOT EXISTS pos_sale_items_category_idx
          ON pos_sale_items (category);

        CREATE INDEX IF NOT EXISTS pos_sale_items_sold_at_idx
          ON pos_sale_items (sold_at DESC);

        CREATE TABLE IF NOT EXISTS pos_expenses (
          id text PRIMARY KEY,
          expense_id text NOT NULL,
          title text NOT NULL DEFAULT '',
          category text NOT NULL DEFAULT '',
          amount numeric NOT NULL DEFAULT 0,
          payment_method text NOT NULL DEFAULT 'cash',
          vendor_name text,
          recorded_by text NOT NULL DEFAULT '',
          status text NOT NULL DEFAULT 'recorded',
          incurred_at date NOT NULL,
          data jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS pos_expenses_incurred_at_idx
          ON pos_expenses (incurred_at DESC);

        CREATE INDEX IF NOT EXISTS pos_expenses_status_incurred_at_idx
          ON pos_expenses (status, incurred_at DESC);

        CREATE INDEX IF NOT EXISTS pos_expenses_category_idx
          ON pos_expenses (category);

        CREATE INDEX IF NOT EXISTS pos_expenses_vendor_name_idx
          ON pos_expenses (vendor_name);

        INSERT INTO pos_sales (
          id,
          transaction_id,
          timestamp,
          cashier,
          customer_name,
          status,
          payment_method,
          payment_status,
          subtotal,
          discount_total,
          tax_amount,
          grand_total,
          amount_paid,
          amount_due,
          gross_profit,
          item_count,
          data,
          created_at,
          updated_at
        )
        SELECT
          record_id,
          coalesce(data->>'transactionId', record_id),
          coalesce(nullif(data->>'timestamp', '')::timestamptz, created_at),
          coalesce(data->>'cashier', ''),
          nullif(data->>'customerName', ''),
          coalesce(data->>'status', 'completed'),
          coalesce(data->>'paymentMethod', 'cash'),
          nullif(data->>'paymentStatus', ''),
          coalesce(nullif(data->>'subtotal', '')::numeric, 0),
          coalesce(nullif(data->>'discountTotal', '')::numeric, 0),
          coalesce(nullif(data->>'taxAmount', '')::numeric, 0),
          coalesce(nullif(data->>'grandTotal', '')::numeric, 0),
          coalesce(nullif(data->>'amountPaid', '')::numeric, 0),
          coalesce(nullif(data->>'amountDue', '')::numeric, 0),
          coalesce((
            SELECT sum(
              (
                coalesce(nullif(item->>'unitPrice', '')::numeric, 0)
                * (1 - coalesce(nullif(item->>'discount', '')::numeric, 0) / 100)
                - coalesce(nullif(item->>'unitCost', '')::numeric, 0)
              )
              * coalesce(nullif(item->>'quantity', '')::numeric, 0)
            )
            FROM jsonb_array_elements(coalesce(data->'items', '[]'::jsonb)) item
          ), 0),
          jsonb_array_length(coalesce(data->'items', '[]'::jsonb)),
          data,
          created_at,
          updated_at
        FROM pos_records
        WHERE store_name = 'sales'
          AND data ? 'transactionId'
        ON CONFLICT (id) DO UPDATE SET
          transaction_id = EXCLUDED.transaction_id,
          timestamp = EXCLUDED.timestamp,
          cashier = EXCLUDED.cashier,
          customer_name = EXCLUDED.customer_name,
          status = EXCLUDED.status,
          payment_method = EXCLUDED.payment_method,
          payment_status = EXCLUDED.payment_status,
          subtotal = EXCLUDED.subtotal,
          discount_total = EXCLUDED.discount_total,
          tax_amount = EXCLUDED.tax_amount,
          grand_total = EXCLUDED.grand_total,
          amount_paid = EXCLUDED.amount_paid,
          amount_due = EXCLUDED.amount_due,
          gross_profit = EXCLUDED.gross_profit,
          item_count = EXCLUDED.item_count,
          data = EXCLUDED.data,
          updated_at = EXCLUDED.updated_at;

        DELETE FROM pos_sale_items
        WHERE sale_id IN (
          SELECT record_id FROM pos_records WHERE store_name = 'sales' AND data ? 'transactionId'
        );

        INSERT INTO pos_sale_items (
          id,
          sale_id,
          inventory_item_id,
          product_name,
          sku,
          category,
          quantity,
          unit_price,
          unit_cost,
          discount,
          line_total,
          gross_profit,
          sold_at,
          data
        )
        SELECT
          coalesce(item->>'id', record_id || '-' || ordinality::text),
          record_id,
          coalesce(item->>'inventoryItemId', item->>'productId', ''),
          coalesce(item->>'name', ''),
          coalesce(item->>'sku', ''),
          coalesce(item->>'category', ''),
          coalesce(nullif(item->>'quantity', '')::numeric, 0),
          coalesce(nullif(item->>'unitPrice', '')::numeric, 0),
          coalesce(nullif(item->>'unitCost', '')::numeric, 0),
          coalesce(nullif(item->>'discount', '')::numeric, 0),
          coalesce(nullif(item->>'lineTotal', '')::numeric, 0),
          (
            coalesce(nullif(item->>'unitPrice', '')::numeric, 0)
            * (1 - coalesce(nullif(item->>'discount', '')::numeric, 0) / 100)
            - coalesce(nullif(item->>'unitCost', '')::numeric, 0)
          ) * coalesce(nullif(item->>'quantity', '')::numeric, 0),
          coalesce(nullif(data->>'timestamp', '')::timestamptz, created_at),
          item
        FROM pos_records
        CROSS JOIN LATERAL jsonb_array_elements(coalesce(data->'items', '[]'::jsonb))
          WITH ORDINALITY AS sale_item(item, ordinality)
        WHERE store_name = 'sales'
          AND data ? 'transactionId'
        ON CONFLICT (id) DO UPDATE SET
          sale_id = EXCLUDED.sale_id,
          inventory_item_id = EXCLUDED.inventory_item_id,
          product_name = EXCLUDED.product_name,
          sku = EXCLUDED.sku,
          category = EXCLUDED.category,
          quantity = EXCLUDED.quantity,
          unit_price = EXCLUDED.unit_price,
          unit_cost = EXCLUDED.unit_cost,
          discount = EXCLUDED.discount,
          line_total = EXCLUDED.line_total,
          gross_profit = EXCLUDED.gross_profit,
          sold_at = EXCLUDED.sold_at,
          data = EXCLUDED.data;

        INSERT INTO pos_expenses (
          id,
          expense_id,
          title,
          category,
          amount,
          payment_method,
          vendor_name,
          recorded_by,
          status,
          incurred_at,
          data,
          created_at,
          updated_at
        )
        SELECT
          record_id,
          coalesce(data->>'expenseId', record_id),
          coalesce(data->>'title', ''),
          coalesce(data->>'category', ''),
          coalesce(nullif(data->>'amount', '')::numeric, 0),
          coalesce(data->>'paymentMethod', 'cash'),
          nullif(data->>'vendorName', ''),
          coalesce(data->>'recordedBy', ''),
          coalesce(data->>'status', 'recorded'),
          coalesce(nullif(data->>'incurredAt', '')::date, created_at::date),
          data,
          created_at,
          updated_at
        FROM pos_records
        WHERE store_name = 'expenses'
          AND data ? 'expenseId'
        ON CONFLICT (id) DO UPDATE SET
          expense_id = EXCLUDED.expense_id,
          title = EXCLUDED.title,
          category = EXCLUDED.category,
          amount = EXCLUDED.amount,
          payment_method = EXCLUDED.payment_method,
          vendor_name = EXCLUDED.vendor_name,
          recorded_by = EXCLUDED.recorded_by,
          status = EXCLUDED.status,
          incurred_at = EXCLUDED.incurred_at,
          data = EXCLUDED.data,
          updated_at = EXCLUDED.updated_at;
        `
      )
      .then(() => undefined);
  }

  await schemaReady;
}

type InventoryRecord = Record<string, unknown> & { id: string };
type SaleRecord = Record<string, unknown> & { id: string; items?: unknown };
type SaleItemRecord = Record<string, unknown>;
type ExpenseRecord = Record<string, unknown> & { id: string };

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function saleItemProfit(item: SaleItemRecord): number {
  return (
    (asNumber(item.unitPrice) * (1 - asNumber(item.discount) / 100) - asNumber(item.unitCost)) *
    asNumber(item.quantity)
  );
}

function saleProfit(record: SaleRecord): number {
  return asArray(record.items).reduce<number>(
    (sum, item) => sum + saleItemProfit(item as SaleItemRecord),
    0
  );
}

export async function upsertInventoryIndex(
  client: PoolClient,
  record: InventoryRecord
): Promise<void> {
  await client.query(
    `
    INSERT INTO pos_inventory (
      id,
      name,
      generic_name,
      sku,
      barcode,
      category,
      supplier,
      batch_lot,
      current_qty,
      reorder_level,
      unit_cost,
      selling_price,
      expiry_date,
      product_status,
      stock_status,
      data,
      updated_at
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      nullif($5, ''),
      $6,
      $7,
      $8,
      $9,
      $10,
      $11,
      $12,
      nullif($13, '')::date,
      $14,
      $15,
      $16::jsonb,
      coalesce(nullif($17, '')::timestamptz, now())
    )
    ON CONFLICT (id) DO UPDATE SET
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
      data = EXCLUDED.data,
      updated_at = EXCLUDED.updated_at
    `,
    [
      record.id,
      asText(record.name),
      asText(record.genericName),
      asText(record.sku),
      asText(record.barcode),
      asText(record.category),
      asText(record.supplier),
      asText(record.batchLot),
      asNumber(record.currentQty),
      asNumber(record.reorderLevel),
      asNumber(record.unitCost),
      asNumber(record.sellingPrice),
      asText(record.expiryDate),
      asText(record.productStatus, 'active'),
      asText(record.stockStatus, 'in-stock'),
      JSON.stringify(record),
      asText(record.updatedAt),
    ]
  );
}

export async function upsertSaleIndex(client: PoolClient, record: SaleRecord): Promise<void> {
  const items = asArray(record.items) as SaleItemRecord[];
  await client.query(
    `
    INSERT INTO pos_sales (
      id,
      transaction_id,
      timestamp,
      cashier,
      customer_name,
      status,
      payment_method,
      payment_status,
      subtotal,
      discount_total,
      tax_amount,
      grand_total,
      amount_paid,
      amount_due,
      gross_profit,
      item_count,
      data,
      updated_at
    )
    VALUES (
      $1,
      $2,
      coalesce(nullif($3, '')::timestamptz, now()),
      $4,
      nullif($5, ''),
      $6,
      $7,
      nullif($8, ''),
      $9,
      $10,
      $11,
      $12,
      $13,
      $14,
      $15,
      $16,
      $17::jsonb,
      coalesce(nullif($18, '')::timestamptz, now())
    )
    ON CONFLICT (id) DO UPDATE SET
      transaction_id = EXCLUDED.transaction_id,
      timestamp = EXCLUDED.timestamp,
      cashier = EXCLUDED.cashier,
      customer_name = EXCLUDED.customer_name,
      status = EXCLUDED.status,
      payment_method = EXCLUDED.payment_method,
      payment_status = EXCLUDED.payment_status,
      subtotal = EXCLUDED.subtotal,
      discount_total = EXCLUDED.discount_total,
      tax_amount = EXCLUDED.tax_amount,
      grand_total = EXCLUDED.grand_total,
      amount_paid = EXCLUDED.amount_paid,
      amount_due = EXCLUDED.amount_due,
      gross_profit = EXCLUDED.gross_profit,
      item_count = EXCLUDED.item_count,
      data = EXCLUDED.data,
      updated_at = EXCLUDED.updated_at
    `,
    [
      record.id,
      asText(record.transactionId, record.id),
      asText(record.timestamp),
      asText(record.cashier),
      asText(record.customerName),
      asText(record.status, 'completed'),
      asText(record.paymentMethod, 'cash'),
      asText(record.paymentStatus),
      asNumber(record.subtotal),
      asNumber(record.discountTotal),
      asNumber(record.taxAmount),
      asNumber(record.grandTotal),
      asNumber(record.amountPaid),
      asNumber(record.amountDue),
      saleProfit(record),
      items.length,
      JSON.stringify(record),
      asText(record.updatedAt, asText(record.timestamp)),
    ]
  );

  await client.query('DELETE FROM pos_sale_items WHERE sale_id = $1', [record.id]);
  for (const [index, item] of items.entries()) {
    await client.query(
      `
      INSERT INTO pos_sale_items (
        id,
        sale_id,
        inventory_item_id,
        product_name,
        sku,
        category,
        quantity,
        unit_price,
        unit_cost,
        discount,
        line_total,
        gross_profit,
        sold_at,
        data
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        coalesce(nullif($13, '')::timestamptz, now()),
        $14::jsonb
      )
      ON CONFLICT (id) DO UPDATE SET
        sale_id = EXCLUDED.sale_id,
        inventory_item_id = EXCLUDED.inventory_item_id,
        product_name = EXCLUDED.product_name,
        sku = EXCLUDED.sku,
        category = EXCLUDED.category,
        quantity = EXCLUDED.quantity,
        unit_price = EXCLUDED.unit_price,
        unit_cost = EXCLUDED.unit_cost,
        discount = EXCLUDED.discount,
        line_total = EXCLUDED.line_total,
        gross_profit = EXCLUDED.gross_profit,
        sold_at = EXCLUDED.sold_at,
        data = EXCLUDED.data
      `,
      [
        asText(item.id, `${record.id}-${index}`),
        record.id,
        asText(item.inventoryItemId, asText(item.productId)),
        asText(item.name),
        asText(item.sku),
        asText(item.category),
        asNumber(item.quantity),
        asNumber(item.unitPrice),
        asNumber(item.unitCost),
        asNumber(item.discount),
        asNumber(item.lineTotal),
        saleItemProfit(item),
        asText(record.timestamp),
        JSON.stringify(item),
      ]
    );
  }
}

export async function upsertExpenseIndex(client: PoolClient, record: ExpenseRecord): Promise<void> {
  await client.query(
    `
    INSERT INTO pos_expenses (
      id,
      expense_id,
      title,
      category,
      amount,
      payment_method,
      vendor_name,
      recorded_by,
      status,
      incurred_at,
      data,
      updated_at
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      nullif($7, ''),
      $8,
      $9,
      coalesce(nullif($10, '')::date, current_date),
      $11::jsonb,
      coalesce(nullif($12, '')::timestamptz, now())
    )
    ON CONFLICT (id) DO UPDATE SET
      expense_id = EXCLUDED.expense_id,
      title = EXCLUDED.title,
      category = EXCLUDED.category,
      amount = EXCLUDED.amount,
      payment_method = EXCLUDED.payment_method,
      vendor_name = EXCLUDED.vendor_name,
      recorded_by = EXCLUDED.recorded_by,
      status = EXCLUDED.status,
      incurred_at = EXCLUDED.incurred_at,
      data = EXCLUDED.data,
      updated_at = EXCLUDED.updated_at
    `,
    [
      record.id,
      asText(record.expenseId, record.id),
      asText(record.title),
      asText(record.category),
      asNumber(record.amount),
      asText(record.paymentMethod, 'cash'),
      asText(record.vendorName),
      asText(record.recordedBy),
      asText(record.status, 'recorded'),
      asText(record.incurredAt),
      JSON.stringify(record),
      asText(record.updatedAt, asText(record.createdAt)),
    ]
  );
}
