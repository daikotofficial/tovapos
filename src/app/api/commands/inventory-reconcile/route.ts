import { NextRequest, NextResponse } from 'next/server';
import type { InventoryItem } from '@/lib/pos/types';
import { computeStockStatus } from '@/lib/pos/stock';
import { getPosPool } from '@/lib/server/pos-db';
import { upsertTenantInventoryIndex } from '@/lib/server/tenant-indexes';
import {
  assertAnyPermission,
  assertSameOrigin,
  assertTenantActive,
  assertTenantPlanPermission,
  errorResponse,
  requireAuth,
} from '@/lib/server/security';

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    assertTenantActive(auth);
    assertAnyPermission(auth, ['inventory', 'stock-management', 'adjust-stock']);
    await assertTenantPlanPermission(auth.tenantId, 'inventory');
    const body = (await request.json().catch(() => ({}))) as { productId?: unknown };
    const productId = typeof body.productId === 'string' ? body.productId.trim() : '';
    const client = await getPosPool().connect();
    try {
      await client.query('BEGIN');
      const inventoryResult = await client.query(
        `SELECT id, data, current_qty
         FROM pos_tenant_inventory
         WHERE tenant_id = $1
           AND product_status = 'active'
           AND ($2 = '' OR id = $2)
         ORDER BY id
         FOR UPDATE`,
        [auth.tenantId, productId]
      );
      const changed: InventoryItem[] = [];
      for (const row of inventoryResult.rows) {
        const movementResult = await client.query(
          `SELECT data
           FROM pos_tenant_records
           WHERE tenant_id = $1
             AND store_name = 'stockMovements'
             AND data->>'inventoryItemId' = $2
             AND data ? 'quantityAfter'
           ORDER BY data->>'createdAt' DESC, record_id DESC
           LIMIT 1`,
          [auth.tenantId, row.id]
        );
        const movement = movementResult.rows[0]?.data as Record<string, unknown> | undefined;
        const ledgerQuantity = Number(movement?.quantityAfter);
        const storedQuantity = Number(row.current_qty);
        if (!Number.isFinite(ledgerQuantity) || ledgerQuantity < 0 || ledgerQuantity === storedQuantity) continue;
        const current = row.data as InventoryItem;
        const updated = { ...current, currentQty: ledgerQuantity, stockStatus: computeStockStatus(ledgerQuantity, current.reorderLevel, current.expiryDate), updatedAt: new Date().toISOString() } satisfies InventoryItem;
        await client.query(
          `INSERT INTO pos_tenant_records (tenant_id, store_name, record_id, data)
           VALUES ($1, 'inventory', $2, $3::jsonb)
           ON CONFLICT (tenant_id, store_name, record_id) DO UPDATE SET
             data = EXCLUDED.data, version = pos_tenant_records.version + 1, updated_at = now()`,
          [auth.tenantId, row.id, JSON.stringify(updated)]
        );
        await upsertTenantInventoryIndex(client, auth.tenantId, updated);
        await client.query(
          `INSERT INTO pos_audit_log
             (tenant_id, user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'inventory.quantity_reconciled', 'inventory', $3, $4::jsonb)`,
          [auth.tenantId, auth.user.id, row.id, JSON.stringify({ from: storedQuantity, to: ledgerQuantity, source: 'latest-stock-movement' })]
        );
        changed.push(updated);
      }
      await client.query('COMMIT');
      return NextResponse.json({ updatedItems: changed, updatedCount: changed.length });
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
