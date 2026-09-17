import { randomUUID } from 'node:crypto';
import { getPosPool } from './pos-db';

const CODE_PATTERN = /^(?:TOVA[A-HJ-NP-Z2-9]{6}|TV-[A-HJ-NP-Z2-9]{6,8}|TV-[A-F0-9]{32})$/;

export function normalizeAffiliateCode(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new Error('Invalid referral code');
  const code = value.trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) throw new Error('Enter a valid referral code');
  return code;
}

type SignupEvent = { tenantId: string; referralCode: string };

export async function queueAffiliateSignup(
  client: { query: Function },
  event: SignupEvent
): Promise<string> {
  const id = randomUUID();
  const payload = {
    product: process.env.AFFILIATE_PRODUCT || 'tovapos',
    externalId: event.tenantId,
    referralCode: event.referralCode,
    source: 'signup-form',
  };
  const result = await client.query(
    `INSERT INTO pos_affiliate_events
       (id, event_type, product, external_id, payload, status, next_attempt_at)
     VALUES ($1, 'signup', $2, $3, $4::jsonb, 'pending', now())
     ON CONFLICT (event_type, product, external_id)
     DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
     RETURNING id`,
    [id, payload.product, payload.externalId, JSON.stringify(payload)]
  );
  return result.rows[0].id as string;
}

export async function deliverAffiliateEvent(eventId: string): Promise<void> {
  const apiUrl = process.env.AFFILIATE_API_URL?.replace(/\/$/, '');
  const key = process.env.AFFILIATE_INTEGRATION_KEY;
  let destination: URL | null = null;
  try {
    destination = apiUrl ? new URL(apiUrl) : null;
  } catch {
    destination = null;
  }
  if (
    !destination ||
    (process.env.NODE_ENV === 'production' && destination.protocol !== 'https:') ||
    !key ||
    key.length < 32
  ) {
    await getPosPool().query(
      `UPDATE pos_affiliate_events SET status = 'pending', next_attempt_at = now() + interval '5 minutes', last_error = $2, updated_at = now()
       WHERE id = $1 AND status <> 'sent'`,
      [eventId, 'Affiliate integration is not configured']
    );
    return;
  }

  const event = await getPosPool().query(
    `UPDATE pos_affiliate_events
     SET status = 'sending', attempts = attempts + 1, updated_at = now()
     WHERE id = $1 AND status IN ('pending', 'failed') AND (next_attempt_at IS NULL OR next_attempt_at <= now())
     RETURNING event_type, payload`,
    [eventId]
  );
  const row = event.rows[0];
  if (!row) return;

  try {
    const response = await fetch(`${destination.origin}/api/affiliate/track/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tova-integration-key': key },
      body: JSON.stringify(row.payload),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      const retryable = response.status >= 500 || response.status === 429;
      await getPosPool().query(
        `UPDATE pos_affiliate_events
         SET status = $2, last_error = $3, next_attempt_at = CASE WHEN $2 = 'pending' THEN now() + interval '5 minutes' ELSE NULL END, updated_at = now()
         WHERE id = $1 AND status = 'sending'`,
        [
          eventId,
          retryable ? 'pending' : 'failed',
          `Affiliate API returned HTTP ${response.status}`,
        ]
      );
      return;
    }
    await getPosPool().query(
      `UPDATE pos_affiliate_events SET status = 'sent', sent_at = now(), last_error = NULL, updated_at = now() WHERE id = $1 AND status = 'sending'`,
      [eventId]
    );
  } catch (error) {
    await getPosPool().query(
      `UPDATE pos_affiliate_events SET status = 'pending', last_error = $2, next_attempt_at = now() + interval '5 minutes', updated_at = now() WHERE id = $1 AND status = 'sending'`,
      [
        eventId,
        error instanceof Error ? error.message.slice(0, 500) : 'Affiliate API request failed',
      ]
    );
  }
}
