'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BedDouble, CalendarCheck, Plus } from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import Modal from '@/components/ui/Modal';
import NiceSelect from '@/components/ui/NiceSelect';
import DateTimePicker from '@/components/ui/DateTimePicker';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import {
  loadHospitalityReservations,
  loadHospitalityServices,
  loadHospitalityGuests,
  saveHospitalityReservation,
  saveHospitalityService,
  saveHospitalityGuest,
} from '@/lib/pos/local-store';
import type { HospitalityGuest, HospitalityReservation, HospitalityService } from '@/lib/pos/types';
import { formatMoney } from '@/lib/pos/money';
import { normalizeCustomerPhone } from '@/lib/pos/customer';
import {
  isRoom,
  isRoomAvailable,
  reservationDisplayStatus,
  reservationPaymentStatus,
} from '@/lib/pos/hospitality';

type Tab = 'services' | 'reservations';

function emptyService(): HospitalityService {
  return {
    id: `service-${Date.now()}`,
    name: '',
    code: '',
    type: 'room',
    amenities: [],
    capacity: 2,
    rate: 0,
    rateUnit: 'night',
    taxRate: 0,
    taxMode: 'exclusive',
    active: true,
    createdAt: new Date().toISOString(),
  };
}

function dateTimeInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function emptyReservationForm() {
  return {
    serviceId: '',
    guestName: '',
    guestPhone: '',
    guestEmail: '',
    guestIdentityNumber: '',
    checkInAt: dateTimeInput(new Date()),
    checkOutAt: dateTimeInput(new Date(Date.now() + 86_400_000)),
    quantity: 1,
    discount: 0,
    amountPaid: 0,
    paymentMethod: 'cash' as HospitalityReservation['paymentMethod'],
    notes: '',
  };
}

function emptyGuestForm() {
  return {
    name: '',
    phone: '',
    email: '',
    identityNumber: '',
    address: '',
    city: '',
    country: 'Nigeria',
    notes: '',
  };
}

