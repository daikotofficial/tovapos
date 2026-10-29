import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(`${process.cwd()}/package.json`);
const { Client } = require('pg');

const fileEnv = fs.existsSync('.env')
  ? Object.fromEntries(
      fs
        .readFileSync('.env', 'utf8')
        .split(/\r?\n/)
        .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
        .map((line) => {
          const index = line.indexOf('=');
          return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, '')];
        })
    )
  : {};

const databaseUrl = process.env.DATABASE_URL || fileEnv.DATABASE_URL;
const apply = process.argv.includes('--apply');
const tenantArg = process.argv.find((arg) => arg.startsWith('--tenant='));
const tenantId = tenantArg ? tenantArg.slice('--tenant='.length) : '';

if (!databaseUrl) throw new Error('DATABASE_URL is required');
if (!apply) {
  console.log('Dry run only. Re-run with --apply to repair the indexed sale totals.');
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  const filter = tenantId ? 'AND records.tenant_id = $1' : '';
  const params = tenantId ? [tenantId] : [];
  const result = await client.query(
    `WITH canonical AS (
       SELECT
         records.tenant_id,
         records.record_id AS id,
         records.data,
         COALESCE(NULLIF(records.data->>'grandTotal', '')::numeric, 0) AS grand_total,
         COALESCE(NULLIF(records.data->>'subtotal', '')::numeric, 0) AS subtotal,
         COALESCE(NULLIF(records.data->>'discountTotal', '')::numeric, 0) AS discount_total,
         COALESCE(NULLIF(records.data->>'taxAmount', '')::numeric, 0) AS tax_amount,
         COALESCE(NULLIF(records.data->>'amountPaid', '')::numeric, 0) AS amount_paid,
         COALESCE(NULLIF(records.data->>'amountDue', '')::numeric, 0) AS amount_due,
         COALESCE(NULLIF(records.data->>'timestamp', '')::timestamptz, now()) AS sale_timestamp,
         COALESCE(NULLIF(records.data->>'cashier', ''), '') AS cashier,
         COALESCE(NULLIF(records.data->>'customerName', ''), '') AS customer_name,
         COALESCE(NULLIF(records.data->>'transactionId', ''), records.record_id) AS transaction_id,
         COALESCE(NULLIF(lower(trim(records.data->>'status')), ''), 'completed') AS status,
         COALESCE(NULLIF(records.data->>'paymentMethod', ''), 'cash') AS payment_method,
         NULLIF(records.data->>'paymentStatus', '') AS payment_status
       FROM pos_tenant_records records
       WHERE records.store_name = 'sales' ${filter}
     ), calculated AS (
       SELECT canonical.*,
         COALESCE(items.gross_profit, 0) AS gross_profit,
         COALESCE(items.item_count, 0) AS item_count
       FROM canonical
       LEFT JOIN LATERAL (
         SELECT
           SUM(
             (COALESCE(NULLIF(item->>'unitPrice', '')::numeric, 0)
               * (1 - COALESCE(NULLIF(item->>'discount', '')::numeric, 0) / 100)
               - COALESCE(NULLIF(item->>'unitCost', '')::numeric, 0))
             * COALESCE(NULLIF(item->>'quantity', '')::numeric, 0)
           ) AS gross_profit,
           COUNT(*) FILTER (WHERE COALESCE(NULLIF(item->>'quantity', '')::numeric, 0) > 0)::integer AS item_count
         FROM jsonb_array_elements(COALESCE(canonical.data->'items', '[]'::jsonb)) AS item
       ) items ON true
     )
     SELECT calculated.*,
       indexed.id IS NULL AS missing_index,
       (
         indexed.grand_total IS DISTINCT FROM calculated.grand_total
         OR indexed.timestamp IS DISTINCT FROM calculated.sale_timestamp
         OR indexed.cashier IS DISTINCT FROM calculated.cashier
         OR indexed.customer_name IS DISTINCT FROM NULLIF(calculated.customer_name, '')
         OR indexed.payment_method IS DISTINCT FROM calculated.payment_method
         OR indexed.payment_status IS DISTINCT FROM calculated.payment_status
         OR indexed.subtotal IS DISTINCT FROM calculated.subtotal
         OR indexed.discount_total IS DISTINCT FROM calculated.discount_total
         OR indexed.tax_amount IS DISTINCT FROM calculated.tax_amount
         OR indexed.amount_paid IS DISTINCT FROM calculated.amount_paid
         OR indexed.amount_due IS DISTINCT FROM calculated.amount_due
         OR indexed.gross_profit IS DISTINCT FROM calculated.gross_profit
         OR indexed.item_count IS DISTINCT FROM calculated.item_count
         OR indexed.status IS DISTINCT FROM calculated.status
         OR indexed.data IS DISTINCT FROM calculated.data
       ) AS needs_repair
     FROM calculated
     LEFT JOIN pos_tenant_sales indexed
       ON indexed.tenant_id = calculated.tenant_id AND indexed.id = calculated.id
     WHERE indexed.id IS NULL OR (
       indexed.grand_total IS DISTINCT FROM calculated.grand_total
       OR indexed.timestamp IS DISTINCT FROM calculated.sale_timestamp
       OR indexed.cashier IS DISTINCT FROM calculated.cashier
       OR indexed.customer_name IS DISTINCT FROM NULLIF(calculated.customer_name, '')
       OR indexed.payment_method IS DISTINCT FROM calculated.payment_method
       OR indexed.payment_status IS DISTINCT FROM calculated.payment_status
       OR indexed.subtotal IS DISTINCT FROM calculated.subtotal
       OR indexed.discount_total IS DISTINCT FROM calculated.discount_total
       OR indexed.tax_amount IS DISTINCT FROM calculated.tax_amount
       OR indexed.amount_paid IS DISTINCT FROM calculated.amount_paid
       OR indexed.amount_due IS DISTINCT FROM calculated.amount_due
       OR indexed.gross_profit IS DISTINCT FROM calculated.gross_profit
       OR indexed.item_count IS DISTINCT FROM calculated.item_count
       OR indexed.status IS DISTINCT FROM calculated.status
       OR indexed.data IS DISTINCT FROM calculated.data
     )`,
    params
  );

  const missing = result.rows.filter((row) => row.missing_index).length;
  const stale = result.rows.filter((row) => !row.missing_index).length;
  console.log(`Found ${result.rows.length} sale index record(s) needing repair (${missing} missing, ${stale} stale).`);
  if (!apply || result.rows.length === 0) {
    await client.end();
    process.exit(0);
  }

  await client.query('BEGIN');
  for (const row of result.rows) {
    await client.query(
      `INSERT INTO pos_tenant_sales (
        tenant_id, id, transaction_id, timestamp, cashier, customer_name, status,
        payment_method, payment_status, subtotal, discount_total, tax_amount, grand_total,
        amount_paid, amount_due, gross_profit, item_count, data, updated_at
      ) VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, now())
      ON CONFLICT (tenant_id, id) DO UPDATE SET
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
        updated_at = now()`,
      [
        row.tenant_id,
        row.id,
        row.transaction_id,
        row.sale_timestamp,
        row.cashier,
        row.customer_name,
        row.status,
        row.payment_method,
        row.payment_status,
        row.subtotal,
        row.discount_total,
        row.tax_amount,
        row.grand_total,
        row.amount_paid,
        row.amount_due,
        row.gross_profit,
        row.item_count,
        row.data,
      ]
    );
  }
  await client.query('COMMIT');
  console.log('Sale index repair committed successfully.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
