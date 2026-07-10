# TOVAPOS Enterprise Scaling Notes

## Current readiness

The app now has a scalable inventory storage path:

- `pos_inventory` stores searchable product columns separately from the legacy JSON record.
- SKU and barcode have unique indexes.
- category, supplier, stock status, product status, expiry date, and name/id pagination are indexed.
- inventory search uses a Postgres full-text GIN index.
- `/api/pos-store?store=inventory&limit=...` returns paginated inventory results with `nextCursor`.
- inventory writes still update `pos_records` for compatibility and also upsert `pos_inventory`.
- inventory deletes remove both records.
- subscription product-limit checks use `count(*)` instead of loading every product id.
- checkout scan and cart validation use targeted product lookup instead of all-product hydration.
- inventory management uses backend pages and aggregate metrics.
- sales and expenses are dual-written into indexed `pos_sales`, `pos_sale_items`, and `pos_expenses`.
- app boot in Postgres mode hydrates recent/page-limited records instead of full inventory, sales, and expense history.
- dashboard headline metrics use indexed server aggregates for sales, profit, expenses, and inventory value.
- reports overview/profit metrics use indexed server aggregates for selected date ranges.
- high-volume report row views now have bounded server endpoints for sales, credit sales, expenses, product/category sales, payment methods, refunds, and voided sales.

This is a major backend step toward large catalogs. Some compatibility pages still read recent/page-limited JSON records, so the remaining work is to move every reporting and ledger workflow onto indexed paginated or aggregate endpoints.

## Required before 10 million products

1. Add database migrations instead of schema creation inside app startup.
2. Add load tests for checkout, stock adjustment, inventory search, and report generation.
3. Add database backups, point-in-time recovery, monitoring, slow query logging, and alerting.
4. Add branch/tenant columns and composite indexes if multiple businesses share one database.
5. Add background jobs for exports; never export millions of rows in the browser.
6. Add role/audit tables for every stock and financial mutation.
7. Add streamed/batched product imports with validation and duplicate reporting.
8. Add archive/partition strategy for high-volume sale and stock-movement tables.
9. Replace remaining compatibility JSON reads on customer/vendor/settings list pages where necessary.
10. Add cursor-based pagination controls to every report table for deep history browsing.

## Operating targets

- Inventory search page size: 50 to 500 rows.
- Checkout product lookup: single SKU/barcode lookup, under 100 ms on warm database cache.
- Reports: aggregate queries by date range, never client-side reduction of raw rows.
- Exports: asynchronous jobs with downloadable files.
- Product import: streamed/batched imports, 1,000 to 10,000 rows per batch.
