import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { sendPlatformAdminInviteEmail } from '@/lib/server/email';
import { hashPasswordServer, passwordStrengthError } from '@/lib/server/password';
import { getPosPool } from '@/lib/server/pos-db';
import { assertSameOrigin, errorResponse, HttpError } from '@/lib/server/security';
import { assertOwnerAdmin, requirePlatformAdmin } from '@/lib/server/platform-admin';

function inviteUrl(request: NextRequest, token: string): string {
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  return `${origin.replace(/\/$/, '')}/admin/invite?token=${encodeURIComponent(token)}`;
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requirePlatformAdmin(request);
    assertOwnerAdmin(admin);
    const body = (await request.json()) as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const role =
      body.role === 'admin' || body.role === 'support' || body.role === 'owner'
        ? body.role
        : 'support';
    if (!email || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError(400, 'Valid admin name and email are required', 'VALIDATION_ERROR');
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const adminId = `platform-admin-${randomUUID()}`;
    const client = await getPosPool().connect();
    try {
      await client.query('BEGIN');
      const saved = await client.query(
        `
        INSERT INTO pos_platform_admins (id, name, email, role, status, invited_by, invited_at)
        VALUES ($1, $2, $3, $4, 'invited', $5, now())
        ON CONFLICT (email) DO UPDATE SET
          name = EXCLUDED.name,
          role = EXCLUDED.role,
          status = 'invited',
          password_hash = NULL,
          invited_by = EXCLUDED.invited_by,
          invited_at = now(),
          updated_at = now()
        RETURNING id, name, email
        `,
        [adminId, name, email, role, admin.id]
      );
      await client.query(
        `UPDATE pos_platform_admin_invites SET used_at = now()
         WHERE admin_id = $1 AND used_at IS NULL`,
        [saved.rows[0].id]
      );
      await client.query(
        `INSERT INTO pos_platform_admin_invites (id, admin_id, token_hash, expires_at)
         VALUES ($1, $2, $3, now() + interval '48 hours')`,
        [`admin-invite-${randomUUID()}`, saved.rows[0].id, tokenHash]
      );
      await client.query('COMMIT');
      const url = inviteUrl(request, token);
      let emailDeliveryFailed = false;
      try {
        await sendPlatformAdminInviteEmail({ to: email, name, inviteUrl: url });
      } catch {
        emailDeliveryFailed = true;
      }
      return NextResponse.json({ ok: true, inviteUrl: url, emailDeliveryFailed });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as Record<string, unknown>;
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!token) throw new HttpError(400, 'Invitation token is required', 'VALIDATION_ERROR');
    const strengthError = passwordStrengthError(password);
    if (strengthError) throw new HttpError(400, strengthError, 'WEAK_PASSWORD');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const passwordHash = await hashPasswordServer(password);
    const client = await getPosPool().connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `
        SELECT i.id AS invite_id, a.id AS admin_id
        FROM pos_platform_admin_invites i
        JOIN pos_platform_admins a ON a.id = i.admin_id
        WHERE i.token_hash = $1 AND i.used_at IS NULL AND i.expires_at > now()
        FOR UPDATE OF i
        `,
        [tokenHash]
      );
      const row = result.rows[0];
      if (!row) throw new HttpError(400, 'Invitation link is invalid or expired', 'INVALID_TOKEN');
      await client.query(
        `UPDATE pos_platform_admins
         SET password_hash = $2, status = 'active', accepted_at = now(), updated_at = now()
         WHERE id = $1`,
        [row.admin_id, passwordHash]
      );
      await client.query('UPDATE pos_platform_admin_invites SET used_at = now() WHERE id = $1', [
        row.invite_id,
      ]);
      await client.query('COMMIT');
      return NextResponse.json({ ok: true });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return errorResponse(error);
  }
}
