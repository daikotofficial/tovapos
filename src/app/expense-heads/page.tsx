'use client';

import React, { useState } from 'react';
import { Plus, ReceiptText, Trash2 } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import Modal from '@/components/ui/Modal';
import { usePosStore } from '@/lib/pos/PosStoreProvider';

export default function ExpenseHeadsPage() {
  const { settings, updateSettings, expenses } = usePosStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const expenseHeads = settings.expenseCategories ?? [];

  const addExpenseHead = async () => {
    const expenseHead = name.trim();
    if (!expenseHead) return;
    const next = Array.from(new Set([...expenseHeads, expenseHead])).sort();
    await updateSettings({ ...settings, expenseCategories: next });
    setName('');
    setOpen(false);
  };

  const removeExpenseHead = async (expenseHead: string) => {
    const inUse = expenses.some((expense) => expense.category === expenseHead);
    if (inUse) return;
    await updateSettings({
      ...settings,
      expenseCategories: expenseHeads.filter((item) => item !== expenseHead),
    });
  };

  return (
    <AppLayout title="Expense Heads" subtitle="Manage expense heads used when recording costs">
      <PermissionGate permission="expense-heads">
        <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
          <section className="rounded-xl border border-border bg-card shadow-card">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <ReceiptText size={16} className="text-primary" />
                <span className="text-sm font-semibold">Expense Heads</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90"
              >
                <Plus size={14} />
                Add Expense Head
              </button>
            </div>
            <div className="divide-y divide-border">
              {expenseHeads.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No expense heads yet. Add your first expense head.
                </div>
              ) : (
                expenseHeads.map((expenseHead) => {
                  const count = expenses.filter(
                    (expense) => expense.category === expenseHead
                  ).length;
                  const inUse = count > 0;
                  return (
                    <div
                      key={expenseHead}
                      className="flex items-center justify-between gap-4 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-foreground">{expenseHead}</p>
                        <p className="text-xs text-muted-foreground">
                          {count} expense record{count === 1 ? '' : 's'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeExpenseHead(expenseHead)}
                        disabled={inUse}
                        className="inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-semibold text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
                        title={inUse ? 'Expense head is in use' : 'Delete expense head'}
                      >
                        <Trash2 size={13} />
                        Delete
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>

        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Add Expense Head"
          subtitle="This head will appear in the Record Expense category dropdown."
          size="sm"
          footer={
            <>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addExpenseHead}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
              >
                Add Expense Head
              </button>
            </>
          }
        >
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Expense Head Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addExpenseHead();
                }
              }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="e.g. Generator fuel"
              autoFocus
            />
          </label>
        </Modal>
      </PermissionGate>
    </AppLayout>
  );
}
