'use client';

import React, { useEffect, useState } from 'react';
import {
  Bell,
  Building2,
  CheckCircle2,
  CreditCard,
  KeyRound,
  Loader2,
  Palette,
  Receipt,
  Save,
  Settings,
  ShieldCheck,
  Wifi,
  Trash2,
  Plus,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import NiceSelect from '@/components/ui/NiceSelect';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import { BusinessSettings } from '@/lib/pos/types';
import AppImage from '@/components/ui/AppImage';
import { toast } from 'sonner';
import {
  getProductUsage,
  subscriptionPlans,
  type SubscriptionPlanId,
} from '@/lib/pos/subscription';

export default function SettingsPage() {
  const { settings, updateSettings, pendingSyncCount, inventory, isHydrated } = usePosStore();
  const [form, setForm] = useState<BusinessSettings>(settings);
  const [saved, setSaved] = useState(false);
  const productUsage = getProductUsage(settings.subscriptionPlanId, inventory.length);
  const planOptions = Object.values(subscriptionPlans);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  useEffect(() => {
    if (!isHydrated) return;
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const nextTheme = form.themeMode ?? 'light';
    root.dataset.theme = nextTheme;
    window.localStorage.setItem('tovapos.themeMode', nextTheme);
    if (form.themeColor) {
      root.style.setProperty('--primary', form.themeColor);
      root.style.setProperty('--ring', form.themeColor);
    }
    if (form.fontFamily) {
      root.style.setProperty(
        '--font-sans',
        `${form.fontFamily}, ui-sans-serif, system-ui, sans-serif`
      );
    }
  }, [form.fontFamily, form.themeColor, form.themeMode, isHydrated]);

  const save = async () => {
    try {
      await updateSettings(form);
      setSaved(true);
      toast.success('Settings saved successfully.');
      window.setTimeout(() => setSaved(false), 1800);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save settings.');
    }
  };

  const changePlan = async (subscriptionPlanId: SubscriptionPlanId) => {
    const nextSettings: BusinessSettings = {
      ...form,
      subscriptionPlanId,
      subscriptionStatus: 'active',
    };
    setForm(nextSettings);
    try {
      await updateSettings(nextSettings);
      setSaved(true);
      toast.success('Plan updated successfully.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update plan.');
    }
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <AppLayout
      title="Settings"
      subtitle="Manage your account, business details, receipts, and sales preferences"
    >
      <AccountSecurityCard />
      <PermissionGate permission="settings">
        <div className="mx-auto max-w-6xl space-y-4 px-3 py-4 sm:space-y-5 sm:p-6">
          <nav className="sticky top-0 z-10 flex gap-2 overflow-x-auto rounded-xl border border-border bg-card/95 p-2 shadow-card backdrop-blur scrollbar-thin">
            {[
              ['subscription', 'Plan'],
              ['loyalty', 'Loyalty'],
              ['business-profile', 'Business'],
              ['tax-receipts', 'Tax & Receipts'],
              ['tax-types', 'Tax Types'],
              ['alerts', 'Alerts'],
              ['pos-rules', 'POS Rules'],
              ['branches', 'Branches'],
              ['appearance', 'Appearance'],
            ].map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              >
                {label}
              </a>
            ))}
          </nav>
          <div
            id="subscription"
            className="scroll-mt-16 bg-card border border-border rounded-xl shadow-card"
          >
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <CreditCard size={16} className="text-primary" />
              <span className="text-sm font-semibold">Subscription & Plan</span>
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
            <div className="grid grid-cols-1 gap-3 border-t border-border p-5 lg:grid-cols-3">
              {planOptions.map((plan) => {
                const active = (form.subscriptionPlanId ?? 'starter') === plan.id;
                return (
                  <div
                    key={plan.id}
                    className={`flex flex-col rounded-xl border p-4 ${
                      active ? 'border-primary bg-primary/5' : 'border-border bg-background'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-black">{plan.name}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {plan.description}
                        </p>
                      </div>
                      {active && <CheckCircle2 size={18} className="shrink-0 text-primary" />}
                    </div>
                    <p className="mt-3 text-sm font-bold">
                      {plan.monthlyPrice
                        ? `NGN ${plan.monthlyPrice.toLocaleString()} / month`
                        : 'Custom'}
                      <span className="ml-2 rounded-full bg-success/10 px-2 py-1 text-[10px] font-black uppercase text-success">
                        Free now
                      </span>
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Product limit:{' '}
                      {plan.productLimit ? plan.productLimit.toLocaleString() : 'Custom'}
                    </p>
                    <button
                      type="button"
                      onClick={() => void changePlan(plan.id)}
                      disabled={active}
                      className="mt-4 rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-60"
                    >
                      {active ? 'Current plan' : `Switch to ${plan.name}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            id="loyalty"
            className="scroll-mt-16 bg-card border border-border rounded-xl shadow-card"
          >
            <div className="px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold">Customer Loyalty</span>
              <p className="mt-1 text-xs text-muted-foreground">
                Configure monetary loyalty credit earned from paid purchases and when it can be
                used.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
              <label className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-3 md:col-span-2">
                <span>
                  <span className="block text-sm font-medium">Enable customer loyalty</span>
                  <span className="block text-xs text-muted-foreground">
                    Credit sales do not earn or redeem loyalty credit.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={form.loyaltyEnabled ?? false}
                  onChange={(event) => setForm({ ...form, loyaltyEnabled: event.target.checked })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Loyalty credit earned (%)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.loyaltyEarnPercent ?? 1}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      loyaltyEarnPercent: Math.max(0, Number(event.target.value) || 0),
                    })
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2"
                />
                <span className="text-[11px] text-muted-foreground">
                  Example: 1% of NGN 100,000 adds NGN 1,000 to the customer&apos;s loyalty credit.
                </span>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">
                  Minimum loyalty credit before use
                </span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.loyaltyRedemptionThreshold ?? 100}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      loyaltyRedemptionThreshold: Math.max(0, Number(event.target.value) || 0),
                    })
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2"
                />
                <span className="text-[11px] text-muted-foreground">
                  The credit stays on the customer account until it reaches this amount.
                </span>
              </label>
            </div>
          </div>

          <div
            id="business-profile"
            className="scroll-mt-16 bg-card border border-border rounded-xl shadow-card"
          >
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
                <span className="text-xs text-muted-foreground">Company logo</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) {
                      toast.error('Logo must be 2 MB or smaller.');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => setForm({ ...form, logoUrl: String(reader.result) });
                    reader.readAsDataURL(file);
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                {form.logoUrl && (
                  <AppImage
                    src={form.logoUrl}
                    alt="Company logo preview"
                    width={72}
                    height={72}
                    className="mt-2 h-16 w-16 rounded object-contain"
                    unoptimized
                  />
                )}
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

          <div
            id="tax-receipts"
            className="scroll-mt-16 bg-card border border-border rounded-xl shadow-card"
          >
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
                    { value: 'exclusive', label: 'VAT exempt (no VAT)' },
                    { value: 'inclusive', label: 'VAT applies (add separately)' },
                  ]}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Tax Name</span>
                <input
                  value={form.taxName ?? form.taxNumber ?? ''}
                  onChange={(e) => setForm({ ...form, taxName: e.target.value })}
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
              <div className="grid gap-3 border-t border-border pt-4 md:col-span-2 md:grid-cols-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={form.receiptShowLogo ?? true}
                    onChange={(e) => setForm({ ...form, receiptShowLogo: e.target.checked })}
                  />
                  Show logo on receipt
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={form.receiptShowBusinessDetails ?? true}
                    onChange={(e) =>
                      setForm({ ...form, receiptShowBusinessDetails: e.target.checked })
                    }
                  />
                  Show business contact
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={form.receiptShowCustomer ?? true}
                    onChange={(e) => setForm({ ...form, receiptShowCustomer: e.target.checked })}
                  />
                  Show customer details
                </label>
              </div>
            </div>
          </div>

          <div
            id="tax-types"
            className="scroll-mt-16 bg-card border border-border rounded-xl shadow-card"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-semibold">VAT / Tax types</span>
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    taxRates: [
                      ...(form.taxRates ?? []),
                      {
                        id: `tax-${Date.now()}`,
                        name: 'New tax',
                        rate: 0,
                        mode: 'exclusive',
                        active: true,
                      },
                    ],
                  })
                }
                className="inline-flex items-center gap-1 rounded-lg bg-secondary px-3 py-2 text-xs font-semibold"
              >
                <Plus size={13} /> Add tax
              </button>
            </div>
            <div className="space-y-2 p-5">
              {(form.taxRates ?? []).map((tax, index) => (
                <div
                  key={tax.id}
                  className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_120px_160px_auto]"
                >
                  <input
                    value={tax.name}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        taxRates: form.taxRates!.map((item, i) =>
                          i === index ? { ...item, name: e.target.value } : item
                        ),
                      })
                    }
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    placeholder="VAT"
                  />
                  <input
                    type="number"
                    min="0"
                    value={tax.rate}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        taxRates: form.taxRates!.map((item, i) =>
                          i === index ? { ...item, rate: Number(e.target.value) } : item
                        ),
                      })
                    }
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                  <NiceSelect
                    value={tax.mode}
                    onChange={(mode) =>
                      setForm({
                        ...form,
                        taxRates: form.taxRates!.map((item, i) =>
                          i === index ? { ...item, mode: mode as 'inclusive' | 'exclusive' } : item
                        ),
                      })
                    }
                    options={[
                      { value: 'exclusive', label: 'VAT exempt (no VAT)' },
                      { value: 'inclusive', label: 'VAT applies (add separately)' },
                    ]}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setForm({ ...form, taxRates: form.taxRates!.filter((_, i) => i !== index) })
                    }
                    className="text-danger"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div
              id="alerts"
              className="scroll-mt-16 bg-card border border-border rounded-xl shadow-card"
            >
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

            <div
              id="pos-rules"
              className="scroll-mt-16 bg-card border border-border rounded-xl shadow-card"
            >
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
            <div
              id="branches"
              className="scroll-mt-16 bg-card border border-border rounded-xl shadow-card"
            >
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

            <div
              id="appearance"
              className="scroll-mt-16 bg-card border border-border rounded-xl shadow-card"
            >
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
  const { currentUser, upsertUser } = usePosStore();
  const [profileName, setProfileName] = useState(currentUser?.name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setProfileName(currentUser?.name ?? '');
  }, [currentUser?.name]);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = profileName.trim();
    if (!currentUser || !name) {
      toast.error('Your display name is required.');
      return;
    }
    try {
      await upsertUser({ ...currentUser, name });
      toast.success('Profile updated successfully.');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Unable to update profile.');
    }
  };

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
          <form onSubmit={saveProfile} className="mb-6 space-y-3 border-b border-border pb-6">
            <div>
              <p className="text-sm font-semibold">Profile</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Update the name shown beside Logout and throughout the app.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1 space-y-1">
                <span className="text-xs text-muted-foreground">Your display name</span>
                <input
                  value={profileName}
                  onChange={(event) => setProfileName(event.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2"
                  autoComplete="name"
                />
              </label>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white"
              >
                Save Profile
              </button>
            </div>
          </form>
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
