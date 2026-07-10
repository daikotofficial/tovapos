import { NextRequest, NextResponse } from 'next/server';
import {
  ensurePosSchema,
  getPosPool,
  upsertExpenseIndex,
  upsertInventoryIndex,
  upsertSaleIndex,
} from '@/lib/server/pos-db';
import { getSubscriptionPlan } from '@/lib/pos/subscription';

const STORE_NAMES = new Set([
  'inventory',
  'stockMovements',
  'sales',
  'syncQueue',
  'users',
  'customers',
  'vendors',
  'expenses',
  'settings',
]);

type PosRecord = Record<string, unknown> & { id?: unknown };
type InventoryCursor = { name: string; id: string };

function getStoreName(request: NextRequest): string {
  const storeName = request.nextUrl.searchParams.get('store') ?? '';
  if (!STORE_NAMES.has(storeName)) {
    throw new Error('Unknown POS store');
  }
  return storeName;
}

function prepareRecordForStorage(record: PosRecord): PosRecord {
  const { _expectedUpdatedAt, ...storedRecord } = record;
  return storedRecord;
}

function encodeCursor(cursor: InventoryCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(value: string | null): InventoryCursor | null {
  if (!value) return null;

  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    if (
      decoded &&
      typeof decoded === 'object' &&
      typeof (decoded as InventoryCursor).name === 'string' &&
      typeof (decoded as InventoryCursor).id === 'string'
    ) {
      return decoded as InventoryCursor;
    }
  } catch {
    return null;
  }

  return null;
}

function clampLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(1, Math.min(500, Math.floor(parsed)));
}

