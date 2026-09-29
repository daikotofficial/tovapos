export function normalizePhoneForLogin(value: string): string {
  const compact = value.trim().replace(/[^\d+]/g, '');
  if (!compact) return '';
  const digits = compact.replace(/\+/g, '');
  if (!digits || digits.length < 7 || digits.length > 15) return '';
  if (digits.startsWith('00')) return '+' + digits.slice(2);
  if (digits.startsWith('0')) return '+234' + digits.slice(1);
  if (digits.startsWith('234')) return '+' + digits;
  return '+' + digits;
}

export function phoneLoginCandidates(value: string): string[] {
  const compact = value.trim().replace(/[^\d+]/g, '');
  const normalized = normalizePhoneForLogin(value);
  return [...new Set([compact, compact.replace(/^\+/, ''), normalized, normalized.replace(/^\+/, '')].filter(Boolean))];
}
