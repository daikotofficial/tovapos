'use client';

import React, { useMemo, useState } from 'react';
import { Plus, Truck } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import Modal from '@/components/ui/Modal';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import { Vendor } from '@/lib/pos/types';

function emptyVendor(): Vendor {
  return {
    id: `vendor-${Date.now()}`,
    name: '',
    contactName: '',
    phone: '',
    email: '',
    address: '',
    paymentTerms: 'Pay on delivery',
    outstandingBalance: 0,
    createdAt: new Date().toISOString(),
  };
}

export default function VendorsPage() {
  const { vendors, upsertVendor } = usePosStore();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [form, setForm] = useState<Vendor>(emptyVendor());

  const filtered = useMemo(
    () =>
      vendors.filter((vendor) =>
        `${vendor.name} ${vendor.contactName} ${vendor.phone}`
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [vendors, search]
  );

  const save = async () => {
    if (!form.name.trim()) return;
    await upsertVendor(form);
    setEditing(null);
  };

  return (
    <AppLayout
      title="Vendors"
      subtitle="Manage suppliers/vendors and purchase relationships locally"
    >
      <PermissionGate permission="vendors">
        <div className="p-6 max-w-screen-2xl mx-auto space-y-5">
          <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Truck size={16} className="text-primary" />
                <span className="text-sm font-semibold">{vendors.length} Vendors</span>
              </div>
              <button
                onClick={() => {
                  const next = emptyVendor();
                  setForm(next);
                  setEditing(next);
                }}
                className="flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-lg text-sm font-semibold"
              >
                <Plus size={14} />
                Add Vendor
              </button>
            </div>

            <div className="p-4 border-b border-border">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search vendor by business, contact, or phone..."
                className="w-full px-3 py-2 rounded-lg border border-border bg-background"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px]">
                <thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Vendor</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Terms</th>
                    <th className="px-4 py-3">Outstanding</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((vendor) => (
                    <tr key={vendor.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <p className="font-medium">{vendor.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {vendor.email || vendor.address}
                        </p>
                      </td>
                      <td className="px-4 py-3">{vendor.contactName}</td>
                      <td className="px-4 py-3">{vendor.phone}</td>
                      <td className="px-4 py-3">{vendor.paymentTerms}</td>
                      <td className="px-4 py-3 font-tabular">
                        NGN {vendor.outstandingBalance.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => {
                            setForm(vendor);
                            setEditing(vendor);
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
            form.id && vendors.some((vendor) => vendor.id === form.id)
              ? 'Edit Vendor'
              : 'Add Vendor'
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
                Save Vendor
              </button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-4">
            {[
              ['name', 'Business Name'],
              ['contactName', 'Contact Person'],
              ['phone', 'Phone'],
              ['email', 'Email'],
              ['address', 'Address'],
              ['paymentTerms', 'Payment Terms'],
            ].map(([key, label]) => (
              <label key={key} className="space-y-1">
                <span className="text-xs text-muted-foreground">{label}</span>
                <input
                  value={String(form[key as keyof Vendor] ?? '')}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                />
              </label>
            ))}
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Outstanding Balance</span>
              <input
                type="number"
                value={form.outstandingBalance}
                onChange={(e) => setForm({ ...form, outstandingBalance: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background"
              />
            </label>
          </div>
        </Modal>
      </PermissionGate>
    </AppLayout>
  );
}