function clampOffset(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

async function getInventoryMetrics(request: NextRequest) {
  const expiryAlertDays = Math.max(
    0,
    Math.min(3650, Math.floor(Number(request.nextUrl.searchParams.get('expiryAlertDays')) || 30))
  );
  const result = await getPosPool().query(
    `
    SELECT
      count(*)::bigint AS total_products,
      coalesce(sum(current_qty), 0)::float8 AS total_units,
      count(*) FILTER (WHERE stock_status IN ('low', 'critical'))::bigint AS low_stock,
      count(*) FILTER (WHERE stock_status = 'critical')::bigint AS critical_stock,
      count(*) FILTER (WHERE stock_status = 'out')::bigint AS out_of_stock,
      count(*) FILTER (WHERE stock_status = 'expired' OR expiry_date < current_date)::bigint AS expired,
      count(*) FILTER (
        WHERE expiry_date >= current_date
          AND expiry_date <= current_date + ($1::int * interval '1 day')
      )::bigint AS expiring_soon,
      coalesce(sum(current_qty * unit_cost), 0)::float8 AS total_value,
      coalesce(sum(current_qty * (selling_price - unit_cost)), 0)::float8 AS potential_profit
    FROM pos_inventory
    `,
    [expiryAlertDays]
  );
  const row = result.rows[0] ?? {};

  return NextResponse.json({
    totalProducts: Number(row.total_products ?? 0),
    totalUnits: Number(row.total_units ?? 0),
    lowStock: Number(row.low_stock ?? 0),
    criticalStock: Number(row.critical_stock ?? 0),
    outOfStock: Number(row.out_of_stock ?? 0),
    expired: Number(row.expired ?? 0),
    expiringSoon: Number(row.expiring_soon ?? 0),
    totalValue: Number(row.total_value ?? 0),
    potentialProfit: Number(row.potential_profit ?? 0),
  });
}

function dateRangeWhere(
  params: URLSearchParams,
  column: string,
  values: unknown[],
  dateCast = false
): string {
  const where: string[] = [];
  const from = params.get('from');
  if (from) {
    values.push(from);
    where.push(`${column} >= $${values.length}${dateCast ? '::date' : '::timestamptz'}`);
  }
  const to = params.get('to');
  if (to) {
    values.push(to);
    where.push(`${column} <= $${values.length}${dateCast ? '::date' : '::timestamptz'}`);
  }
  return where.length ? `WHERE ${where.join(' AND ')}` : '';
}

function appendDateRange(
  params: URLSearchParams,
  column: string,
  values: unknown[],
  where: string[],
  dateCast = false
): void {
  const from = params.get('from');
  if (from) {
    values.push(from);
    where.push(`${column} >= $${values.length}${dateCast ? '::date' : '::timestamptz'}`);
  }
  const to = params.get('to');
  if (to) {
    values.push(to);
    where.push(`${column} <= $${values.length}${dateCast ? '::date' : '::timestamptz'}`);
  }
}

async function getReportRows(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const report = params.get('report') ?? 'sales';
  const limit = clampLimit(params.get('limit'));
  const offset = clampOffset(params.get('offset'));
  const values: unknown[] = [];
  const where: string[] = [];

  if (
    report === 'sales' ||
    report === 'credit-sales' ||
    report === 'refunds' ||
    report === 'voided'
  ) {
    appendDateRange(params, 'timestamp', values, where);
    if (report === 'sales') where.push("status = 'completed'");
    if (report === 'credit-sales') {
      where.push("status = 'completed'");
      where.push("(payment_method = 'credit' OR amount_due > 0)");
    }
    if (report === 'refunds') where.push("status = 'refunded'");
    if (report === 'voided') where.push("status = 'voided'");
    values.push(limit, offset);
    const result = await getPosPool().query(
      `
      SELECT data
      FROM pos_sales
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY timestamp DESC, id DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values
    );
    return NextResponse.json({ rows: result.rows.map((row) => row.data), limit, offset });
  }

  if (report === 'expenses') {
    appendDateRange(params, 'incurred_at', values, where, true);
    where.push("status = 'recorded'");
    values.push(limit, offset);
    const result = await getPosPool().query(
      `
      SELECT data
      FROM pos_expenses
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY incurred_at DESC, id DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values
    );
    return NextResponse.json({ rows: result.rows.map((row) => row.data), limit, offset });
  }

  if (report === 'sales-by-product') {
    appendDateRange(params, 'sold_at', values, where);
    values.push(limit, offset);
    const result = await getPosPool().query(
      `
      SELECT
        inventory_item_id AS "inventoryItemId",
        product_name AS name,
        coalesce(sum(quantity), 0)::float8 AS qty,
        coalesce(sum(line_total), 0)::float8 AS revenue,
        coalesce(sum(gross_profit), 0)::float8 AS profit
      FROM pos_sale_items
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY inventory_item_id, product_name
      ORDER BY revenue DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values
    );
    return NextResponse.json({ rows: result.rows, limit, offset });
  }

  if (report === 'sales-by-category') {
    appendDateRange(params, 'sold_at', values, where);
    values.push(limit, offset);
    const result = await getPosPool().query(
      `
      SELECT
        category,
        coalesce(sum(quantity), 0)::float8 AS qty,
        coalesce(sum(line_total), 0)::float8 AS revenue,
        coalesce(sum(gross_profit), 0)::float8 AS profit
      FROM pos_sale_items
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY category
      ORDER BY revenue DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values
    );
    return NextResponse.json({ rows: result.rows, limit, offset });
  }

  if (report === 'payment-methods') {
    appendDateRange(params, 'timestamp', values, where);
    values.push(limit, offset);
    const result = await getPosPool().query(
      `
      SELECT
        payment_method AS method,
        count(*)::bigint AS count,
        coalesce(sum(grand_total) FILTER (WHERE payment_method <> 'credit'), 0)::float8 AS collected,
        coalesce(sum(amount_due), 0)::float8 AS receivable,
        coalesce(sum(grand_total), 0)::float8 AS total
      FROM pos_sales
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY payment_method
      ORDER BY total DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values
    );
    return NextResponse.json({ rows: result.rows, limit, offset });
  }

  return NextResponse.json({ rows: [], limit, offset });
}

async function getSalesMetrics(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const values: unknown[] = [];
  const rangeSql = dateRangeWhere(params, 'timestamp', values);
  const salesResult = await getPosPool().query(
    `
    SELECT
      count(*) FILTER (WHERE status = 'completed')::bigint AS completed_count,
      count(*) FILTER (WHERE status = 'refunded')::bigint AS refunded_count,
      count(*) FILTER (WHERE status = 'voided')::bigint AS voided_count,
      coalesce(sum(grand_total) FILTER (WHERE status = 'completed'), 0)::float8 AS revenue,
      coalesce(sum(gross_profit) FILTER (WHERE status = 'completed'), 0)::float8 AS gross_profit,
      coalesce(sum(amount_due) FILTER (WHERE status = 'completed'), 0)::float8 AS receivables,
      coalesce(sum(grand_total) FILTER (WHERE status = 'completed' AND payment_method = 'cash'), 0)::float8 AS cash_sales,
      coalesce(sum(grand_total) FILTER (WHERE status = 'completed' AND payment_method <> 'cash'), 0)::float8 AS non_cash_sales
    FROM pos_sales
    ${rangeSql}
    `,
    values
  );

  const expenseValues: unknown[] = [];
  const expenseRangeSql = dateRangeWhere(params, 'incurred_at', expenseValues, true);
  const expenseResult = await getPosPool().query(
    `
    SELECT coalesce(sum(amount) FILTER (WHERE status = 'recorded'), 0)::float8 AS expenses
    FROM pos_expenses
    ${expenseRangeSql}
    `,
    expenseValues
  );
  const expenseCategoryWhere = expenseRangeSql
    ? `${expenseRangeSql} AND status = 'recorded'`
    : "WHERE status = 'recorded'";
  const expenseCategoriesResult = await getPosPool().query(
    `
    SELECT
      category,
      coalesce(sum(amount), 0)::float8 AS amount
    FROM pos_expenses
    ${expenseCategoryWhere}
    GROUP BY category
    ORDER BY amount DESC
    LIMIT 10
    `,
    expenseValues
  );

  const topProductValues: unknown[] = [];
  const topProductRangeSql = dateRangeWhere(params, 'sold_at', topProductValues);
  const topProductsResult = await getPosPool().query(
    `
    SELECT
      inventory_item_id AS "inventoryItemId",
      product_name AS name,
      coalesce(sum(quantity), 0)::float8 AS qty,
      coalesce(sum(line_total), 0)::float8 AS revenue,
      coalesce(sum(gross_profit), 0)::float8 AS profit
    FROM pos_sale_items
    ${topProductRangeSql}
    GROUP BY inventory_item_id, product_name
    ORDER BY revenue DESC
    LIMIT 10
    `,
    topProductValues
  );

  const sales = salesResult.rows[0] ?? {};
  const expenses = Number(expenseResult.rows[0]?.expenses ?? 0);
  const grossProfit = Number(sales.gross_profit ?? 0);
  return NextResponse.json({
    completedCount: Number(sales.completed_count ?? 0),
    refundedCount: Number(sales.refunded_count ?? 0),
    voidedCount: Number(sales.voided_count ?? 0),
    revenue: Number(sales.revenue ?? 0),
    grossProfit,
    expenses,
    netProfit: grossProfit - expenses,
    receivables: Number(sales.receivables ?? 0),
    cashSales: Number(sales.cash_sales ?? 0),
    nonCashSales: Number(sales.non_cash_sales ?? 0),
    topProducts: topProductsResult.rows,
    expenseCategories: expenseCategoriesResult.rows.map((row) => [
      row.category,
      Number(row.amount ?? 0),
    ]),
  });
}

async function getSalesPage(request: NextRequest) {
  const limit = clampLimit(request.nextUrl.searchParams.get('limit'));
  const offset = clampOffset(request.nextUrl.searchParams.get('offset'));
  const result = await getPosPool().query(
    `
    SELECT data
    FROM pos_sales
    ORDER BY timestamp DESC, id DESC
    LIMIT $1 OFFSET $2
    `,
    [limit, offset]
  );
  return NextResponse.json(result.rows.map((row) => row.data));
}

async function getExpensesPage(request: NextRequest) {
  const limit = clampLimit(request.nextUrl.searchParams.get('limit'));
  const offset = clampOffset(request.nextUrl.searchParams.get('offset'));
  const result = await getPosPool().query(
    `
    SELECT data
    FROM pos_expenses
    ORDER BY incurred_at DESC, id DESC
    LIMIT $1 OFFSET $2
    `,
    [limit, offset]
  );
  return NextResponse.json(result.rows.map((row) => row.data));
}

async function getInventoryPage(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (params.get('metrics') === 'true') {
    return getInventoryMetrics(request);
  }

  const scan = params.get('scan')?.trim();
  if (scan) {
    const result = await getPosPool().query(
      `
      SELECT data
      FROM pos_inventory
      WHERE lower(sku) = lower($1)
        OR lower(coalesce(barcode, '')) = lower($1)
        OR lower(name) = lower($1)
        OR lower(name) LIKE '%' || lower($1) || '%'
      ORDER BY
        CASE
          WHEN lower(sku) = lower($1) THEN 0
          WHEN lower(coalesce(barcode, '')) = lower($1) THEN 1
          WHEN lower(name) = lower($1) THEN 2
          ELSE 3
        END,
        lower(name) ASC,
        id ASC
      LIMIT 1
      `,
      [scan]
    );

    return NextResponse.json({ item: result.rows[0]?.data ?? null });
  }

  const ids = params.get('ids');
  if (ids) {
    const inventoryIds = ids
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 500);
    const result = await getPosPool().query(
      `
      SELECT data
      FROM pos_inventory
      WHERE id = ANY($1::text[])
      ORDER BY lower(name) ASC, id ASC
      `,
      [inventoryIds]
    );

    return NextResponse.json(result.rows.map((row) => row.data));
  }

  const limit = clampLimit(params.get('limit'));
  const offset = clampOffset(params.get('offset'));
  const cursor = decodeCursor(params.get('cursor'));
  const values: unknown[] = [];
  const where: string[] = [];

  const q = params.get('q')?.trim();
  if (q) {
    values.push(q);
    const index = values.length;
    where.push(`
      (
        to_tsvector(
          'simple',
          coalesce(name, '') || ' ' ||
          coalesce(generic_name, '') || ' ' ||
          coalesce(sku, '') || ' ' ||
          coalesce(barcode, '') || ' ' ||
          coalesce(batch_lot, '')
        ) @@ plainto_tsquery('simple', $${index})
        OR lower(sku) LIKE lower($${index}) || '%'
        OR lower(coalesce(barcode, '')) LIKE lower($${index}) || '%'
      )
    `);
  }

  const category = params.get('category');
  if (category && category !== 'all') {
    values.push(category);
    where.push(`category = $${values.length}`);
  }

  const supplier = params.get('supplier');
  if (supplier && supplier !== 'all') {
    values.push(supplier);
    where.push(`supplier = $${values.length}`);
  }

  const status = params.get('status');
  if (status && status !== 'all') {
    if (status === 'low-stock') {
      where.push("stock_status IN ('low', 'critical')");
    } else if (status === 'alerts') {
      const expiryAlertDays = Math.max(
        0,
        Math.min(3650, Number(params.get('expiryAlertDays')) || 30)
      );
      values.push(expiryAlertDays);
      where.push(`
        (
          stock_status IN ('low', 'critical', 'out', 'expired')
          OR (
            expiry_date >= current_date
            AND expiry_date <= current_date + ($${values.length}::int * interval '1 day')
          )
        )
      `);
    } else if (status === 'expiring-soon') {
      const expiryAlertDays = Math.max(
        0,
        Math.min(3650, Number(params.get('expiryAlertDays')) || 30)
      );
      values.push(expiryAlertDays);
      where.push(`
        expiry_date >= current_date
        AND expiry_date <= current_date + ($${values.length}::int * interval '1 day')
      `);
    } else {
      values.push(status);
      where.push(`stock_status = $${values.length}`);
    }
  }

  if (cursor && !params.has('offset')) {
    values.push(cursor.name.toLowerCase(), cursor.id);
    where.push(`(lower(name), id) > ($${values.length - 1}, $${values.length})`);
  }

  values.push(limit + 1);
  const limitIndex = values.length;
  if (params.has('offset')) values.push(offset);
  const offsetSql = params.has('offset') ? `OFFSET $${limitIndex + 1}` : '';
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await getPosPool().query(
    `
    SELECT data, lower(name) AS cursor_name, id
    FROM pos_inventory
    ${whereSql}
    ORDER BY lower(name) ASC, id ASC
    LIMIT $${limitIndex}
    ${offsetSql}
    `,
    values
  );

  const rows = result.rows.slice(0, limit);
  const last = rows[rows.length - 1];
  const total =
    params.get('includeTotal') === 'true'
      ? Number(
          (
            await getPosPool().query(
              `SELECT count(*)::bigint AS total FROM pos_inventory ${whereSql}`,
              values.slice(0, params.has('offset') ? -2 : -1)
            )
          ).rows[0]?.total ?? 0
        )
      : undefined;

  return NextResponse.json({
    items: rows.map((row) => row.data),
    nextCursor:
      result.rows.length > limit && last
        ? encodeCursor({ name: last.cursor_name, id: last.id })
        : null,
    limit,
    total,
  });
}

export async function GET(request: NextRequest) {
  try {
    await ensurePosSchema();
    const storeName = getStoreName(request);
    if (
      storeName === 'inventory' &&
      (request.nextUrl.searchParams.has('limit') ||
        request.nextUrl.searchParams.has('cursor') ||
        request.nextUrl.searchParams.has('scan') ||
        request.nextUrl.searchParams.has('ids') ||
        request.nextUrl.searchParams.has('metrics') ||
        request.nextUrl.searchParams.has('offset') ||
        request.nextUrl.searchParams.has('q') ||
        request.nextUrl.searchParams.has('category') ||
        request.nextUrl.searchParams.has('supplier') ||
        request.nextUrl.searchParams.has('status'))
    ) {
      return getInventoryPage(request);
    }
    if (storeName === 'sales' && request.nextUrl.searchParams.get('metrics') === 'true') {
      return getSalesMetrics(request);
    }
    if (storeName === 'sales' && request.nextUrl.searchParams.has('report')) {
      return getReportRows(request);
    }
    if (storeName === 'sales' && request.nextUrl.searchParams.has('limit')) {
      return getSalesPage(request);
    }
    if (storeName === 'expenses' && request.nextUrl.searchParams.has('limit')) {
      return getExpensesPage(request);
    }

    const result = await getPosPool().query(
      'SELECT data FROM pos_records WHERE store_name = $1 ORDER BY updated_at DESC',
      [storeName]
    );

    return NextResponse.json(result.rows.map((row) => row.data));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load POS records' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    await ensurePosSchema();
    const storeName = getStoreName(request);
    const body = await request.json();
    let records = (Array.isArray(body) ? body : [body]) as PosRecord[];
    const client = await getPosPool().connect();

    try {
      await client.query('BEGIN');
      if (storeName === 'settings') {
        const existing = await client.query(
          "SELECT data FROM pos_records WHERE store_name = 'settings' AND record_id = 'settings' LIMIT 1"
        );
        const currentSettings = existing.rows[0]?.data;
        records = records.map((record) => ({
          ...record,
          subscriptionPlanId:
            currentSettings?.subscriptionPlanId ?? record.subscriptionPlanId ?? 'starter',
          subscriptionStatus:
            currentSettings?.subscriptionStatus ?? record.subscriptionStatus ?? 'active',
          subscriptionRenewsAt:
            currentSettings?.subscriptionRenewsAt ?? record.subscriptionRenewsAt,
        }));
      }

      if (storeName === 'inventory') {
        const settingsResult = await client.query(
          "SELECT data FROM pos_records WHERE store_name = 'settings' AND record_id = 'settings' LIMIT 1"
        );
        const plan = getSubscriptionPlan(settingsResult.rows[0]?.data?.subscriptionPlanId);
        if (plan.productLimit) {
          const existingInventory = await client.query(
            'SELECT count(*)::bigint AS product_count FROM pos_inventory'
          );
          const currentProductCount = Number(existingInventory.rows[0]?.product_count ?? 0);
          const incomingIds = Array.from(
            new Set(records.flatMap((record) => (typeof record.id === 'string' ? [record.id] : [])))
          );
          const existingIncoming = await client.query(
            `
            SELECT id
            FROM pos_inventory
            WHERE id = ANY($1::text[])
            `,
            [incomingIds]
          );
          const existingIncomingIds = new Set<string>(
            existingIncoming.rows.map((row) => row.id as string)
          );
          const newProductCount = incomingIds.filter((id) => !existingIncomingIds.has(id)).length;
          if (currentProductCount + newProductCount > plan.productLimit) {
            throw new Error(
              `${plan.name} allows ${plan.productLimit.toLocaleString()} products. Upgrade your plan to add more inventory.`
            );
          }
        }
      }

      for (const record of records) {
        if (!record?.id || typeof record.id !== 'string') {
          throw new Error('POS record is missing an id');
        }

        if (storeName === 'inventory' && typeof record._expectedUpdatedAt === 'string') {
          const existing = await client.query(
            `
            SELECT data->>'updatedAt' AS updated_at
            FROM pos_records
            WHERE store_name = 'inventory' AND record_id = $1
            FOR UPDATE
            `,
            [record.id]
          );
          const currentUpdatedAt = existing.rows[0]?.updated_at;
          if (currentUpdatedAt && currentUpdatedAt !== record._expectedUpdatedAt) {
            throw new Error(
              'Inventory changed while this transaction was being processed. Reload stock and try again.'
            );
          }
        }

        const storedRecord = prepareRecordForStorage(record);
        await client.query(
          `
          INSERT INTO pos_records (store_name, record_id, data)
          VALUES ($1, $2, $3::jsonb)
          ON CONFLICT (store_name, record_id)
          DO UPDATE SET data = EXCLUDED.data, updated_at = now()
          `,
          [storeName, record.id, JSON.stringify(storedRecord)]
        );

        if (storeName === 'inventory') {
          await upsertInventoryIndex(client, storedRecord as PosRecord & { id: string });
        }
        if (storeName === 'sales') {
          await upsertSaleIndex(client, storedRecord as PosRecord & { id: string });
        }
        if (storeName === 'expenses') {
          await upsertExpenseIndex(client, storedRecord as PosRecord & { id: string });
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to save POS records' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await ensurePosSchema();
    const storeName = getStoreName(request);
    const { id } = await request.json();
    if (!id || typeof id !== 'string') {
      throw new Error('POS record id is required');
    }

    const client = await getPosPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM pos_records WHERE store_name = $1 AND record_id = $2', [
        storeName,
        id,
      ]);
      if (storeName === 'inventory') {
        await client.query('DELETE FROM pos_inventory WHERE id = $1', [id]);
      }
      if (storeName === 'sales') {
        await client.query('DELETE FROM pos_sales WHERE id = $1', [id]);
      }
      if (storeName === 'expenses') {
        await client.query('DELETE FROM pos_expenses WHERE id = $1', [id]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to delete POS record' },
      { status: 500 }
    );
  }
}
