export interface LocalSalesShift {
  id: string;
  businessDate: string;
  userId: string;
  userName: string;
  openingCash: number;
  openingPurpose: string;
  openedAt: string;
  closedAt?: string;
  closingCash?: number;
  expectedCash?: number;
  cashVariance?: number;
  status: 'open' | 'closed';
}

export function businessDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function shiftKey(userId: string, date = businessDate()): string {
  return 'tovapos.sales-shift.' + userId + '.' + date;
}

export function getSalesShift(userId: string): LocalSalesShift | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(shiftKey(userId));
  if (!raw) return null;
  try { return JSON.parse(raw) as LocalSalesShift; } catch { return null; }
}

export function getOpenSalesShift(userId: string): LocalSalesShift | null {
  const shift = getSalesShift(userId);
  return shift?.status === 'open' ? shift : null;
}

export function saveSalesShift(shift: LocalSalesShift): void {
  window.localStorage.setItem(shiftKey(shift.userId, shift.businessDate), JSON.stringify(shift));
  window.dispatchEvent(new CustomEvent('tovapos:sales-shift'));
}

export function clearSalesShift(userId: string, date = businessDate()): void {
  window.localStorage.removeItem(shiftKey(userId, date));
  window.dispatchEvent(new CustomEvent('tovapos:sales-shift'));
}


export function clearAllSalesShiftsLocally(): void {
  if (typeof window === 'undefined') return;
  const prefix = 'tovapos.sales-shift.';
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(prefix)) window.localStorage.removeItem(key);
  }
  window.dispatchEvent(new CustomEvent('tovapos:sales-shift'));
}
