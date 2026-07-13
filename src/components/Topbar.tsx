'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Bell, AlertTriangle, Clock, Cloud, Wifi, WifiOff, Menu, LoaderCircle } from 'lucide-react';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import { getDaysUntilExpiry } from '@/lib/pos/stock';

interface TopbarProps {
  title: string;
  subtitle?: string;
  onOpenMenu?: () => void;
}

export default function Topbar({ title, subtitle, onOpenMenu }: TopbarProps) {
  const { isOnline, connectivity, syncProgress, pendingSyncCount, currentUser, inventory } =
    usePosStore();
  const [showNotifs, setShowNotifs] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const notifications = useMemo(() => {
    const stockAlerts = inventory
      .filter((item) =>
        ['low', 'critical', 'out', 'expiring-soon', 'expired'].includes(item.stockStatus)
      )
      .slice(0, 5)
      .map((item) => {
        const daysUntilExpiry = getDaysUntilExpiry(item.expiryDate);
        return {
          id: `stock-${item.id}`,
          type: item.stockStatus === 'expired' || item.stockStatus === 'out' ? 'danger' : 'warning',
          message:
            item.stockStatus === 'expired'
              ? `${item.name} has an expired batch and needs review`
              : item.stockStatus === 'expiring-soon'
                ? `${item.name} expires in ${daysUntilExpiry} day(s)`
                : `${item.name} is ${item.stockStatus.replace('-', ' ')} (${item.currentQty} left)`,
          time: item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : 'Stock alert',
        };
      });

    if (pendingSyncCount > 0) {
      stockAlerts.push({
        id: 'sync-pending',
        type: 'info',
        message: `${pendingSyncCount} update${pendingSyncCount === 1 ? '' : 's'} waiting to be sent`,
        time: isOnline ? 'Updating' : 'Internet unavailable',
      });
    }

    return stockAlerts;
  }, [inventory, isOnline, pendingSyncCount]);
  const unread = notifications.filter(
    (n) => (n.type === 'warning' || n.type === 'danger') && !readIds.has(n.id)
  ).length;

  useEffect(() => {
    const raw = window.localStorage.getItem('tovapos.readNotifications');
    if (raw) setReadIds(new Set(JSON.parse(raw) as string[]));
  }, []);

  const saveReadIds = (next: Set<string>) => {
    setReadIds(next);
    window.localStorage.setItem('tovapos.readNotifications', JSON.stringify([...next]));
  };

  useEffect(() => {
    const formatTime = () => {
      setCurrentTime(
        new Date().toLocaleString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      );
    };

    formatTime();
    const interval = window.setInterval(formatTime, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <header className="min-h-14 bg-card border-b border-border flex items-center justify-between gap-3 px-4 py-2 shrink-0 z-30 sm:px-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {onOpenMenu && (
            <button
              type="button"
              onClick={onOpenMenu}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={18} />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-foreground leading-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="hidden truncate text-xs text-muted-foreground sm:block">{subtitle}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* Time */}
        <div className="hidden h-8 items-center gap-1.5 rounded-md bg-muted px-3 text-xs text-muted-foreground md:flex">
          <Clock size={12} />
          <span className="font-tabular">{currentTime || 'Loading time...'}</span>
        </div>

        <div
          className={`hidden h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium sm:flex ${
            connectivity.status === 'online'
              ? 'bg-success/10 text-success'
              : connectivity.status === 'checking'
                ? 'bg-muted text-muted-foreground'
                : 'bg-warning/10 text-warning'
          }`}
          title={
            connectivity.status === 'online'
              ? `TOVAPOS is online${connectivity.latencyMs === null ? '' : ` (${connectivity.latencyMs} ms response)`}`
              : connectivity.status === 'degraded'
                ? 'The connection is unstable; sales can continue safely'
                : connectivity.status === 'checking'
                  ? 'Checking service availability'
                  : 'TOVAPOS cannot reach the service; sales can continue on this device'
          }
        >
          {connectivity.status === 'checking' ? (
            <LoaderCircle size={12} className="animate-spin" />
          ) : connectivity.status === 'online' ? (
            <Wifi size={12} />
          ) : (
            <WifiOff size={12} />
          )}
          <span>
            {connectivity.status === 'online'
              ? 'Online'
              : connectivity.status === 'checking'
                ? 'Checking connection'
                : connectivity.status === 'degraded'
                  ? 'Connection unstable'
                  : 'Offline — sales can continue'}
          </span>
        </div>

        <div className="hidden h-8 items-center gap-1.5 rounded-md bg-muted px-3 text-xs text-muted-foreground lg:flex">
          <Cloud size={12} />
          <span className="font-tabular">
            {syncProgress.isSyncing
              ? `Sending ${syncProgress.completed}/${syncProgress.total}`
              : `${pendingSyncCount} update${pendingSyncCount === 1 ? '' : 's'} waiting`}
          </span>
        </div>

        {currentUser && (
          <div className="hidden h-8 max-w-[220px] items-center gap-2 rounded-md bg-primary/10 px-3 text-xs font-semibold text-primary xl:flex">
            <span className="truncate">{currentUser.name}</span>
            <span className="capitalize text-primary/70">{currentUser.role.replace('-', ' ')}</span>
          </div>
        )}

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
            aria-label="Open alerts"
          >
            <Bell size={18} />
            {unread > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-danger text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {unread}
              </span>
            )}
          </button>

          {showNotifs && (
            <div className="absolute right-0 top-full mt-2 w-[min(20rem,calc(100vw-2rem))] bg-card border border-border rounded-xl shadow-modal z-50 fade-in">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="text-sm font-semibold text-foreground">Alerts</span>
                <span className="text-xs text-muted-foreground">{unread} unread</span>
              </div>
              <div className="max-h-72 overflow-y-auto scrollbar-thin">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                    No active alerts.
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => saveReadIds(new Set([...readIds, n.id]))}
                      className="flex items-start gap-3 border-b border-border px-4 py-3 transition-colors duration-100 last:border-0 hover:bg-muted/50"
                    >
                      <AlertTriangle
                        size={14}
                        className={`mt-0.5 shrink-0 ${n.type === 'danger' ? 'text-danger' : n.type === 'warning' ? 'text-warning' : 'text-info'}`}
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-xs leading-relaxed ${
                            readIds.has(n.id) ? 'text-muted-foreground' : 'text-foreground'
                          }`}
                        >
                          {n.message}
                        </p>
                        <p className="mt-1 text-[10px] text-muted-foreground">{n.time}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="px-4 py-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => saveReadIds(new Set(notifications.map((item) => item.id)))}
                  className="text-xs text-primary font-medium hover:underline"
                >
                  Mark all as read
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
