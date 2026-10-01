'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, Printer, RefreshCw, ShoppingBag } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import NiceSelect from '@/components/ui/NiceSelect';
import DatePicker from '@/components/ui/DatePicker';
import ReceiptModal from '@/app/components/ReceiptModal';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import type { SaleTransaction } from '@/lib/pos/types';
import { formatMoney } from '@/lib/pos/money';
import { toast } from 'sonner';

const inputClass = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25';
type SortMode = 'newest' | 'oldest' | 'highest' | 'lowest';
type SalesSummary = { total: number; cash: number; card: number; transfer: number; other: number };

const emptySummary: SalesSummary = { total: 0, cash: 0, card: 0, transfer: 0, other: 0 };
const dateText = (value: string) => new Date(value).toLocaleDateString('en-NG', { dateStyle: 'medium' });
const timeText = (value: string) => new Date(value).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
const cents = (value: unknown) => Math.round((Number(value) || 0) * 100);
const amount = (value: number) => value / 100;

function summarizeSales(rows: SaleTransaction[]): SalesSummary {
  const summary = { ...emptySummary };
  for (const sale of rows) {
    const saleTotal = cents(sale.grandTotal);
    summary.total += saleTotal;
    if (sale.paymentMethod === 'split' && sale.paymentBreakdown) {
      const cash = cents(sale.paymentBreakdown.cash);
      const card = cents(sale.paymentBreakdown.card);
      const transfer = cents(sale.paymentBreakdown['bank-transfer']);
      summary.cash += cash;
      summary.card += card;
      summary.transfer += transfer;
      summary.other += saleTotal - cash - card - transfer;
    } else if (sale.paymentMethod === 'cash') summary.cash += saleTotal;
    else if (sale.paymentMethod === 'card') summary.card += saleTotal;
    else if (sale.paymentMethod === 'bank-transfer') summary.transfer += saleTotal;
    else summary.other += saleTotal;
  }
  return {
    total: amount(summary.total),
    cash: amount(summary.cash),
    card: amount(summary.card),
    transfer: amount(summary.transfer),
    other: amount(summary.other),
  };
}

