'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Building2,
  CheckCircle2,
  Loader2,
  LogOut,
  MailPlus,
  MessageSquareReply,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';
import { formatMoney } from '@/lib/pos/money';
import type { SupportTicket } from '@/lib/pos/types';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'support';
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
  revenue: number;
  openTicketCount: number;
}

export default function AdminPage() {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [email, setEmail] = useState('admin@tovapos.com.ng');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
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
      active: tenants.filter((tenant) => tenant.status === 'active').length,
      products: tenants.reduce((sum, tenant) => sum + tenant.productCount, 0),
      openTickets: tickets.filter(
        (ticket) => ticket.status === 'open' || ticket.status === 'pending'
      ).length,
      revenue: tenants.reduce((sum, tenant) => sum + tenant.revenue, 0),
    }),
    [tenants, tickets]
  );

  const loadPanel = useCallback(async () => {
    const response = await fetch('/api/admin/control-panel', { cache: 'no-store' });
    const payload = (await response.json().catch(() => null)) as {
      tenants?: TenantRow[];
      tickets?: SupportTicket[];
      error?: string;
    } | null;
    if (!response.ok) throw new Error(payload?.error ?? 'Unable to load admin panel');
    setTenants(payload?.tenants ?? []);
    setTickets(payload?.tickets ?? []);
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

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <AppLogo size={34} />
            <div>
              <p className="text-lg font-black">TOVAPOS Admin</p>
              <p className="text-xs text-muted-foreground">
                {admin.name} · {admin.role}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold"
          >
            <LogOut size={15} />
            Logout
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-screen-2xl space-y-5 p-6">
        {error && (
          <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
            {error}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          {[
            ['Businesses', totals.businesses.toLocaleString()],
            ['Active', totals.active.toLocaleString()],
            ['Products', totals.products.toLocaleString()],
            ['Open Tickets', totals.openTickets.toLocaleString()],
            ['Revenue', formatMoney(totals.revenue, 'NGN')],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-border bg-card px-4 py-3 shadow-card"
            >
              <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-black text-foreground">{value}</p>
            </div>
          ))}
        </div>

        {admin.role === 'owner' && (
          <form
            onSubmit={inviteAdmin}
            className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-card md:grid-cols-[1fr_1fr_150px_auto]"
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
              <p className="text-xs text-muted-foreground md:col-span-4">
                Invite link: <span className="font-mono text-foreground">{inviteUrl}</span>
              </p>
            )}
          </form>
        )}

        <section className="rounded-xl border border-border bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-primary" />
              <span className="text-sm font-semibold">Businesses</span>
            </div>
            <button
              type="button"
              onClick={() => void loadPanel()}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
            >
              <RefreshCw size={13} />
              Refresh
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Registered</th>
                  <th className="px-4 py-3">Products</th>
                  <th className="px-4 py-3">Active Items</th>
                  <th className="px-4 py-3">Users</th>
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
                      {new Date(tenant.registeredAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 font-tabular">{tenant.productCount}</td>
                    <td className="px-4 py-3 font-tabular">{tenant.activeItemCount}</td>
                    <td className="px-4 py-3 font-tabular">
                      {tenant.activeUserCount}/{tenant.userCount}
                    </td>
                    <td className="px-4 py-3 font-tabular">{tenant.openTicketCount}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">
                        {tenant.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void runAction(
                              {
                                action:
                                  tenant.status === 'active' ? 'suspend-tenant' : 'activate-tenant',
                                tenantId: tenant.id,
                              },
                              tenant.id
                            )
                          }
                          disabled={busy === tenant.id}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold"
                        >
                          {tenant.status === 'active' ? (
                            <Ban size={12} />
                          ) : (
                            <CheckCircle2 size={12} />
                          )}
                          {tenant.status === 'active' ? 'Block' : 'Unblock'}
                        </button>
                        {admin.role === 'owner' && (
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

        <section className="rounded-xl border border-border bg-card shadow-card">
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
                      <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">
                        {ticket.status}
                      </span>
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
              <textarea
                value={responseText}
                onChange={(event) => setResponseText(event.target.value)}
                className="mt-3 min-h-44 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder="Write a response for the selected ticket."
              />
              <div className="mt-3 flex gap-2">
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
      </div>
    </main>
  );
}
