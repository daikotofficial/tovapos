import { NextRequest, NextResponse } from 'next/server';
import type { InventoryItem } from '@/lib/pos/types';
import { getPosPool } from '@/lib/server/pos-db';
import { upsertTenantInventoryIndex } from '@/lib/server/tenant-indexes';
import {
  assertSameOrigin,
  assertTenantActive,
  assertTenantPlanPermission,
  assertWritePermission,
  errorResponse,
  HttpError,
  requireAuth,
} from '@/lib/server/security';

function text(value: unknown, label: string): string {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result || result.length > 120) {
    throw new HttpError(400, `${label} is required and must be valid`, 'VALIDATION_ERROR');
  }
  return result;
}

function rate(value: unknown): number {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || result > 100) {
    throw new HttpError(400, 'VAT rate must be between 0 and 100', 'VALIDATION_ERROR');
  }
  return Number(result.toFixed(2));
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    assertTenantActive(auth);
    assertWritePermission(auth, 'settings');
    await assertTenantPlanPermission(auth.tenantId, 'settings');

    const body = (await request.json()) as Record<string, unknown>;
    const category = text(body.category, 'Category');
    const taxMode = body.taxMode === 'inclusive' || body.taxMode === 'exclusive'
      ? body.taxMode
      : null;
    if (!taxMode) throw new HttpError(400, 'VAT pricing mode is required', 'VALIDATION_ERROR');
    const taxRate = rate(body.taxRate);
    const taxId = typeof body.taxId === 'string' ? body.taxId.trim().slice(0, 120) : '';
    const now = new Date().toISOString();
    const client = await getPosPool().connect();

    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `tax-category:${auth.tenantId}:${category.toLowerCase()}`,
      ]);
      const result = await client.query(
        `SELECT record_id, data
         FROM pos_tenant_records
         WHERE tenant_id = $1
           AND store_name = 'inventory'
           AND lower(trim(data->>'category')) = lower(trim($2))
         ORDER BY record_id
         FOR UPDATE`,
        [auth.tenantId, category]
      );
      const updatedItems: InventoryItem[] = [];
      for (const row of result.rows) {
        const updated = {
          ...(row.data as InventoryItem),
          taxApplicable: taxRate > 0,
          taxId: taxId || undefined,
          taxRate,
          taxMode,
          updatedAt: now,
        } satisfies InventoryItem;
        await client.query(
          `UPDATE pos_tenant_records
           SET data = $3::jsonb, version = version + 1, updated_at = now()
           WHERE tenant_id = $1 AND store_name = 'inventory' AND record_id = $2`,
          [auth.tenantId, row.record_id, JSON.stringify(updated)]
        );
        await upsertTenantInventoryIndex(client, auth.tenantId, updated);
        await client.query(
          `INSERT INTO pos_audit_log
             (tenant_id, user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'inventory.tax_overridden', 'inventory', $3, $4::jsonb)`,
          [
            auth.tenantId,
            auth.user.id,
            updated.id,
            JSON.stringify({ category, taxId: taxId || null, taxRate, taxMode }),
          ]
        );
        updatedItems.push(updated);
      }
      await client.query('COMMIT');
      return NextResponse.json({ category, taxId: taxId || null, taxRate, taxMode, updatedItems, updatedCount: updatedItems.length });
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
