'use client';

import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { confirmAction } from '@/components/ui/confirmAction';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import Modal from '@/components/ui/Modal';
import NiceSelect from '@/components/ui/NiceSelect';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import { Customer, CustomerDiscountRule } from '@/lib/pos/types';
import { formatMoney } from '@/lib/pos/money';
import { useRowsPerPage } from '@/lib/pos/useRowsPerPage';
import ListPagination from '@/components/ui/ListPagination';

function emptyCustomer(): Customer {
  return {
    id: `cust-${Date.now()}`,
    name: '',
    phone: '',
    email: '',
    address: '',
    loyaltyPoints: 0,
    creditLimit: 0,
    totalSpend: 0,
    discountRules: [],
    createdAt: new Date().toISOString(),
  };
}

export default function CustomersPage() {
  const { customers, upsertCustomer, deleteCustomer } = usePosStore();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<Customer>(emptyCustomer());
  const [rowsPerPage] = useRowsPerPage();
  const [page, setPage] = useState(1);
  const [ruleProductId, setRuleProductId] = useState('');
  const [ruleType, setRuleType] = useState<CustomerDiscountRule['type']>('percentage');
  const [ruleValue, setRuleValue] = useState('');
  const [ruleQuantity, setRuleQuantity] = useState('');
  const { inventory, settings } = usePosStore();

  const filtered = useMemo(
    () =>
      customers.filter((customer) =>
        `${customer.name} ${customer.phone} ${customer.email ?? ''}`
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [customers, search]
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const visibleCustomers = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  React.useEffect(() => setPage(1), [search, rowsPerPage]);

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('Customer name is required.');
      return;
    }
    try {
      const existing = customers.some((customer) => customer.id === form.id);
      await upsertCustomer({ ...form, name: form.name.trim(), phone: form.phone.trim() });
      setEditing(null);
      toast.success(existing ? 'Customer updated successfully.' : 'Customer added successfully.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save customer.');
    }
  };

  const addRule = () => {
    const value = Number(ruleValue);
    if (!ruleProductId || !Number.isFinite(value) || value < 0) {
      toast.error('Select a product and enter a valid discount.');
      return;
    }
    const maxQuantity = Number(ruleQuantity);
    const rule: CustomerDiscountRule = {
      id: `discount-${Date.now()}`,
      inventoryItemId: ruleProductId,
      type: ruleType,
      value,
      active: true,
      ...(maxQuantity > 0 ? { maxQuantity } : {}),
    };
    setForm({ ...form, discountRules: [...(form.discountRules ?? []), rule] });
    setRuleProductId('');
    setRuleValue('');
    setRuleQuantity('');
  };

  const remove = async (customer: Customer) => {
    if (
      !(await confirmAction({
        title: `Delete ${customer.name}?`,
        description: 'This permanently removes the customer record.',
        confirmLabel: 'Delete customer',
      }))
    )
      return;
    try {
      await deleteCustomer(customer.id);
      toast.success('Customer deleted successfully.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete customer.');
    }
  };

  return (
    <AppLayout
      title="Customers"
      subtitle="Manage customer records, loyalty points, and credit limits offline"
    >
      <PermissionGate permission="customers">
        <div className="mx-auto max-w-screen-2xl space-y-4 px-3 py-4 sm:space-y-5 sm:p-6">
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card sm:rounded-xl">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-primary" />
                <span className="text-sm font-semibold">{customers.length} Customers</span>
              </div>
              <button
                onClick={() => {
                  const next = emptyCustomer();
                  setForm(next);
                  setEditing(next);
                }}
                className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white"
              >
                <Plus size={14} />
                Add Customer
              </button>
            </div>

            <div className="p-4 border-b border-border">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customer by name, phone, or email..."
                className="w-full px-3 py-2 rounded-lg border border-border bg-background"
              />
            </div>

            <div className="overflow-x-auto overscroll-x-contain scrollbar-thin">
              <table className="w-full min-w-[780px]">
                <thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Loyalty Credit</th>
                    <th className="px-4 py-3">Credit Limit</th>
                    <th className="px-4 py-3">Total Spend</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visibleCustomers.map((customer) => (
                    <tr key={customer.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <p className="font-medium">{customer.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {customer.email || customer.address}
                        </p>
                      </td>
                      <td className="px-4 py-3">{customer.phone || '-'}</td>
                      <td className="px-4 py-3 font-tabular">
                        {formatMoney(customer.loyaltyPoints, settings.currency)}
                      </td>
                      <td className="px-4 py-3 font-tabular">
                        NGN {customer.creditLimit.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-tabular">
                        NGN {customer.totalSpend.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => {
                            setForm(customer);
                            setEditing(customer);
                          }}
                          className="text-sm font-semibold text-primary"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => void remove(customer)}
                          className="ml-3 inline-flex items-center gap-1 text-sm font-semibold text-danger"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </td>
                    </tr>
                  ))}
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
        </div>

        <Modal
          open={!!editing}
          onClose={() => setEditing(null)}
          title={
            form.id && customers.some((customer) => customer.id === form.id)
              ? 'Edit Customer'
              : 'Add Customer'
          }
          footer={
            <>
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 rounded-lg bg-secondary text-sm"
              >
                Cancel
              </button>
              <button
                onClick={save}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold"
              >
                Save Customer
              </button>
            </>
          }
        >
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              ['name', 'Customer Name'],
              ['phone', 'Phone'],
              ['email', 'Email'],
              ['address', 'Address'],
            ].map(([key, label]) => (
              <label key={key} className="space-y-1">
                <span className="text-xs text-muted-foreground">{label}</span>
                <input
                  value={String(form[key as keyof Customer] ?? '')}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                />
              </label>
            ))}
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Loyalty Credit Amount</span>
              <input
                type="number"
                value={form.loyaltyPoints}
                onChange={(e) => setForm({ ...form, loyaltyPoints: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Credit Limit</span>
              <input
                type="number"
                value={form.creditLimit}
                onChange={(e) => setForm({ ...form, creditLimit: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background"
              />
            </label>
          </div>
          <div className="mt-5 rounded-lg border border-border p-3">
            <p className="text-sm font-semibold">Customer product discounts (optional)</p>
            <p className="mb-3 text-xs text-muted-foreground">
              These discounts apply automatically when this customer is selected at checkout.
            </p>
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-12">
              <NiceSelect
                value={ruleProductId}
                onChange={setRuleProductId}
                placeholder="Select product"
                options={inventory.map((item) => ({
                  value: item.id,
                  label: `${item.name} (${item.sku})`,
                }))}
                className="w-full min-w-0 sm:col-span-2 lg:col-span-5"
              />
              <NiceSelect
                value={ruleType}
                onChange={(value) => setRuleType(value as CustomerDiscountRule['type'])}
                options={[
                  { value: 'percentage', label: 'Percent off' },
                  { value: 'fixed-unit-price', label: 'Fixed unit price' },
                ]}
                className="w-full min-w-0 lg:col-span-3"
              />
              <div className="flex min-w-0 gap-2 lg:col-span-4">
                <input
                  type="number"
                  min="0"
                  value={ruleValue}
                  onChange={(e) => setRuleValue(e.target.value)}
                  placeholder={ruleType === 'percentage' ? '10' : '1750'}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={addRule}
                  className="rounded-lg bg-secondary px-3 text-sm font-semibold"
                >
                  Add
                </button>
              </div>
              <input
                type="number"
                min="1"
                value={ruleQuantity}
                onChange={(e) => setRuleQuantity(e.target.value)}
                placeholder="Qty limit (optional)"
                className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm sm:col-span-2 lg:col-span-4"
              />
            </div>
            <div className="mt-3 space-y-1">
              {(form.discountRules ?? []).map((rule) => (
                <div
                  key={rule.id}
                  className="flex min-w-0 flex-col items-start justify-between gap-2 rounded bg-muted/30 px-2 py-2 text-xs sm:flex-row sm:items-center"
                >
                  <span className="min-w-0 break-words">
                    {inventory.find((item) => item.id === rule.inventoryItemId)?.name ?? 'Product'}{' '}
                    ·{' '}
                    {rule.type === 'percentage' ? `${rule.value}% off` : `unit price ${rule.value}`}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        discountRules: (form.discountRules ?? []).filter(
                          (item) => item.id !== rule.id
                        ),
                      })
                    }
                    className="shrink-0 text-danger"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      </PermissionGate>
    </AppLayout>
  );
}
