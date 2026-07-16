import { NextRequest, NextResponse } from 'next/server';
import type { AppNotification } from '@/lib/pos/types';
import { getPosPool } from '@/lib/server/pos-db';
import { assertSameOrigin, errorResponse, HttpError, requireAuth } from '@/lib/server/security';

function notificationFromRow(row: Record<string, unknown>): AppNotification {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    tenantName: row.tenant_name ? String(row.tenant_name) : undefined,
    targetUserId: row.target_user_id ? String(row.target_user_id) : null,
    targetUserName: row.target_user_name ? String(row.target_user_name) : null,
    title: String(row.title),
    message: String(row.message),
    tone: row.tone as AppNotification['tone'],
    sentBy: String(row.sent_by),
    sentByEmail: row.sent_by_email ? String(row.sent_by_email) : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
    readAt: row.read_at ? new Date(String(row.read_at)).toISOString() : null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const result = await getPosPool().query(
      `
      SELECT n.*, t.name AS tenant_name, u.name AS target_user_name
      FROM pos_app_notifications n
      JOIN pos_tenants t ON t.id = n.tenant_id
      LEFT JOIN pos_app_users u ON u.tenant_id = n.tenant_id AND u.id = n.target_user_id
      WHERE n.tenant_id = $1
        AND (n.target_user_id IS NULL OR n.target_user_id = $2)
      ORDER BY n.created_at DESC
      LIMIT 100
      `,
      [auth.tenantId, auth.user.id]
    );
    return NextResponse.json({ notifications: result.rows.map(notificationFromRow) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) throw new HttpError(400, 'Notification id is required', 'VALIDATION_ERROR');
    await getPosPool().query(
      `
      UPDATE pos_app_notifications
      SET read_at = coalesce(read_at, now())
      WHERE id = $1
        AND tenant_id = $2
        AND (target_user_id IS NULL OR target_user_id = $3)
      `,
      [id, auth.tenantId, auth.user.id]
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
