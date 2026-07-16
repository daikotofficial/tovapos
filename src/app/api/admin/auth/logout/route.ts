import { NextRequest, NextResponse } from 'next/server';
import { getPosPool } from '@/lib/server/pos-db';
import { assertSameOrigin, errorResponse } from '@/lib/server/security';
import {
  clearPlatformAdminCookie,
  hashAdminToken,
  PLATFORM_ADMIN_COOKIE,
} from '@/lib/server/platform-admin';

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const token = request.cookies.get(PLATFORM_ADMIN_COOKIE)?.value;
    if (token) {
      await getPosPool().query('DELETE FROM pos_platform_admin_sessions WHERE token_hash = $1', [
        hashAdminToken(token),
      ]);
    }
    const response = NextResponse.json({ ok: true });
    clearPlatformAdminCookie(response);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
