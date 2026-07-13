import { NextRequest, NextResponse } from 'next/server';
import { getPosPool } from '@/lib/server/pos-db';
import {
  hashPasswordServer,
  passwordStrengthError,
  verifyPasswordServer,
} from '@/lib/server/password';
import { assertSameOrigin, errorResponse, HttpError, requireAuth } from '@/lib/server/security';

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    const body = (await request.json()) as Record<string, unknown>;
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    const strengthError = passwordStrengthError(newPassword);
    if (!currentPassword) {
      throw new HttpError(400, 'Enter your current password', 'VALIDATION_ERROR');
    }
    if (strengthError) throw new HttpError(400, strengthError, 'WEAK_PASSWORD');

    const userResult = await getPosPool().query(
      'SELECT password_hash FROM pos_app_users WHERE tenant_id = $1 AND id = $2',
      [auth.tenantId, auth.user.id]
    );
    const currentHash = userResult.rows[0]?.password_hash;
    if (!currentHash || !(await verifyPasswordServer(currentPassword, currentHash))) {
      throw new HttpError(400, 'Current password is incorrect', 'INVALID_CURRENT_PASSWORD');
    }
    if (await verifyPasswordServer(newPassword, currentHash)) {
      throw new HttpError(
        400,
        'New password must be different from your current password',
        'PASSWORD_REUSED'
      );
    }

    const passwordHash = await hashPasswordServer(newPassword);
    const client = await getPosPool().connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE pos_app_users
         SET password_hash = $3, password_updated_at = now(), updated_at = now()
         WHERE tenant_id = $1 AND id = $2`,
        [auth.tenantId, auth.user.id, passwordHash]
      );
      await client.query(
        'DELETE FROM pos_sessions WHERE tenant_id = $1 AND user_id = $2 AND id <> $3',
        [auth.tenantId, auth.user.id, auth.sessionId]
      );
      await client.query(
        `UPDATE pos_password_reset_tokens SET used_at = now()
         WHERE tenant_id = $1 AND user_id = $2 AND used_at IS NULL`,
        [auth.tenantId, auth.user.id]
      );
      await client.query(
        `INSERT INTO pos_audit_log
          (tenant_id, user_id, action, entity_type, entity_id)
         VALUES ($1, $2, 'password.changed', 'user', $2)`,
        [auth.tenantId, auth.user.id]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return NextResponse.json({ message: 'Password changed successfully' });
  } catch (error) {
    return errorResponse(error);
  }
}
