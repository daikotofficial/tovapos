export function normalizeCustomerPhone(value: string | undefined | null): string {
  return String(value ?? '')
    .trim()
    .replace(/[^\d+]/g, '');
}
