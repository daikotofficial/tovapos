import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { SupportTicket } from '@/lib/pos/types';
import { getPosPool } from '@/lib/server/pos-db';
import { assertSameOrigin, errorResponse, HttpError, requireAuth } from '@/lib/server/security';

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

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const result = await getPosPool().query(
      `
      SELECT st.*, t.name AS tenant_name
      FROM pos_support_tickets st
      JOIN pos_tenants t ON t.id = st.tenant_id
      WHERE st.tenant_id = $1
      ORDER BY st.created_at DESC
      LIMIT 100
      `,
      [auth.tenantId]
    );
    return NextResponse.json({ tickets: result.rows.map(ticketFromRow) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    const body = (await request.json()) as Record<string, unknown>;
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const priority =
      body.priority === 'low' ||
      body.priority === 'high' ||
      body.priority === 'urgent' ||
      body.priority === 'normal'
        ? body.priority
        : 'normal';
    if (subject.length < 4 || message.length < 10) {
      throw new HttpError(400, 'Support subject and message are required', 'VALIDATION_ERROR');
    }
    const id = `ticket-${randomUUID()}`;
    const result = await getPosPool().query(
      `
      INSERT INTO pos_support_tickets (
        id, tenant_id, subject, message, priority, created_by, created_by_email
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [id, auth.tenantId, subject, message, priority, auth.user.name, auth.user.email]
    );
    return NextResponse.json({ ticket: ticketFromRow(result.rows[0]) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
