'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, Printer, RefreshCw, ShoppingBag } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import NiceSelect from '@/components/ui/NiceSelect';
import ReceiptModal from '@/app/components/ReceiptModal';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import type { SaleTransaction } from '@/lib/pos/types';
import { formatMoney } from '@/lib/pos/money';
import { toast } from 'sonner';

const inputClass = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25';
type SortMode = 'newest' | 'oldest' | 'highest' | 'lowest';
const dateText = (value: string) => new Date(value).toLocaleDateString('en-NG', { dateStyle: 'medium' });
const timeText = (value: string) => new Date(value).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });

export default function MySalesHistoryPage() {
  const { settings } = usePosStore();
  const [sales, setSales] = useState<SaleTransaction[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<SortMode>('newest');
  const [selectedSale, setSelectedSale] = useState<SaleTransaction | null>(null);
  const [loading, setLoading] = useState(false);

  const loadSales = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const response = await fetch(`/api/my-sales-history?${params}`, { cache: 'no-store' });
      const payload = (await response.json()) as { rows?: SaleTransaction[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load your sales history');
      setSales(payload.rows ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load your sales history');
    } finally { setLoading(false); }
  };
  useEffect(() => { void loadSales(); }, [from, to]);

  const visibleSales = useMemo(() => [...sales].sort((a, b) => {
    if (sort === 'highest') return b.grandTotal - a.grandTotal;
    if (sort === 'lowest') return a.grandTotal - b.grandTotal;
    const difference = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    return sort === 'oldest' ? difference : -difference;
  }), [sales, sort]);
  const total = visibleSales.reduce((sum, sale) => sum + Number(sale.grandTotal || 0), 0);

  return <AppLayout title="My Sales History" subtitle="Review and reprint the sales recorded under your account">
    <PermissionGate permission="checkout"><div className="space-y-4 p-3 sm:p-6">
      <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">POS / Sales</p><h2 className="mt-1 text-lg font-bold">My Sales History</h2><p className="mt-1 text-sm text-muted-foreground">Only transactions recorded by your signed-in account are shown.</p></div><button type="button" onClick={() => void loadSales()} disabled={loading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-60"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh</button></div>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_15rem_auto] lg:items-end">
          <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">From date</span><span className="relative block"><CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={`${inputClass} pl-9`} /></span></label>
          <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">To date</span><span className="relative block"><CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={`${inputClass} pl-9`} /></span></label>
          <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Sort history</span><NiceSelect value={sort} onChange={setSort} options={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'highest', label: 'Highest amount' }, { value: 'lowest', label: 'Lowest amount' }]} /></label>
          <button type="button" onClick={() => { setFrom(''); setTo(''); setSort('newest'); }} className="h-10 rounded-lg border border-border px-4 text-sm font-semibold text-muted-foreground hover:bg-muted">Clear</button>
        </div>
      </section>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3"><div className="rounded-xl border border-border bg-card p-4 shadow-card"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Transactions</p><p className="mt-1 text-2xl font-bold tabular-nums">{visibleSales.length}</p></div><div className="rounded-xl border border-border bg-card p-4 shadow-card"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Sales value</p><p className="mt-1 text-2xl font-bold tabular-nums">{formatMoney(total, settings.currency)}</p></div><div className="rounded-xl border border-border bg-card p-4 shadow-card"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Period</p><p className="mt-1 truncate text-sm font-bold">{from || to ? `${from || 'Beginning'} to ${to || 'Today'}` : 'All available history'}</p></div></section>
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-card"><div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5"><div className="flex items-center gap-2"><ShoppingBag size={17} className="text-primary" /><h2 className="text-sm font-semibold">Your transactions</h2></div><span className="text-xs text-muted-foreground">{visibleSales.length} shown</span></div>
        {loading ? <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><RefreshCw size={16} className="animate-spin" /> Loading your sales...</div> : visibleSales.length === 0 ? <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">No sales found for this period.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-border bg-muted/20 text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-3">Transaction</th><th className="px-4 py-3">Date / time</th><th className="px-4 py-3">Items</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Receipt</th></tr></thead><tbody className="divide-y divide-border">{visibleSales.map((sale) => <tr key={sale.id} className="hover:bg-muted/20"><td className="px-4 py-3"><span className="font-mono text-xs font-semibold">{sale.transactionId}</span><span className={`mt-1 block text-[10px] font-semibold uppercase ${sale.status === 'completed' ? 'text-success' : sale.status === 'refunded' ? 'text-warning' : 'text-danger'}`}>{sale.status}</span></td><td className="px-4 py-3"><span className="flex items-center gap-1.5"><CalendarDays size={13} className="text-muted-foreground" />{dateText(sale.timestamp)}</span><span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 size={13} />{timeText(sale.timestamp)}</span></td><td className="px-4 py-3 tabular-nums">{sale.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)}</td><td className="px-4 py-3 capitalize">{sale.paymentMethod.replace('-', ' ')}</td><td className="px-4 py-3 text-right font-bold tabular-nums">{formatMoney(sale.grandTotal, settings.currency)}</td><td className="px-4 py-3 text-right"><button type="button" onClick={() => setSelectedSale(sale)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary/90"><Printer size={13} /> Print</button></td></tr>)}</tbody></table></div>}
      </section>
    </div></PermissionGate>
    {selectedSale && <ReceiptModal open onClose={() => setSelectedSale(null)} sale={selectedSale} currency={settings.currency} businessName={settings.businessName} businessLogo={settings.logoUrl} businessPhone={settings.phone} businessEmail={settings.email} businessAddress={settings.address} showLogo={settings.receiptShowLogo} showBusinessDetails={settings.receiptShowBusinessDetails} showCustomer={settings.receiptShowCustomer} receiptFooter={settings.receiptFooter} taxLabel={`${settings.taxRate || 0}%`} />}
  </AppLayout>;
}
