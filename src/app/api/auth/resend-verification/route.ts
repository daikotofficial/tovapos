import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { issueEmailVerification } from '@/lib/server/email-verification';
import { getPosPool } from '@/lib/server/pos-db';
import {
  assertSameOrigin,
  errorResponse,
  HttpError,
  sameOriginRedirectUrl,
} from '@/lib/server/security';
import { ensureSecuritySchema } from '@/lib/server/security-schema';

const MESSAGE = 'If an unconfirmed account uses that email, a new confirmation link will be sent.';

export async function POST(request: NextRequest) {
  const isNativeForm = request.headers
    .get('content-type')
    ?.toLowerCase()
    .includes('application/x-www-form-urlencoded');
  try {
    assertSameOrigin(request);
    await ensureSecuritySchema();
    const body = isNativeForm
      ? Object.fromEntries((await request.formData()).entries())
      : ((await request.json()) as Record<string, unknown>);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError(400, 'Enter a valid email address', 'VALIDATION_ERROR');
    }
    const address = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const key = createHash('sha256').update(`verify|${address}|${email}`).digest('hex');
    const rate = await getPosPool().query(
      `INSERT INTO pos_auth_attempts (attempt_key, failures, blocked_until, last_attempt_at)
       VALUES ($1, 1, NULL, now())
       ON CONFLICT (attempt_key) DO UPDATE SET
         failures = CASE WHEN last_attempt_at < now() - interval '15 minutes' THEN 1 ELSE failures + 1 END,
         blocked_until = CASE WHEN last_attempt_at >= now() - interval '15 minutes' AND failures + 1 > 3 THEN now() + interval '15 minutes' ELSE blocked_until END,
         last_attempt_at = now()
       RETURNING failures, blocked_until`,
      [key]
    );
    if (Number(rate.rows[0]?.failures ?? 0) > 3) {
      throw new HttpError(429, 'Too many requests. Try again later.', 'RATE_LIMITED');
    }
    const accounts = await getPosPool().query(
      `SELECT u.tenant_id, u.id AS user_id, u.name, u.email, t.name AS business_name
       FROM pos_app_users u JOIN pos_tenants t ON t.id = u.tenant_id
       WHERE lower(u.email) = $1 AND u.email_verified_at IS NULL
         AND u.status = 'active' AND t.status = 'active' LIMIT 2`,
      [email]
    );
    const uniqueAccount = accounts.rows.length === 1 ? accounts.rows : [];
    for (const account of uniqueAccount) {
      try {
        await issueEmailVerification({
          tenantId: account.tenant_id,
          userId: account.user_id,
          email: account.email,
          name: account.name,
          businessName: account.business_name,
          requestOrigin: request.headers.get('origin') || request.nextUrl.origin,
        });
      } catch (error) {
        console.error('Unable to resend verification email', error);
      }
    }
    return isNativeForm
      ? NextResponse.redirect(
          sameOriginRedirectUrl(request, '/verify-email/pending?delivery=resent'),
          303
        )
      : NextResponse.json({ message: MESSAGE });
  } catch (error) {
    if (isNativeForm) {
      return NextResponse.redirect(
        sameOriginRedirectUrl(request, '/resend-verification?error=request'),
        303
      );
    }
    return errorResponse(error);
  }
}