export default function MySalesHistoryPage() {
  const { settings } = usePosStore();
  const [sales, setSales] = useState<SaleTransaction[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [sort, setSort] = useState<SortMode>('newest');
  const [selectedSale, setSelectedSale] = useState<SaleTransaction | null>(null);
  const [summary, setSummary] = useState<SalesSummary>(emptySummary);
  const [loading, setLoading] = useState(false);

  const loadSales = useCallback(async (start: string, end: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (start) params.set('from', start);
      if (end) params.set('to', end);
      const response = await fetch(`/api/my-sales-history?${params}`, { cache: 'no-store' });
      const payload = (await response.json()) as {
        rows?: SaleTransaction[];
        summary?: SalesSummary;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load your sales history');
      setSales(payload.rows ?? []);
      setSummary(payload.summary ?? summarizeSales(payload.rows ?? []));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load your sales history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSales(from, to);
  }, [from, loadSales, to]);

  const visibleSales = useMemo(() => [...sales].sort((a, b) => {
    if (sort === 'highest') return b.grandTotal - a.grandTotal;
    if (sort === 'lowest') return a.grandTotal - b.grandTotal;
    const difference = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    return sort === 'oldest' ? difference : -difference;
  }), [sales, sort]);

  const draftRangeInvalid = Boolean(draftFrom && draftTo && draftFrom > draftTo);
  const draftHasChanges = draftFrom !== from || draftTo !== to;
  const clearPeriod = () => {
    setDraftFrom('');
    setDraftTo('');
    setFrom('');
    setTo('');
  };
  const applyPeriod = () => {
    if (draftRangeInvalid) {
      toast.error('The start date cannot be after the end date.');
      return;
    }
    setFrom(draftFrom);
    setTo(draftTo);
  };
  const cards = [
    { label: 'Total sales', value: summary.total, className: 'text-foreground' },
    { label: 'Cash sales', value: summary.cash, className: 'text-emerald-700' },
    { label: 'Card sales', value: summary.card, className: 'text-blue-700' },
    { label: 'Transfer sales', value: summary.transfer, className: 'text-violet-700' },
    { label: 'Other / mobile / credit', value: summary.other, className: 'text-amber-700' },
  ];

  return <AppLayout title="My Sales History" subtitle="Review and reprint the sales recorded under your account">
    <PermissionGate permission="checkout"><div className="space-y-4 p-3 sm:p-6">
      <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">POS / Sales</p><h2 className="mt-1 text-lg font-bold">My Sales History</h2><p className="mt-1 text-sm text-muted-foreground">Only transactions recorded by your signed-in account are shown.</p></div><button type="button" onClick={() => void loadSales(from, to)} disabled={loading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-60"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh</button></div>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_15rem_auto_auto] lg:items-end">
          <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">From date</span><DatePicker value={draftFrom} onChange={setDraftFrom} placeholder="From date" /></label>
          <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">To date</span><DatePicker value={draftTo} onChange={setDraftTo} placeholder="To date" /></label>
          <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Sort history</span><NiceSelect value={sort} onChange={setSort} options={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'highest', label: 'Highest amount' }, { value: 'lowest', label: 'Lowest amount' }]} /></label>
          <button type="button" onClick={applyPeriod} disabled={!draftHasChanges || draftRangeInvalid || loading} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">Apply period</button>
          <button type="button" onClick={clearPeriod} disabled={(!from && !to && !draftFrom && !draftTo) || loading} className="h-10 rounded-lg border border-border px-4 text-sm font-semibold text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">Clear</button>
        </div>
        {draftRangeInvalid && <p className="mt-2 text-xs font-medium text-danger">The start date cannot be after the end date.</p>}
        <p className="mt-3 text-xs text-muted-foreground">Choose a period, then select Apply period to refresh the totals and transaction list.</p>
      </section>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">{cards.map((card) => <div key={card.label} className="rounded-xl border border-border bg-card p-4 shadow-card"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{card.label}</p><p className={`mt-1 text-2xl font-bold tabular-nums ${card.className}`}>{formatMoney(card.value, settings.currency)}</p></div>)}</section>
      <section className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">Cash + card + transfer + other = <span className="font-bold text-foreground">{formatMoney(summary.cash + summary.card + summary.transfer + summary.other, settings.currency)}</span> · Total sales = <span className="font-bold text-foreground">{formatMoney(summary.total, settings.currency)}</span></section>
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-card"><div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5"><div className="flex items-center gap-2"><ShoppingBag size={17} className="text-primary" /><h2 className="text-sm font-semibold">Your transactions</h2></div><span className="text-xs text-muted-foreground">{visibleSales.length} shown</span></div>
        {loading ? <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><RefreshCw size={16} className="animate-spin" /> Loading your sales...</div> : visibleSales.length === 0 ? <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">No sales found for this period.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-border bg-muted/20 text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-3">Transaction</th><th className="px-4 py-3">Date / time</th><th className="px-4 py-3">Items</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Receipt</th></tr></thead><tbody className="divide-y divide-border">{visibleSales.map((sale) => <tr key={sale.id} className="hover:bg-muted/20"><td className="px-4 py-3"><span className="font-mono text-xs font-semibold">{sale.transactionId}</span><span className={`mt-1 block text-[10px] font-semibold uppercase ${sale.status === 'completed' ? 'text-success' : sale.status === 'refunded' ? 'text-warning' : 'text-danger'}`}>{sale.status}</span></td><td className="px-4 py-3"><span className="flex items-center gap-1.5"><CalendarDays size={13} className="text-muted-foreground" />{dateText(sale.timestamp)}</span><span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 size={13} />{timeText(sale.timestamp)}</span></td><td className="px-4 py-3 tabular-nums">{sale.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)}</td><td className="px-4 py-3 capitalize">{sale.paymentMethod.replace('-', ' ')}</td><td className="px-4 py-3 text-right font-bold tabular-nums">{formatMoney(sale.grandTotal, settings.currency)}</td><td className="px-4 py-3 text-right"><button type="button" onClick={() => setSelectedSale(sale)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary/90"><Printer size={13} /> Print</button></td></tr>)}</tbody></table></div>}
      </section>
    </div></PermissionGate>
    {selectedSale && <ReceiptModal open onClose={() => setSelectedSale(null)} sale={selectedSale} currency={settings.currency} businessName={settings.businessName} businessLogo={settings.logoUrl} businessPhone={settings.phone} businessEmail={settings.email} businessAddress={settings.address} showLogo={settings.receiptShowLogo} showBusinessDetails={settings.receiptShowBusinessDetails} showCustomer={settings.receiptShowCustomer} receiptFooter={settings.receiptFooter} taxLabel={`${settings.taxRate || 0}%`} />}
  </AppLayout>;
}
