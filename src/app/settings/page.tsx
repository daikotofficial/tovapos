'use client';

import React, { useEffect, useState } from 'react';
import { Bell, Building2, Palette, Receipt, Save, Settings, ShieldCheck, Wifi } from 'lucide-react';
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
      subtitle="Configure business identity, taxes, receipt, and offline behavior"
    >
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
                    Receives products expiring within the configured alert window.
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
                  Product categories and expense heads now have dedicated sidebar pages so daily
                  setup data is managed where teams naturally use it.
                </p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl shadow-card">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Palette size={16} className="text-primary" />
                <span className="text-sm font-semibold">Theme & Offline Sync</span>
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
                    <span className="text-sm font-semibold">Offline Sync Queue</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {pendingSyncCount} local change{pendingSyncCount === 1 ? '' : 's'} waiting to
                    sync. Online changes are marked synced automatically in this local-first build.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="px-5 py-4 border-t border-border flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {pendingSyncCount} local change{pendingSyncCount === 1 ? '' : 's'} waiting to sync.
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
