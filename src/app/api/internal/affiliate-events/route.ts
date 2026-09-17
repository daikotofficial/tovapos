import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { deliverAffiliateEvent } from '@/lib/server/affiliate';
import { getPosPool } from '@/lib/server/pos-db';
import { ensureSecuritySchema } from '@/lib/server/security-schema';

export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  return (
    expected.length >= 32 &&
    supplied.length === expected.length &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  );
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await ensureSecuritySchema();
  const pool = getPosPool();
  await pool.query(
    `UPDATE pos_affiliate_events SET status = 'pending', next_attempt_at = now() WHERE status = 'sending' AND updated_at < now() - interval '10 minutes'`
  );
  const events = await pool.query(
    `SELECT id FROM pos_affiliate_events WHERE status = 'pending' AND next_attempt_at <= now() ORDER BY created_at LIMIT 50`
  );
  let sent = 0;
  for (const event of events.rows) {
    await deliverAffiliateEvent(String(event.id));
    sent += 1;
  }
  return NextResponse.json({ ok: true, processed: sent });
}
