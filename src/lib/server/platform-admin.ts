import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getPosPool } from './pos-db';
import { ensureSecuritySchema } from './security-schema';
import { HttpError } from './security';

export const PLATFORM_ADMIN_COOKIE = 'tovapos_admin_session';

export interface PlatformAdmin {
  id: string;
  name: string;
  email: string;
  role: 'super-admin' | 'admin' | 'support';
  status: 'invited' | 'active' | 'suspended';
  mfaEnabled?: boolean;
}

export function hashAdminToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createPlatformAdminSession(
  adminId: string,
  remember = false
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + (remember ? 14 * 24 : 8) * 60 * 60 * 1000);
  await getPosPool().query(
    `INSERT INTO pos_platform_admin_sessions (id, admin_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [`admin-session-${randomUUID()}`, adminId, hashAdminToken(token), expiresAt]
  );
  return { token, expiresAt };
}

export function setPlatformAdminCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date
): void {
  response.cookies.set(PLATFORM_ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    expires: expiresAt,
    priority: 'high',
  });
}

export function clearPlatformAdminCookie(response: NextResponse): void {
  response.cookies.set(PLATFORM_ADMIN_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    expires: new Date(0),
  });
}

export async function requirePlatformAdmin(request: NextRequest): Promise<PlatformAdmin> {
  const token = request.cookies.get(PLATFORM_ADMIN_COOKIE)?.value;
  if (!token) throw new HttpError(401, 'Admin authentication is required', 'UNAUTHENTICATED');
  await ensureSecuritySchema();
  const result = await getPosPool().query(
    `
    SELECT a.id, a.name, a.email, a.role, a.status, a.mfa_enabled, s.id AS session_id
    FROM pos_platform_admin_sessions s
    JOIN pos_platform_admins a ON a.id = s.admin_id
    WHERE s.token_hash = $1
      AND s.expires_at > now()
      AND a.status = 'active'
    LIMIT 1
    `,
    [hashAdminToken(token)]
  );
  const row = result.rows[0];
  if (!row) throw new HttpError(401, 'Admin session is invalid or expired', 'SESSION_EXPIRED');
  void getPosPool().query(
    'UPDATE pos_platform_admin_sessions SET last_seen_at = now() WHERE id = $1',
    [row.session_id]
  );
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    mfaEnabled: Boolean(row.mfa_enabled),
  };
}

export function assertSuperAdmin(admin: PlatformAdmin): void {
  if (admin.role !== 'super-admin') {
    throw new HttpError(403, 'Only the seeded super admin can perform this action', 'FORBIDDEN');
  }
}

export function assertPlatformOperator(admin: PlatformAdmin): void {
  if (admin.role === 'support') {
    throw new HttpError(403, 'Support admins cannot manage business accounts', 'FORBIDDEN');
  }
}
