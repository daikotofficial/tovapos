import { NextRequest, NextResponse } from 'next/server';
import { getPosPool } from '@/lib/server/pos-db';
import { verifyPasswordServer } from '@/lib/server/password';
import { assertSameOrigin, errorResponse, HttpError } from '@/lib/server/security';
import { ensureSecuritySchema } from '@/lib/server/security-schema';
import { createPlatformAdminSession, setPlatformAdminCookie } from '@/lib/server/platform-admin';

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    await ensureSecuritySchema();
    const body = (await request.json()) as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const remember = Boolean(body.remember);
    if (!email || !password) {
      throw new HttpError(400, 'Email and password are required', 'VALIDATION_ERROR');
    }
    const result = await getPosPool().query(
      `SELECT * FROM pos_platform_admins
       WHERE lower(email) = $1 AND status = 'active'
       LIMIT 1`,
      [email]
    );
    const row = result.rows[0];
    if (!row?.password_hash || !(await verifyPasswordServer(password, row.password_hash))) {
      throw new HttpError(401, 'Admin email or password is incorrect', 'INVALID_CREDENTIALS');
    }
    await getPosPool().query(
      `UPDATE pos_platform_admins SET last_login = now(), updated_at = now() WHERE id = $1`,
      [row.id]
    );
    const session = await createPlatformAdminSession(row.id, remember);
    const response = NextResponse.json({
      admin: {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        status: row.status,
      },
    });
    setPlatformAdminCookie(response, session.token, session.expiresAt);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
