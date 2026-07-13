'use client';

import React, { useEffect, useState } from 'react';
import {
  Bell,
  Building2,
  KeyRound,
  Loader2,
  Palette,
  Receipt,
  Save,
  Settings,
  ShieldCheck,
  Wifi,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import NiceSelect from '@/components/ui/NiceSelect';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import { BusinessSettings } from '@/lib/pos/types';
import { getProductUsage } from '@/lib/pos/subscription';

export default function SettingsPage() {
  const { settings, updateSettings, pendingSyncCount, inventory } = usePosStore();
  const [form, setForm] = useState<BusinessSettings>(settings);
  const [saved, setSaved] = useState(false);
  const productUsage = getProductUsage(settings.subscriptionPlanId, inventory.length);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const save = async () => {
    await updateSettings(form);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <AppLayout
      title="Settings"
      subtitle="Manage your account, business details, receipts, and sales preferences"
    >
      <AccountSecurityCard />
      <PermissionGate permission="settings">
        <div className="p-6 max-w-6xl mx-auto space-y-5">
          <div className="bg-card border border-border rounded-xl shadow-card">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <ShieldCheck size={16} className="text-primary" />
              <span className="text-sm font-semibold">Subscription & Plan Limits</span>
            </div>
            <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-3">
              <div className="rounded-lg bg-muted/40 px-4 py-3">
                <p className="text-xs font-bold uppercase text-muted-foreground">Current plan</p>
                <p className="mt-1 text-lg font-bold">{productUsage.plan.name}</p>
              </div>
              <div className="rounded-lg bg-muted/40 px-4 py-3">
                <p className="text-xs font-bold uppercase text-muted-foreground">Product usage</p>
                <p className="mt-1 text-lg font-bold font-tabular">
                  {productUsage.currentProducts.toLocaleString()}
                  {productUsage.limit ? ` / ${productUsage.limit.toLocaleString()}` : ' / Custom'}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Counts distinct product/batch records, not units in stock.
                </p>
              </div>
              <div className="rounded-lg bg-muted/40 px-4 py-3">
                <p className="text-xs font-bold uppercase text-muted-foreground">Status</p>
                <p className="mt-1 text-lg font-bold capitalize">
                  {settings.subscriptionStatus ?? 'active'}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl shadow-card">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Building2 size={16} className="text-primary" />
              <span className="text-sm font-semibold">Business Profile</span>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Business / Store Name</span>
                <input
                  value={form.businessName}
                  onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Logo URL</span>
                <input
                  value={form.logoUrl ?? ''}
                  onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                  placeholder="https://..."
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Phone</span>
                <input
                  value={form.phone ?? ''}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Email</span>
                <input
                  value={form.email ?? ''}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs text-muted-foreground">Address</span>
                <input
                  value={form.address ?? ''}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                />
              </label>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl shadow-card">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Receipt size={16} className="text-primary" />
              <span className="text-sm font-semibold">Tax, Receipts & Payments</span>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Currency</span>
                <NiceSelect
                  value={form.currency}
                  onChange={(currency) => setForm({ ...form, currency })}
                  options={[
                    { value: 'NGN', label: 'NGN' },
                    { value: 'USD', label: 'USD' },
                    { value: 'GHS', label: 'GHS' },
                    { value: 'KES', label: 'KES' },
                  ]}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Default VAT / Tax Rate (%)</span>
                <input
                  type="number"
                  value={form.taxRate}
                  onChange={(e) => setForm({ ...form, taxRate: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">VAT Pricing Mode</span>
                <NiceSelect
                  value={form.taxMode ?? 'exclusive'}
                  onChange={(taxMode) =>
                    setForm({ ...form, taxMode: taxMode as BusinessSettings['taxMode'] })
                  }
                  options={[
                    { value: 'exclusive', label: 'VAT exclusive' },
                    { value: 'inclusive', label: 'VAT inclusive' },
                  ]}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Tax / VAT Number</span>
                <input
                  value={form.taxNumber ?? ''}
                  onChange={(e) => setForm({ ...form, taxNumber: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Receipt Prefix</span>
                <input
                  value={form.receiptPrefix ?? 'TXN'}
                  onChange={(e) => setForm({ ...form, receiptPrefix: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs text-muted-foreground">Receipt Footer</span>
                <textarea
                  value={form.receiptFooter}
                  onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background min-h-24"
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-card border border-border rounded-xl shadow-card">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Bell size={16} className="text-primary" />
                <span className="text-sm font-semibold">Alerts & Notifications</span>
              </div>
              <div className="p-5 grid grid-cols-1 gap-4">
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">Low Stock Threshold Default</span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={form.lowStockAlertDays}
                    onChange={(e) =>
                      setForm({ ...form, lowStockAlertDays: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">Expiry Alert Days</span>
                  <input
                    type="number"
                    value={form.expiryAlertDays ?? 30}
                    onChange={(e) => setForm({ ...form, expiryAlertDays: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">Notification Recipients</span>
                  <input
                    value={form.notificationRecipients ?? ''}
                    onChange={(e) => setForm({ ...form, notificationRecipients: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                    placeholder="manager@store.com, owner@store.com"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">Expiry Email Recipients</span>
                  <input
                    value={form.expiryEmailRecipients ?? ''}
                    onChange={(e) => setForm({ ...form, expiryEmailRecipients: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                    placeholder="stock@store.com, owner@store.com"
                  />
                  <span className="block text-[11px] text-muted-foreground">
                    A complete expiry report is emailed every Monday at 7:00 AM West Africa Time.
                    Products already expired and products expiring within the configured window are
                    included. Separate multiple addresses with commas.
                  </span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['inApp', 'In-app'],
                    ['dashboard', 'Dashboard'],
                    ['email', 'Email'],
                  ].map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={
                          form.notificationChannels?.[
                            key as keyof NonNullable<BusinessSettings['notificationChannels']>
                          ] ?? false
                        }
                        onChange={(e) =>
                          setForm({
                            ...form,
                            notificationChannels: {
                              inApp: form.notificationChannels?.inApp ?? true,
                              dashboard: form.notificationChannels?.dashboard ?? true,
                              email: form.notificationChannels?.email ?? false,
                              [key]: e.target.checked,
                            },
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl shadow-card">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <ShieldCheck size={16} className="text-primary" />
                <span className="text-sm font-semibold">POS Rules</span>
              </div>
              <div className="p-5 grid grid-cols-1 gap-3">
                <label className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
                  <span>
                    <span className="block text-sm font-medium">Allow Offline Sales</span>
                    <span className="block text-xs text-muted-foreground">
                      Cashiers can keep selling without internet.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={form.allowOfflineSales}
                    onChange={(e) => setForm({ ...form, allowOfflineSales: e.target.checked })}
                  />
                </label>
                <label className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
                  <span>
                    <span className="block text-sm font-medium">Allow Negative Stock</span>
                    <span className="block text-xs text-muted-foreground">
                      Keep disabled for strict stock control.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={form.allowNegativeStock ?? false}
                    onChange={(e) => setForm({ ...form, allowNegativeStock: e.target.checked })}
                  />
                </label>
                <label className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
                  <span>
                    <span className="block text-sm font-medium">Allow Selling Below Cost</span>
                    <span className="block text-xs text-muted-foreground">
                      Use only for clearance or manager-approved sales.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={form.allowSellingBelowCost ?? false}
                    onChange={(e) => setForm({ ...form, allowSellingBelowCost: e.target.checked })}
                  />
                </label>
                <label className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
                  <span>
                    <span className="block text-sm font-medium">Cashier Discounts</span>
                    <span className="block text-xs text-muted-foreground">
                      Cashiers can apply order and line discounts.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={form.allowCashierDiscounts ?? true}
                    onChange={(e) => setForm({ ...form, allowCashierDiscounts: e.target.checked })}
                  />
                </label>
                <label className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
                  <span>
                    <span className="block text-sm font-medium">Manager Approval for Refunds</span>
                    <span className="block text-xs text-muted-foreground">
                      Refunds will require elevated permission.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={form.requireManagerForRefunds}
                    onChange={(e) =>
                      setForm({ ...form, requireManagerForRefunds: e.target.checked })
                    }
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-card border border-border rounded-xl shadow-card">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Settings size={16} className="text-primary" />
                <span className="text-sm font-semibold">Branches</span>
              </div>
              <div className="p-5 grid grid-cols-1 gap-4">
                <TextListArea
                  label="Branches / Locations"
                  value={form.branches ?? []}
                  onChange={(branches) => setForm({ ...form, branches })}
                />
                <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Enter one branch or location per line.
                </p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl shadow-card">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Palette size={16} className="text-primary" />
                <span className="text-sm font-semibold">Appearance & Connection Recovery</span>
              </div>
              <div className="p-5 grid grid-cols-1 gap-4">
                <div className="grid grid-cols-[80px_1fr] gap-3">
                  <input
                    type="color"
                    value={form.themeColor ?? '#19b8a6'}
                    onChange={(e) => setForm({ ...form, themeColor: e.target.value })}
                    className="h-10 w-full rounded-lg border border-border bg-background p-1"
                  />
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Theme Hex Code</span>
                    <input
                      value={form.themeColor ?? '#19b8a6'}
                      onChange={(e) => setForm({ ...form, themeColor: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background font-tabular"
                      placeholder="#19b8a6"
                    />
                  </label>
                </div>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">Appearance</span>
                  <NiceSelect
                    value={form.themeMode ?? 'light'}
                    onChange={(themeMode) =>
                      setForm({
                        ...form,
                        themeMode: themeMode as BusinessSettings['themeMode'],
                      })
                    }
                    options={[
                      { value: 'light', label: 'Light mode' },
                      { value: 'dark', label: 'Dark mode' },
                    ]}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">Font</span>
                  <NiceSelect
                    value={form.fontFamily ?? 'Inter'}
                    onChange={(fontFamily) => setForm({ ...form, fontFamily })}
                    options={[
                      'Inter',
                      'Roboto',
                      'Open Sans',
                      'Lato',
                      'Montserrat',
                      'Poppins',
                      'Nunito',
                      'Source Sans 3',
                      'Work Sans',
                      'System UI',
                    ].map((font) => ({ value: font, label: font }))}
                  />
                </label>
                <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Wifi size={15} className="text-primary" />
                    <span className="text-sm font-semibold">Updates Waiting</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {pendingSyncCount} update{pendingSyncCount === 1 ? '' : 's'} waiting to be sent.
                    Updates are sent automatically when the service is available.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="px-5 py-4 border-t border-border flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {pendingSyncCount} update{pendingSyncCount === 1 ? '' : 's'} waiting to be sent.
            </p>
            <button
              onClick={save}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold"
            >
              <Save size={14} />
              {saved ? 'Saved' : 'Save Settings'}
            </button>
          </div>
        </div>
      </PermissionGate>
    </AppLayout>
  );
}

function AccountSecurityCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to change password');
      setMessage(payload?.message ?? 'Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to change password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 pt-6">
      <div className="rounded-xl border border-border bg-card shadow-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <KeyRound size={16} className="text-primary" />
          <span className="text-sm font-semibold">Account & Security</span>
        </div>
        <div className="p-5">
          <form onSubmit={changePassword} className="space-y-3">
            <div>
              <p className="text-sm font-semibold">Change Password</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Changing your password signs your account out on other devices.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Current Password</span>
                <input
                  required
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">New Password</span>
                <input
                  required
                  minLength={10}
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Confirm New Password</span>
                <input
                  required
                  minLength={10}
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2"
                />
              </label>
            </div>
            <p className="text-[11px] leading-5 text-muted-foreground">
              Use at least 10 characters with uppercase and lowercase letters, a number, and a
              symbol.
            </p>
            {error && <p className="text-sm text-danger">{error}</p>}
            {message && <p className="text-sm text-success">{message}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting && <Loader2 size={15} className="animate-spin" />}
              Change Password
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function TextListArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <textarea
        value={value.join('\n')}
        onChange={(e) =>
          onChange(
            e.target.value
              .split('\n')
              .map((item) => item.trim())
              .filter(Boolean)
          )
        }
        className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}
