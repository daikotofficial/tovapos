export function formatMoney(amount: number, currency = 'NGN'): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const normalizedCurrency = currency || 'NGN';

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: normalizedCurrency,
    minimumFractionDigits: safeAmount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
    .format(safeAmount)
    .replace(/\u00a0/g, ' ');
}

export function getCurrencyInputPrefix(currency = 'NGN'): string {
  return currency.toUpperCase();
}
