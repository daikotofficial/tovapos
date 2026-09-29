import { NextRequest, NextResponse } from 'next/server';
import { getPosPool } from '@/lib/server/pos-db';
import {
  assertSameOrigin,
  assertTenantActive,
  errorResponse,
  HttpError,
  requireAuth,
} from '@/lib/server/security';

const CONFIRMATION = 'CLEAR SALES DATA';

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    assertTenantActive(auth);

    if (!['owner', 'super-admin'].includes(auth.user.role)) {
      throw new HttpError(
        403,
        'Only the business owner can clear sales test data.',
        'OWNER_REQUIRED'
      );
    }

    const body = (await request.json().catch(() => null)) as { confirmation?: unknown } | null;
    if (body?.confirmation !== CONFIRMATION) {
      throw new HttpError(
        400,
        `Type ${CONFIRMATION} exactly to confirm this action.`,
        'CONFIRMATION_REQUIRED'
      );
    }

    const client = await getPosPool().connect();
    try {
      await client.query('BEGIN');
      // Serialize reset requests for this tenant and make the three deletes atomic.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `sales-reset:${auth.tenantId}`,
      ]);

      const records = await client.query(
        `DELETE FROM pos_tenant_records
         WHERE tenant_id = $1 AND store_name = 'sales'`,
        [auth.tenantId]
      );
      const indexItems = await client.query(
        'DELETE FROM pos_tenant_sale_items WHERE tenant_id = $1',
        [auth.tenantId]
      );
      const indexes = await client.query('DELETE FROM pos_tenant_sales WHERE tenant_id = $1', [
        auth.tenantId,
      ]);

      await client.query(
        `INSERT INTO pos_audit_log
          (tenant_id, user_id, action, entity_type, entity_id, after_data)
         VALUES ($1, $2, 'sales.test_data_cleared', 'sales', $3, $4::jsonb)`,
        [
          auth.tenantId,
          auth.user.id,
          auth.tenantId,
          JSON.stringify({
            records: records.rowCount ?? 0,
            saleItems: indexItems.rowCount ?? 0,
            indexes: indexes.rowCount ?? 0,
          }),
        ]
      );
      await client.query('COMMIT');

      return NextResponse.json({
        ok: true,
        removed: {
          sales: indexes.rowCount ?? 0,
          saleItems: indexItems.rowCount ?? 0,
          storedSales: records.rowCount ?? 0,
        },
      });
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
