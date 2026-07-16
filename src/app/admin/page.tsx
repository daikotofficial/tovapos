'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban,
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
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';
import type { SupportTicket } from '@/lib/pos/types';

type PlatformRole = 'super-admin' | 'admin' | 'support';
type AdminSection = 'overview' | 'businesses' | 'support' | 'admins' | 'billing' | 'security';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: PlatformRole;
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
  const [remember, setRemember] = useState(true);
  const [activeSection, setActiveSection] = useState<AdminSection>('overview');
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [admins, setAdmins] = useState<PlatformAdminRow[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [responseText, setResponseText] = useState('');
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

  const loadPanel = useCallback(async () => {
    const response = await fetch('/api/admin/control-panel', { cache: 'no-store' });
    const payload = (await response.json().catch(() => null)) as {
      tenants?: TenantRow[];
      tickets?: SupportTicket[];
      admins?: PlatformAdminRow[];
      error?: string;
    } | null;
    if (!response.ok) throw new Error(payload?.error ?? 'Unable to load admin panel');
    setTenants(payload?.tenants ?? []);
    setTickets(payload?.tickets ?? []);
    setAdmins(payload?.admins ?? []);
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
        body: JSON.stringify({ email, password, remember }),
      });
      const payload = (await response.json().catch(() => null)) as {
        admin?: AdminUser;
        error?: string;
      } | null;
      if (!response.ok || !payload?.admin) throw new Error(payload?.error ?? 'Unable to sign in');
      setAdmin(payload.admin);
      setPassword('');
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
              <button
                type="button"
                onClick={() => void loadPanel()}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold"
              >
                <RefreshCw size={14} />
                Refresh
              </button>
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
                                  onClick={() => {
                                    const confirmed = window.confirm(
                                      `Delete ${tenant.name}? This permanently removes the business and all tenant data.`
                                    );
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
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">Admin</th>
                          <th className="px-4 py-3">Role</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Last Login</th>
                          <th className="px-4 py-3">Created</th>
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
                          </tr>
                        ))}
                        {admins.length === 0 && (
                          <tr>
                            <td className="px-4 py-4 text-sm text-muted-foreground" colSpan={5}>
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
              <div className="grid gap-5 xl:grid-cols-2">
                <section className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={17} className="text-primary" />
                    <p className="text-sm font-semibold">Role Enforcement</p>
                  </div>
                  <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                    <p>Super admin: seeded from env, invites admins, deletes business accounts.</p>
                    <p>Admin: can block or unblock businesses and monitor operations.</p>
                    <p>Support: can view and respond to support tickets only.</p>
                  </div>
                </section>

                <section className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <LockKeyhole size={17} className="text-primary" />
                    <p className="text-sm font-semibold">Seed Configuration</p>
                  </div>
                  <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                    <p>
                      Set <span className="font-mono text-foreground">PLATFORM_ADMIN_EMAIL</span>,{' '}
                      <span className="font-mono text-foreground">PLATFORM_ADMIN_NAME</span>, and{' '}
                      <span className="font-mono text-foreground">PLATFORM_ADMIN_PASSWORD</span> in
                      Render.
                    </p>
                    <p>
                      The application does not keep a fallback super-admin password in source code.
                    </p>
                  </div>
                </section>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
