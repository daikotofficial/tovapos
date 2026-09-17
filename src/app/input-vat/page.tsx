'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Download, Plus, Printer, ReceiptText, Search } from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import DatePicker from '@/components/ui/DatePicker';
import Modal from '@/components/ui/Modal';
import ListPagination from '@/components/ui/ListPagination';
import { formatMoney } from '@/lib/pos/money';
import { loadInputVatRecords, saveInputVatRecord } from '@/lib/pos/local-store';
import type { InputVatRecord } from '@/lib/pos/types';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import { useRowsPerPage } from '@/lib/pos/useRowsPerPage';

const today = () => new Date().toISOString().slice(0, 10);

export default function InputVatPage() {
  const { currentUser, settings, activeBusinessMode } = usePosStore();
  const [records, setRecords] = useState<InputVatRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(today());
  const [page, setPage] = useState(1);
  const [rowsPerPage] = useRowsPerPage();
  const [form, setForm] = useState({
    date: today(),
    vendorName: '',
    vendorTin: '',
    invoiceNumber: '',
    goodsAmount: '',
    inputVatAmount: '',
    totalInvoiceAmount: '',
    notes: '',
  });

  const refresh = async () => setRecords(await loadInputVatRecords());
  useEffect(() => {
    if (activeBusinessMode !== 'retail') return;
    void refresh();
  }, [activeBusinessMode]);

  const filtered = useMemo(
    () =>
      records.filter((record) => {
        const query = search.trim().toLowerCase();
        const matchesSearch =
          !query ||
          `${record.vendorName} ${record.vendorTin ?? ''} ${record.invoiceNumber ?? ''} ${record.recordNumber}`
            .toLowerCase()
            .includes(query);
        const matchesFrom = !from || record.date >= from;
        const matchesTo = !to || record.date <= to;
        return matchesSearch && matchesFrom && matchesTo;
      }),
    [from, records, search, to]
  );

  const totals = useMemo(
    () => ({
      goods: filtered
        .filter((r) => r.status === 'recorded')
        .reduce((sum, r) => sum + r.goodsAmount, 0),
      vat: filtered
        .filter((r) => r.status === 'recorded')
        .reduce((sum, r) => sum + r.inputVatAmount, 0),
      entries: filtered.filter((r) => r.status === 'recorded').length,
    }),
    [filtered]
  );

  const save = async () => {
    const goodsAmount = Number(form.goodsAmount);
    const inputVatAmount = Number(form.inputVatAmount);
    if (
      !form.vendorName.trim() ||
      !form.date ||
      !Number.isFinite(goodsAmount) ||
      goodsAmount < 0 ||
      !Number.isFinite(inputVatAmount) ||
      inputVatAmount < 0
    ) {
      toast.error('Enter the date, vendor, goods amount, and input VAT paid.');
      return;
    }
    const now = new Date().toISOString();
    const record: InputVatRecord = {
      id: `input-vat-${Date.now()}`,
      recordNumber: `IVAT-${Date.now().toString().slice(-8)}`,
      date: form.date,
      vendorName: form.vendorName.trim(),
      vendorTin: form.vendorTin.trim() || undefined,
      invoiceNumber: form.invoiceNumber.trim() || undefined,
      goodsAmount,
      inputVatAmount,
      totalInvoiceAmount: form.totalInvoiceAmount ? Number(form.totalInvoiceAmount) : undefined,
      notes: form.notes.trim() || undefined,
      recordedBy: currentUser?.name ?? 'Unknown user',
      status: 'recorded',
      createdAt: now,
      updatedAt: now,
    };
    try {
      const response = await fetch('/api/pos-store?store=inputVat', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? 'Unable to save input VAT record.');
      await saveInputVatRecord(record);
      setRecords((current) => [record, ...current]);
      setOpen(false);
      setForm({
        date: today(),
        vendorName: '',
        vendorTin: '',
        invoiceNumber: '',
        goodsAmount: '',
        inputVatAmount: '',
        totalInvoiceAmount: '',
        notes: '',
      });
      toast.success('Input VAT record saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save input VAT record.');
    }
  };

  const exportCsv = () => {
    const rows = [
      [
        'Record',
        'Date',
        'Vendor',
        'TIN',
        'Invoice',
        'Goods Amount',
        'Input VAT Paid',
        'Total Invoice',
      ],
      ...filtered.map((r) => [
        r.recordNumber,
        r.date,
        r.vendorName,
        r.vendorTin ?? '',
        r.invoiceNumber ?? '',
        String(r.goodsAmount),
        String(r.inputVatAmount),
        String(r.totalInvoiceAmount ?? ''),
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `input-vat-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const visible = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const input =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

  if (activeBusinessMode !== 'retail') {
    return (
      <AppLayout title="Input VAT Register" subtitle="Retail / Product businesses only">
        <PermissionGate permission="manage-tax">
          <div className="mx-auto max-w-3xl p-4 sm:p-6">
            <div className="rounded-xl border border-warning/30 bg-warning/10 p-5 text-sm text-warning">
              Input VAT Register is available only for Retail / Product businesses.
            </div>
          </div>
        </PermissionGate>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Input VAT Register"
      subtitle="Record VAT paid to vendors for your filing records"
    >
      <PermissionGate permission="manage-tax">
        <div className="mx-auto max-w-screen-2xl space-y-5 p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              ['Input VAT Paid', formatMoney(totals.vat, settings.currency), 'text-primary'],
              ['Goods Amount', formatMoney(totals.goods, settings.currency), 'text-foreground'],
              ['VAT Entries', String(totals.entries), 'text-foreground'],
            ].map(([label, value, color]) => (
              <div key={label} className="rounded-xl border border-border bg-card p-4 shadow-card">
                <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
                <p className={`mt-2 text-2xl font-bold font-tabular ${color}`}>{value}</p>
              </div>
            ))}
          </div>
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <ReceiptText size={16} className="text-primary" />
                <span className="text-sm font-semibold">Input VAT Records</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={exportCsv}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted"
                >
                  <Download size={14} /> Export
                </button>
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted"
                >
                  <Printer size={14} /> Print
                </button>
                <button
                  onClick={() => setOpen(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90"
                >
                  <Plus size={14} /> Record Input VAT
                </button>
              </div>
            </div>
            <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[1fr_180px_180px]">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-2.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search vendor, TIN, invoice..."
                  className={`${input} pl-9`}
                />
              </div>
              <DatePicker value={from} onChange={setFrom} placeholder="From date" />
              <DatePicker value={to} onChange={setTo} placeholder="To date" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
                  <tr>
                    {[
                      'Record',
                      'Date',
                      'Vendor',
                      'TIN',
                      'Invoice',
                      'Goods Amount',
                      'Input VAT Paid',
                      'Total Invoice',
                    ].map((h) => (
                      <th key={h} className="px-4 py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visible.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-10 text-center text-sm text-muted-foreground"
                      >
                        No input VAT records found.
                      </td>
                    </tr>
                  ) : (
                    visible.map((r) => (
                      <tr key={r.id}>
                        <td className="px-4 py-3 font-mono text-xs">{r.recordNumber}</td>
                        <td className="px-4 py-3">{r.date}</td>
                        <td className="px-4 py-3 font-medium">{r.vendorName}</td>
                        <td className="px-4 py-3">{r.vendorTin || '-'}</td>
                        <td className="px-4 py-3">{r.invoiceNumber || '-'}</td>
                        <td className="px-4 py-3 text-right font-tabular">
                          {formatMoney(r.goodsAmount, settings.currency)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold font-tabular text-primary">
                          {formatMoney(r.inputVatAmount, settings.currency)}
                        </td>
                        <td className="px-4 py-3 text-right font-tabular">
                          {formatMoney(r.totalInvoiceAmount ?? 0, settings.currency)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <ListPagination
              page={Math.min(page, totalPages)}
              totalItems={filtered.length}
              rowsPerPage={rowsPerPage}
              onPageChange={setPage}
            />
          </section>
        </div>
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Record Input VAT"
          subtitle="Record VAT paid to a vendor. This does not affect inventory or calculate VAT net-off."
          size="lg"
          footer={
            <>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-muted-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => void save()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
              >
                Save Input VAT
              </button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Date</span>
              <DatePicker
                value={form.date}
                onChange={(value) => setForm({ ...form, date: value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Vendor Name</span>
              <input
                autoFocus
                value={form.vendorName}
                onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
                className={input}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Vendor TIN (Optional)</span>
              <input
                value={form.vendorTin}
                onChange={(e) => setForm({ ...form, vendorTin: e.target.value })}
                className={input}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Invoice Number</span>
              <input
                value={form.invoiceNumber}
                onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                className={input}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Total Goods Amount</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.goodsAmount}
                onChange={(e) => setForm({ ...form, goodsAmount: e.target.value })}
                className={input}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Input VAT Paid</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.inputVatAmount}
                onChange={(e) => setForm({ ...form, inputVatAmount: e.target.value })}
                className={input}
              />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs text-muted-foreground">Total Invoice Amount (Optional)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.totalInvoiceAmount}
                onChange={(e) => setForm({ ...form, totalInvoiceAmount: e.target.value })}
                className={input}
              />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs text-muted-foreground">Notes (Optional)</span>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className={`${input} min-h-20`}
              />
            </label>
          </div>
        </Modal>
      </PermissionGate>
    </AppLayout>
  );
}
