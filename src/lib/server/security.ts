import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { Permission, TovaUser, UserRole } from '@/lib/pos/types';
import { getSubscriptionPlan } from '@/lib/pos/subscription';
import { getPosPool } from './pos-db';
import { ensureSecuritySchema } from './security-schema';

export const SESSION_COOKIE = 'tovapos_session';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'REQUEST_FAILED'
  ) {
    super(message);
  }
}

export interface AuthContext {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  tenantStatus: 'active' | 'suspended';
  user: TovaUser;
  sessionId: string;
}

export function publicUser(row: Record<string, unknown>): TovaUser {
  return {
    id: String(row.id),
    name: String(row.name),
    email: row.email ? String(row.email) : '',
    phone: row.phone ? String(row.phone) : undefined,
    role: row.role as UserRole,
    permissions: Array.isArray(row.permissions) ? (row.permissions as Permission[]) : [],
    status: row.status as 'active' | 'suspended',
    branch: row.branch ? String(row.branch) : undefined,
    pin: '',
    passwordUpdatedAt: row.password_updated_at
      ? new Date(String(row.password_updated_at)).toISOString()
      : undefined,
    lastLogin: row.last_login ? new Date(String(row.last_login)).toISOString() : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : undefined,
  };
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(
  tenantId: string,
  userId: string,
  remember: boolean
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + (remember ? 14 * 24 : 8) * 60 * 60 * 1000);
  await getPosPool().query(
    `INSERT INTO pos_sessions (id, tenant_id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), tenantId, userId, hashSessionToken(token), expiresAt]
  );
  return { token, expiresAt };
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    expires: expiresAt,
    priority: 'high',
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    expires: new Date(0),
  });
}

export function sameOriginRedirectUrl(request: NextRequest, path: string): URL {
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      return new URL(path, origin);
    } catch {
      // Fall back to the request URL when an intermediary supplied an invalid origin.
    }
  }
  return new URL(path, request.url);
}

export async function requireAuth(request: NextRequest): Promise<AuthContext> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) throw new HttpError(401, 'Authentication is required', 'UNAUTHENTICATED');
  await ensureSecuritySchema();

  const result = await getPosPool().query(
    `
      SELECT
        s.id AS session_id,
        s.tenant_id,
        t.slug AS tenant_slug,
        t.name AS tenant_name,
        t.status AS tenant_status,
        u.id,
        u.name,
        u.email,
        u.phone,
        u.role,
        u.permissions,
        u.status,
        u.branch,
        u.password_updated_at,
        u.last_login,
        u.created_at,
        u.updated_at
      FROM pos_sessions s
      JOIN pos_tenants t ON t.id = s.tenant_id
      JOIN pos_app_users u ON u.tenant_id = s.tenant_id AND u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.expires_at > now()
        AND u.status = 'active'
      LIMIT 1
    `,
    [hashSessionToken(token)]
  );
  const row = result.rows[0];
  if (!row) throw new HttpError(401, 'Session is invalid or expired', 'SESSION_EXPIRED');

  void getPosPool().query('UPDATE pos_sessions SET last_seen_at = now() WHERE id = $1', [
    row.session_id,
  ]);
  return {
    tenantId: row.tenant_id,
    tenantSlug: row.tenant_slug,
    tenantName: row.tenant_name,
    tenantStatus: row.tenant_status,
    user: publicUser(row),
    sessionId: row.session_id,
  };
}

export function assertTenantActive(auth: AuthContext): void {
  if (auth.tenantStatus !== 'active') {
    throw new HttpError(
      403,
      'This business account has been blocked. Please contact support.',
      'TENANT_SUSPENDED'
    );
  }
}

export function assertPermission(auth: AuthContext, permission: Permission): void {
  if (
    auth.user.role !== 'owner' &&
    auth.user.role !== 'super-admin' &&
    !auth.user.permissions.includes(permission)
  ) {
    throw new HttpError(403, 'You do not have permission for this action', 'FORBIDDEN');
  }
}

export function assertAnyPermission(auth: AuthContext, permissions: Permission[]): void {
  if (
    auth.user.role !== 'owner' &&
    auth.user.role !== 'super-admin' &&
    !permissions.some((permission) => auth.user.permissions.includes(permission))
  ) {
    throw new HttpError(403, 'You do not have permission for this action', 'FORBIDDEN');
  }
}

export async function assertTenantPlanPermission(
  tenantId: string,
  permission: Permission
): Promise<void> {
  const result = await getPosPool().query(
    `SELECT data->>'subscriptionPlanId' AS plan_id
     FROM pos_tenant_records
     WHERE tenant_id = $1 AND store_name = 'settings' AND record_id = 'settings'`,
    [tenantId]
  );
  const plan = getSubscriptionPlan(result.rows[0]?.plan_id);
  if (!plan.permissions.includes(permission)) {
    throw new HttpError(
      403,
      `${plan.name} does not include this feature. Upgrade the subscription to continue.`,
      'PLAN_UPGRADE_REQUIRED'
    );
  }
}

export function assertSameOrigin(request: NextRequest): void {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 1024 * 1024) {
    throw new HttpError(413, 'Request body is too large', 'PAYLOAD_TOO_LARGE');
  }
  const origin = request.headers.get('origin');
  if (!origin) return;
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    throw new HttpError(403, 'Request origin is invalid', 'INVALID_ORIGIN');
  }
  const allowedHosts = new Set(
    [request.nextUrl.host, request.headers.get('host')]
      .filter((host): host is string => Boolean(host))
      .map((host) => host.toLowerCase())
  );
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    try {
      allowedHosts.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).host.toLowerCase());
    } catch {
      // Invalid deployment configuration must not broaden the origin allow-list.
    }
  }
  if (!allowedHosts.has(originUrl.host.toLowerCase())) {
    throw new HttpError(403, 'Cross-origin mutation is not allowed', 'INVALID_ORIGIN');
  }
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { error: 'Request body is invalid', code: 'INVALID_JSON' },
      { status: 400 }
    );
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    error.constraint === 'pos_app_users_global_email_unique'
  ) {
    return NextResponse.json(
      { error: 'An account already uses this email address', code: 'DUPLICATE_EMAIL' },
      { status: 409 }
    );
  }
  console.error('Secure API request failed', error);
  return NextResponse.json(
    { error: 'The request could not be completed', code: 'INTERNAL_ERROR' },
    { status: 500 }
  );
}
