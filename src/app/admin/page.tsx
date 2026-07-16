'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  Activity,
  Ban,
  Bell,
  Building2,
  CheckCircle2,
  CreditCard,
  LayoutDashboard,
  LifeBuoy,
  Loader2,
  LockKeyhole,
  LogOut,
  MailPlus,
  MessageSquareReply,
  Moon,
  RefreshCw,
  Search,
  Send,
  Server,
  ShieldCheck,
  ShieldAlert,
  Sun,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import AppLogo from '@/components/ui/AppLogo';
import { confirmAction } from '@/components/ui/confirmAction';
import type { SupportTicket } from '@/lib/pos/types';

type PlatformRole = 'super-admin' | 'admin' | 'support';
type AdminSection = 'overview' | 'businesses' | 'support' | 'admins' | 'billing' | 'security';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: PlatformRole;
  mfaEnabled?: boolean;
}

interface PlatformAdminRow extends AdminUser {
  status: 'invited' | 'active' | 'suspended';
  lastLogin?: string | null;
  createdAt: string;
}

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  status: 'active' | 'suspended';
  registeredAt: string;
  productCount: number;
  activeItemCount: number;
  totalUnits: number;
  userCount: number;
  activeUserCount: number;
  saleCount: number;
  subscriptionPlanId: 'starter' | 'pro' | 'delux' | string;
  subscriptionStatus: 'trialing' | 'active' | 'past-due' | 'cancelled' | string;
  subscriptionRenewsAt?: string | null;
  openTicketCount: number;
}

interface AdminUserRow {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'suspended';
  lastLogin?: string | null;
}

interface SecuritySummary {
  apiStatus: 'healthy' | 'degraded';
  activeAppSessions: number;
  activeAdminSessions: number;
  pendingAdminInvites: number;
  blockedLoginAttempts: number;
  failedLogins24h: number;
  activeAppUsers: number;
  notifications7d: number;
  checkedAt: string;
}

const sectionItems: Array<{
  id: AdminSection;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'businesses', label: 'Businesses', icon: Building2 },
  { id: 'support', label: 'Support', icon: LifeBuoy },
  { id: 'admins', label: 'Admins', icon: Users },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'security', label: 'Security', icon: LockKeyhole },
];

const statusBadge =
  'rounded-full bg-muted px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground';

function formatDate(value?: string | null): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleDateString();
}

