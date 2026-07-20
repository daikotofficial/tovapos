'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, CheckCircle2, Clock, WifiOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import Badge from '@/components/ui/Badge';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import type { AppNotification } from '@/lib/pos/types';
import { getDaysUntilExpiry } from '@/lib/pos/stock';

export default function NotificationsPage() {
  const { inventory, syncQueue, settings, isOnline } = usePosStore();
  const router = useRouter();
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [appNotifications, setAppNotifications] = useState<AppNotification[]>([]);
  const alerts = useMemo(() => {
    const expiryDays = settings.expiryAlertDays ?? 30;
    return inventory
      .flatMap((item) => {
        const days = getDaysUntilExpiry(item.expiryDate);
        const rows = [];
        if (item.currentQty <= item.reorderLevel) {
          rows.push({
            id: `stock-${item.id}`,
            title: `${item.name} is low on stock`,
            detail: `${item.currentQty} ${item.unitOfMeasurement ?? 'unit'} left. Reorder level is ${
              item.reorderLevel
            }.`,
            tone: item.currentQty === 0 ? 'danger' : 'warning',
            status: item.stockStatus,
            targetStatus: 'alerts',
          });
        }
        if (days < 0 || days <= expiryDays) {
          rows.push({
            id: `expiry-${item.id}`,
            title: days < 0 ? `${item.name} has expired` : `${item.name} expires soon`,
            detail:
              days < 0
                ? `Expired on ${item.expiryDate}. Remove or mark as damaged.`
                : `${days} day${days === 1 ? '' : 's'} remaining. Batch ${item.batchLot}.`,
            tone: days < 0 ? 'danger' : 'warning',
            status: item.stockStatus,
            targetStatus: days < 0 ? 'expired' : 'alerts',
          });
        }
        return rows;
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [inventory, settings.expiryAlertDays]);

  const pendingSync = syncQueue.filter((item) => item.status !== 'synced');
  const unreadAlerts =
    alerts.filter((alert) => !readIds.has(alert.id)).length +
    appNotifications.filter((notice) => !notice.readAt && !readIds.has(notice.id)).length;

  useEffect(() => {
    const raw = window.localStorage.getItem('tovapos.readNotifications');
    if (raw) setReadIds(new Set(JSON.parse(raw) as string[]));
  }, []);

  const saveReadIds = (next: Set<string>) => {
    setReadIds(next);
    window.localStorage.setItem('tovapos.readNotifications', JSON.stringify([...next]));
  };

  useEffect(() => {
    let cancelled = false;
    const loadNotifications = async () => {
      try {
        const response = await fetch('/api/notifications', { cache: 'no-store' });
        const payload = (await response.json().catch(() => null)) as {
          notifications?: AppNotification[];
        } | null;
        if (!cancelled && response.ok) setAppNotifications(payload?.notifications ?? []);
      } catch {
        if (!cancelled) setAppNotifications([]);
      }
    };
    void loadNotifications();
    const interval = window.setInterval(loadNotifications, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const openAlert = (alert: (typeof alerts)[number]) => {
    saveReadIds(new Set([...readIds, alert.id]));
    router.push(`/inventory-management?status=${alert.targetStatus}`);
  };

  const markAppNotificationRead = async (notice: AppNotification) => {
    saveReadIds(new Set([...readIds, notice.id]));
    setAppNotifications((current) =>
      current.map((item) =>
        item.id === notice.id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item
      )
    );
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: notice.id }),
    }).catch(() => undefined);
  };

  return (
    <AppLayout
      title="Notifications"
      subtitle="Stock alerts, expiry alerts, and offline sync status"
    >
      <PermissionGate permission="notifications">
        <div className="mx-auto max-w-screen-2xl space-y-4 px-3 py-4 sm:space-y-5 sm:p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Metric
              label="Stock & Expiry Alerts"
              value={alerts.length}
              icon={Bell}
              onClick={() => router.push('/inventory-management?status=alerts')}
            />
            <Metric label="Unread Alerts" value={unreadAlerts} icon={AlertTriangle} />
            <Metric label="Pending Sync" value={pendingSync.length} icon={WifiOff} />
            <Metric
              label="Connection"
              value={isOnline ? 'Online' : 'Offline'}
              icon={CheckCircle2}
            />
            <Metric
              label="Expiry Window"
              value={`${settings.expiryAlertDays ?? 30} days`}
              icon={Clock}
            />
          </div>

          <section className="rounded-xl border border-border bg-card shadow-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Bell size={16} className="text-primary" />
              <h2 className="text-sm font-semibold">Messages From TOVAPOS</h2>
            </div>
            <div className="divide-y divide-border">
              {appNotifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No platform messages yet.
                </p>
              ) : (
                appNotifications.map((notice) => (
                  <button
                    key={notice.id}
                    type="button"
                    onClick={() => void markAppNotificationRead(notice)}
                    className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/30"
                  >
                    <div>
                      <p
                        className={`text-sm font-semibold ${
                          notice.readAt || readIds.has(notice.id)
                            ? 'text-muted-foreground'
                            : 'text-foreground'
                        }`}
                      >
                        {notice.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{notice.message}</p>
                      <p className="mt-2 text-[10px] uppercase text-muted-foreground">
                        {notice.sentBy} · {new Date(notice.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">
                      {notice.tone}
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card shadow-card">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-warning" />
                <h2 className="text-sm font-semibold">Operational Alerts</h2>
              </div>
              <button
                type="button"
                onClick={() => saveReadIds(new Set(alerts.map((alert) => alert.id)))}
                className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Mark all as read
              </button>
            </div>
            <div className="divide-y divide-border">
              {alerts.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No low-stock or expiry alerts right now.
                </p>
              ) : (
                alerts.map((alert) => (
                  <button
                    key={alert.id}
                    type="button"
                    onClick={() => openAlert(alert)}
                    className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/30"
                  >
                    <div>
                      <p
                        className={`text-sm font-semibold ${
                          readIds.has(alert.id) ? 'text-muted-foreground' : 'text-foreground'
                        }`}
                      >
                        {alert.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{alert.detail}</p>
                    </div>
                    <Badge variant={alert.status} />
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card shadow-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <WifiOff size={16} className="text-primary" />
              <h2 className="text-sm font-semibold">Updates Waiting</h2>
            </div>
            <div className="overflow-x-auto overscroll-x-contain scrollbar-thin">
              <table className="w-full min-w-[760px]">
                <thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Record</th>
                    <th className="px-4 py-3">Change</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pendingSync.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-sm text-muted-foreground"
                      >
                        All updates have been sent.
                      </td>
                    </tr>
                  ) : (
                    pendingSync.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 text-sm font-medium">{item.entity}</td>
                        <td className="px-4 py-3 text-sm">{item.action}</td>
                        <td className="px-4 py-3 text-sm">{item.status}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {item.createdAt}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                          {item.idempotencyKey}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </PermissionGate>
    </AppLayout>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
        <Icon size={16} className="text-primary" />
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="rounded-xl border border-border bg-card p-4 text-left shadow-card transition-colors hover:bg-muted/30"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 text-left shadow-card">
      {content}
    </div>
  );
}