export default function HospitalityPage() {
  const { settings, activeBusinessMode, isHydrated, isAuthenticated } = usePosStore();
  const pathname = usePathname();
  const dedicatedPage = pathname === '/reservations' || pathname === '/rooms-services';
  const [tab, setTab] = useState<Tab>(pathname === '/rooms-services' ? 'services' : 'reservations');
  const [services, setServices] = useState<HospitalityService[]>([]);
  const [reservations, setReservations] = useState<HospitalityReservation[]>([]);
  const [guests, setGuests] = useState<HospitalityGuest[]>([]);
  const [serviceModal, setServiceModal] = useState(false);
  const [reservationModal, setReservationModal] = useState(false);
  const [guestPickerOpen, setGuestPickerOpen] = useState(false);
  const [guestModal, setGuestModal] = useState(false);
  const [editingReservationId, setEditingReservationId] = useState<string | null>(null);
  const [serviceForm, setServiceForm] = useState(emptyService());
  const [guestQuery, setGuestQuery] = useState('');
  const [reservationForm, setReservationForm] = useState(emptyReservationForm);
  const [guestForm, setGuestForm] = useState(emptyGuestForm);

  const loadData = async () => {
    try {
      const [nextServices, nextReservations, nextGuests] = await Promise.all([
        loadHospitalityServices(),
        loadHospitalityReservations(),
        loadHospitalityGuests(),
      ]);
      setServices(nextServices);
      setReservations(nextReservations.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setGuests(nextGuests.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load hospitality records.');
    }
  };

  useEffect(() => {
    if (!isHydrated || !isAuthenticated || activeBusinessMode !== 'hospitality') return;
    void loadData();
  }, [activeBusinessMode, isAuthenticated, isHydrated]);

  const guestMatches = useMemo(() => {
    const query = guestQuery.trim().toLowerCase();
    return guests
      .filter(
        (guest) =>
          !query ||
          `${guest.name} ${guest.phone} ${guest.email ?? ''}`.toLowerCase().includes(query)
      )
      .slice(0, 8);
  }, [guests, guestQuery]);

  const availableServiceIds = useMemo(
    () =>
      new Set(
        services
          .filter(
            (service) =>
              service.active &&
              (!isRoom(service) ||
                isRoomAvailable(
                  service.id,
                  reservationForm.checkInAt,
                  reservationForm.checkOutAt,
                  reservations.filter((reservation) => reservation.id !== editingReservationId)
                ))
          )
          .map((service) => service.id)
      ),
    [
      editingReservationId,
      reservationForm.checkInAt,
      reservationForm.checkOutAt,
      reservations,
      services,
    ]
  );

  const selectedService = services.find((service) => service.id === reservationForm.serviceId);
  const units =
    selectedService?.rateUnit === 'night'
      ? Math.max(
          1,
          Math.ceil(
            (new Date(reservationForm.checkOutAt).getTime() -
              new Date(reservationForm.checkInAt).getTime()) /
              86_400_000
          )
        )
      : Math.max(1, Number(reservationForm.quantity) || 1);
  const subtotal = Number(((selectedService?.rate ?? 0) * units).toFixed(2));
  const discountedSubtotal = Number(
    (
      subtotal *
      (1 - Math.min(100, Math.max(0, Number(reservationForm.discount) || 0)) / 100)
    ).toFixed(2)
  );
  const taxAmount =
    selectedService?.taxMode === 'inclusive'
      ? Number(((discountedSubtotal * (Number(selectedService.taxRate) || 0)) / 100).toFixed(2))
      : 0;
  const total = Number((discountedSubtotal + taxAmount).toFixed(2));

  const saveService = async () => {
    if (!serviceForm.name.trim() || !serviceForm.code.trim() || serviceForm.rate <= 0) {
      toast.error('Service name, code, and a positive rate are required.');
      return;
    }
    try {
      const saved = {
        ...serviceForm,
        name: serviceForm.name.trim(),
        code: serviceForm.code.trim().toUpperCase(),
        updatedAt: new Date().toISOString(),
      };
      await saveHospitalityService(saved);
      setServices((current) => [...current.filter((item) => item.id !== saved.id), saved]);
      setServiceModal(false);
      toast.success('Hospitality service saved successfully.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save hospitality service.');
    }
  };

  const chooseGuest = (guest: HospitalityGuest) => {
    setReservationForm((current) => ({
      ...current,
      guestName: guest.name,
      guestPhone: guest.phone,
      guestEmail: guest.email ?? '',
      guestIdentityNumber: guest.identityNumber ?? '',
    }));
    setGuestQuery('');
    setGuestPickerOpen(false);
  };

  const openGuestModal = () => {
    setGuestForm({
      ...emptyGuestForm(),
      name: reservationForm.guestName,
      phone: reservationForm.guestPhone,
      email: reservationForm.guestEmail,
      identityNumber: reservationForm.guestIdentityNumber,
    });
    setGuestPickerOpen(false);
    setGuestModal(true);
  };

  const saveGuestFromReservation = async () => {
    if (!guestForm.name.trim() || !guestForm.phone.trim()) {
      toast.error('Guest name and phone number are required.');
      return;
    }
    const phone = normalizeCustomerPhone(guestForm.phone);
    if (guests.some((guest) => normalizeCustomerPhone(guest.phone) === phone)) {
      toast.error('A guest with this phone number already exists. Select the existing guest.');
      return;
    }
    const guest: HospitalityGuest = {
      id: `guest-${Date.now()}`,
      name: guestForm.name.trim(),
      phone,
      email: guestForm.email.trim() || undefined,
      identityNumber: guestForm.identityNumber.trim() || undefined,
      address: guestForm.address.trim() || undefined,
      city: guestForm.city.trim() || undefined,
      country: guestForm.country.trim() || undefined,
      notes: guestForm.notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    try {
      await saveHospitalityGuest(guest);
      setGuests((current) => [...current, guest].sort((a, b) => a.name.localeCompare(b.name)));
      chooseGuest(guest);
      setGuestModal(false);
      toast.success('Guest profile added.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save guest profile.');
    }
  };

  const saveReservation = async (paymentAction: 'pay-later' | 'record-payment' | 'edit') => {
    if (
      !selectedService ||
      !reservationForm.guestName.trim() ||
      !reservationForm.guestPhone.trim()
    ) {
      toast.error('Select a service and provide the guest name and phone number.');
      return;
    }
    if (new Date(reservationForm.checkOutAt) <= new Date(reservationForm.checkInAt)) {
      toast.error('Check-out must be after check-in.');
      return;
    }
    if (isRoom(selectedService) && !availableServiceIds.has(selectedService.id)) {
      toast.error('This room is already reserved for the selected dates. Choose another room.');
      return;
    }
    try {
      const phone = normalizeCustomerPhone(reservationForm.guestPhone);
      const existing = guests.find((guest) => normalizeCustomerPhone(guest.phone) === phone);
      const guest: HospitalityGuest = existing ?? {
        id: `guest-${Date.now()}`,
        name: reservationForm.guestName.trim(),
        phone,
        email: reservationForm.guestEmail.trim() || undefined,
        identityNumber: reservationForm.guestIdentityNumber.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      if (!existing) {
        await saveHospitalityGuest(guest);
        setGuests((current) => [...current, guest].sort((a, b) => a.name.localeCompare(b.name)));
      }
      const now = new Date().toISOString();
      const amountPaid =
        paymentAction === 'pay-later'
          ? 0
          : Math.min(total, Math.max(0, Number(reservationForm.amountPaid) || 0));
      if (paymentAction === 'record-payment' && amountPaid <= 0) {
        toast.error('Enter the payment received, or choose Book & Pay Later.');
        return;
      }
      const existingReservation = reservations.find((item) => item.id === editingReservationId);
      if (paymentAction === 'edit' && !existingReservation) {
        toast.error('The reservation could not be found. Refresh and try again.');
        return;
      }
      const reservation: HospitalityReservation = {
        id: existingReservation?.id ?? `reservation-${Date.now()}`,
        reservationCode:
          existingReservation?.reservationCode ?? `RES-${Date.now().toString().slice(-8)}`,
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        guestId: guest.id,
        guestName: reservationForm.guestName.trim(),
        guestPhone: phone,
        guestEmail: reservationForm.guestEmail.trim() || undefined,
        guestIdentityNumber: reservationForm.guestIdentityNumber.trim() || undefined,
        checkInAt: reservationForm.checkInAt,
        checkOutAt: reservationForm.checkOutAt,
        quantity: units,
        rate: selectedService.rate,
        discount: Number(reservationForm.discount) || 0,
        taxRate: Number(selectedService.taxRate) || 0,
        taxMode: selectedService.taxMode ?? 'exclusive',
        subtotal,
        taxAmount,
        total,
        status: existingReservation?.status ?? 'reserved',
        amountPaid,
        paymentStatus: amountPaid >= total ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid',
        paymentMethod: amountPaid > 0 ? reservationForm.paymentMethod : undefined,
        paymentRecordedAt:
          amountPaid > 0 ? (existingReservation?.paymentRecordedAt ?? now) : undefined,
        notes: reservationForm.notes.trim() || undefined,
        createdAt: existingReservation?.createdAt ?? now,
        updatedAt: now,
      };
      await saveHospitalityReservation(reservation);
      setReservations((current) =>
        existingReservation
          ? current.map((item) => (item.id === reservation.id ? reservation : item))
          : [reservation, ...current]
      );
      setReservationModal(false);
      setEditingReservationId(null);
      setReservationForm(emptyReservationForm());
      toast.success(
        paymentAction === 'edit'
          ? `Reservation ${reservation.reservationCode} updated successfully.`
          : paymentAction === 'record-payment'
            ? `Reservation ${reservation.reservationCode} booked and payment recorded.`
            : `Reservation ${reservation.reservationCode} booked. Payment remains outstanding.`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create reservation.');
    }
  };

  const openNewReservation = () => {
    setEditingReservationId(null);
    setReservationForm(emptyReservationForm());
    setGuestQuery('');
    setGuestPickerOpen(false);
    setReservationModal(true);
  };

  const editReservation = (reservation: HospitalityReservation) => {
    setEditingReservationId(reservation.id);
    setReservationForm({
      serviceId: reservation.serviceId,
      guestName: reservation.guestName,
      guestPhone: reservation.guestPhone,
      guestEmail: reservation.guestEmail ?? '',
      guestIdentityNumber: reservation.guestIdentityNumber ?? '',
      checkInAt: reservation.checkInAt.slice(0, 16),
      checkOutAt: reservation.checkOutAt.slice(0, 16),
      quantity: reservation.quantity,
      discount: reservation.discount,
      amountPaid: reservation.amountPaid,
      paymentMethod: reservation.paymentMethod ?? 'cash',
      notes: reservation.notes ?? '',
    });
    setGuestQuery(reservation.guestName);
    setReservationModal(true);
  };

  const updateReservationStatus = async (
    reservation: HospitalityReservation,
    status: HospitalityReservation['status']
  ) => {
    try {
      const updated = { ...reservation, status, updatedAt: new Date().toISOString() };
      await saveHospitalityReservation(updated);
      setReservations((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      toast.success(`Reservation marked ${status}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update reservation.');
    }
  };

  return (
    <AppLayout title="Hospitality" subtitle="Rooms, services, reservations, and guest stays">
      <PermissionGate permission="dashboard">
        <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
          {activeBusinessMode !== 'hospitality' && (
            <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
              Hospitality is not enabled for this business. Enable Retail + Hospitality in Settings
              to use this workspace.
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {dedicatedPage ? (
              <div>
                <p className="text-xs font-bold uppercase text-primary">Hospitality</p>
                <h2 className="text-xl font-bold">
                  {tab === 'services' ? 'Rooms & Services' : 'Reservations'}
                </h2>
              </div>
            ) : (
              <div className="flex gap-2 rounded-lg border border-border bg-card p-1">
                {[
                  ['reservations', CalendarCheck, 'Reservations'],
                  ['services', BedDouble, 'Rooms & Services'],
                ].map(([value, Icon, label]) => {
                  const TabIcon = Icon as typeof BedDouble;
                  return (
                    <button
                      key={value as string}
                      type="button"
                      onClick={() => setTab(value as Tab)}
                      className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${tab === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                    >
                      <TabIcon size={15} /> {label as string}
                    </button>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              onClick={() =>
                tab === 'services'
                  ? (setServiceForm(emptyService()), setServiceModal(true))
                  : openNewReservation()
              }
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white"
            >
              <Plus size={15} /> {tab === 'services' ? 'Add Room / Service' : 'New Reservation'}
            </button>
          </div>

          {tab === 'services' ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {services.map((service) => (
                <article
                  key={service.id}
                  className="rounded-xl border border-border bg-card p-4 shadow-card"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{service.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {service.code} · {service.type === 'service' ? 'Service' : 'Room'} · per{' '}
                        {service.rateUnit}
                      </p>
                    </div>
                    <BedDouble size={18} className="text-primary" />
                  </div>
                  <p className="mt-4 text-lg font-bold">
                    {formatMoney(service.rate, settings.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {service.taxMode === 'inclusive'
                      ? `VAT ${service.taxRate}% applies`
                      : 'VAT exempt'}
                  </p>
                </article>
              ))}
              {services.length === 0 && (
                <p className="col-span-full rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  Add rooms or services to begin.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Reservation</th>
                    <th className="px-4 py-3">Guest</th>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3">Stay</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reservations.map((reservation) => (
                    <tr key={reservation.id}>
                      <td className="px-4 py-3 font-mono text-xs">{reservation.reservationCode}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold">{reservation.guestName}</p>
                        <p className="text-xs text-muted-foreground">{reservation.guestPhone}</p>
                      </td>
                      <td className="px-4 py-3">{reservation.serviceName}</td>
                      <td className="px-4 py-3 text-xs">
                        {new Date(reservation.checkInAt).toLocaleString()}
                        <br />
                        to {new Date(reservation.checkOutAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {formatMoney(reservation.total, settings.currency)}
                      </td>
                      <td className="px-4 py-3 capitalize">
                        <span className="capitalize">{reservationDisplayStatus(reservation)}</span>
                        <span className="mt-1 block text-xs capitalize text-muted-foreground">
                          {reservationPaymentStatus(reservation)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {reservation.status === 'reserved' && (
                            <button
                              type="button"
                              onClick={() =>
                                void updateReservationStatus(reservation, 'checked-in')
                              }
                              className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary"
                            >
                              Check in
                            </button>
                          )}
                          {reservation.status === 'checked-in' && (
                            <button
                              type="button"
                              onClick={() =>
                                void updateReservationStatus(reservation, 'checked-out')
                              }
                              className="rounded-md bg-success/10 px-2 py-1 text-xs font-semibold text-success"
                            >
                              Check out
                            </button>
                          )}
                          {reservation.status !== 'checked-out' &&
                            reservation.status !== 'cancelled' && (
                              <button
                                type="button"
                                onClick={() => editReservation(reservation)}
                                className="rounded-md border border-border px-2 py-1 text-xs font-semibold"
                              >
                                Edit
                              </button>
                            )}
                          {reservation.status === 'reserved' && (
                            <button
                              type="button"
                              onClick={() => void updateReservationStatus(reservation, 'cancelled')}
                              className="rounded-md border border-danger/30 px-2 py-1 text-xs font-semibold text-danger"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {reservations.length === 0 && (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  No reservations yet.
                </p>
              )}
            </div>
          )}
        </div>
      </PermissionGate>

      <Modal
        open={serviceModal}
        onClose={() => setServiceModal(false)}
        title="Add Room or Service"
        footer={
          <>
            <button
              type="button"
              onClick={() => setServiceModal(false)}
              className="rounded-lg bg-secondary px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void saveService()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
            >
              Save
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Room / Service name</span>
            <input
              value={serviceForm.name}
              onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Code</span>
            <input
              value={serviceForm.code}
              onChange={(e) => setServiceForm({ ...serviceForm, code: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Entry type</span>
            <NiceSelect
              value={serviceForm.type ?? 'room'}
              onChange={(type) =>
                setServiceForm({ ...serviceForm, type: type as HospitalityService['type'] })
              }
              options={[
                { value: 'room', label: 'Room / accommodation unit' },
                { value: 'service', label: 'Other hospitality service' },
              ]}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Rate</span>
            <input
              type="number"
              min="0"
              value={serviceForm.rate}
              onChange={(e) => setServiceForm({ ...serviceForm, rate: Number(e.target.value) })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Rate unit</span>
            <NiceSelect
              value={serviceForm.rateUnit}
              onChange={(value) =>
                setServiceForm({
                  ...serviceForm,
                  rateUnit: value as HospitalityService['rateUnit'],
                })
              }
              options={[
                { value: 'night', label: 'Per night' },
                { value: 'hour', label: 'Per hour' },
                { value: 'service', label: 'Per service' },
              ]}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Guest capacity</span>
            <input
              type="number"
              min="1"
              value={serviceForm.capacity ?? 2}
              onChange={(e) =>
                setServiceForm({ ...serviceForm, capacity: Math.max(1, Number(e.target.value)) })
              }
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-muted-foreground">Facilities / amenities</span>
            <input
              value={(serviceForm.amenities ?? []).join(', ')}
              onChange={(e) =>
                setServiceForm({
                  ...serviceForm,
                  amenities: e.target.value
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean),
                })
              }
              placeholder="Wi-Fi, air conditioning, TV"
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">VAT rate</span>
            <input
              type="number"
              min="0"
              value={serviceForm.taxRate}
              onChange={(e) => setServiceForm({ ...serviceForm, taxRate: Number(e.target.value) })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">VAT mode</span>
            <NiceSelect
              value={serviceForm.taxMode ?? 'exclusive'}
              onChange={(value) =>
                setServiceForm({ ...serviceForm, taxMode: value as HospitalityService['taxMode'] })
              }
              options={[
                { value: 'exclusive', label: 'VAT exempt (no VAT)' },
                { value: 'inclusive', label: 'VAT applies (add separately)' },
              ]}
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={reservationModal}
        onClose={() => setReservationModal(false)}
        title={editingReservationId ? 'Edit Reservation' : 'New Reservation'}
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setReservationModal(false)}
              className="rounded-lg bg-secondary px-4 py-2 text-sm"
            >
              Cancel
            </button>
            {editingReservationId ? (
              <button
                type="button"
                onClick={() => void saveReservation('edit')}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
              >
                Save Changes
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void saveReservation('pay-later')}
                  className="rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary"
                >
                  Book &amp; Pay Later
                </button>
                <button
                  type="button"
                  onClick={() => void saveReservation('record-payment')}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
                >
                  Book &amp; Record Payment
                </button>
              </>
            )}
          </>
        }
      >
        <div className="space-y-4">
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Room / Service</span>
            <NiceSelect
              value={reservationForm.serviceId}
              onChange={(serviceId) => setReservationForm({ ...reservationForm, serviceId })}
              placeholder="Select room or service"
              options={services
                .filter((service) => service.active)
                .map((service) => ({
                  value: service.id,
                  label: `${service.name} — ${formatMoney(service.rate, settings.currency)} / ${service.rateUnit}${isRoom(service) && !availableServiceIds.has(service.id) ? ' · Unavailable for selected dates' : ''}`,
                }))}
            />
            {services.filter((service) => service.active).length === 0 && (
              <p className="mt-1 text-xs text-warning">
                No rooms or services are configured for this business. Add one under Rooms &amp;
                Services.
              </p>
            )}
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="relative space-y-1">
              <span className="text-xs text-muted-foreground">Guest name</span>
              <input
                value={reservationForm.guestName}
                onFocus={() => setGuestPickerOpen(true)}
                onBlur={() => window.setTimeout(() => setGuestPickerOpen(false), 150)}
                onChange={(e) => {
                  setReservationForm({ ...reservationForm, guestName: e.target.value });
                  setGuestQuery(e.target.value);
                }}
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
              />
              {guestPickerOpen && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-modal">
                  <button
                    type="button"
                    onClick={openGuestModal}
                    className="mb-1 block w-full rounded-md border-b border-border px-3 py-2 text-left text-sm font-semibold text-primary hover:bg-muted"
                  >
                    + Add new guest
                  </button>
                  {guestMatches.map((guest) => (
                    <button
                      type="button"
                      key={guest.id}
                      onClick={() => chooseGuest(guest)}
                      className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      {guest.name}
                      <span className="block text-xs text-muted-foreground">{guest.phone}</span>
                    </button>
                  ))}
                  {guestMatches.length === 0 && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      No matching guest profile.
                    </p>
                  )}
                </div>
              )}
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Guest phone</span>
              <input
                type="tel"
                value={reservationForm.guestPhone}
                onChange={(e) =>
                  setReservationForm({ ...reservationForm, guestPhone: e.target.value })
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Guest email</span>
              <input
                type="email"
                value={reservationForm.guestEmail}
                onChange={(e) =>
                  setReservationForm({ ...reservationForm, guestEmail: e.target.value })
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">NIN / Identity number</span>
              <input
                value={reservationForm.guestIdentityNumber}
                onChange={(e) =>
                  setReservationForm({ ...reservationForm, guestIdentityNumber: e.target.value })
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Arrival date and time</span>
              <DateTimePicker
                value={reservationForm.checkInAt}
                onChange={(checkInAt) => setReservationForm({ ...reservationForm, checkInAt })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Departure date and time</span>
              <DateTimePicker
                value={reservationForm.checkOutAt}
                onChange={(checkOutAt) => setReservationForm({ ...reservationForm, checkOutAt })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Discount (%)</span>
              <input
                type="number"
                min="0"
                max="100"
                value={reservationForm.discount}
                onChange={(e) =>
                  setReservationForm({ ...reservationForm, discount: Number(e.target.value) })
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Amount received now</span>
              <input
                type="number"
                min="0"
                value={reservationForm.amountPaid}
                onChange={(e) =>
                  setReservationForm({ ...reservationForm, amountPaid: Number(e.target.value) })
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Payment method</span>
              <NiceSelect
                value={reservationForm.paymentMethod ?? 'cash'}
                onChange={(paymentMethod) =>
                  setReservationForm({
                    ...reservationForm,
                    paymentMethod: paymentMethod as HospitalityReservation['paymentMethod'],
                  })
                }
                options={[
                  { value: 'cash', label: 'Cash' },
                  { value: 'card', label: 'Card' },
                  { value: 'mobile', label: 'Mobile' },
                  { value: 'bank-transfer', label: 'Bank transfer' },
                  { value: 'split', label: 'Split payment' },
                ]}
              />
            </label>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between">
              <span>
                Subtotal ({units} unit{units === 1 ? '' : 's'})
              </span>
              <span>{formatMoney(subtotal, settings.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span>VAT</span>
              <span>{formatMoney(taxAmount, settings.currency)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-border pt-1 font-bold">
              <span>Total</span>
              <span>{formatMoney(total, settings.currency)}</span>
            </div>
          </div>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Notes</span>
            <textarea
              value={reservationForm.notes}
              onChange={(e) => setReservationForm({ ...reservationForm, notes: e.target.value })}
              className="min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
        </div>
      </Modal>
      <Modal
        open={guestModal}
        onClose={() => setGuestModal(false)}
        title="Add Guest"
        subtitle="Create a guest profile and attach it to this reservation."
        footer={
          <>
            <button
              type="button"
              onClick={() => setGuestModal(false)}
              className="rounded-lg bg-secondary px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void saveGuestFromReservation()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
            >
              Save Guest
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Full name</span>
            <input
              value={guestForm.name}
              onChange={(e) => setGuestForm({ ...guestForm, name: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Phone number</span>
            <input
              type="tel"
              value={guestForm.phone}
              onChange={(e) => setGuestForm({ ...guestForm, phone: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Email</span>
            <input
              type="email"
              value={guestForm.email}
              onChange={(e) => setGuestForm({ ...guestForm, email: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Identity number</span>
            <input
              value={guestForm.identityNumber}
              onChange={(e) => setGuestForm({ ...guestForm, identityNumber: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-muted-foreground">Address</span>
            <input
              value={guestForm.address}
              onChange={(e) => setGuestForm({ ...guestForm, address: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">City</span>
            <input
              value={guestForm.city}
              onChange={(e) => setGuestForm({ ...guestForm, city: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Country</span>
            <input
              value={guestForm.country}
              onChange={(e) => setGuestForm({ ...guestForm, country: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-muted-foreground">Notes</span>
            <textarea
              value={guestForm.notes}
              onChange={(e) => setGuestForm({ ...guestForm, notes: e.target.value })}
              className="min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
        </div>
      </Modal>
    </AppLayout>
  );
}
