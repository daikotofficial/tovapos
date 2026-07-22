'use client';

import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { confirmAction } from '@/components/ui/confirmAction';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import Modal from '@/components/ui/Modal';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import { Vendor } from '@/lib/pos/types';
import { useRowsPerPage } from '@/lib/pos/useRowsPerPage';
import ListPagination from '@/components/ui/ListPagination';

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
  const { vendors, upsertVendor, deleteVendor } = usePosStore();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [form, setForm] = useState<Vendor>(emptyVendor());
  const [rowsPerPage] = useRowsPerPage();
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () =>
      vendors.filter((vendor) =>
        `${vendor.name} ${vendor.contactName} ${vendor.phone}`
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [vendors, search]
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const visibleVendors = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  React.useEffect(() => setPage(1), [search, rowsPerPage]);

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('Vendor name is required.');
      return;
    }
    try {
      const existing = vendors.some((vendor) => vendor.id === form.id);
      await upsertVendor({ ...form, name: form.name.trim() });
      setEditing(null);
      toast.success(existing ? 'Vendor updated successfully.' : 'Vendor added successfully.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save vendor.');
    }
  };

  const remove = async (vendor: Vendor) => {
    if (
      !(await confirmAction({
        title: `Delete ${vendor.name}?`,
        description: 'This permanently removes the vendor record.',
        confirmLabel: 'Delete vendor',
      }))
    )
      return;
    try {
      await deleteVendor(vendor.id);
      toast.success('Vendor deleted successfully.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete vendor.');
    }
  };

  return (
    <AppLayout title="Vendors" subtitle="Manage suppliers, contacts, and purchasing relationships">
      <PermissionGate permission="vendors">
        <div className="mx-auto max-w-screen-2xl space-y-4 px-3 py-4 sm:space-y-5 sm:p-6">
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card sm:rounded-xl">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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
                className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white"
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

            <div className="overflow-x-auto overscroll-x-contain scrollbar-thin">
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
                  {visibleVendors.map((vendor) => (
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
                        <button
                          onClick={() => void remove(vendor)}
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
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
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
