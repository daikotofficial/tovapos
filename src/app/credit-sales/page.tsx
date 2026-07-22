'use client';

import React, { useMemo, useState } from 'react';
import { CheckCircle2, CreditCard, Landmark, Search, Smartphone, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import { formatMoney } from '@/lib/pos/money';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import type { CreditPaymentMethod, SaleTransaction } from '@/lib/pos/types';
import { useRowsPerPage } from '@/lib/pos/useRowsPerPage';
import ListPagination from '@/components/ui/ListPagination';

const paymentMethods: { id: CreditPaymentMethod; label: string; icon: React.ElementType }[] = [
  { id: 'cash', label: 'Cash', icon: Wallet },
  { id: 'card', label: 'Card', icon: CreditCard },
  { id: 'mobile', label: 'Mobile', icon: Smartphone },
  { id: 'bank-transfer', label: 'Transfer', icon: Landmark },
  { id: 'split', label: 'Split', icon: CreditCard },
];

function getOutstanding(sale: SaleTransaction): number {
  return Number(sale.amountDue ?? (sale.paymentMethod === 'credit' ? sale.grandTotal : 0));
}

function getPaid(sale: SaleTransaction): number {
  return Number(sale.amountPaid ?? 0);
}

function getPaymentStatus(sale: SaleTransaction): string {
  const due = getOutstanding(sale);
  if (due <= 0) return 'Paid';
  return getPaid(sale) > 0 ? 'Partial' : 'Unpaid';
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to record payment';
}

export default function CreditSalesPage() {
  const { sales, settings, currentUser, reconcileCreditSale, pendingSyncCount } = usePosStore();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'open' | 'all' | 'paid'>('open');
  const [selectedId, setSelectedId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<CreditPaymentMethod>('cash');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [rowsPerPage] = useRowsPerPage();
  const [page, setPage] = useState(1);

  const creditSales = useMemo(
    () =>
      sales
        .filter((sale) => sale.status === 'completed' && sale.paymentMethod === 'credit')
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [sales]
  );
  const openTotal = creditSales.reduce((sum, sale) => sum + getOutstanding(sale), 0);
  const paidTotal = creditSales.reduce((sum, sale) => sum + getPaid(sale), 0);
  const selectedSale =
    creditSales.find((sale) => sale.id === selectedId) ??
    creditSales.find((sale) => getOutstanding(sale) > 0) ??
    creditSales[0];

  const filteredSales = creditSales.filter((sale) => {
    const due = getOutstanding(sale);
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'open' && due > 0) ||
      (statusFilter === 'paid' && due <= 0);
    const haystack =
      `${sale.transactionId} ${sale.customerName ?? ''} ${sale.cashier}`.toLowerCase();
    return matchesStatus && haystack.includes(query.trim().toLowerCase());
  });
  const totalPages = Math.max(1, Math.ceil(filteredSales.length / rowsPerPage));
  const visibleSales = filteredSales.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  React.useEffect(() => setPage(1), [query, rowsPerPage, statusFilter, filteredSales.length]);

  const fillFullAmount = () => {
    if (!selectedSale) return;
    setAmount(getOutstanding(selectedSale).toFixed(2));
  };

  const recordPayment = async () => {
    if (!selectedSale) return;
    const paymentAmount = Number(amount);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      toast.error('Enter a payment amount greater than zero.');
      return;
    }
    if (paymentAmount > getOutstanding(selectedSale)) {
      toast.error('Payment cannot exceed the outstanding credit balance.');
      return;
    }

    setIsSaving(true);
    try {
      const updated = await reconcileCreditSale(selectedSale.id, {
        amount: paymentAmount,
        method,
        notes,
        recordedBy: currentUser?.name ?? 'Unknown user',
      });
      setSelectedId(updated.id);
      setAmount('');
      setNotes('');
      toast.success(
        `${formatMoney(paymentAmount, settings.currency)} recorded. Remaining credit: ${formatMoney(
          getOutstanding(updated),
          settings.currency
        )}.`
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppLayout title="Credit Sales" subtitle="Receive full or partial payments for customer credit">
      <PermissionGate permission="credit-sales">
        <div className="mx-auto max-w-screen-2xl space-y-5 p-4 sm:p-6">
          {pendingSyncCount > 0 && (
            <section className="rounded-lg border border-warning/25 bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
              {pendingSyncCount} update{pendingSyncCount === 1 ? '' : 's'} waiting to be sent.
            </section>
          )}

          <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <SummaryCard
              label="Outstanding Credit"
              value={formatMoney(openTotal, settings.currency)}
            />
            <SummaryCard
              label="Credit Collected"
              value={formatMoney(paidTotal, settings.currency)}
            />
            <SummaryCard label="Credit Sales" value={creditSales.length.toLocaleString()} />
          </section>

          <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_420px]">
            <div className="overflow-hidden rounded-xl border border-border bg-white shadow-card">
              <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-bold">Customer credit ledger</p>
                  <p className="text-xs text-muted-foreground">
                    Select a credit sale to receive payment against its outstanding balance.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative">
                    <Search
                      size={15}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search receipt or customer"
                      className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 sm:w-64"
                    />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                    className="h-10 rounded-md border border-border bg-background px-3 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="open">Open credit</option>
                    <option value="all">All credit</option>
                    <option value="paid">Paid credit</option>
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto overscroll-x-contain scrollbar-thin">
                <table className="w-full min-w-[900px]">
                  <thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Receipt</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">Paid</th>
                      <th className="px-4 py-3">Balance</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredSales.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-12 text-center text-sm text-muted-foreground"
                        >
                          No credit sales match this view.
                        </td>
                      </tr>
                    ) : (
                      visibleSales.map((sale) => {
                        const active = selectedSale?.id === sale.id;
                        return (
                          <tr
                            key={sale.id}
                            onClick={() => {
                              setSelectedId(sale.id);
                              setAmount('');
                              setNotes('');
                            }}
                            className={`cursor-pointer transition-colors ${
                              active ? 'bg-primary/10' : 'hover:bg-muted/30'
                            }`}
                          >
                            <td className="px-4 py-3 text-sm font-semibold">
                              {sale.transactionId}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {new Date(sale.timestamp).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {sale.customerName ?? 'Walk-in Customer'}
                            </td>
                            <td className="px-4 py-3 text-sm font-tabular text-muted-foreground">
                              {formatMoney(sale.grandTotal, settings.currency)}
                            </td>
                            <td className="px-4 py-3 text-sm font-tabular text-muted-foreground">
                              {formatMoney(getPaid(sale), settings.currency)}
                            </td>
                            <td className="px-4 py-3 text-sm font-bold font-tabular text-warning">
                              {formatMoney(getOutstanding(sale), settings.currency)}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {getPaymentStatus(sale)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <ListPagination
                page={Math.min(page, totalPages)}
                totalItems={filteredSales.length}
                rowsPerPage={rowsPerPage}
                onPageChange={setPage}
              />
            </div>

            <aside className="rounded-xl border border-border bg-white p-4 shadow-card">
              {selectedSale ? (
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-bold">Receive credit payment</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedSale.transactionId} -{' '}
                      {selectedSale.customerName ?? 'Walk-in Customer'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <BalanceTile
                      label="Total"
                      value={formatMoney(selectedSale.grandTotal, settings.currency)}
                    />
                    <BalanceTile
                      label="Paid"
                      value={formatMoney(getPaid(selectedSale), settings.currency)}
                    />
                    <BalanceTile
                      label="Balance"
                      value={formatMoney(getOutstanding(selectedSale), settings.currency)}
                      emphasis
                    />
                    <BalanceTile label="Status" value={getPaymentStatus(selectedSale)} />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-muted-foreground">
                      Amount
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        min={0}
                        max={getOutstanding(selectedSale)}
                        step={0.01}
                        disabled={getOutstanding(selectedSale) <= 0}
                        className="h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm font-semibold font-tabular outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-muted"
                      />
                      <button
                        type="button"
                        onClick={fillFullAmount}
                        disabled={getOutstanding(selectedSale) <= 0}
                        className="h-11 rounded-md border border-border px-3 text-sm font-bold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:text-muted-foreground"
                      >
                        Full
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-muted-foreground">
                      Method
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {paymentMethods.map(({ id, label, icon: Icon }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setMethod(id)}
                          className={`flex h-10 items-center justify-center gap-2 rounded-md border text-sm font-semibold transition-colors ${
                            method === id
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`}
                        >
                          <Icon size={15} />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-muted-foreground">
                      Note
                    </label>
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      rows={3}
                      placeholder="Optional payment note"
                      className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={recordPayment}
                    disabled={isSaving || getOutstanding(selectedSale) <= 0}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                  >
                    <CheckCircle2 size={17} />
                    {isSaving ? 'Recording...' : 'Record Payment'}
                  </button>

                  <div className="border-t border-border pt-4">
                    <p className="text-xs font-bold uppercase text-muted-foreground">
                      Payment history
                    </p>
                    <div className="mt-3 space-y-2">
                      {(selectedSale.creditPayments ?? []).length === 0 ? (
                        <p className="rounded-md bg-muted/50 px-3 py-3 text-sm text-muted-foreground">
                          No payment has been recorded for this credit sale.
                        </p>
                      ) : (
                        [...(selectedSale.creditPayments ?? [])].reverse().map((payment) => (
                          <div
                            key={payment.id}
                            className="rounded-md border border-border px-3 py-2"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-bold font-tabular">
                                {formatMoney(payment.amount, settings.currency)}
                              </span>
                              <span className="text-xs capitalize text-muted-foreground">
                                {payment.method.replace('-', ' ')}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {new Date(payment.recordedAt).toLocaleString()} by{' '}
                              {payment.recordedBy}
                            </p>
                            {payment.notes && (
                              <p className="mt-1 text-xs text-muted-foreground">{payment.notes}</p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No credit sale is available for reconciliation.
                </p>
              )}
            </aside>
          </section>
        </div>
      </PermissionGate>
    </AppLayout>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-border bg-white p-4 shadow-card">
      <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold font-tabular text-foreground">{value}</p>
    </article>
  );
}

function BalanceTile({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className={`rounded-md px-3 py-2 ${emphasis ? 'bg-warning/10' : 'bg-muted/50'}`}>
      <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-sm font-bold font-tabular ${emphasis ? 'text-warning' : 'text-foreground'}`}
      >
        {value}
      </p>
    </div>
  );
}
