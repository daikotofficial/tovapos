'use client';

import React, { useMemo, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import Modal from '@/components/ui/Modal';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import { Customer } from '@/lib/pos/types';

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
    createdAt: new Date().toISOString(),
  };
}

export default function CustomersPage() {
  const { customers, upsertCustomer } = usePosStore();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<Customer>(emptyCustomer());

  const filtered = useMemo(
    () =>
      customers.filter((customer) =>
        `${customer.name} ${customer.phone} ${customer.email ?? ''}`
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [customers, search]
  );

  const save = async () => {
    if (!form.name.trim()) return;
    await upsertCustomer(form);
    setEditing(null);
  };

  return (
    <AppLayout
      title="Customers"
      subtitle="Manage customer records, loyalty points, and credit limits offline"
    >
      <PermissionGate permission="customers">
        <div className="p-6 max-w-screen-2xl mx-auto space-y-5">
          <div className="bg-card border border-border rounded-xl shadow-card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
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
                className="flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-lg text-sm font-semibold"
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

            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px]">
                <thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Loyalty</th>
                    <th className="px-4 py-3">Credit Limit</th>
                    <th className="px-4 py-3">Total Spend</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((customer) => (
                    <tr key={customer.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <p className="font-medium">{customer.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {customer.email || customer.address}
                        </p>
                      </td>
                      <td className="px-4 py-3">{customer.phone || '-'}</td>
                      <td className="px-4 py-3 font-tabular">{customer.loyaltyPoints}</td>
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
          <div className="grid grid-cols-2 gap-4">
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
              <span className="text-xs text-muted-foreground">Loyalty Points</span>
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
        </Modal>
      </PermissionGate>
    </AppLayout>
  );
}
