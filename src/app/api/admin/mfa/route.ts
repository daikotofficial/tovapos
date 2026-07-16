import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getPosPool } from '@/lib/server/pos-db';
import { assertSameOrigin, errorResponse, HttpError } from '@/lib/server/security';
import { requirePlatformAdmin } from '@/lib/server/platform-admin';
import { generateTotpSecret, totpUri, verifyTotp } from '@/lib/server/totp';

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requirePlatformAdmin(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';

    if (action === 'start') {
      const secret = generateTotpSecret();
      await getPosPool().query(
        `UPDATE pos_platform_admins
         SET mfa_secret = $2, mfa_enabled = false, updated_at = now()
         WHERE id = $1`,
        [admin.id, secret]
      );
      const otpauthUrl = totpUri(secret, admin.email);
      const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
        type: 'image/png',
        margin: 1,
        width: 220,
        color: {
          dark: '#071412',
          light: '#ffffff',
        },
      });
      return NextResponse.json({ secret, otpauthUrl, qrDataUrl });
    }

    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const result = await getPosPool().query(
      'SELECT mfa_secret, mfa_enabled FROM pos_platform_admins WHERE id = $1 LIMIT 1',
      [admin.id]
    );
    const row = result.rows[0];
    const secret = typeof row?.mfa_secret === 'string' ? row.mfa_secret : '';
    if (!secret) throw new HttpError(400, 'Start 2FA setup first', 'MFA_SETUP_REQUIRED');
    if (!verifyTotp(secret, code)) {
      throw new HttpError(400, 'Authenticator code is incorrect or expired', 'INVALID_MFA_CODE');
    }

    if (action === 'verify') {
      await getPosPool().query(
        `UPDATE pos_platform_admins SET mfa_enabled = true, updated_at = now() WHERE id = $1`,
        [admin.id]
      );
      return NextResponse.json({ ok: true, mfaEnabled: true });
    }

    if (action === 'disable') {
      await getPosPool().query(
        `UPDATE pos_platform_admins
         SET mfa_enabled = false, mfa_secret = NULL, updated_at = now()
         WHERE id = $1`,
        [admin.id]
      );
      return NextResponse.json({ ok: true, mfaEnabled: false });
    }

    throw new HttpError(400, 'Unsupported 2FA action', 'VALIDATION_ERROR');
  } catch (error) {
    return errorResponse(error);
  }
}
