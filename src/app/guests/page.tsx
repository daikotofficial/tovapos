'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import { loadHospitalityGuests, saveHospitalityGuest } from '@/lib/pos/local-store';
import type { HospitalityGuest } from '@/lib/pos/types';
import { toast } from 'sonner';
import { normalizeCustomerPhone } from '@/lib/pos/customer';
import { Pencil } from 'lucide-react';
import { usePosStore } from '@/lib/pos/PosStoreProvider';

export default function GuestsPage() {
  const { activeBusinessMode, isHydrated, isAuthenticated } = usePosStore();
  const [guests, setGuests] = useState<HospitalityGuest[]>([]);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    identityNumber: '',
    address: '',
    city: '',
    country: 'Nigeria',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);

  useEffect(() => {
    if (!isHydrated || !isAuthenticated || activeBusinessMode !== 'hospitality') return;
    void loadHospitalityGuests()
      .then((records) => setGuests(records.sort((a, b) => a.name.localeCompare(b.name))))
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : 'Unable to load guests.')
      );
  }, [activeBusinessMode, isAuthenticated, isHydrated]);

  const saveGuest = async () => {
    const phone = normalizeCustomerPhone(form.phone);
    if (!form.name.trim() || !phone) {
      toast.error('Guest name and phone number are required.');
      return;
    }
    if (guests.some((guest) => guest.id !== editingGuestId && guest.phone === phone)) {
      toast.error('A hospitality guest already uses this phone number.');
      return;
    }
    setSaving(true);
    try {
      const existing = guests.find((item) => item.id === editingGuestId);
      const guest: HospitalityGuest = {
        id: existing?.id ?? `guest-${Date.now()}`,
        name: form.name.trim(),
        phone,
        email: form.email.trim() || undefined,
        identityNumber: form.identityNumber.trim() || undefined,
        address: form.address.trim() || undefined,
        city: form.city.trim() || undefined,
        country: form.country.trim() || undefined,
        notes: form.notes.trim() || undefined,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveHospitalityGuest(guest);
      setGuests((current) => [...current, guest].sort((a, b) => a.name.localeCompare(b.name)));
      setForm({
        name: '',
        phone: '',
        email: '',
        identityNumber: '',
        address: '',
        city: '',
        country: 'Nigeria',
        notes: '',
      });
      setEditingGuestId(null);
      toast.success('Guest saved successfully.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save guest.');
    } finally {
      setSaving(false);
    }
  };

  const editGuest = (guest: HospitalityGuest) => {
    setEditingGuestId(guest.id);
    setForm({
      name: guest.name,
      phone: guest.phone,
      email: guest.email ?? '',
      identityNumber: guest.identityNumber ?? '',
      address: guest.address ?? '',
      city: guest.city ?? '',
      country: guest.country ?? 'Nigeria',
      notes: guest.notes ?? '',
    });
  };

  return (
    <AppLayout title="Guests" subtitle="Hospitality guest records and identity details">
      <PermissionGate permission="customers">
        <div className="mx-auto max-w-screen-2xl space-y-5 p-4 sm:p-6">
          <section className="rounded-xl border border-border bg-white p-4 shadow-card">
            <h2 className="font-semibold">{editingGuestId ? 'Edit guest' : 'Add guest'}</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input
                placeholder="Full name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                placeholder="Phone number"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                placeholder="Email (optional)"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                placeholder="NIN / Identity number"
                value={form.identityNumber}
                onChange={(e) => setForm({ ...form, identityNumber: e.target.value })}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                placeholder="Address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm sm:col-span-2"
              />
              <input
                placeholder="City"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                placeholder="Country"
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <textarea
                placeholder="Guest notes, preferences, or special requests"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="min-h-20 rounded-lg border border-border bg-background px-3 py-2 text-sm sm:col-span-2"
              />
            </div>
            <button
              type="button"
              onClick={() => void saveGuest()}
              disabled={saving}
              className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : editingGuestId ? 'Update Guest' : 'Save Guest'}
            </button>
            {editingGuestId && (
              <button
                type="button"
                onClick={() => {
                  setEditingGuestId(null);
                  setForm({
                    name: '',
                    phone: '',
                    email: '',
                    identityNumber: '',
                    address: '',
                    city: '',
                    country: 'Nigeria',
                    notes: '',
                  });
                }}
                className="ml-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
            )}
          </section>
          <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-card">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Guest</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Identity number</th>
                  <th className="px-4 py-3">Address</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {guests.map((guest) => (
                  <tr key={guest.id}>
                    <td className="px-4 py-3 font-semibold">{guest.name}</td>
                    <td className="px-4 py-3">{guest.phone}</td>
                    <td className="px-4 py-3">{guest.email || '—'}</td>
                    <td className="px-4 py-3">{guest.identityNumber || '—'}</td>
                    <td className="px-4 py-3">
                      {[guest.address, guest.city].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => editGuest(guest)}
                        className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary"
                      >
                        <Pencil size={13} /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {guests.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">
                No hospitality guests saved yet.
              </p>
            )}
          </section>
        </div>
      </PermissionGate>
    </AppLayout>
  );
}
