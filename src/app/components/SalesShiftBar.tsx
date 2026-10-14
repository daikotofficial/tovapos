'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, LockKeyhole, LockOpen } from 'lucide-react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import NiceSelect from '@/components/ui/NiceSelect';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import { formatMoney } from '@/lib/pos/money';
import {
  businessDate,
  getOpenSalesShift,
  getSalesShift,
  saveSalesShift,
  type CashPayout,
  type LocalSalesShift,
} from '@/lib/pos/sales-shift';

function cashCollectedForSale(sale: {
  paymentMethod: string;
  grandTotal: number;
  amountPaid?: number;
  paymentBreakdown?: { cash?: number };
}): number {
  if (sale.paymentMethod === 'cash') return Number(sale.amountPaid ?? sale.grandTotal);
  if (sale.paymentMethod === 'split') return Number(sale.paymentBreakdown?.cash ?? 0);
  return 0;
}

type PayoutMethod = CashPayout['method'];

const payoutMethodOptions = [
  { value: 'cash' as const, label: 'Cash' },
  { value: 'bank-transfer' as const, label: 'Transfer' },
  { value: 'card' as const, label: 'Card' },
];

function parseAmount(value: string): number {
  return Number(value.replace(/,/g, ''));
}

function formatAmountInput(value: string): string {
  const raw = value.replace(/,/g, '').trim();
  if (!raw || raw === '.') return raw;
  const amount = Number(raw);
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat(undefined, {
    useGrouping: true,
    maximumFractionDigits: 2,
  }).format(amount);
}

function cleanAmountInput(value: string): string {
  return value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
}

