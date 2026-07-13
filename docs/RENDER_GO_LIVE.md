# Render go-live checklist

## Service

Deploy this repository as a Render **Node web service**, not a static site. The included `render.yaml` uses:

- `npm ci && npm run build`
- `npm start`
- `/api/health` as the deployment health check
- Node 22

For a real POS deployment, use an always-on paid instance. A sleeping service can make online checkout appear unavailable until the instance wakes.

## Required environment variables

Set these in Render's Environment page. Never commit their values.

- `DATABASE_URL`: production PostgreSQL connection string
- `NEXT_PUBLIC_STORAGE_DRIVER=postgres`
- `NEXT_PUBLIC_SITE_URL`: exact public HTTPS origin, without a trailing path
- Email delivery: configure either `RESEND_API_KEY`, or the existing `MAILGUN_API_KEY` and
  `MAILGUN_DOMAIN`. `MAILGUN_BASE_URL` can be `https://api.mailgun.net` or the official EU API.
- `PASSWORD_RESET_FROM_EMAIL`: sender on a verified sending domain, for example
  `TOVAPOS <no-reply@example.com>`. With Mailgun, this defaults to the configured Mailgun domain.
- `NODE_ENV=production`

Keep `PASSWORD_RESET_DEV_LINKS=false` and `AUTH_DEV_LINKS=false` in production. Ensure
`NEXT_PUBLIC_SITE_URL` is the final Render or custom-domain HTTPS origin; confirmation and reset
links use it in production. Verify the sender domain before opening the service to users, then
complete real confirmation and forgot-password tests from the public URL.

The optional database pool and timeout variables are listed in `.env.example`. Start with `DATABASE_POOL_MAX=10` per application instance and coordinate the total across all instances with the PostgreSQL connection limit or pooler.

## Weekly expiry email

The Blueprint includes the `tovapos-weekly-expiry-digest` cron service. Its `0 6 * * 1` UTC
schedule runs every Monday at 7:00 AM West Africa Time. It calls a protected internal endpoint
using the generated `CRON_SECRET`; never expose that secret to browser code.

Each organization controls delivery from **Settings → Alerts & Notifications**:

- `Expiry Alert Days` defaults to 30.
- `Expiry Email Recipients` accepts comma-separated addresses and enables the weekly digest.
- The email summarizes expired stock and stock expiring inside the alert window.
- A CSV attachment contains the complete matching product list.
- Weekly run records prevent duplicate sends and preserve failed-delivery status for retry.

After syncing an existing Render Blueprint, confirm that the new cron service exists and that its
`CRON_SECRET` is copied from the web service as defined in `render.yaml`.

## Before opening registration

1. Create a production PostgreSQL backup and recovery policy.
2. Confirm `/api/health` returns HTTP 200 from the public URL.
3. Register a disposable organization, confirm its email, and verify normal email-and-password
   sign-in. Confirm that attempting to reuse the email is rejected.
4. Create a cashier without refund permission and confirm refund controls are absent.
5. Complete a cash sale, verify stock, sign out, and sign back in.
6. Test a short outage on an already authenticated terminal and confirm automatic replay.
7. Verify Pro-only pages with both Starter and Pro organizations.
8. Configure Render deploy-failure, health-check, and database alerts.
9. Request a password reset, confirm email delivery, use the link once, and confirm it cannot be
   reused.
10. Add a disposable near-expiry product, run the expiry cron once, and confirm the formatted email
    and full CSV attachment reach every configured recipient.

## First production period

Monitor API 5xx responses, PostgreSQL connections and slow queries, failed sync counts, authentication lockouts, registration volume, and rejected stock commands. Keep releases small and preserve the audit log when correcting operational data.

The current schema bootstrap is idempotent and retries after a transient failure. Before running multiple application instances or introducing complex migrations, move schema evolution into a dedicated pre-deploy migration command.
