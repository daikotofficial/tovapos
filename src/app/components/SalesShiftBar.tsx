'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, LockKeyhole, LockOpen } from 'lucide-react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import { formatMoney } from '@/lib/pos/money';
import { businessDate, getSalesShift, saveSalesShift, type LocalSalesShift } from '@/lib/pos/sales-shift';

function cashCollectedForSale(sale: { paymentMethod: string; grandTotal: number; paymentBreakdown?: { cash?: number } }): number {
  if (sale.paymentMethod === 'cash') return sale.grandTotal;
  if (sale.paymentMethod === 'split') return Number(sale.paymentBreakdown?.cash ?? 0);
  return 0;
}

export default function SalesShiftBar() {
  const { currentUser, sales, settings } = usePosStore();
  const [shift, setShift] = useState<LocalSalesShift | null>(null);
  const [mode, setMode] = useState<'open' | 'close' | null>(null);
  const [openingCash, setOpeningCash] = useState('');
  const [openingPurpose, setOpeningPurpose] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [dontRemindToday, setDontRemindToday] = useState(false);
  const reminderKey = currentUser
    ? 'tovapos.sales-reminder.' + currentUser.id + '.' + businessDate() + '.' + (currentUser.lastLogin ?? currentUser.updatedAt ?? 'session')
    : '';

  const refresh = () => setShift(currentUser ? getSalesShift(currentUser.id) : null);
  useEffect(() => {
    if (!currentUser) return;
    const localShift = getSalesShift(currentUser.id);
    setShift(localShift);
    if (!localShift && !window.sessionStorage.getItem(reminderKey)) setMode('open');
    if (process.env.NEXT_PUBLIC_STORAGE_DRIVER === 'postgres') {
      void fetch('/api/commands/sales-shift?businessDate=' + businessDate(), { cache: 'no-store' })
        .then((response) => response.ok ? response.json() : null)
        .then((serverShift) => {
          if (serverShift) {
            saveSalesShift(serverShift as LocalSalesShift);
            setMode(null);
          }
        })
        .catch(() => undefined);
    }
    window.addEventListener('tovapos:sales-shift', refresh);
    return () => window.removeEventListener('tovapos:sales-shift', refresh);
  }, [currentUser?.id, currentUser?.lastLogin, currentUser?.updatedAt, reminderKey]);

  const todaySales = useMemo(
    () => sales.filter((sale) => sale.status === 'completed'
      && sale.cashierId === currentUser?.id
      && (!shift || sale.shiftId === shift.id)
      && businessDate(new Date(sale.timestamp)) === businessDate()),
    [currentUser?.id, sales, shift]
  );
  const totalSales = todaySales.reduce((sum, sale) => sum + sale.grandTotal, 0);
  const cashSales = todaySales.reduce((sum, sale) => sum + cashCollectedForSale(sale), 0);
  const expectedCash = (shift?.openingCash ?? 0) + cashSales;
  const countedCash = Number(closingCash);
  const variance = Number.isFinite(countedCash) ? countedCash - expectedCash : 0;
  const balanced = closingCash !== '' && Math.abs(variance) < 0.005;

  const open = async () => {
    const amount = Number(openingCash);
    if (!Number.isFinite(amount) || amount < 0) { toast.error('Enter the cash received at handover.'); return; }
    if (!openingPurpose.trim()) { toast.error('Enter the purpose or handover note.'); return; }
    if (!currentUser) return;
    if (getSalesShift(currentUser.id)) { toast.error('Sales has already been opened or closed for today.'); return; }
    const nextShift: LocalSalesShift = { id: 'shift-' + currentUser.id + '-' + businessDate(), businessDate: businessDate(), userId: currentUser.id, userName: currentUser.name, openingCash: amount, openingPurpose: openingPurpose.trim(), openedAt: new Date().toISOString(), status: 'open' };
    if (process.env.NEXT_PUBLIC_STORAGE_DRIVER === 'postgres') {
      const response = await fetch('/api/commands/sales-shift', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'open', ...nextShift }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) { toast.error(payload?.error ?? 'Unable to open sales.'); return; }
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
    if (process.env.NEXT_PUBLIC_STORAGE_DRIVER === 'postgres' && !navigator.onLine) {
      toast.error('Reconnect before closing sales so the server can finalize the authoritative shift.');
      return;
    }
    if (process.env.NEXT_PUBLIC_STORAGE_DRIVER === 'postgres') {
      const response = await fetch('/api/commands/sales-shift', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'close', shiftId: shift.id, businessDate: shift.businessDate, closingCash: countedCash }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) { toast.error(payload?.error ?? 'Unable to close sales.'); return; }
      saveSalesShift(payload as LocalSalesShift);
    } else saveSalesShift({ ...shift, closedAt: new Date().toISOString(), closingCash: countedCash, expectedCash, cashVariance: variance, status: 'closed' });
    setClosingCash('');
    setMode(null);
    toast.success('Sales closed and cash balanced.');
  };

  if (!currentUser) return null;

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {shift?.status === 'open' ? <LockOpen size={18} className="text-success" /> : <LockKeyhole size={18} className="text-warning" />}
          <div>
            <p className="text-sm font-bold">{shift?.status === 'open' ? 'Sales open' : shift ? 'Sales closed' : 'Sales not opened'}</p>
            <p className="text-xs text-muted-foreground">{shift?.status === 'open' ? 'Opening cash: ' + formatMoney(shift.openingCash, settings.currency) + ' - ' + todaySales.length + ' sale' + (todaySales.length === 1 ? '' : 's') + ' today' : shift ? 'This user has already closed sales for today.' : 'Open sales before recording a transaction.'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {!shift && <button type="button" onClick={() => setMode('open')} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">Open Sales</button>}
          {shift?.status === 'open' && <button type="button" onClick={() => { setClosingCash(expectedCash.toFixed(2)); setMode('close'); }} className="rounded-lg border border-primary px-3 py-2 text-sm font-semibold text-primary">Close Sales</button>}
        </div>
      </div>

      <Modal open={mode === 'open'} onClose={() => setMode(null)} title="Open Sales" subtitle="Record the cash handed over before you start selling." size="sm" footer={<><button type="button" onClick={() => setMode(null)} className="rounded-lg bg-secondary px-4 py-2 text-sm">Cancel</button><button type="button" onClick={open} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">Open Sales</button></>}>
        <div className="space-y-4">
          <label className="block space-y-1"><span className="text-xs font-medium text-muted-foreground">Cash received</span><input autoFocus type="number" min="0" step="0.01" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" placeholder="0.00" /></label>
          <label className="block space-y-1"><span className="text-xs font-medium text-muted-foreground">Purpose / handover note</span><textarea value={openingPurpose} onChange={(e) => setOpeningPurpose(e.target.value)} className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" placeholder="e.g. Opening float handed over by James" /></label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={dontRemindToday} onChange={(e) => setDontRemindToday(e.target.checked)} className="h-4 w-4 rounded border-border text-primary" />Don't remind me again today</label>
        </div>
      </Modal>

      <Modal open={mode === 'close'} onClose={() => setMode(null)} title="Close Sales" subtitle="Count the cash in hand. Card, transfer, mobile, and credit are excluded from the cash count." size="sm" footer={<><button type="button" onClick={() => setMode(null)} className="rounded-lg bg-secondary px-4 py-2 text-sm">Cancel</button><button type="button" disabled={!balanced} onClick={close} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Close Sales</button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Total sales</p><p className="mt-1 text-lg font-bold">{formatMoney(totalSales, settings.currency)}</p></div>
            <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Expected cash</p><p className="mt-1 text-lg font-bold">{formatMoney(expectedCash, settings.currency)}</p></div>
          </div>
          <label className="block space-y-1"><span className="text-xs font-medium text-muted-foreground">Cash sales amount counted</span><input autoFocus type="number" min="0" step="0.01" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} className={'w-full rounded-lg border bg-background px-3 py-2.5 text-sm ' + (closingCash !== '' && !balanced ? 'border-danger focus:ring-danger/30' : 'border-border')} placeholder="0.00" /></label>
          {closingCash !== '' && <div className={'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ' + (balanced ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger')}>{balanced ? 'Cash balances exactly.' : <><AlertTriangle size={15} /> Short / over by {formatMoney(Math.abs(variance), settings.currency)}. Adjust the count before closing.</>}</div>}
          <p className="text-xs text-muted-foreground">Opening cash {formatMoney(shift?.openingCash ?? 0, settings.currency)} + cash sales {formatMoney(cashSales, settings.currency)} = expected cash.</p>
        </div>
      </Modal>
    </>
  );
}
