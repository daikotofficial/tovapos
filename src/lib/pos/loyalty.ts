import type { BusinessSettings, Customer } from './types';

function positive(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function loyaltyEarnedForSale(
  amount: number,
  settings: BusinessSettings,
  paymentMethod: string
): number {
  if (!settings.loyaltyEnabled || paymentMethod === 'credit') return 0;
  const earnPercent = positive(settings.loyaltyEarnPercent);
  return Number(((Math.max(0, amount) * earnPercent) / 100).toFixed(2));
}

export function loyaltyRedemption(
  customer: Customer | null | undefined,
  requestedCredit: number,
  grandTotal: number,
  settings: BusinessSettings,
  paymentMethod: string
): { points: number; credit: number } {
  if (!settings.loyaltyEnabled || paymentMethod === 'credit' || !customer) {
    return { points: 0, credit: 0 };
  }
  const available = positive(customer.loyaltyPoints);
  const threshold = positive(settings.loyaltyRedemptionThreshold);
  if (available < threshold || requestedCredit <= 0) return { points: 0, credit: 0 };
  const credit = Number(Math.min(available, requestedCredit, Math.max(0, grandTotal)).toFixed(2));
  return { points: credit, credit };
}
