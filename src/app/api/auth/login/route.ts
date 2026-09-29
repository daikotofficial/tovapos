import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getPosPool } from '@/lib/server/pos-db';
import { hashPasswordServer, verifyPasswordServer } from '@/lib/server/password';
import {
  assertSameOrigin,
  createSession,
  errorResponse,
  HttpError,
  publicUser,
  sameOriginRedirectUrl,
  setSessionCookie,
} from '@/lib/server/security';
import { ensureSecuritySchema } from '@/lib/server/security-schema';
import { phoneLoginCandidates, normalizePhoneForLogin } from '@/lib/server/login-identifier';

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
    const identifier = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const isEmailLogin = identifier.includes('@');
    const email = isEmailLogin ? identifier.toLowerCase() : '';
    const phoneCandidates = isEmailLogin ? [] : phoneLoginCandidates(identifier);
    if (!identifier || !password || (!isEmailLogin && phoneCandidates.length === 0)) {
      throw new HttpError(400, 'Email or phone number and password are required', 'VALIDATION_ERROR');
    }
    const loginKey = isEmailLogin ? email : normalizePhoneForLogin(identifier) || identifier;

    const clientAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    const attemptKey = createHash('sha256').update(`${clientAddress}|${loginKey}`).digest('hex');
    const attempt = await getPosPool().query(
      `SELECT failures, blocked_until FROM pos_auth_attempts WHERE attempt_key = $1`,
      [attemptKey]
    );
    if (attempt.rows[0]?.blocked_until && new Date(attempt.rows[0].blocked_until) > new Date()) {
      throw new HttpError(429, 'Too many sign-in attempts. Try again later.', 'RATE_LIMITED');
    }

    const result = await getPosPool().query(
      `SELECT u.*, t.slug AS tenant_slug, t.name AS tenant_name, t.status AS tenant_status
       FROM pos_app_users u
       JOIN pos_tenants t ON t.id = u.tenant_id
       WHERE (
         ($1::boolean AND lower(u.email) = $2)
         OR (NOT $1::boolean AND (
           regexp_replace(coalesce(u.phone, ''), '[^0-9+]', '', 'g') = ANY($3::text[])
           OR ('+234' || substring(regexp_replace(coalesce(u.phone, ''), '[^0-9+]', '', 'g') from 2)) = ANY($3::text[])
           OR ('+' || regexp_replace(coalesce(u.phone, ''), '[^0-9+]', '', 'g')) = ANY($3::text[])
         ))
       )
       ORDER BY u.created_at DESC
       LIMIT 2`,
      [isEmailLogin, email, phoneCandidates]
    );
    if (result.rows.length > 1) {
      throw new HttpError(
        409,
        isEmailLogin
          ? 'This email is attached to more than one account. Contact an administrator to resolve the duplicate before signing in.'
          : 'This phone number is attached to more than one account. Contact an administrator to resolve the duplicate before signing in.',
        isEmailLogin ? 'DUPLICATE_EMAIL' : 'DUPLICATE_PHONE'
      );
    }
    const candidate = result.rows[0];
    if (!candidate) {
      throw new HttpError(401, 'The email or phone number or password is incorrect.', 'INVALID_CREDENTIALS');
    }
    if (candidate.status !== 'active') {
      throw new HttpError(
        403,
        'This user account has been suspended. Contact your business owner or support.',
        'USER_SUSPENDED'
      );
    }
    const row =
      candidate && (await verifyPasswordServer(password, candidate.password_hash))
        ? candidate
        : null;
    if (!row) {
      await getPosPool().query(
        `INSERT INTO pos_auth_attempts (attempt_key, failures, blocked_until, last_attempt_at)
         VALUES ($1, 1, NULL, now())
         ON CONFLICT (attempt_key) DO UPDATE SET
           failures = CASE
             WHEN pos_auth_attempts.last_attempt_at < now() - interval '15 minutes' THEN 1
             ELSE pos_auth_attempts.failures + 1
           END,
           blocked_until = CASE
             WHEN (
               CASE
                 WHEN pos_auth_attempts.last_attempt_at < now() - interval '15 minutes' THEN 1
                 ELSE pos_auth_attempts.failures + 1
               END
             ) >= 5 THEN now() + interval '15 minutes'
             ELSE NULL
           END,
           last_attempt_at = now()`,
        [attemptKey]
      );
      throw new HttpError(
        401,
        'The password is incorrect. Use Forgot password if you need to reset it.',
        'INVALID_CREDENTIALS'
      );
    }

    if (isEmailLogin && !row.email_verified_at) {
      throw new HttpError(
        403,
        'Confirm your email address before signing in. You can request a new confirmation email.',
        'EMAIL_NOT_VERIFIED'
      );
    }

    await getPosPool().query('DELETE FROM pos_auth_attempts WHERE attempt_key = $1', [attemptKey]);

    if (String(row.password_hash).startsWith('pbkdf2-sha256$')) {
      const upgraded = await hashPasswordServer(password);
      await getPosPool().query(
        `UPDATE pos_app_users SET password_hash = $3, password_updated_at = now(), updated_at = now()
         WHERE tenant_id = $1 AND id = $2`,
        [row.tenant_id, row.id, upgraded]
      );
    }
    await getPosPool().query(
      `UPDATE pos_app_users SET last_login = now(), updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [row.tenant_id, row.id]
    );

    const session = await createSession(
      String(row.tenant_id),
      String(row.id),
      body.remember === true || body.remember === 'on'
    );
    const response = isNativeForm
      ? NextResponse.redirect(sameOriginRedirectUrl(request, '/dashboard'), 303)
      : NextResponse.json({
          user: publicUser({ ...row, last_login: new Date() }),
          tenant: {
            id: row.tenant_id,
            slug: row.tenant_slug,
            name: row.tenant_name,
            status: row.tenant_status,
          },
        });
    setSessionCookie(response, session.token, session.expiresAt);
    return response;
  } catch (error) {
    if (isNativeForm) {
      const authError =
        error instanceof HttpError && error.code === 'DUPLICATE_EMAIL'
          ? 'duplicate-email'
          : error instanceof HttpError && error.code === 'DUPLICATE_PHONE'
            ? 'duplicate-phone'
            : error instanceof HttpError && error.code === 'EMAIL_NOT_VERIFIED'
            ? 'email-unverified'
            : error instanceof HttpError && error.code === 'RATE_LIMITED'
              ? 'rate-limited'
              : 'invalid';
      return NextResponse.redirect(
        sameOriginRedirectUrl(request, `/sign-up-login?authError=${authError}`),
        303
      );
    }
    return errorResponse(error);
  }
}
