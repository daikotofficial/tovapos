'use client';

import React, { useMemo, useState } from 'react';
import { Plus, ReceiptText, Save, TrendingDown } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import DatePicker from '@/components/ui/DatePicker';
import Modal from '@/components/ui/Modal';
import NiceSelect from '@/components/ui/NiceSelect';
import { formatMoney } from '@/lib/pos/money';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import { ExpenseCategory, ExpensePaymentMethod, RecordExpenseInput } from '@/lib/pos/types';
import { useRowsPerPage } from '@/lib/pos/useRowsPerPage';
import ListPagination from '@/components/ui/ListPagination';

const paymentMethods: ExpensePaymentMethod[] = ['cash', 'card', 'bank-transfer', 'mobile'];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyExpense(
  recordedBy: string,
  category: ExpenseCategory = 'Miscellaneous'
): RecordExpenseInput {
  return {
    title: '',
    category,
    amount: 0,
    paymentMethod: 'cash',
    vendorName: '',
    notes: '',
    incurredAt: todayIso(),
    recordedBy,
  };
}

export default function ExpensesPage() {
  const { expenses, settings, recordExpense, currentUser, hasPermission, pendingSyncCount } =
    usePosStore();
  const canRecordExpenses = hasPermission('expenses');
  const categories: ExpenseCategory[] = useMemo(
    () => (settings.expenseCategories?.length ? settings.expenseCategories : ['Miscellaneous']),
    [settings.expenseCategories]
  );
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RecordExpenseInput>(
    emptyExpense(currentUser?.name ?? 'Unknown user')
  );
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | 'all'>('all');
  const [saving, setSaving] = useState(false);
  const [rowsPerPage] = useRowsPerPage();
  const [page, setPage] = useState(1);

  const activeExpenses = expenses.filter((expense) => expense.status === 'recorded');
  const filtered = useMemo(
    () =>
      activeExpenses.filter((expense) => {
        const matchesSearch = `${expense.title} ${expense.vendorName ?? ''} ${expense.notes ?? ''}`
          .toLowerCase()
          .includes(search.toLowerCase());
        const matchesCategory = categoryFilter === 'all' || expense.category === categoryFilter;
        return matchesSearch && matchesCategory;
      }),
    [activeExpenses, categoryFilter, search]
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const visibleExpenses = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  React.useEffect(() => setPage(1), [categoryFilter, rowsPerPage, search, filtered.length]);

  const totals = useMemo(() => {
    const total = activeExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const thisMonth = activeExpenses
      .filter((expense) => expense.incurredAt.slice(0, 7) === new Date().toISOString().slice(0, 7))
      .reduce((sum, expense) => sum + expense.amount, 0);
    const byCategory = categories
      .map((category) => ({
        category,
        total: activeExpenses
          .filter((expense) => expense.category === category)
          .reduce((sum, expense) => sum + expense.amount, 0),
      }))
      .filter((item) => item.total > 0)
      .sort((a, b) => b.total - a.total);

    return { total, thisMonth, byCategory };
  }, [activeExpenses, categories]);

  const openCreate = () => {
    setForm(emptyExpense(currentUser?.name ?? 'Unknown user', categories[0] ?? 'Miscellaneous'));
    setOpen(true);
  };

  const save = async () => {
    if (!canRecordExpenses || !form.title.trim() || form.amount <= 0) return;

    setSaving(true);
    try {
      await recordExpense({
        ...form,
        amount: Number(form.amount),
        recordedBy: currentUser?.name ?? form.recordedBy,
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout
      title="Expenses"
      subtitle="Record operating costs and include them in profit reporting"
    >
      <PermissionGate permission="expenses">
        <div className="mx-auto max-w-screen-2xl space-y-4 px-3 py-4 sm:space-y-5 sm:p-6">
          {!canRecordExpenses && (
            <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
              Your current role can view this page only if expenses permission is assigned.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  All Expenses
                </p>
                <TrendingDown size={16} className="text-danger" />
              </div>
              <p className="mt-2 text-2xl font-bold font-tabular text-danger">
                {formatMoney(totals.total, settings.currency)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-card">
              <p className="text-xs font-semibold uppercase text-muted-foreground">This Month</p>
              <p className="mt-2 text-2xl font-bold font-tabular">
                {formatMoney(totals.thisMonth, settings.currency)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-card">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Pending Sync</p>
              <p className="mt-2 text-2xl font-bold font-tabular text-warning">
                {pendingSyncCount}
              </p>
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-[1fr_320px]">
            <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-card sm:rounded-xl">
              <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                  <ReceiptText size={16} className="text-primary" />
                  <span className="text-sm font-semibold">{filtered.length} Expense Records</span>
                </div>
                <button
                  onClick={openCreate}
                  disabled={!canRecordExpenses}
                  className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus size={14} />
                  Record Expense
                </button>
              </div>

              <div className="grid min-w-0 gap-3 border-b border-border p-4 md:grid-cols-[1fr_220px]">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search title, vendor, or note..."
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                <NiceSelect
                  value={categoryFilter}
                  onChange={(value) => setCategoryFilter(value as ExpenseCategory | 'all')}
                  options={[
                    { value: 'all', label: 'All categories' },
                    ...categories.map((category) => ({ value: category, label: category })),
                  ]}
                />
              </div>

              <div className="overflow-x-auto overscroll-x-contain scrollbar-thin">
                <table className="w-full min-w-[860px]">
                  <thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Expense</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Vendor</th>
                      <th className="px-4 py-3">Payment</th>
                      <th className="px-4 py-3">Recorded By</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-10 text-center text-sm text-muted-foreground"
                        >
                          No expenses recorded yet.
                        </td>
                      </tr>
                    ) : (
                      visibleExpenses.map((expense) => (
                        <tr key={expense.id}>
                          <td className="px-4 py-3">
                            <p className="font-medium">{expense.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {expense.expenseId} · {expense.incurredAt}
                            </p>
                          </td>
                          <td className="px-4 py-3">{expense.category}</td>
                          <td className="px-4 py-3">{expense.vendorName || '-'}</td>
                          <td className="px-4 py-3 capitalize">
                            {expense.paymentMethod.replace('-', ' ')}
                          </td>
                          <td className="px-4 py-3">{expense.recordedBy}</td>
                          <td className="px-4 py-3 text-right font-bold font-tabular text-danger">
                            {formatMoney(expense.amount, settings.currency)}
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
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-card">
              <p className="text-sm font-semibold">Top Expense Categories</p>
              <div className="mt-3 space-y-3">
                {totals.byCategory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No category data yet.</p>
                ) : (
                  totals.byCategory.slice(0, 8).map((item) => (
                    <div key={item.category}>
                      <div className="flex justify-between gap-3 text-sm">
                        <span>{item.category}</span>
                        <span className="font-semibold font-tabular">
                          {formatMoney(item.total, settings.currency)}
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-danger"
                          style={{ width: `${Math.max(8, (item.total / totals.total) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Record Expense"
          subtitle="Captured expenses reduce net profit on the dashboard and reports."
          footer={
            <>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg bg-secondary px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || !form.title.trim() || form.amount <= 0}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save size={14} />
                {saving ? 'Saving...' : 'Save Expense'}
              </button>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs text-muted-foreground">Expense Title</span>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
                placeholder="e.g. Generator fuel, rent, staff lunch"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Category</span>
              <NiceSelect
                value={form.category}
                onChange={(category) => setForm({ ...form, category: category as ExpenseCategory })}
                options={categories.map((category) => ({ value: category, label: category }))}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Amount</span>
              <input
                type="number"
                min={0}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Payment Method</span>
              <NiceSelect
                value={form.paymentMethod}
                onChange={(paymentMethod) =>
                  setForm({ ...form, paymentMethod: paymentMethod as ExpensePaymentMethod })
                }
                options={paymentMethods.map((method) => ({
                  value: method,
                  label: method.replace('-', ' '),
                }))}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Date Incurred</span>
              <DatePicker
                value={form.incurredAt}
                onChange={(incurredAt) => setForm({ ...form, incurredAt })}
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs text-muted-foreground">Vendor / Payee</span>
              <input
                value={form.vendorName}
                onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
                placeholder="Optional"
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs text-muted-foreground">Notes</span>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2"
                placeholder="Optional details for reconciliation"
              />
            </label>
          </div>
        </Modal>
      </PermissionGate>
    </AppLayout>
  );
}
