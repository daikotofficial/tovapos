import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getPosPool } from '@/lib/server/pos-db';
import {
  assertSameOrigin,
  createSession,
  errorResponse,
  HttpError,
  sameOriginRedirectUrl,
  setSessionCookie,
} from '@/lib/server/security';
import { ensureSecuritySchema } from '@/lib/server/security-schema';

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
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token || token.length > 200) {
      throw new HttpError(400, 'This confirmation link is invalid', 'INVALID_VERIFICATION_TOKEN');
    }

    const client = await getPosPool().connect();
    let tenantId = '';
    let userId = '';
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT v.id, v.tenant_id, v.user_id
         FROM pos_email_verification_tokens v
         JOIN pos_app_users u ON u.tenant_id = v.tenant_id AND u.id = v.user_id
         WHERE v.token_hash = $1 AND v.used_at IS NULL AND v.expires_at > now()
           AND u.status = 'active'
         FOR UPDATE OF v`,
        [createHash('sha256').update(token).digest('hex')]
      );
      const row = result.rows[0];
      if (!row) {
        throw new HttpError(
          400,
          'This confirmation link is invalid or has expired',
          'INVALID_VERIFICATION_TOKEN'
        );
      }
      tenantId = row.tenant_id;
      userId = row.user_id;
      await client.query(
        `UPDATE pos_app_users
         SET email_verified_at = now(), updated_at = now()
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, userId]
      );
      await client.query(
        `UPDATE pos_email_verification_tokens SET used_at = now()
         WHERE tenant_id = $1 AND user_id = $2 AND used_at IS NULL`,
        [tenantId, userId]
      );
      await client.query(
        `INSERT INTO pos_audit_log
          (tenant_id, user_id, action, entity_type, entity_id)
         VALUES ($1, $2, 'email.verified', 'user', $2)`,
        [tenantId, userId]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const session = await createSession(tenantId, userId, false);
    const response = isNativeForm
      ? NextResponse.redirect(sameOriginRedirectUrl(request, '/dashboard'), 303)
      : NextResponse.json({ message: 'Email confirmed successfully' });
    setSessionCookie(response, session.token, session.expiresAt);
    return response;
  } catch (error) {
    if (isNativeForm) {
      return NextResponse.redirect(
        sameOriginRedirectUrl(request, '/verify-email/result?status=invalid'),
        303
      );
    }
    return errorResponse(error);
  }
}
