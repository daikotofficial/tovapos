import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { sendExpiryDigestEmail, type ExpiryDigestItem } from '@/lib/server/email';
import { getPosPool } from '@/lib/server/pos-db';
import { ensureSecuritySchema } from '@/lib/server/security-schema';

export const maxDuration = 300;

function cronAuthorized(request: NextRequest): boolean {
  const configured = process.env.CRON_SECRET || '';
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (configured.length < 32 || supplied.length !== configured.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(configured));
}

function expiryRecipients(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return Array.from(
    new Set(
      value
        .split(/[;,\s]+/)
        .map((email) => email.trim().toLowerCase())
        .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    )
  ).slice(0, 20);
}

export async function POST(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await ensureSecuritySchema();
  const body = (await request.json().catch(() => ({}))) as { dryRun?: boolean; cursor?: string };
  const dryRun = body.dryRun === true && process.env.NODE_ENV !== 'production';
  const cursor = typeof body.cursor === 'string' ? body.cursor.slice(0, 200) : '';
  const timezone = process.env.EXPIRY_DIGEST_TIMEZONE || 'Africa/Lagos';
  const pool = getPosPool();
  const weekResult = await pool.query(
    `SELECT to_char(date_trunc('week', timezone($1, now())), 'YYYY-MM-DD') AS scheduled_week`,
    [timezone]
  );
  const scheduledWeek = String(weekResult.rows[0].scheduled_week);
  const tenants = await pool.query(
    `SELECT t.id, t.name, coalesce(r.data, '{}'::jsonb) AS settings
     FROM pos_tenants t
     LEFT JOIN pos_tenant_records r
       ON r.tenant_id = t.id AND r.store_name = 'settings' AND r.record_id = 'settings'
     WHERE t.status = 'active' AND t.id > $1
     ORDER BY t.id
     LIMIT 25`,
    [cursor]
  );
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, '');
  const results: Array<Record<string, unknown>> = [];
  let failures = 0;

  for (const tenant of tenants.rows) {
    const settings = (tenant.settings || {}) as Record<string, unknown>;
    const recipients = expiryRecipients(settings.expiryEmailRecipients);
    const alertDays = Math.max(
      1,
      Math.min(365, Math.floor(Number(settings.expiryAlertDays) || 30))
    );

    if (!dryRun) {
      const claim = await pool.query(
        `INSERT INTO pos_expiry_digest_runs
          (tenant_id, scheduled_week, status, started_at, finished_at, error_message)
         VALUES ($1, $2, 'processing', now(), NULL, NULL)
         ON CONFLICT (tenant_id, scheduled_week) DO UPDATE SET
           status = 'processing', started_at = now(), finished_at = NULL, error_message = NULL
         WHERE pos_expiry_digest_runs.status = 'failed'
         RETURNING tenant_id`,
        [tenant.id, scheduledWeek]
      );
      if (!claim.rowCount) {
        results.push({ tenantId: tenant.id, status: 'already-processed' });
        continue;
      }
    }

    const inventory = await pool.query(
      `SELECT name, coalesce(sku, '') AS sku, coalesce(batch_lot, '') AS batch_lot,
              current_qty, expiry_date::text,
              (expiry_date - current_date)::int AS days_remaining
       FROM pos_tenant_inventory
       WHERE tenant_id = $1
         AND current_qty > 0
         AND product_status = 'active'
         AND expiry_date IS NOT NULL
         AND expiry_date <= current_date + $2::int
       ORDER BY expiry_date, lower(name), id`,
      [tenant.id, alertDays]
    );
    const items: ExpiryDigestItem[] = inventory.rows.map((row) => ({
      name: String(row.name),
      sku: String(row.sku),
      batchLot: String(row.batch_lot),
      currentQty: Number(row.current_qty),
      expiryDate: String(row.expiry_date).slice(0, 10),
      daysRemaining: Number(row.days_remaining),
    }));

    if (dryRun) {
      results.push({
        tenantId: tenant.id,
        status: 'dry-run',
        recipients: recipients.length,
        items: items.length,
        expired: items.filter((item) => item.daysRemaining < 0).length,
      });
      continue;
    }

    if (!recipients.length) {
      await pool.query(
        `UPDATE pos_expiry_digest_runs
         SET status = 'skipped', item_count = $3, recipient_count = 0, finished_at = now()
         WHERE tenant_id = $1 AND scheduled_week = $2`,
        [tenant.id, scheduledWeek, items.length]
      );
      results.push({ tenantId: tenant.id, status: 'skipped-no-recipients', items: items.length });
      continue;
    }

    try {
      await sendExpiryDigestEmail({
        to: recipients,
        businessName: String(settings.businessName || tenant.name),
        alertDays,
        items,
        reportUrl: `${siteUrl}/reports?view=expiring`,
      });
      await pool.query(
        `UPDATE pos_expiry_digest_runs
         SET status = 'sent', item_count = $3, recipient_count = $4, finished_at = now()
         WHERE tenant_id = $1 AND scheduled_week = $2`,
        [tenant.id, scheduledWeek, items.length, recipients.length]
      );
      results.push({
        tenantId: tenant.id,
        status: 'sent',
        recipients: recipients.length,
        items: items.length,
      });
    } catch (error) {
      failures += 1;
      const message =
        error instanceof Error ? error.message.slice(0, 500) : 'Email delivery failed';
      await pool.query(
        `UPDATE pos_expiry_digest_runs
         SET status = 'failed', item_count = $3, recipient_count = $4,
             error_message = $5, finished_at = now()
         WHERE tenant_id = $1 AND scheduled_week = $2`,
        [tenant.id, scheduledWeek, items.length, recipients.length, message]
      );
      results.push({ tenantId: tenant.id, status: 'failed' });
    }
  }

  const nextCursor = tenants.rows.length === 25 ? String(tenants.rows.at(-1)?.id || '') : null;
  return NextResponse.json(
    { scheduledWeek, timezone, dryRun, tenants: results, failures, nextCursor },
    { status: failures ? 500 : 200 }
  );
}
