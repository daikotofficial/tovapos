# TOVAPOS Security and Offline Architecture

## Security boundary

- Every company is a row in `pos_tenants` and receives an opaque tenant id plus an internal unique slug.
- Every operational primary key includes `tenant_id`; SKU, barcode, receipt, and expense uniqueness are tenant-scoped.
- Browser requests authenticate with a random HttpOnly, SameSite=Strict session cookie. Only a SHA-256 digest of the token is stored.
- Password verification runs on the server with scrypt. Imported PBKDF2 passwords are upgraded after a successful legacy login.
- API authorization uses the authenticated database user. React permission gates are presentation only.
- Password hashes, password salts, PIN hashes, and plaintext password/PIN inputs are never returned or cached in IndexedDB.
- IndexedDB databases are named per tenant so a shared browser cannot merge two companies' cached records.

Existing unscoped data is imported once into the internal `legacy` tenant. All users sign in with a globally unique email address and password.

## Financial and stock commands

Direct writes to inventory, stock movements, and sales are rejected. The supported commands are:

- `POST /api/commands/sale`
- `POST /api/commands/stock-adjustment`
- `POST /api/commands/refund`
- `POST /api/commands/credit-payment`

Each command validates authorization and business input on the server, takes row locks, writes its audit record, and commits all related records in one PostgreSQL transaction. Sale totals and receipt numbers are computed by the server.

Every command has a tenant-scoped idempotency key. Replaying the same command returns the stored response; reusing a key with different input returns a conflict.

## Offline operation

The browser maintains a tenant-specific IndexedDB mirror. Offline checkout writes the local sale, stock movement, inventory projection, customer projection, and immutable queue command in one IndexedDB transaction before reporting success.

The header does not treat Wi-Fi or `navigator.onLine` as proof of service. It probes `/api/health` every 12 seconds (and immediately on focus, visibility, and browser network events); that endpoint verifies both the application and PostgreSQL. A four-second timeout or failed probe moves checkout into safe local mode.

On reconnect:

1. Pending sale commands are submitted oldest-first to the atomic sale endpoint.
2. Pending stock changes are submitted as quantity deltas, never absolute quantity snapshots.
3. The server acknowledges each idempotency key.
4. Server-authoritative inventory and receipt data replace the local projection.
5. Conflicts remain failed and visible; they are never falsely marked synced.

Retries use bounded exponential backoff and stop after five attempts for manual review.

Refunds and credit payments intentionally require connectivity because duplicate refunds and stale customer balances are unsafe to reconcile automatically.

### Fundamental offline stock rule

Disconnected terminals cannot know one another's newest stock. TOVAPOS therefore guarantees durable commands and deterministic reconciliation, but exact no-oversell behavior requires one of these operating policies:

- allocate offline stock quotas per terminal;
- keep a safety-stock reserve;
- require connectivity for scarce/controlled products; or
- permit oversell conflicts for later manager review.

The current server rejects an offline sale at synchronization if online sales consumed the remaining stock first.

## Production checklist

1. Use TLS and a managed PostgreSQL service with encryption, backups, point-in-time recovery, and monitoring.
2. Run schema changes in a deployment migration job before starting new application instances.
3. Set `NEXT_PUBLIC_SITE_URL` to the exact HTTPS application origin.
4. Keep `.env` outside source control and rotate any credential that may previously have been exposed.
5. Put the app behind request-size limits and an application-aware rate limiter shared by all instances.
6. Alert on failed sync operations, repeated authentication lockouts, negative/large stock deltas, and refund volume.
7. Retain `pos_audit_log` according to the company's accounting and legal policy.
8. Load test with the production connection-pool and database sizing.

## Verification performed

- unauthenticated users API: rejected with HTTP 401;
- two tenants using identical product id and SKU: isolated and both accepted;
- user list responses: no credential material;
- ten concurrent sales against five units: five accepted, five conflicted, final stock zero;
- duplicate sale replay: same receipt returned, no second deduction;
- ten concurrent `+1` adjustments: final quantity ten.
- ordered replay of twenty locally queued sales: twenty unique receipts and correct final stock;
- application/database health endpoint: verified healthy before the integration run.

With PostgreSQL and the production server running locally, repeat the core regression suite with:

```bash
npm run test:security
```
