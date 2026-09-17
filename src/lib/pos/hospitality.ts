import type { HospitalityReservation, HospitalityService } from './types';

export function isRoom(service: HospitalityService): boolean {
  return service.type !== 'service';
}

export function isReservationLive(reservation: HospitalityReservation, now = new Date()): boolean {
  if (reservation.status === 'cancelled' || reservation.status === 'checked-out') return false;
  return new Date(reservation.checkOutAt).getTime() > now.getTime();
}

export function reservationOverlaps(
  reservation: HospitalityReservation,
  serviceId: string,
  checkInAt: string,
  checkOutAt: string,
  now = new Date()
): boolean {
  if (reservation.serviceId !== serviceId || !isReservationLive(reservation, now)) return false;
  return (
    new Date(reservation.checkInAt).getTime() < new Date(checkOutAt).getTime() &&
    new Date(reservation.checkOutAt).getTime() > new Date(checkInAt).getTime()
  );
}

export function isRoomAvailable(
  serviceId: string,
  checkInAt: string,
  checkOutAt: string,
  reservations: HospitalityReservation[],
  now = new Date()
): boolean {
  return !reservations.some((reservation) =>
    reservationOverlaps(reservation, serviceId, checkInAt, checkOutAt, now)
  );
}

export function reservationPaymentStatus(
  reservation: Pick<HospitalityReservation, 'total' | 'amountPaid' | 'paymentStatus'>
): 'unpaid' | 'partial' | 'paid' {
  const total = Math.max(0, Number(reservation.total) || 0);
  const paid = Math.max(0, Number(reservation.amountPaid) || 0);
  if (paid >= total && total > 0) return 'paid';
  if (paid > 0) return 'partial';
  return reservation.paymentStatus ?? 'unpaid';
}

export function reservationDisplayStatus(
  reservation: HospitalityReservation,
  now = new Date()
): string {
  if (
    (reservation.status === 'reserved' || reservation.status === 'checked-in') &&
    new Date(reservation.checkOutAt).getTime() <= now.getTime()
  ) {
    return 'expired';
  }
  return reservation.status.replace('-', ' ');
}
