import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getPosPool } from '@/lib/server/pos-db';
import {
  hashPasswordServer,
  passwordStrengthError,
  verifyPasswordServer,
} from '@/lib/server/password';
import { assertSameOrigin, errorResponse, HttpError } from '@/lib/server/security';
import { ensureSecuritySchema } from '@/lib/server/security-schema';

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    await ensureSecuritySchema();
    const body = (await request.json()) as Record<string, unknown>;
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!token || token.length > 200) {
      throw new HttpError(400, 'This password reset link is invalid', 'INVALID_RESET_TOKEN');
    }
    const strengthError = passwordStrengthError(password);
    if (strengthError) throw new HttpError(400, strengthError, 'WEAK_PASSWORD');

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const client = await getPosPool().connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT r.id, r.tenant_id, r.user_id, u.password_hash
         FROM pos_password_reset_tokens r
         JOIN pos_app_users u ON u.tenant_id = r.tenant_id AND u.id = r.user_id
         WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > now()
           AND u.status = 'active'
         FOR UPDATE OF r`,
        [tokenHash]
      );
      const row = result.rows[0];
      if (!row) {
        throw new HttpError(
          400,
          'This password reset link is invalid or has expired',
          'INVALID_RESET_TOKEN'
        );
      }
      if (await verifyPasswordServer(password, row.password_hash)) {
        throw new HttpError(
          400,
          'Choose a password you have not used for this account',
          'PASSWORD_REUSED'
        );
      }

      const passwordHash = await hashPasswordServer(password);
      await client.query(
        `UPDATE pos_app_users
         SET password_hash = $3, password_updated_at = now(), updated_at = now()
         WHERE tenant_id = $1 AND id = $2`,
        [row.tenant_id, row.user_id, passwordHash]
      );
      await client.query(
        `UPDATE pos_password_reset_tokens SET used_at = now()
         WHERE tenant_id = $1 AND user_id = $2 AND used_at IS NULL`,
        [row.tenant_id, row.user_id]
      );
      await client.query('DELETE FROM pos_sessions WHERE tenant_id = $1 AND user_id = $2', [
        row.tenant_id,
        row.user_id,
      ]);
      await client.query(
        `INSERT INTO pos_audit_log
          (tenant_id, user_id, action, entity_type, entity_id)
         VALUES ($1, $2, 'password.reset_completed', 'user', $2)`,
        [row.tenant_id, row.user_id]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return NextResponse.json({ message: 'Your password has been reset. You can now sign in.' });
  } catch (error) {
    return errorResponse(error);
  }
}
