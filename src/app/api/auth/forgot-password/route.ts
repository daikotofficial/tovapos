import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { passwordResetEmailConfigured, sendPasswordResetEmail } from '@/lib/server/email';
import { getPosPool } from '@/lib/server/pos-db';
import { assertSameOrigin, errorResponse, HttpError } from '@/lib/server/security';
import { ensureSecuritySchema } from '@/lib/server/security-schema';

const GENERIC_MESSAGE =
  'If an account uses that email address, a password reset link will be sent shortly.';

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    await ensureSecuritySchema();
    const body = (await request.json()) as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError(400, 'Enter a valid email address', 'VALIDATION_ERROR');
    }

    const clientAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    const attemptKey = createHash('sha256')
      .update(`forgot-password|${clientAddress}|${email}`)
      .digest('hex');
    const rate = await getPosPool().query(
      `INSERT INTO pos_auth_attempts (attempt_key, failures, blocked_until, last_attempt_at)
       VALUES ($1, 1, NULL, now())
       ON CONFLICT (attempt_key) DO UPDATE SET
         failures = CASE
           WHEN pos_auth_attempts.last_attempt_at < now() - interval '15 minutes' THEN 1
           ELSE pos_auth_attempts.failures + 1
         END,
         blocked_until = CASE
           WHEN pos_auth_attempts.last_attempt_at >= now() - interval '15 minutes'
             AND pos_auth_attempts.failures + 1 > 3
           THEN now() + interval '15 minutes'
           ELSE pos_auth_attempts.blocked_until
         END,
         last_attempt_at = now()
       RETURNING failures, blocked_until`,
      [attemptKey]
    );
    if (
      Number(rate.rows[0]?.failures ?? 0) > 3 ||
      (rate.rows[0]?.blocked_until && new Date(rate.rows[0].blocked_until) > new Date())
    ) {
      throw new HttpError(429, 'Too many reset requests. Try again later.', 'RATE_LIMITED');
    }

    const account = await getPosPool().query(
      `SELECT u.tenant_id, u.id AS user_id, u.name, u.email, t.name AS business_name
       FROM pos_app_users u
       JOIN pos_tenants t ON t.id = u.tenant_id
       WHERE lower(u.email) = $1
         AND t.status = 'active' AND u.status = 'active'
       ORDER BY u.created_at DESC
       LIMIT 2`,
      [email]
    );
    const accounts = account.rows.length === 1 ? account.rows : [];
    let developmentResetUrl: string | undefined;
    for (const user of accounts) {
      const token = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      await getPosPool().query(
        `WITH invalidated AS (
           UPDATE pos_password_reset_tokens SET used_at = now()
           WHERE tenant_id = $1 AND user_id = $2 AND used_at IS NULL
         )
         INSERT INTO pos_password_reset_tokens
           (id, tenant_id, user_id, token_hash, expires_at)
         VALUES ($3, $1, $2, $4, now() + interval '30 minutes')`,
        [user.tenant_id, user.user_id, randomUUID(), tokenHash]
      );

      const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
      const siteUrl =
        process.env.NODE_ENV === 'production'
          ? configuredSiteUrl || request.nextUrl.origin
          : request.nextUrl.origin;
      const resetUrl = `${siteUrl}/reset-password?token=${encodeURIComponent(token)}`;
      if (
        process.env.PASSWORD_RESET_DEV_LINKS === 'true' &&
        process.env.NODE_ENV !== 'production'
      ) {
        developmentResetUrl = resetUrl;
      }
      try {
        await sendPasswordResetEmail({
          to: user.email,
          name: user.name,
          businessName: user.business_name,
          resetUrl,
        });
      } catch (error) {
        console.error('Unable to deliver password reset email', error);
      }
      await getPosPool().query(
        `INSERT INTO pos_audit_log
          (tenant_id, user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'password.reset_requested', 'user', $2, $3::jsonb)`,
        [
          user.tenant_id,
          user.user_id,
          JSON.stringify({ deliveryConfigured: passwordResetEmailConfigured() }),
        ]
      );
    }

    return NextResponse.json({ message: GENERIC_MESSAGE, developmentResetUrl });
  } catch (error) {
    return errorResponse(error);
  }
}