export default function SalesShiftBar() {
  const { currentUser, sales, settings } = usePosStore();
  const [shift, setShift] = useState<LocalSalesShift | null>(null);
  const [mode, setMode] = useState<'open' | 'close' | null>(null);
  const [openingCash, setOpeningCash] = useState('');
  const [openingPurpose, setOpeningPurpose] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [cashPayouts, setCashPayouts] = useState<
    Array<{ purpose: string; amount: string; method: PayoutMethod }>
  >([{ purpose: '', amount: '', method: 'cash' }]);
  const [dontRemindToday, setDontRemindToday] = useState(false);
  const reminderKey = currentUser
    ? 'tovapos.sales-reminder.' +
      currentUser.id +
      '.' +
      businessDate() +
      '.' +
      (currentUser.lastLogin ?? currentUser.updatedAt ?? 'session')
    : '';

  const refresh = () => setShift(currentUser ? getSalesShift(currentUser.id) : null);
  const refreshAuthoritativeShift = async () => {
    if (!currentUser || process.env.NEXT_PUBLIC_STORAGE_DRIVER !== 'postgres') return;
    try {
      const response = await fetch('/api/commands/sales-shift?businessDate=' + businessDate(), {
        cache: 'no-store',
      });
      if (!response.ok) return;
      const serverShift = await response.json();
      if (serverShift) {
        saveSalesShift(serverShift as LocalSalesShift);
        setShift(serverShift as LocalSalesShift);
      }
    } catch {
      // The close action itself will require connectivity and revalidate on the server.
    }
  };
  useEffect(() => {
    if (!currentUser) return;
    const localShift = getSalesShift(currentUser.id);
    setShift(localShift);
    if (!localShift && !window.sessionStorage.getItem(reminderKey)) setMode('open');
    if (process.env.NEXT_PUBLIC_STORAGE_DRIVER === 'postgres') {
      void fetch('/api/commands/sales-shift?businessDate=' + businessDate(), { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((serverShift) => {
          if (serverShift) {
            saveSalesShift(serverShift as LocalSalesShift);
            setShift(serverShift as LocalSalesShift);
            setMode(null);
          } else {
            // The server is authoritative. Remove a stale browser shift after a reset
            // or after this user has no shift for the current business date.
            window.localStorage.removeItem(
              'tovapos.sales-shift.' + currentUser.id + '.' + businessDate()
            );
            setShift(null);
          }
        })
        .catch(() => undefined);
    }
    window.addEventListener('tovapos:sales-shift', refresh);
    return () => window.removeEventListener('tovapos:sales-shift', refresh);
  }, [currentUser?.id, currentUser?.lastLogin, currentUser?.updatedAt, reminderKey]);

  const todaySales = useMemo(
    () =>
      sales.filter(
        (sale) =>
          sale.status === 'completed' &&
          sale.cashierId === currentUser?.id &&
          (!shift || sale.shiftId === shift.id) &&
          businessDate(new Date(sale.timestamp)) === businessDate()
      ),
    [currentUser?.id, sales, shift]
  );
  const localTotalSales = todaySales.reduce((sum, sale) => sum + sale.grandTotal, 0);
  const localCashSales = todaySales.reduce((sum, sale) => sum + cashCollectedForSale(sale), 0);
  const totalSales = shift?.totalSales ?? localTotalSales;
  const cashSales = shift?.cashSales ?? localCashSales;
  const payoutTotalsByMethod = cashPayouts.reduce<Record<PayoutMethod, number>>(
    (totals, payout) => {
      const amount = parseAmount(payout.amount);
      if (Number.isFinite(amount) && amount > 0) totals[payout.method] += amount;
      return totals;
    },
    { cash: 0, card: 0, 'bank-transfer': 0 }
  );
  const payoutTotal = Object.values(payoutTotalsByMethod).reduce((sum, amount) => sum + amount, 0);
  const expectedCashBeforePayouts = (shift?.openingCash ?? 0) + cashSales;
  const paymentBreakdown = shift?.paymentBreakdown ?? {};
  const netCashSales = Math.max(
    0,
    Number(paymentBreakdown.cash ?? cashSales) - payoutTotalsByMethod.cash
  );
  const netCardPayments = Math.max(
    0,
    Number(paymentBreakdown.card ?? 0) - payoutTotalsByMethod.card
  );
  const netTransferPayments = Math.max(
    0,
    Number(paymentBreakdown['bank-transfer'] ?? 0) - payoutTotalsByMethod['bank-transfer']
  );
  const expectedCash = expectedCashBeforePayouts - payoutTotalsByMethod.cash;
  const nonCashSales = Math.max(0, totalSales - cashSales);
  const countedCash = Number(closingCash);
  const variance = Number.isFinite(countedCash) ? countedCash - expectedCash : 0;
  const balanced = closingCash !== '' && Math.abs(variance) < 0.005;

  const open = async () => {
    const amount = parseAmount(openingCash);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error('Enter the cash received at handover.');
      return;
    }
    if (!openingPurpose.trim()) {
      toast.error('Enter the purpose or handover note.');
      return;
    }
    if (!currentUser) return;
    if (getOpenSalesShift(currentUser.id)) {
      toast.error('Sales is already open for today.');
      return;
    }
    const nextShift: LocalSalesShift = {
      id: 'shift-' + currentUser.id + '-' + businessDate(),
      businessDate: businessDate(),
      userId: currentUser.id,
      userName: currentUser.name,
      openingCash: amount,
      openingPurpose: openingPurpose.trim(),
      openedAt: new Date().toISOString(),
      status: 'open',
    };
    if (process.env.NEXT_PUBLIC_STORAGE_DRIVER === 'postgres') {
      const response = await fetch('/api/commands/sales-shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'open', ...nextShift }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.error ?? 'Unable to open sales.');
        return;
      }
      saveSalesShift(payload as LocalSalesShift);
    } else saveSalesShift(nextShift);
    if (dontRemindToday && reminderKey) window.sessionStorage.setItem(reminderKey, '1');
    setOpeningCash('');
    setOpeningPurpose('');
    setDontRemindToday(false);
    setMode(null);
    toast.success('Sales opened. Cash handover recorded.');
  };

  const close = async () => {
    if (!shift || shift.status !== 'open' || !balanced) return;
    const normalizedPayouts: CashPayout[] = [];
    for (const payout of cashPayouts) {
      const purpose = payout.purpose.trim();
      const amount = parseAmount(payout.amount);
      if (!purpose && !payout.amount) continue;
      if (!purpose || !Number.isFinite(amount) || amount <= 0) {
        toast.error('Each cash payout needs a purpose and an amount greater than zero.');
        return;
      }
      if (amount > 1_000_000_000_000 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-8) {
        toast.error('Each cash payout must use a valid amount with no more than two decimals.');
        return;
      }
      normalizedPayouts.push({
        id: crypto.randomUUID(),
        purpose,
        amount,
        method: payout.method,
        recordedAt: new Date().toISOString(),
        recordedBy: currentUser?.id ?? '',
      });
    }
    const normalizedPayoutTotals = normalizedPayouts.reduce<Record<PayoutMethod, number>>(
      (totals, payout) => {
        totals[payout.method] += payout.amount;
        return totals;
      },
      { cash: 0, card: 0, 'bank-transfer': 0 }
    );
    const availablePayoutTotals: Record<PayoutMethod, number> = {
      cash: expectedCashBeforePayouts,
      card: Number(paymentBreakdown.card ?? 0),
      'bank-transfer': Number(paymentBreakdown['bank-transfer'] ?? 0),
    };
    for (const method of ['cash', 'card', 'bank-transfer'] as const) {
      if (normalizedPayoutTotals[method] > availablePayoutTotals[method]) {
        toast.error(
          `The ${method === 'bank-transfer' ? 'transfer' : method} payout is greater than the amount available.`
        );
        return;
      }
    }
    if (process.env.NEXT_PUBLIC_STORAGE_DRIVER === 'postgres' && !navigator.onLine) {
      toast.error(
        'Reconnect before closing sales so the server can finalize the authoritative shift.'
      );
      return;
    }
    if (process.env.NEXT_PUBLIC_STORAGE_DRIVER === 'postgres') {
      const response = await fetch('/api/commands/sales-shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'close',
          shiftId: shift.id,
          businessDate: shift.businessDate,
          closingCash: countedCash,
          cashPayouts: normalizedPayouts,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.error ?? 'Unable to close sales.');
        return;
      }
      saveSalesShift(payload as LocalSalesShift);
    } else
      saveSalesShift({
        ...shift,
        closedAt: new Date().toISOString(),
        closingCash: countedCash,
        expectedCash,
        cashPayouts: normalizedPayouts,
        cashVariance: variance,
        status: 'closed',
      });
    setClosingCash('');
    setCashPayouts([{ purpose: '', amount: '', method: 'cash' }]);
    setMode(null);
    toast.success('Sales closed and cash balanced.');
  };

  if (!currentUser) return null;

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {shift?.status === 'open' ? (
            <LockOpen size={18} className="text-success" />
          ) : (
            <LockKeyhole size={18} className="text-warning" />
          )}
          <div>
            <p className="text-sm font-bold">
              {shift?.status === 'open'
                ? 'Sales open'
                : shift
                  ? 'Sales closed'
                  : 'Sales not opened'}
            </p>
            <p className="text-xs text-muted-foreground">
              {shift?.status === 'open'
                ? 'Opening cash: ' +
                  formatMoney(shift.openingCash, settings.currency) +
                  ' - ' +
                  todaySales.length +
                  ' sale' +
                  (todaySales.length === 1 ? '' : 's') +
                  ' today'
                : shift
                  ? 'This session is closed. Reopen sales to continue working.'
                  : 'Open sales before recording a transaction.'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {(!shift || shift.status === 'closed') && (
            <button
              type="button"
              onClick={() => setMode('open')}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white"
            >
              {shift ? 'Reopen Sales' : 'Open Sales'}
            </button>
          )}
          {shift?.status === 'open' && (
            <button
              type="button"
              onClick={async () => {
                await refreshAuthoritativeShift();
                setMode('close');
              }}
              className="rounded-lg border border-primary px-3 py-2 text-sm font-semibold text-primary"
            >
              Close Sales
            </button>
          )}
        </div>
      </div>

      <Modal
        open={mode === 'open'}
        onClose={() => setMode(null)}
        title={shift?.status === 'closed' ? 'Reopen Sales' : 'Open Sales'}
        subtitle="Record the cash handed over before you start selling."
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setMode(null)}
              className="rounded-lg bg-secondary px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={open}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
            >
              Open Sales
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Cash received</span>
            <input
              autoFocus
              type="text"
              inputMode="decimal"
              value={openingCash}
              onChange={(e) => setOpeningCash(cleanAmountInput(e.target.value))}
              onBlur={(e) => setOpeningCash(formatAmountInput(e.target.value))}
              onWheel={(event) => event.currentTarget.blur()}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
              placeholder="0.00"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Purpose / handover note
            </span>
            <textarea
              value={openingPurpose}
              onChange={(e) => setOpeningPurpose(e.target.value)}
              className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
              placeholder="e.g. Opening float handed over by James"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={dontRemindToday}
              onChange={(e) => setDontRemindToday(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary"
            />
            Do not remind me again today
          </label>
        </div>
      </Modal>

      <Modal
        open={mode === 'close'}
        onClose={() => setMode(null)}
        title="Close Sales"
        subtitle="Record shift payouts by payment method, then count the cash remaining in hand."
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setMode(null)}
              className="rounded-lg bg-secondary px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!balanced}
              onClick={close}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Close Sales
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Total sales</p>
              <p className="mt-1 text-lg font-bold">{formatMoney(totalSales, settings.currency)}</p>
            </div>
            <div className="rounded-lg bg-primary/10 p-3">
              <p className="text-xs text-muted-foreground">Expected cash at hand</p>
              <p className="mt-1 text-lg font-bold text-primary">
                {formatMoney(expectedCash, settings.currency)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-lg border border-border p-2.5">
              <p className="text-muted-foreground">Opening cash</p>
              <p className="mt-1 font-bold">
                {formatMoney(shift?.openingCash ?? 0, settings.currency)}
              </p>
            </div>
            <div className="rounded-lg border border-border p-2.5">
              <p className="text-muted-foreground">Cash after payouts</p>
              <p className="mt-1 font-bold">{formatMoney(netCashSales, settings.currency)}</p>
            </div>
            <div className="rounded-lg border border-border p-2.5">
              <p className="text-muted-foreground">Card after payouts</p>
              <p className="mt-1 font-bold">{formatMoney(netCardPayments, settings.currency)}</p>
            </div>
            <div className="rounded-lg border border-border p-2.5">
              <p className="text-muted-foreground">Transfer after payouts</p>
              <p className="mt-1 font-bold">
                {formatMoney(netTransferPayments, settings.currency)}
              </p>
            </div>
            <div className="rounded-lg border border-border p-2.5 sm:col-span-4">
              <p className="text-muted-foreground">Credit / other non-cash</p>
              <p className="mt-1 font-bold">
                {formatMoney(
                  Math.max(
                    0,
                    nonCashSales -
                      (paymentBreakdown.card ?? 0) -
                      (paymentBreakdown['bank-transfer'] ?? 0)
                  ),
                  settings.currency
                )}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Credit or legacy non-cash payments that are not cash, card, or transfer.
              </p>
            </div>
          </div>
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-muted-foreground">Shift payouts</span>
              <span className="text-xs text-muted-foreground">Optional</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Record money given out during this shift and select the account it came from. Cash
              payouts reduce cash at hand; transfer and card payouts reduce their matching totals.
            </p>
            <div className="space-y-2">
              {cashPayouts.map((payout, index) => (
                <div
                  key={index}
                  className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_9rem_auto] sm:items-end"
                >
                  <label className="min-w-0 space-y-1">
                    <span className="sr-only">Payout purpose {index + 1}</span>
                    <input
                      type="text"
                      value={payout.purpose}
                      onChange={(event) =>
                        setCashPayouts((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, purpose: event.target.value } : item
                          )
                        )
                      }
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                      placeholder="Purpose, e.g. delivery"
                      maxLength={160}
                    />
                  </label>
                  <label className="min-w-0 space-y-1">
                    <span className="sr-only">Payout method {index + 1}</span>
                    <NiceSelect
                      value={payout.method}
                      options={payoutMethodOptions}
                      onChange={(value) =>
                        setCashPayouts((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, method: value } : item
                          )
                        )
                      }
                      className="w-full"
                    />
                  </label>
                  <label className="min-w-0 space-y-1">
                    <span className="sr-only">Payout amount {index + 1}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={payout.amount}
                      onChange={(event) =>
                        setCashPayouts((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, amount: cleanAmountInput(event.target.value) }
                              : item
                          )
                        )
                      }
                      onBlur={(event) =>
                        setCashPayouts((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, amount: formatAmountInput(event.target.value) }
                              : item
                          )
                        )
                      }
                      onWheel={(event) => event.currentTarget.blur()}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                      placeholder="Amount"
                    />
                  </label>
                  {cashPayouts.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setCashPayouts((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index)
                        )
                      }
                      className="rounded-lg px-2 py-2 text-xs text-danger hover:bg-danger/10 sm:mb-0.5"
                      aria-label={`Remove payout ${index + 1}`}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() =>
                  setCashPayouts((current) => [
                    ...current,
                    { purpose: '', amount: '', method: 'cash' },
                  ])
                }
                className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-primary"
              >
                + Add payout
              </button>
              <span className="text-xs font-semibold text-foreground">
                Total payouts: {formatMoney(payoutTotal, settings.currency)}
              </span>
            </div>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Actual cash counted after payouts
            </span>
            <input
              autoFocus
              type="text"
              inputMode="decimal"
              value={closingCash}
              onChange={(e) => setClosingCash(cleanAmountInput(e.target.value))}
              onBlur={(e) => setClosingCash(formatAmountInput(e.target.value))}
              onWheel={(event) => event.currentTarget.blur()}
              className={
                'w-full rounded-lg border bg-background px-3 py-2.5 text-sm ' +
                (closingCash !== '' && !balanced
                  ? 'border-danger focus:ring-danger/30'
                  : 'border-border')
              }
              placeholder="0.00"
            />
          </label>
          {closingCash !== '' && (
            <div
              className={
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ' +
                (balanced ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger')
              }
            >
              {balanced ? (
                'Cash balances exactly.'
              ) : (
                <>
                  <AlertTriangle size={15} /> Short / over by{' '}
                  {formatMoney(Math.abs(variance), settings.currency)}. Adjust the count before
                  closing.
                </>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Opening cash {formatMoney(shift?.openingCash ?? 0, settings.currency)} + cash sales{' '}
            {formatMoney(cashSales, settings.currency)} - cash payouts{' '}
            {formatMoney(payoutTotalsByMethod.cash, settings.currency)} = expected cash at hand.
          </p>
        </div>
      </Modal>
    </>
  );
}
