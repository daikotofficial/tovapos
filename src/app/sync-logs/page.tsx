'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, PackagePlus, RefreshCw, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import { confirmAction } from '@/components/ui/confirmAction';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import type { SaleTransaction, SyncQueueItem } from '@/lib/pos/types';

export default function SyncLogsPage() {
  const { currentUser, isOnline, syncQueue, retrySyncOperation, cancelFailedOfflineSale } =
    usePosStore();
  const [workingId, setWorkingId] = useState('');
  const isAdmin = currentUser?.role === 'owner' || currentUser?.role === 'super-admin';
  const operations = useMemo(() => {
    const groups = new Map<string, SyncQueueItem[]>();
    syncQueue.forEach((item) => {
      const current = groups.get(item.operationId) ?? [];
      current.push(item);
      groups.set(item.operationId, current);
    });
    return [...groups.entries()]
      .map(([operationId, items]) => {
        const saleItem = items.find((item) => item.entity === 'sale');
        const payload = saleItem?.payload as { sale?: SaleTransaction } | undefined;
        const failed = items.some((item) => item.status === 'failed');
        const pending = items.some((item) => item.status === 'pending');
        return {
          operationId,
          items,
          sale: payload?.sale,
          status: failed
            ? ('failed' as const)
            : pending
              ? ('pending' as const)
              : ('synced' as const),
          attempts: Math.max(...items.map((item) => item.attempts)),
          error: items.find((item) => item.lastError)?.lastError,
          createdAt: items.reduce(
            (earliest, item) => (item.createdAt < earliest ? item.createdAt : earliest),
            items[0].createdAt
          ),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [syncQueue]);

  const failedCount = operations.filter((item) => item.status === 'failed').length;
  const pendingCount = operations.filter((item) => item.status === 'pending').length;

  const run = async (operationId: string, action: () => Promise<void>, success: string) => {
    setWorkingId(operationId);
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to resolve sync operation');
    } finally {
      setWorkingId('');
    }
  };

  return (
    <AppLayout title="Sync Logs" subtitle="Review and resolve offline reconciliation problems">
      <PermissionGate permission="sync-logs">
        {!isAdmin ? (
          <div className="px-3 py-4 sm:p-6">
            <div className="mx-auto max-w-xl rounded-xl border border-warning/30 bg-warning/10 p-5 text-warning">
              Sync Logs are restricted to owners and super administrators.
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-screen-2xl space-y-5 p-4 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <Summary label="Needs attention" value={failedCount} tone="danger" />
              <Summary label="Waiting to sync" value={pendingCount} tone="warning" />
              <Summary
                label="Successfully reconciled"
                value={operations.filter((item) => item.status === 'synced').length}
                tone="success"
              />
            </div>

            <div className="rounded-xl border border-border bg-card shadow-card">
              <div className="border-b border-border px-4 py-4 sm:px-5">
                <h2 className="font-semibold text-foreground">Device reconciliation history</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Review updates made during an outage. A failed sale can be retried after
                  correcting stock, or cancelled after the connection returns.
                </p>
              </div>
              {operations.length === 0 ? (
                <div className="px-5 py-14 text-center text-sm text-muted-foreground">
                  No offline synchronization activity has been recorded on this device.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {operations.map((operation) => {
                    const busy = workingId === operation.operationId;
                    const productId = operation.sale?.items[0]?.inventoryItemId;
                    return (
                      <div key={operation.operationId} className="space-y-3 px-4 py-4 sm:px-5">
                        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Status status={operation.status} />
                              <span className="font-mono text-xs text-muted-foreground">
                                {operation.operationId}
                              </span>
                            </div>
                            <p className="mt-2 text-sm font-semibold text-foreground">
                              {operation.sale
                                ? `${operation.sale.transactionId} · ${operation.sale.items.length} product line(s)`
                                : `${operation.items[0].entity} ${operation.items[0].action}`}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {new Date(operation.createdAt).toLocaleString()} ·{' '}
                              {operation.attempts} attempt{operation.attempts === 1 ? '' : 's'}
                            </p>
                            {operation.error && (
                              <p className="mt-2 rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
                                {operation.error}
                              </p>
                            )}
                          </div>
                          {operation.status === 'failed' && (
                            <div className="flex flex-wrap gap-2">
                              {productId && (
                                <Link
                                  href={`/inventory-management?product=${encodeURIComponent(productId)}`}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
                                >
                                  <PackagePlus size={14} /> Correct stock
                                </Link>
                              )}
                              <button
                                type="button"
                                disabled={busy || !isOnline}
                                onClick={() =>
                                  void run(
                                    operation.operationId,
                                    () => retrySyncOperation(operation.operationId),
                                    'Update scheduled for another attempt'
                                  )
                                }
                                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                              >
                                <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Retry
                              </button>
                              {operation.sale && (
                                <button
                                  type="button"
                                  disabled={busy || !isOnline}
                                  onClick={async () => {
                                    const confirmed = await confirmAction({
                                      title: 'Cancel rejected sale?',
                                      description:
                                        'The sale will be marked void and the stock count on this device will be corrected.',
                                      confirmLabel: 'Cancel sale',
                                    });
                                    if (confirmed) {
                                      void run(
                                        operation.operationId,
                                        () => cancelFailedOfflineSale(operation.operationId),
                                        'Rejected sale cancelled and stock restored'
                                      );
                                    }
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-danger/30 px-3 py-2 text-xs font-semibold text-danger disabled:opacity-50"
                                >
                                  <XCircle size={14} /> Cancel sale
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </PermissionGate>
    </AppLayout>
  );
}

function Summary({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold ${tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-success'}`}
      >
        {value}
      </p>
    </div>
  );
}

function Status({ status }: { status: 'failed' | 'pending' | 'synced' }) {
  const Icon =
    status === 'failed' ? AlertTriangle : status === 'pending' ? RefreshCw : CheckCircle2;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
        status === 'failed'
          ? 'bg-danger/10 text-danger'
          : status === 'pending'
            ? 'bg-warning/10 text-warning'
            : 'bg-success/10 text-success'
      }`}
    >
      <Icon size={11} /> {status}
    </span>
  );
}
