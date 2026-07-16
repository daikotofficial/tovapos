import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import type { SupportTicket } from '@/lib/pos/types';
import { getPosPool } from '@/lib/server/pos-db';
import { assertSameOrigin, errorResponse, HttpError } from '@/lib/server/security';
import {
  assertPlatformOperator,
  assertSuperAdmin,
  requirePlatformAdmin,
} from '@/lib/server/platform-admin';

function ticketFromRow(row: Record<string, unknown>): SupportTicket {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    tenantName: row.tenant_name ? String(row.tenant_name) : undefined,
    subject: String(row.subject),
    message: String(row.message),
    status: row.status as SupportTicket['status'],
    priority: row.priority as SupportTicket['priority'],
    createdBy: String(row.created_by),
    createdByEmail: row.created_by_email ? String(row.created_by_email) : undefined,
    response: row.response ? String(row.response) : undefined,
    respondedBy: row.responded_by ? String(row.responded_by) : undefined,
    respondedAt: row.responded_at ? new Date(String(row.responded_at)).toISOString() : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function safeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requirePlatformAdmin(request);

    const [tenants, tickets, admins, users, security] = await Promise.all([
      getPosPool().query(
        `
        SELECT
          t.id,
          t.slug,
          t.name,
          t.status,
          t.created_at,
          t.updated_at,
          coalesce(inv.product_count, 0)::int AS product_count,
          coalesce(inv.active_item_count, 0)::int AS active_item_count,
          coalesce(inv.total_units, 0)::float8 AS total_units,
          coalesce(users.user_count, 0)::int AS user_count,
          coalesce(users.active_user_count, 0)::int AS active_user_count,
          coalesce(sales.sale_count, 0)::int AS sale_count,
          coalesce(settings.data->>'subscriptionPlanId', 'starter') AS subscription_plan_id,
          coalesce(settings.data->>'subscriptionStatus', 'active') AS subscription_status,
          settings.data->>'subscriptionRenewsAt' AS subscription_renews_at,
          coalesce(open_tickets.open_ticket_count, 0)::int AS open_ticket_count
        FROM pos_tenants t
        LEFT JOIN (
          SELECT tenant_id,
            count(*) AS product_count,
            count(*) FILTER (WHERE product_status = 'active') AS active_item_count,
            coalesce(sum(current_qty), 0) AS total_units
          FROM pos_tenant_inventory
          GROUP BY tenant_id
        ) inv ON inv.tenant_id = t.id
        LEFT JOIN (
          SELECT tenant_id,
            count(*) AS user_count,
            count(*) FILTER (WHERE status = 'active') AS active_user_count
          FROM pos_app_users
          GROUP BY tenant_id
        ) users ON users.tenant_id = t.id
        LEFT JOIN (
          SELECT tenant_id,
            count(*) FILTER (WHERE status = 'completed') AS sale_count
          FROM pos_tenant_sales
          GROUP BY tenant_id
        ) sales ON sales.tenant_id = t.id
        LEFT JOIN pos_tenant_records settings
          ON settings.tenant_id = t.id
         AND settings.store_name = 'settings'
         AND settings.record_id = 'settings'
        LEFT JOIN (
          SELECT tenant_id, count(*) AS open_ticket_count
          FROM pos_support_tickets
          WHERE status IN ('open', 'pending')
          GROUP BY tenant_id
        ) open_tickets ON open_tickets.tenant_id = t.id
        ORDER BY t.created_at DESC
        LIMIT 500
        `
      ),
      getPosPool().query(
        `
        SELECT st.*, t.name AS tenant_name
        FROM pos_support_tickets st
        JOIN pos_tenants t ON t.id = st.tenant_id
        ORDER BY st.created_at DESC
        LIMIT 100
        `
      ),
      admin.role === 'super-admin'
        ? getPosPool().query(
            `
            SELECT id, name, email, role, status, last_login, created_at
            FROM pos_platform_admins
            ORDER BY
              CASE role WHEN 'super-admin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
              created_at DESC
            LIMIT 100
            `
          )
        : Promise.resolve({ rows: [] }),
      getPosPool().query(
        `
        SELECT
          u.tenant_id,
          u.id,
          u.name,
          u.email,
          u.role,
          u.status,
          u.last_login,
          t.name AS tenant_name,
          t.slug AS tenant_slug
        FROM pos_app_users u
        JOIN pos_tenants t ON t.id = u.tenant_id
        ORDER BY u.last_login DESC NULLS LAST, u.created_at DESC
        LIMIT 500
        `
      ),
      getPosPool().query(
        `
        SELECT
          (SELECT count(*)::int FROM pos_sessions WHERE expires_at > now()) AS active_app_sessions,
          (SELECT count(*)::int FROM pos_platform_admin_sessions WHERE expires_at > now()) AS active_admin_sessions,
          (SELECT count(*)::int FROM pos_platform_admin_invites WHERE used_at IS NULL AND expires_at > now()) AS pending_admin_invites,
          (SELECT count(*)::int FROM pos_auth_attempts WHERE blocked_until > now()) AS blocked_login_attempts,
          (SELECT coalesce(sum(failures), 0)::int FROM pos_auth_attempts WHERE last_attempt_at > now() - interval '24 hours') AS failed_logins_24h,
          (SELECT count(*)::int FROM pos_app_users WHERE status = 'active') AS active_app_users,
          (SELECT count(*)::int FROM pos_app_notifications WHERE created_at > now() - interval '7 days') AS notifications_7d
        `
      ),
    ]);

    return NextResponse.json({
      tenants: tenants.rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        status: row.status,
        registeredAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
        productCount: Number(row.product_count),
        activeItemCount: Number(row.active_item_count),
        totalUnits: Number(row.total_units),
        userCount: Number(row.user_count),
        activeUserCount: Number(row.active_user_count),
        saleCount: Number(row.sale_count),
        subscriptionPlanId: row.subscription_plan_id,
        subscriptionStatus: row.subscription_status,
        subscriptionRenewsAt: row.subscription_renews_at
          ? new Date(row.subscription_renews_at).toISOString()
          : null,
        openTicketCount: Number(row.open_ticket_count),
      })),
      tickets: tickets.rows.map(ticketFromRow),
      admins: admins.rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        status: row.status,
        lastLogin: row.last_login ? new Date(row.last_login).toISOString() : null,
        createdAt: new Date(row.created_at).toISOString(),
      })),
      users: users.rows.map((row) => ({
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        tenantSlug: row.tenant_slug,
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        status: row.status,
        lastLogin: row.last_login ? new Date(row.last_login).toISOString() : null,
      })),
      security: {
        apiStatus: 'healthy',
        activeAppSessions: Number(security.rows[0]?.active_app_sessions ?? 0),
        activeAdminSessions: Number(security.rows[0]?.active_admin_sessions ?? 0),
        pendingAdminInvites: Number(security.rows[0]?.pending_admin_invites ?? 0),
        blockedLoginAttempts: Number(security.rows[0]?.blocked_login_attempts ?? 0),
        failedLogins24h: Number(security.rows[0]?.failed_logins_24h ?? 0),
        activeAppUsers: Number(security.rows[0]?.active_app_users ?? 0),
        notifications7d: Number(security.rows[0]?.notifications_7d ?? 0),
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requirePlatformAdmin(request);
    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';

    if (action === 'respond-ticket') {
      const ticketId = typeof body.ticketId === 'string' ? body.ticketId : '';
      const response = typeof body.response === 'string' ? body.response.trim() : '';
      const status =
        body.status === 'open' ||
        body.status === 'pending' ||
        body.status === 'resolved' ||
        body.status === 'closed'
          ? body.status
          : 'pending';
      if (!ticketId || response.length < 2) {
        throw new HttpError(400, 'Ticket response is required', 'VALIDATION_ERROR');
      }
      const result = await getPosPool().query(
        `
        UPDATE pos_support_tickets
        SET response = $2, status = $3, responded_by = $4, responded_at = now(), updated_at = now()
        WHERE id = $1
        RETURNING *
        `,
        [ticketId, response, status, admin.name]
      );
      if (!result.rows[0]) throw new HttpError(404, 'Support ticket not found', 'NOT_FOUND');
      return NextResponse.json({ ticket: ticketFromRow(result.rows[0]) });
    }

    if (action === 'send-notification') {
      const title = safeText(body.title);
      const message = safeText(body.message);
      const tenantId = safeText(body.tenantId);
      const targetUserId = safeText(body.targetUserId);
      const scope = body.scope === 'tenant' || body.scope === 'user' ? body.scope : 'all';
      const tone =
        body.tone === 'success' ||
        body.tone === 'warning' ||
        body.tone === 'danger' ||
        body.tone === 'info'
          ? body.tone
          : 'info';
      if (title.length < 3 || message.length < 5) {
        throw new HttpError(400, 'Notification title and message are required', 'VALIDATION_ERROR');
      }
      const tenantIds =
        scope === 'all'
          ? await getPosPool().query('SELECT id FROM pos_tenants WHERE status = $1', ['active'])
          : await getPosPool().query('SELECT id FROM pos_tenants WHERE id = $1 LIMIT 1', [
              tenantId,
            ]);
      if (tenantIds.rows.length === 0) {
        throw new HttpError(
          400,
          'Select a valid business for this notification',
          'VALIDATION_ERROR'
        );
      }
      if (scope === 'user' && !targetUserId) {
        throw new HttpError(400, 'Select a user for this notification', 'VALIDATION_ERROR');
      }
      if (scope === 'user') {
        const target = await getPosPool().query(
          'SELECT id FROM pos_app_users WHERE tenant_id = $1 AND id = $2 AND status = $3 LIMIT 1',
          [tenantId, targetUserId, 'active']
        );
        if (!target.rows[0]) {
          throw new HttpError(
            400,
            'Select an active user in the selected business',
            'VALIDATION_ERROR'
          );
        }
      }
      const client = await getPosPool().connect();
      try {
        await client.query('BEGIN');
        for (const row of tenantIds.rows) {
          await client.query(
            `
            INSERT INTO pos_app_notifications (
              id, tenant_id, target_user_id, title, message, tone, sent_by, sent_by_email
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `,
            [
              `notification-${randomUUID()}`,
              row.id,
              scope === 'user' ? targetUserId : null,
              title,
              message,
              tone,
              admin.name,
              admin.email,
            ]
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return NextResponse.json({ ok: true, delivered: tenantIds.rows.length });
    }

    if (action === 'suspend-admin' || action === 'activate-admin' || action === 'delete-admin') {
      assertSuperAdmin(admin);
      const adminId = safeText(body.adminId);
      if (!adminId) throw new HttpError(400, 'Admin id is required', 'VALIDATION_ERROR');
      if (adminId === admin.id) {
        throw new HttpError(400, 'You cannot change your own active admin account', 'SELF_ADMIN');
      }
      const target = await getPosPool().query(
        'SELECT id, role, status FROM pos_platform_admins WHERE id = $1 LIMIT 1',
        [adminId]
      );
      if (!target.rows[0]) throw new HttpError(404, 'Admin account not found', 'NOT_FOUND');
      if (target.rows[0].role === 'super-admin') {
        const remaining = await getPosPool().query(
          `SELECT count(*)::int AS count
           FROM pos_platform_admins
           WHERE id <> $1 AND role = 'super-admin' AND status = 'active'`,
          [adminId]
        );
        if (Number(remaining.rows[0]?.count ?? 0) < 1) {
          throw new HttpError(
            400,
            'At least one active super admin must remain',
            'LAST_SUPER_ADMIN'
          );
        }
      }
      if (action === 'delete-admin') {
        await getPosPool().query('DELETE FROM pos_platform_admins WHERE id = $1', [adminId]);
      } else {
        await getPosPool().query(
          `UPDATE pos_platform_admins SET status = $2, updated_at = now() WHERE id = $1`,
          [adminId, action === 'suspend-admin' ? 'suspended' : 'active']
        );
      }
      return NextResponse.json({ ok: true });
    }

    const tenantId = typeof body.tenantId === 'string' ? body.tenantId : '';
    if (!tenantId) throw new HttpError(400, 'Tenant id is required', 'VALIDATION_ERROR');

    if (action === 'suspend-tenant' || action === 'activate-tenant') {
      assertPlatformOperator(admin);
      const nextStatus = action === 'suspend-tenant' ? 'suspended' : 'active';
      const result = await getPosPool().query(
        `
        UPDATE pos_tenants
        SET status = $2, updated_at = now()
        WHERE id = $1
        RETURNING id, status
        `,
        [tenantId, nextStatus]
      );
      if (!result.rows[0]) throw new HttpError(404, 'Business account not found', 'NOT_FOUND');
      await getPosPool().query(
        `INSERT INTO pos_audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, $3, 'tenant', $1, $4::jsonb)`,
        [
          tenantId,
          admin.id,
          action,
          JSON.stringify({ performedBy: admin.email, targetStatus: nextStatus }),
        ]
      );
      return NextResponse.json({ ok: true });
    }

    if (action === 'delete-tenant') {
      assertSuperAdmin(admin);
      const result = await getPosPool().query(
        'DELETE FROM pos_tenants WHERE id = $1 RETURNING id',
        [tenantId]
      );
      if (!result.rows[0]) throw new HttpError(404, 'Business account not found', 'NOT_FOUND');
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, 'Unsupported admin action', 'VALIDATION_ERROR');
  } catch (error) {
    return errorResponse(error);
  }
}
