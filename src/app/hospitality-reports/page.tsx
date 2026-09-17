'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  BedDouble,
  CalendarCheck,
  CircleDollarSign,
  Search,
  Users,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import DatePicker from '@/components/ui/DatePicker';
import { formatMoney } from '@/lib/pos/money';
import {
  loadHospitalityGuests,
  loadHospitalityReservations,
  loadHospitalityServices,
} from '@/lib/pos/local-store';
import { isReservationLive, isRoom, reservationPaymentStatus } from '@/lib/pos/hospitality';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import type { HospitalityGuest, HospitalityReservation, HospitalityService } from '@/lib/pos/types';
import { toast } from 'sonner';

type SortField =
  'createdAt' | 'guestName' | 'serviceName' | 'checkInAt' | 'checkOutAt' | 'total' | 'amountPaid';

function Stat({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: string;
  helper: string;
  icon: typeof BedDouble;
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon size={17} className="text-primary" />
        {label}
      </div>
      <p className="mt-3 font-tabular text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </article>
  );
}

const dateOnly = (value: string) => new Date(`${value}T00:00:00`).getTime();
const displayDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' });

export default function HospitalityReportsPage() {
  const { settings, activeBusinessMode, isHydrated, isAuthenticated } = usePosStore();
  const now = new Date();
  const reportNow = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(
    new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  );
  const [to, setTo] = useState(now.toISOString().slice(0, 10));
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [payment, setPayment] = useState('all');
  const [sort, setSort] = useState<SortField>('checkInAt');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [services, setServices] = useState<HospitalityService[]>([]);
  const [reservations, setReservations] = useState<HospitalityReservation[]>([]);
  const [guests, setGuests] = useState<HospitalityGuest[]>([]);

  useEffect(() => {
    if (!isHydrated || !isAuthenticated || activeBusinessMode !== 'hospitality') return;
    Promise.all([loadHospitalityServices(), loadHospitalityReservations(), loadHospitalityGuests()])
      .then(([s, r, g]) => {
        setServices(s);
        setReservations(r);
        setGuests(g);
      })
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : 'Unable to load hospitality reports.')
      );
  }, [activeBusinessMode, isAuthenticated, isHydrated]);

  const data = useMemo(() => {
    const start = dateOnly(from);
    const end = dateOnly(to) + 86400000 - 1;
    const rows = reservations.filter((r) => {
      const created = new Date(r.createdAt).getTime();
      return created >= start && created <= end;
    });
    const filtered = rows.filter((r) => {
      const pay = reservationPaymentStatus(r);
      const text =
        `${r.reservationCode} ${r.guestName} ${r.guestPhone} ${r.serviceName}`.toLowerCase();
      return (
        (!query.trim() || text.includes(query.trim().toLowerCase())) &&
        (status === 'all' || r.status === status) &&
        (payment === 'all' || pay === payment)
      );
    });
    const sorted = [...filtered].sort((a, b) => {
      const av =
        sort === 'total' || sort === 'amountPaid' ? Number(a[sort]) : String(a[sort]).toLowerCase();
      const bv =
        sort === 'total' || sort === 'amountPaid' ? Number(b[sort]) : String(b[sort]).toLowerCase();
      const result = av < bv ? -1 : av > bv ? 1 : 0;
      return direction === 'asc' ? result : -result;
    });
    const active = rows.filter((r) => r.status !== 'cancelled');
    const booked = active.reduce((sum, r) => sum + Number(r.total || 0), 0);
    const collected = active.reduce((sum, r) => sum + Number(r.amountPaid || 0), 0);
    const occupied = services
      .filter(isRoom)
      .filter((room) =>
        reservations.some((r) => r.serviceId === room.id && isReservationLive(r, reportNow))
      ).length;
    return {
      rows: sorted,
      active,
      booked,
      collected,
      outstanding: Math.max(0, booked - collected),
      occupied,
      rooms: services.filter(isRoom).length,
      arrivals: active.filter((r) => r.checkInAt.slice(0, 10) === to).length,
      departures: active.filter((r) => r.checkOutAt.slice(0, 10) === to).length,
    };
  }, [from, to, query, status, payment, sort, direction, reservations, services, reportNow]);

  const sortBy = (field: SortField) => {
    if (sort === field) setDirection(direction === 'asc' ? 'desc' : 'asc');
    else {
      setSort(field);
      setDirection('desc');
    }
  };
  const header = (label: string, field: SortField) => (
    <button
      type="button"
      onClick={() => sortBy(field)}
      className="inline-flex items-center gap-1 font-bold hover:text-primary"
    >
      {label}
      {sort === field && (direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
    </button>
  );

  return (
    <AppLayout
      title="Hospitality Reports"
      subtitle="Reservations, occupancy, revenue, and guest balances"
    >
      <PermissionGate permission="reports">
        <div className="mx-auto max-w-screen-2xl space-y-5 p-4 sm:p-6">
          <section className="rounded-xl border border-border bg-card p-4 shadow-card">
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1 text-xs font-semibold">
                <span>From</span>
                <DatePicker value={from} onChange={setFrom} />
              </label>
              <label className="space-y-1 text-xs font-semibold">
                <span>To</span>
                <DatePicker value={to} onChange={setTo} />
              </label>
              <label className="min-w-56 flex-1 space-y-1 text-xs font-semibold">
                <span>Search bookings</span>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-2.5 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Guest, booking code, room or phone"
                    className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm"
                  />
                </div>
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="all">All booking statuses</option>
                <option value="reserved">Reserved</option>
                <option value="checked-in">Checked in</option>
                <option value="checked-out">Checked out</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <select
                value={payment}
                onChange={(e) => setPayment(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="all">All payment statuses</option>
                <option value="paid">Paid</option>
                <option value="partial">Part-paid</option>
                <option value="unpaid">Unpaid</option>
              </select>
            </div>
          </section>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Reservation revenue"
              value={formatMoney(data.booked, settings.currency)}
              helper={`${data.active.length} active reservations`}
              icon={CircleDollarSign}
            />
            <Stat
              label="Payments collected"
              value={formatMoney(data.collected, settings.currency)}
              helper="Recorded guest payments"
              icon={CircleDollarSign}
            />
            <Stat
              label="Outstanding balances"
              value={formatMoney(data.outstanding, settings.currency)}
              helper="Balance due from guests"
              icon={BarChart3}
            />
            <Stat
              label="Current occupancy"
              value={`${data.occupied} / ${data.rooms}`}
              helper={`${data.rooms ? Math.round((data.occupied / data.rooms) * 100) : 0}% of rooms occupied`}
              icon={BedDouble}
            />
          </section>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat
              label="Arrivals"
              value={String(data.arrivals)}
              helper={`Expected on ${displayDate(`${to}T00:00:00`)}`}
              icon={CalendarCheck}
            />
            <Stat
              label="Departures"
              value={String(data.departures)}
              helper={`Expected on ${displayDate(`${to}T00:00:00`)}`}
              icon={CalendarCheck}
            />
            <Stat
              label="Guest profiles"
              value={String(guests.length)}
              helper="Guests recorded for this business"
              icon={Users}
            />
          </section>
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h2 className="font-bold">Reservation ledger</h2>
                <p className="text-xs text-muted-foreground">
                  {data.rows.length} matching reservations · sorted by selected column
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-sm">
                <thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">{header('Booking', 'createdAt')}</th>
                    <th className="px-4 py-3">{header('Guest', 'guestName')}</th>
                    <th className="px-4 py-3">{header('Room / service', 'serviceName')}</th>
                    <th className="px-4 py-3">{header('Arrival', 'checkInAt')}</th>
                    <th className="px-4 py-3">{header('Departure', 'checkOutAt')}</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3 text-right">{header('Total', 'total')}</th>
                    <th className="px-4 py-3 text-right">{header('Paid', 'amountPaid')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.rows.map((r) => {
                    const pay = reservationPaymentStatus(r);
                    return (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-semibold">{r.reservationCode}</td>
                        <td className="px-4 py-3">
                          <div>{r.guestName}</div>
                          <div className="text-xs text-muted-foreground">{r.guestPhone}</div>
                        </td>
                        <td className="px-4 py-3">{r.serviceName}</td>
                        <td className="px-4 py-3">{displayDate(r.checkInAt)}</td>
                        <td className="px-4 py-3">{displayDate(r.checkOutAt)}</td>
                        <td className="px-4 py-3 capitalize">{r.status.replace('-', ' ')}</td>
                        <td className="px-4 py-3 capitalize">{pay.replace('-', ' ')}</td>
                        <td className="px-4 py-3 text-right">
                          {formatMoney(Number(r.total), settings.currency)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {formatMoney(Number(r.amountPaid), settings.currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {data.rows.length === 0 && (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  No reservations match the selected filters.
                </p>
              )}
            </div>
          </section>
        </div>
      </PermissionGate>
    </AppLayout>
  );
}