function roleLabel(role: PlatformRole): string {
  if (role === 'super-admin') return 'Super admin';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function AdminPage() {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [email, setEmail] = useState('admin@tovapos.com.ng');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<{
    secret: string;
    otpauthUrl: string;
    qrDataUrl: string;
  } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [activeSection, setActiveSection] = useState<AdminSection>('overview');
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [admins, setAdmins] = useState<PlatformAdminRow[]>([]);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [security, setSecurity] = useState<SecuritySummary | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [responseText, setResponseText] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [noticeScope, setNoticeScope] = useState<'all' | 'tenant' | 'user'>('all');
  const [noticeTenantId, setNoticeTenantId] = useState('');
  const [noticeUserId, setNoticeUserId] = useState('');
  const [noticeTone, setNoticeTone] = useState<'info' | 'success' | 'warning' | 'danger'>('info');
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');
  const [adminTheme, setAdminTheme] = useState<'light' | 'dark'>('light');
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'support'>('support');
  const [inviteUrl, setInviteUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const totals = useMemo(
    () => ({
      businesses: tenants.length,
      activeBusinesses: tenants.filter((tenant) => tenant.status === 'active').length,
      products: tenants.reduce((sum, tenant) => sum + tenant.productCount, 0),
      activeItems: tenants.reduce((sum, tenant) => sum + tenant.activeItemCount, 0),
      openTickets: tickets.filter(
        (ticket) => ticket.status === 'open' || ticket.status === 'pending'
      ).length,
      freeAccess: tenants.filter((tenant) => tenant.subscriptionStatus === 'active').length,
    }),
    [tenants, tickets]
  );

  const planSummary = useMemo(
    () =>
      tenants.reduce<Record<string, number>>((summary, tenant) => {
        const plan = tenant.subscriptionPlanId || 'starter';
        summary[plan] = (summary[plan] ?? 0) + 1;
        return summary;
      }, {}),
    [tenants]
  );

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId);
  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    return users
      .filter((user) => {
        if (noticeTenantId && user.tenantId !== noticeTenantId) return false;
        if (!term) return true;
        return [user.name, user.email, user.tenantName, user.role].some((value) =>
          value.toLowerCase().includes(term)
        );
      })
      .slice(0, 20);
  }, [noticeTenantId, userSearch, users]);

  useEffect(() => {
    const saved = window.localStorage.getItem('tovapos.adminTheme');
    const nextTheme = saved === 'dark' || saved === 'light' ? saved : 'light';
    setAdminTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = adminTheme;
    window.localStorage.setItem('tovapos.adminTheme', adminTheme);
  }, [adminTheme]);

  const loadPanel = useCallback(async () => {
    const response = await fetch('/api/admin/control-panel', { cache: 'no-store' });
    const payload = (await response.json().catch(() => null)) as {
      tenants?: TenantRow[];
      tickets?: SupportTicket[];
      admins?: PlatformAdminRow[];
      users?: AdminUserRow[];
      security?: SecuritySummary;
      error?: string;
    } | null;
    if (!response.ok) throw new Error(payload?.error ?? 'Unable to load admin panel');
    setTenants(payload?.tenants ?? []);
    setTickets(payload?.tickets ?? []);
    setAdmins(payload?.admins ?? []);
    setUsers(payload?.users ?? []);
    setSecurity(payload?.security ?? null);
  }, []);

  const loadSession = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/auth/session', { cache: 'no-store' });
      const payload = (await response.json().catch(() => null)) as { admin?: AdminUser } | null;
      if (response.ok && payload?.admin) {
        setAdmin(payload.admin);
        await loadPanel();
      }
    } finally {
      setLoading(false);
    }
  }, [loadPanel]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy('login');
    setError('');
    try {
      const response = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, otp, remember }),
      });
      const payload = (await response.json().catch(() => null)) as {
        admin?: AdminUser;
        mfaRequired?: boolean;
        mfaSetupRequired?: boolean;
        secret?: string;
        otpauthUrl?: string;
        error?: string;
      } | null;
      if (response.ok && payload?.mfaRequired) {
        setMfaRequired(true);
        setMfaSetup(null);
        setError('Enter your 6-digit authenticator code.');
        return;
      }
      if (!response.ok || !payload?.admin) throw new Error(payload?.error ?? 'Unable to sign in');
      setAdmin(payload.admin);
      setPassword('');
      setOtp('');
      setMfaRequired(false);
      await loadPanel();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in');
    } finally {
      setBusy('');
      setLoading(false);
    }
  };

  const logout = async () => {
    await fetch('/api/admin/auth/logout', { method: 'POST' });
    setAdmin(null);
    setTenants([]);
    setTickets([]);
    setAdmins([]);
    setUsers([]);
    setSecurity(null);
  };

  const runAction = async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    setError('');
    try {
      const response = await fetch('/api/admin/control-panel', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? 'Admin action failed');
      setResponseText('');
      setSelectedTicketId('');
      await loadPanel();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Admin action failed');
    } finally {
      setBusy('');
    }
  };

  const manageAdmin = async (
    target: PlatformAdminRow,
    action: 'suspend-admin' | 'activate-admin' | 'delete-admin'
  ) => {
    const destructive = action === 'delete-admin';
    const confirmed = await confirmAction({
      title:
        action === 'activate-admin'
          ? `Unsuspend ${target.name}?`
          : action === 'suspend-admin'
            ? `Suspend ${target.name}?`
            : `Delete ${target.name}?`,
      description:
        action === 'activate-admin'
          ? 'This admin will be able to sign in to the platform control panel again.'
          : action === 'suspend-admin'
            ? 'This admin will be blocked from signing in until restored.'
            : 'This permanently removes the platform admin account and its pending invites.',
      confirmLabel:
        action === 'activate-admin'
          ? 'Unsuspend admin'
          : action === 'suspend-admin'
            ? 'Suspend admin'
            : 'Delete admin',
      tone: destructive ? 'danger' : 'warning',
    });
    if (!confirmed) return;
    await runAction({ action, adminId: target.id }, target.id);
  };

  const inviteAdmin = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy('invite');
    setError('');
    setInviteUrl('');
    try {
      const response = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: inviteName, email: inviteEmail, role: inviteRole }),
      });
      const payload = (await response.json().catch(() => null)) as {
        inviteUrl?: string;
        error?: string;
      } | null;
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to invite admin');
      setInviteUrl(payload?.inviteUrl ?? '');
      setInviteName('');
      setInviteEmail('');
      await loadPanel();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to invite admin');
    } finally {
      setBusy('');
    }
  };

  const sendNotification = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy('notify');
    setError('');
    try {
      const response = await fetch('/api/admin/control-panel', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send-notification',
          scope: noticeScope,
          tenantId: noticeTenantId,
          targetUserId: noticeUserId,
          tone: noticeTone,
          title: noticeTitle,
          message: noticeMessage,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        delivered?: number;
        error?: string;
      } | null;
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to send notification');
      toast.success(
        noticeScope === 'all'
          ? `Notification queued for ${payload?.delivered ?? 0} businesses`
          : 'Notification sent'
      );
      setNoticeTitle('');
      setNoticeMessage('');
      await loadPanel();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to send notification';
      setError(message);
      toast.error(message);
    } finally {
      setBusy('');
    }
  };

  const startMfaSetup = async () => {
    setBusy('mfa');
    setError('');
    try {
      const response = await fetch('/api/admin/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      const payload = (await response.json().catch(() => null)) as {
        secret?: string;
        otpauthUrl?: string;
        qrDataUrl?: string;
        error?: string;
      } | null;
      if (!response.ok || !payload?.secret || !payload.otpauthUrl || !payload.qrDataUrl) {
        throw new Error(payload?.error ?? 'Unable to start 2FA setup');
      }
      setMfaSetup({
        secret: payload.secret,
        otpauthUrl: payload.otpauthUrl,
        qrDataUrl: payload.qrDataUrl,
      });
      setMfaCode('');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to start 2FA setup';
      setError(message);
      toast.error(message);
    } finally {
      setBusy('');
    }
  };

  const submitMfaAction = async (action: 'verify' | 'disable') => {
    setBusy('mfa');
    setError('');
    try {
      const response = await fetch('/api/admin/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, code: mfaCode }),
      });
      const payload = (await response.json().catch(() => null)) as {
        mfaEnabled?: boolean;
        error?: string;
      } | null;
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to update 2FA');
      setAdmin((current) =>
        current ? { ...current, mfaEnabled: Boolean(payload?.mfaEnabled) } : current
      );
      setMfaSetup(null);
      setMfaCode('');
      toast.success(action === 'verify' ? '2FA is now active' : '2FA has been disabled');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to update 2FA';
      setError(message);
      toast.error(message);
    } finally {
      setBusy('');
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" />
          Preparing admin
        </div>
      </main>
    );
  }

  if (!admin) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
        <form
          onSubmit={login}
          className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-modal"
        >
          <div className="mb-6 flex items-center gap-3">
            <AppLogo size={38} />
            <div>
              <p className="text-xl font-black">TOVAPOS Admin</p>
              <p className="text-sm text-muted-foreground">Platform control panel</p>
            </div>
          </div>
          {error && (
            <p className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
              {error}
            </p>
          )}
          <label className="mb-3 block space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">Email</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
              autoComplete="username"
            />
          </label>
          <label className="mb-3 block space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
              autoComplete="current-password"
            />
          </label>
          {(mfaRequired || otp) && (
            <label className="mb-3 block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">
                Authenticator code
              </span>
              <input
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm tracking-[0.35em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
              />
            </label>
          )}
          <label className="mb-5 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            Keep me signed in
          </label>
          <button
            type="submit"
            disabled={busy === 'login'}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-bold text-white disabled:opacity-60"
          >
            {busy === 'login' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ShieldCheck size={16} />
            )}
            Login
          </button>
        </form>
      </main>
    );
  }

  const canManageBusinesses = admin.role === 'super-admin' || admin.role === 'admin';
  const canDeleteBusinesses = admin.role === 'super-admin';
  const isSuperAdmin = admin.role === 'super-admin';

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="border-b border-border bg-card lg:w-72 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3 px-5 py-4 lg:block">
            <div className="flex items-center gap-3">
              <AppLogo size={34} />
              <div>
                <p className="text-lg font-black">TOVAPOS Admin</p>
                <p className="text-xs text-muted-foreground">Platform operations</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold lg:mt-5 lg:w-full lg:justify-center"
            >
              <LogOut size={14} />
              Logout
            </button>
          </div>
          <nav className="flex gap-2 overflow-x-auto px-4 pb-4 lg:block lg:space-y-1">
            {sectionItems.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`flex min-w-max items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold lg:w-full ${
                    active
                      ? 'bg-primary text-white'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon size={16} />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="hidden border-t border-border p-5 lg:block">
            <p className="text-xs font-bold uppercase text-muted-foreground">Signed in</p>
            <p className="mt-2 text-sm font-semibold">{admin.name}</p>
            <p className="text-xs text-muted-foreground">{admin.email}</p>
            <span className="mt-3 inline-block rounded-full bg-primary/10 px-2 py-1 text-[10px] font-black uppercase text-primary">
              {roleLabel(admin.role)}
            </span>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="border-b border-border bg-card px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xl font-black">
                  {sectionItems.find((item) => item.id === activeSection)?.label}
                </p>
                <p className="text-sm text-muted-foreground">
                  Secure control for businesses, support, admins, and billing readiness.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAdminTheme((theme) => (theme === 'dark' ? 'light' : 'dark'))}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold"
                  aria-label="Toggle admin theme"
                >
                  {adminTheme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                  {adminTheme === 'dark' ? 'Light' : 'Dark'}
                </button>
                <button
                  type="button"
                  onClick={() => void loadPanel()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold"
                >
                  <RefreshCw size={14} />
                  Refresh
                </button>
              </div>
            </div>
          </header>

          <div className="space-y-5 p-5">
            {error && (
              <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
                {error}
              </p>
            )}

            {activeSection === 'overview' && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
                  {[
                    ['Businesses', totals.businesses.toLocaleString()],
                    ['Active', totals.activeBusinesses.toLocaleString()],
                    ['Products', totals.products.toLocaleString()],
                    ['Active Items', totals.activeItems.toLocaleString()],
                    ['Open Tickets', totals.openTickets.toLocaleString()],
                    ['Free Access', totals.freeAccess.toLocaleString()],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-border bg-card px-4 py-3">
                      <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
                      <p className="mt-1 text-xl font-black text-foreground">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
                  <section className="rounded-lg border border-border bg-card">
                    <div className="border-b border-border px-4 py-3">
                      <p className="text-sm font-semibold">Recent Businesses</p>
                    </div>
                    <div className="divide-y divide-border">
                      {tenants.slice(0, 6).map((tenant) => (
                        <div
                          key={tenant.id}
                          className="flex items-center justify-between gap-3 p-4"
                        >
                          <div>
                            <p className="text-sm font-semibold">{tenant.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {tenant.productCount} products · {tenant.activeUserCount} active users
                            </p>
                          </div>
                          <span className={statusBadge}>{tenant.status}</span>
                        </div>
                      ))}
                      {tenants.length === 0 && (
                        <p className="p-4 text-sm text-muted-foreground">No businesses yet.</p>
                      )}
                    </div>
                  </section>

                  <section className="rounded-lg border border-border bg-card">
                    <div className="border-b border-border px-4 py-3">
                      <p className="text-sm font-semibold">Plan Distribution</p>
                    </div>
                    <div className="space-y-3 p-4">
                      {Object.entries(planSummary).map(([plan, count]) => (
                        <div key={plan} className="flex items-center justify-between">
                          <span className="text-sm font-semibold capitalize">{plan}</span>
                          <span className="font-tabular text-sm">{count}</span>
                        </div>
                      ))}
                      {Object.keys(planSummary).length === 0 && (
                        <p className="text-sm text-muted-foreground">No plan data yet.</p>
                      )}
                      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                        Paystack collection is intentionally disabled. Businesses can choose plans
                        while access remains free during market rollout.
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            )}

            {activeSection === 'businesses' && (
              <section className="rounded-lg border border-border bg-card">
                <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                  <Building2 size={16} className="text-primary" />
                  <span className="text-sm font-semibold">Businesses</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] text-left text-sm">
                    <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Business</th>
                        <th className="px-4 py-3">Registered</th>
                        <th className="px-4 py-3">Products</th>
                        <th className="px-4 py-3">Active Items</th>
                        <th className="px-4 py-3">Users</th>
                        <th className="px-4 py-3">Plan</th>
                        <th className="px-4 py-3">Tickets</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {tenants.map((tenant) => (
                        <tr key={tenant.id}>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-foreground">{tenant.name}</p>
                            <p className="text-xs text-muted-foreground">{tenant.slug}</p>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDate(tenant.registeredAt)}
                          </td>
                          <td className="px-4 py-3 font-tabular">{tenant.productCount}</td>
                          <td className="px-4 py-3 font-tabular">{tenant.activeItemCount}</td>
                          <td className="px-4 py-3 font-tabular">
                            {tenant.activeUserCount}/{tenant.userCount}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-semibold capitalize">{tenant.subscriptionPlanId}</p>
                            <p className="text-xs text-muted-foreground">
                              {tenant.subscriptionStatus}
                            </p>
                          </td>
                          <td className="px-4 py-3 font-tabular">{tenant.openTicketCount}</td>
                          <td className="px-4 py-3">
                            <span className={statusBadge}>{tenant.status}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  void runAction(
                                    {
                                      action:
                                        tenant.status === 'active'
                                          ? 'suspend-tenant'
                                          : 'activate-tenant',
                                      tenantId: tenant.id,
                                    },
                                    tenant.id
                                  )
                                }
                                disabled={!canManageBusinesses || busy === tenant.id}
                                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold disabled:opacity-50"
                              >
                                {tenant.status === 'active' ? (
                                  <Ban size={12} />
                                ) : (
                                  <CheckCircle2 size={12} />
                                )}
                                {tenant.status === 'active' ? 'Block' : 'Unblock'}
                              </button>
                              {canDeleteBusinesses && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const confirmed = await confirmAction({
                                      title: `Delete ${tenant.name}?`,
                                      description:
                                        'This permanently removes the business account, users, inventory, sales, tickets, and tenant data. This cannot be undone.',
                                      confirmLabel: 'Delete business',
                                    });
                                    if (confirmed) {
                                      void runAction(
                                        { action: 'delete-tenant', tenantId: tenant.id },
                                        tenant.id
                                      );
                                    }
                                  }}
                                  disabled={busy === tenant.id}
                                  className="inline-flex items-center gap-1 rounded-md border border-danger/30 px-2 py-1 text-xs font-semibold text-danger"
                                >
                                  <Trash2 size={12} />
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {activeSection === 'support' && (
              <div className="space-y-5">
                <section className="rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                    <MessageSquareReply size={16} className="text-primary" />
                    <span className="text-sm font-semibold">Support Tickets</span>
                  </div>
                  <div className="grid gap-4 p-4 lg:grid-cols-[1fr_420px]">
                    <div className="divide-y divide-border rounded-lg border border-border">
                      {tickets.length === 0 ? (
                        <p className="p-4 text-sm text-muted-foreground">No support tickets yet.</p>
                      ) : (
                        tickets.map((ticket) => (
                          <button
                            key={ticket.id}
                            type="button"
                            onClick={() => {
                              setSelectedTicketId(ticket.id);
                              setResponseText(ticket.response ?? '');
                            }}
                            className={`block w-full p-4 text-left hover:bg-muted/50 ${
                              selectedTicketId === ticket.id ? 'bg-primary/5' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold">{ticket.subject}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {ticket.tenantName} · {ticket.createdBy} · {ticket.priority}
                                </p>
                              </div>
                              <span className={statusBadge}>{ticket.status}</span>
                            </div>
                            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                              {ticket.message}
                            </p>
                          </button>
                        ))
                      )}
                    </div>
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-sm font-semibold">Support Response</p>
                      {selectedTicket && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Replying to {selectedTicket.tenantName} · {selectedTicket.createdByEmail}
                        </p>
                      )}
                      <textarea
                        value={responseText}
                        onChange={(event) => setResponseText(event.target.value)}
                        className="mt-3 min-h-44 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        placeholder="Write a response for the selected ticket."
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={!selectedTicketId || busy === 'ticket'}
                          onClick={() =>
                            void runAction(
                              {
                                action: 'respond-ticket',
                                ticketId: selectedTicketId,
                                response: responseText,
                                status: 'pending',
                              },
                              'ticket'
                            )
                          }
                          className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Send Response
                        </button>
                        <button
                          type="button"
                          disabled={!selectedTicketId || busy === 'ticket'}
                          onClick={() =>
                            void runAction(
                              {
                                action: 'respond-ticket',
                                ticketId: selectedTicketId,
                                response: responseText || 'Resolved.',
                                status: 'resolved',
                              },
                              'ticket'
                            )
                          }
                          className="rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                        >
                          Mark Resolved
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                    <Bell size={16} className="text-primary" />
                    <span className="text-sm font-semibold">Send Notification</span>
                  </div>
                  <form
                    onSubmit={sendNotification}
                    className="grid gap-4 p-4 xl:grid-cols-[1fr_380px]"
                  >
                    <div className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-3">
                        <select
                          value={noticeScope}
                          onChange={(event) => {
                            const scope = event.target.value as typeof noticeScope;
                            setNoticeScope(scope);
                            if (scope === 'all') {
                              setNoticeTenantId('');
                              setNoticeUserId('');
                            }
                            if (scope === 'tenant') setNoticeUserId('');
                          }}
                          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        >
                          <option value="all">All businesses</option>
                          <option value="tenant">One business</option>
                          <option value="user">One user</option>
                        </select>
                        <select
                          value={noticeTenantId}
                          onChange={(event) => {
                            setNoticeTenantId(event.target.value);
                            setNoticeUserId('');
                          }}
                          disabled={noticeScope === 'all'}
                          className="rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
                        >
                          <option value="">Select business</option>
                          {tenants.map((tenant) => (
                            <option key={tenant.id} value={tenant.id}>
                              {tenant.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={noticeTone}
                          onChange={(event) =>
                            setNoticeTone(event.target.value as typeof noticeTone)
                          }
                          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        >
                          <option value="info">Info</option>
                          <option value="success">Success</option>
                          <option value="warning">Warning</option>
                          <option value="danger">Urgent</option>
                        </select>
                      </div>
                      <input
                        value={noticeTitle}
                        onChange={(event) => setNoticeTitle(event.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        placeholder="Notification title"
                      />
                      <textarea
                        value={noticeMessage}
                        onChange={(event) => setNoticeMessage(event.target.value)}
                        className="min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        placeholder="Message to show inside the user's notification center."
                      />
                      <button
                        type="submit"
                        disabled={busy === 'notify'}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {busy === 'notify' ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <Send size={15} />
                        )}
                        Send Notification
                      </button>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <div className="relative">
                        <Search
                          size={14}
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                        />
                        <input
                          value={userSearch}
                          onChange={(event) => setUserSearch(event.target.value)}
                          className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm"
                          placeholder="Search users or businesses"
                        />
                      </div>
                      <div className="mt-3 max-h-64 space-y-2 overflow-y-auto scrollbar-thin">
                        {filteredUsers.map((user) => (
                          <button
                            key={`${user.tenantId}-${user.id}`}
                            type="button"
                            onClick={() => {
                              setNoticeScope('user');
                              setNoticeTenantId(user.tenantId);
                              setNoticeUserId(user.id);
                            }}
                            className={`block w-full rounded-lg border px-3 py-2 text-left text-sm ${
                              noticeUserId === user.id
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:bg-muted/40'
                            }`}
                          >
                            <p className="font-semibold">{user.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {user.email} · {user.tenantName} · {user.role}
                            </p>
                          </button>
                        ))}
                        {filteredUsers.length === 0 && (
                          <p className="py-6 text-center text-sm text-muted-foreground">
                            No users match this search.
                          </p>
                        )}
                      </div>
                    </div>
                  </form>
                </section>
              </div>
            )}

            {activeSection === 'admins' && (
              <div className="space-y-5">
                {isSuperAdmin ? (
                  <form
                    onSubmit={inviteAdmin}
                    className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-[1fr_1fr_150px_auto]"
                  >
                    <input
                      value={inviteName}
                      onChange={(event) => setInviteName(event.target.value)}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      placeholder="Admin name"
                    />
                    <input
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      placeholder="Admin email"
                    />
                    <select
                      value={inviteRole}
                      onChange={(event) => setInviteRole(event.target.value as 'admin' | 'support')}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    >
                      <option value="support">Support</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      type="submit"
                      disabled={busy === 'invite'}
                      className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      <MailPlus size={15} />
                      Invite
                    </button>
                    {inviteUrl && (
                      <p className="break-all text-xs text-muted-foreground md:col-span-4">
                        Invite link: <span className="font-mono text-foreground">{inviteUrl}</span>
                      </p>
                    )}
                  </form>
                ) : (
                  <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                    Only the seeded super admin can invite platform admins.
                  </div>
                )}

                <section className="rounded-lg border border-border bg-card">
                  <div className="border-b border-border px-4 py-3">
                    <p className="text-sm font-semibold">Platform Admins</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left text-sm">
                      <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">Admin</th>
                          <th className="px-4 py-3">Role</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Last Login</th>
                          <th className="px-4 py-3">Created</th>
                          <th className="px-4 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {admins.map((row) => (
                          <tr key={row.id}>
                            <td className="px-4 py-3">
                              <p className="font-semibold">{row.name}</p>
                              <p className="text-xs text-muted-foreground">{row.email}</p>
                            </td>
                            <td className="px-4 py-3">{roleLabel(row.role)}</td>
                            <td className="px-4 py-3">
                              <span className={statusBadge}>{row.status}</span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {formatDate(row.lastLogin)}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {formatDate(row.createdAt)}
                            </td>
                            <td className="px-4 py-3">
                              {isSuperAdmin && row.id !== admin.id && (
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void manageAdmin(
                                        row,
                                        row.status === 'active' ? 'suspend-admin' : 'activate-admin'
                                      )
                                    }
                                    className="rounded-md border border-border px-2 py-1 text-xs font-semibold"
                                  >
                                    {row.status === 'active' ? 'Suspend' : 'Unsuspend'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void manageAdmin(row, 'delete-admin')}
                                    className="rounded-md border border-danger/30 px-2 py-1 text-xs font-semibold text-danger"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                        {admins.length === 0 && (
                          <tr>
                            <td className="px-4 py-4 text-sm text-muted-foreground" colSpan={6}>
                              Admin list is visible to super admins only.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}

            {activeSection === 'billing' && (
              <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
                <section className="rounded-lg border border-border bg-card">
                  <div className="border-b border-border px-4 py-3">
                    <p className="text-sm font-semibold">Subscription Readiness</p>
                  </div>
                  <div className="space-y-4 p-4">
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                      <p className="text-sm font-bold text-foreground">Free rollout is active</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Paystack billing hooks can be added later without changing the account
                        control model. For now, businesses can select Starter, Pro, or Delux while
                        subscription collection remains disabled.
                      </p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      {['starter', 'pro', 'delux'].map((plan) => (
                        <div key={plan} className="rounded-lg border border-border p-4">
                          <p className="text-sm font-black capitalize">{plan}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {planSummary[plan] ?? 0} businesses selected
                          </p>
                          <span className="mt-3 inline-block rounded-full bg-success/10 px-2 py-1 text-[10px] font-black uppercase text-success">
                            Free access
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-border bg-card p-4">
                  <p className="text-sm font-semibold">Payment Gateway</p>
                  <div className="mt-3 rounded-lg border border-dashed border-border p-4">
                    <p className="text-sm font-bold">Paystack disabled</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Keep live charging off until the product is ready to enforce paid access.
                    </p>
                  </div>
                </section>
              </div>
            )}

            {activeSection === 'security' && (
              <div className="space-y-5">
                <section className="rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <div className="flex items-center gap-2">
                      <LockKeyhole size={16} className="text-primary" />
                      <p className="text-sm font-semibold">Two-Factor Authentication</p>
                    </div>
                    <span className={statusBadge}>{admin.mfaEnabled ? 'enabled' : 'off'}</span>
                  </div>
                  <div className="grid gap-4 p-4 lg:grid-cols-[1fr_420px]">
                    <div className="space-y-3 text-sm text-muted-foreground">
                      <p>
                        Protect this admin account with a 6-digit authenticator code from Google
                        Authenticator, Microsoft Authenticator, 1Password, or another TOTP app.
                      </p>
                      <p>
                        Once enabled, future admin logins require both the password and the
                        authenticator code.
                      </p>
                      {!admin.mfaEnabled && (
                        <button
                          type="button"
                          onClick={() => void startMfaSetup()}
                          disabled={busy === 'mfa'}
                          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {busy === 'mfa' ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <ShieldCheck size={15} />
                          )}
                          Set up 2FA
                        </button>
                      )}
                    </div>

                    <div className="rounded-lg border border-border p-4">
                      {admin.mfaEnabled ? (
                        <div className="space-y-3">
                          <p className="text-sm font-bold text-success">2FA is active</p>
                          <p className="text-xs leading-5 text-muted-foreground">
                            To disable it, enter a current authenticator code.
                          </p>
                          <input
                            value={mfaCode}
                            onChange={(event) =>
                              setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                            }
                            className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm tracking-[0.35em]"
                            inputMode="numeric"
                            placeholder="000000"
                          />
                          <button
                            type="button"
                            onClick={() => void submitMfaAction('disable')}
                            disabled={busy === 'mfa' || mfaCode.length !== 6}
                            className="w-full rounded-lg border border-danger/30 px-4 py-2 text-sm font-semibold text-danger disabled:opacity-60"
                          >
                            Disable 2FA
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-sm font-bold">2FA is not enabled</p>
                          <p className="text-xs leading-5 text-muted-foreground">
                            Click Set up 2FA to open the QR code setup screen.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    {
                      label: 'API Status',
                      value: security?.apiStatus ?? 'healthy',
                      icon: Server,
                      tone: 'text-success',
                    },
                    {
                      label: 'Active App Users',
                      value: security?.activeAppUsers ?? 0,
                      icon: Users,
                      tone: 'text-primary',
                    },
                    {
                      label: 'App Sessions',
                      value: security?.activeAppSessions ?? 0,
                      icon: Activity,
                      tone: 'text-info',
                    },
                    {
                      label: 'Admin Sessions',
                      value: security?.activeAdminSessions ?? 0,
                      icon: ShieldCheck,
                      tone: 'text-primary',
                    },
                    {
                      label: 'Blocked Logins',
                      value: security?.blockedLoginAttempts ?? 0,
                      icon: ShieldAlert,
                      tone:
                        (security?.blockedLoginAttempts ?? 0) > 0 ? 'text-danger' : 'text-success',
                    },
                    {
                      label: 'Failed Logins 24h',
                      value: security?.failedLogins24h ?? 0,
                      icon: LockKeyhole,
                      tone: (security?.failedLogins24h ?? 0) > 0 ? 'text-warning' : 'text-success',
                    },
                    {
                      label: 'Pending Invites',
                      value: security?.pendingAdminInvites ?? 0,
                      icon: MailPlus,
                      tone: 'text-info',
                    },
                    {
                      label: 'Notifications 7d',
                      value: security?.notifications7d ?? 0,
                      icon: Bell,
                      tone: 'text-primary',
                    },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.label} className="rounded-lg border border-border bg-card p-4">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold uppercase text-muted-foreground">
                            {item.label}
                          </p>
                          <Icon size={16} className={item.tone} />
                        </div>
                        <p className="mt-2 text-2xl font-black capitalize">{item.value}</p>
                      </div>
                    );
                  })}
                </div>

                <section className="rounded-lg border border-border bg-card">
                  <div className="border-b border-border px-4 py-3">
                    <p className="text-sm font-semibold">Security Controls</p>
                  </div>
                  <div className="grid gap-4 p-4 lg:grid-cols-3">
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-sm font-bold">Role boundaries</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Super admin deletes accounts and invites admins. Admins manage business
                        status. Support handles tickets and notifications.
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-sm font-bold">Threat login watch</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Blocked and failed login counters come from the auth-attempt lockout table.
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-sm font-bold">Last checked</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {security ? new Date(security.checkedAt).toLocaleString() : 'Not checked'}
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            )}
          </div>
        </section>
      </div>
      {mfaSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card text-foreground shadow-modal">
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <p className="text-lg font-black">Set Up Two-Factor Authentication</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Scan the QR code, then enter the 6-digit code from your authenticator app.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMfaSetup(null);
                  setMfaCode('');
                }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Cancel
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="flex justify-center rounded-xl border border-border bg-white p-4">
                <Image
                  src={mfaSetup.qrDataUrl}
                  alt="Scan this QR code with Google Authenticator"
                  width={220}
                  height={220}
                  unoptimized
                />
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="text-xs font-bold uppercase text-muted-foreground">
                  Manual setup key
                </p>
                <p className="mt-2 break-all font-mono text-xs text-foreground">
                  {mfaSetup.secret}
                </p>
              </div>

              <a
                href={mfaSetup.otpauthUrl}
                className="inline-flex text-xs font-semibold text-primary hover:underline"
              >
                Open setup link on this device
              </a>

              <label className="block space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">
                  Enter authenticator code
                </span>
                <input
                  value={mfaCode}
                  onChange={(event) =>
                    setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  className="h-12 w-full rounded-lg border border-border bg-background px-3 text-center text-lg font-black tracking-[0.45em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  autoFocus
                />
              </label>

              <button
                type="button"
                onClick={() => void submitMfaAction('verify')}
                disabled={busy === 'mfa' || mfaCode.length !== 6}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy === 'mfa' ? <Loader2 size={15} className="animate-spin" /> : null}
                Verify and Enable 2FA
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
