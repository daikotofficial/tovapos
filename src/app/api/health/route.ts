import { NextResponse } from 'next/server';
import { getPosPool } from '@/lib/server/pos-db';

export const dynamic = 'force-dynamic';

let lastDatabaseProbeAt = 0;
let lastDatabaseProbeHealthy = false;
let databaseProbeInFlight: Promise<boolean> | null = null;

async function databaseIsHealthy(): Promise<boolean> {
  const now = Date.now();
  if (now - lastDatabaseProbeAt < 5_000) return lastDatabaseProbeHealthy;
  if (!databaseProbeInFlight) {
    databaseProbeInFlight = getPosPool()
      .query('SELECT 1')
      .then(() => true)
      .catch((error) => {
        console.error('Application health check failed', error);
        return false;
      })
      .finally(() => {
        databaseProbeInFlight = null;
      });
  }
  lastDatabaseProbeHealthy = await databaseProbeInFlight;
  lastDatabaseProbeAt = Date.now();
  return lastDatabaseProbeHealthy;
}

export async function GET() {
  const startedAt = Date.now();
  try {
    if (!(await databaseIsHealthy())) throw new Error('Database health probe failed');
    return NextResponse.json(
      {
        status: 'ok',
        database: 'ok',
        checkedAt: new Date().toISOString(),
        serverLatencyMs: Date.now() - startedAt,
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    if (lastDatabaseProbeHealthy) console.error('Application health check failed', error);
    return NextResponse.json(
      {
        status: 'unavailable',
        database: 'unavailable',
        checkedAt: new Date().toISOString(),
      },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
