import { NextRequest, NextResponse } from 'next/server';
import { getPosPool } from '@/lib/server/pos-db';
import {
  assertSameOrigin,
  clearSessionCookie,
  errorResponse,
  hashSessionToken,
  SESSION_COOKIE,
} from '@/lib/server/security';
import { ensureSecuritySchema } from '@/lib/server/security-schema';

export async function POST(request: NextRequest) {
  let originAccepted = false;
  try {
    assertSameOrigin(request);
    originAccepted = true;
    await ensureSecuritySchema();
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (token) {
      await getPosPool().query('DELETE FROM pos_sessions WHERE token_hash = $1', [
        hashSessionToken(token),
      ]);
    }
    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    const response = errorResponse(error);
    if (originAccepted) clearSessionCookie(response);
    return response;
  }
}
