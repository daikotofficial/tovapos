# Scalability and data-integrity baseline

This document records the first capacity audit for the POS application. It is an engineering baseline, not a capacity guarantee.

## Current strengths

- Tenant-scoped PostgreSQL tables use composite keys and tenant-aware indexes.
- Sale, refund, payment, and stock command paths use transactions, idempotency, and row locking.
- Inventory already has a cursor-based API path and server-side metrics.
- The database pool has bounded connection, statement, and query timeouts.

## Current blockers for very large businesses

1. The generic `pos-store` read path can return an entire tenant store when the caller does not send pagination parameters.
2. The browser provider keeps collections such as customers, vendors, users, and offline records in client state. A million-record collection cannot be mirrored into every cashier browser.
3. Customer/vendor/user loading does not yet have a complete server-side search and cursor contract, so replacing full loads requires coordinated UI changes.
4. Reports correctly use bounded result pages, but aggregate queries still scan tenant history. Large tenants will need date/tenant partitioning, summary tables, or a reporting store.
5. Operational tables retain JSONB copies of records. This preserves compatibility, but storage growth and audit retention need an explicit archival policy.

## Required acceptance criteria before high-scale marketing

- No production API returns an unbounded tenant collection.
- Every large collection supports tenant-scoped filtering, stable cursor pagination, and server-side search.
- Cashier startup loads only the data needed for checkout; historical sales and audit data remain server-side.
- Reports use bounded queries or precomputed summaries for large date ranges.
- Load tests cover peak concurrency, offline replay, duplicate commands, database failover, and tenant-isolation attempts.
- Backup restoration is tested and recorded; integrity checks compare sales, stock movements, refunds, and audit entries.

## Storage policy direction

Keep legally and operationally required records, but avoid duplicating large payloads unnecessarily. Use bounded JSON metadata, integer minor units or exact numeric database values for money, indexed typed columns for query fields, and archival partitions for historical data. No data should be discarded merely to make the database smaller.

