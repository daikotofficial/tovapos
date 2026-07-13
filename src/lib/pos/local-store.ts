import {
  BusinessSettings,
  Customer,
  ExpenseRecord,
  InventoryItem,
  SaleTransaction,
  StockMovement,
  SyncQueueItem,
  TovaUser,
  Vendor,
} from './types';
import { normalizeInventoryItem } from './stock';
import { defaultSettings } from './seeds';

const DB_NAME = 'tovapos-local-first';
const DB_VERSION = 4;
let activeTenantId = 'anonymous';

type StoreName =
  | 'inventory'
  | 'stockMovements'
  | 'sales'
  | 'syncQueue'
  | 'users'
  | 'customers'
  | 'vendors'
  | 'expenses'
  | 'settings';

const STORE_NAMES: StoreName[] = [
  'inventory',
  'stockMovements',
  'sales',
  'syncQueue',
  'users',
  'customers',
  'vendors',
  'expenses',
  'settings',
];

export interface InventoryPageResult {
  items: InventoryItem[];
  nextCursor: string | null;
  limit: number;
  total?: number;
}

export interface InventoryMetrics {
  totalProducts: number;
  totalUnits: number;
  lowStock: number;
  criticalStock: number;
  outOfStock: number;
  expired: number;
  expiringSoon: number;
  totalValue: number;
  potentialProfit: number;
}

export interface SalesMetrics {
  completedCount: number;
  refundedCount: number;
  voidedCount: number;
  revenue: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  receivables: number;
  cashSales: number;
  nonCashSales: number;
  topProducts: {
    inventoryItemId: string;
    name: string;
    qty: number;
    revenue: number;
    profit: number;
  }[];
  expenseCategories: [string, number][];
}

export interface ReportRowsResult<T = unknown> {
  rows: T[];
  limit: number;
  offset: number;
}

export interface InventoryPageInput {
  q?: string;
  category?: string;
  supplier?: string;
  status?: string;
  cursor?: string;
  offset?: number;
  limit?: number;
  includeTotal?: boolean;
  expiryAlertDays?: number;
}

function canUseIndexedDb(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function storageKey(storeName: StoreName): string {
  return `tovapos.${activeTenantId}.${storeName}`;
}

function cleanForBrowserStorage<T extends { id: string }>(item: T, storeName?: StoreName): T {
  const cleanItem = { ...item } as Record<string, unknown>;
  delete cleanItem._expectedUpdatedAt;
  if (storeName === 'users') {
    delete cleanItem.passwordHash;
    delete cleanItem.passwordSalt;
    delete cleanItem.newPassword;
    cleanItem.pin = '';
  }
  return cleanItem as T;
}

function shouldUsePostgresStore(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof fetch !== 'undefined' &&
    process.env.NEXT_PUBLIC_STORAGE_DRIVER === 'postgres'
  );
}

function isNetworkFailure(error: unknown): boolean {
  return (
    (typeof navigator !== 'undefined' && !navigator.onLine) ||
    error instanceof TypeError ||
    (error instanceof Error && /fetch|network|load failed/i.test(error.message))
  );
}

async function apiRequest<T>(
  storeName: StoreName,
  init?: RequestInit,
  params?: Record<string, string | number | boolean | undefined>
): Promise<T> {
  const query = new URLSearchParams({ store: storeName });
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  const response = await fetch(`/api/pos-store?${query.toString()}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(10_000),
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(error?.error ?? `POS store request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function getAllFromBrowser<T>(storeName: StoreName): Promise<T[]> {
  if (!canUseIndexedDb()) {
    const raw = window.localStorage.getItem(storageKey(storeName));
    return raw ? (JSON.parse(raw) as T[]) : [];
  }

  const db = await openDb();
  const transaction = db.transaction(storeName, 'readonly');
  const done = transactionDone(transaction);
  const records = await requestToPromise<T[]>(transaction.objectStore(storeName).getAll());
  await done;
  return records;
}

async function putOneInBrowser<T extends { id: string }>(
  storeName: StoreName,
  item: T
): Promise<void> {
  if (!canUseIndexedDb()) {
    const raw = window.localStorage.getItem(storageKey(storeName));
    const existing = raw ? (JSON.parse(raw) as T[]) : [];
    const cleanItem = cleanForBrowserStorage(item, storeName);
    window.localStorage.setItem(
      storageKey(storeName),
      JSON.stringify([...existing.filter((record) => record.id !== item.id), cleanItem])
    );
    return;
  }
  const db = await openDb();
  const transaction = db.transaction(storeName, 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(storeName).put(cleanForBrowserStorage(item, storeName));
  await done;
}

async function putManyInBrowser<T extends { id: string }>(
  storeName: StoreName,
  items: T[]
): Promise<void> {
  if (!canUseIndexedDb()) {
    const raw = window.localStorage.getItem(storageKey(storeName));
    const existing = raw ? (JSON.parse(raw) as T[]) : [];
    const cleanItems = items.map((item) => cleanForBrowserStorage(item, storeName));
    const incoming = new Set(cleanItems.map((item) => item.id));
    window.localStorage.setItem(
      storageKey(storeName),
      JSON.stringify([...existing.filter((record) => !incoming.has(record.id)), ...cleanItems])
    );
    return;
  }
  const db = await openDb();
  const transaction = db.transaction(storeName, 'readwrite');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(storeName);
  items.forEach((item) => store.put(cleanForBrowserStorage(item, storeName)));
  await done;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error('Browser storage request timed out')),
      5_000
    );
    request.onsuccess = () => {
      window.clearTimeout(timeout);
      resolve(request.result);
    };
    request.onerror = () => {
      window.clearTimeout(timeout);
      reject(request.error);
    };
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      try {
        transaction.abort();
      } catch {
        // The transaction may already be complete.
      }
      reject(new Error('Browser storage transaction timed out'));
    }, 5_000);
    transaction.oncomplete = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    transaction.onerror = () => {
      window.clearTimeout(timeout);
      reject(transaction.error);
    };
    transaction.onabort = () => {
      window.clearTimeout(timeout);
      reject(transaction.error ?? new Error('Browser storage transaction was cancelled'));
    };
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function setLocalTenant(tenantId: string): void {
  const normalized = tenantId.trim() || 'anonymous';
  if (normalized === activeTenantId) return;
  if (dbPromise) void dbPromise.then((database) => database.close()).catch(() => undefined);
  dbPromise = null;
  activeTenantId = normalized;
}

export async function ensureCleanLocalDatabase(): Promise<void> {
  return Promise.resolve();
}

function openDb(): Promise<IDBDatabase> {
  if (!canUseIndexedDb()) {
    return Promise.reject(new Error('IndexedDB is not available'));
  }

  if (!dbPromise) {
    const pending = new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open(`${DB_NAME}-${activeTenantId}`, DB_VERSION);
      let settled = false;
      const timeout = window.setTimeout(() => {
        settled = true;
        reject(new Error('Browser storage is blocked. Close older TOVAPOS tabs and try again.'));
      }, 4_000);

      request.onupgradeneeded = () => {
        const db = request.result;
        STORE_NAMES.forEach((name) => {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: 'id' });
          }
        });
      };

      request.onsuccess = () => {
        window.clearTimeout(timeout);
        if (settled) request.result.close();
        else resolve(request.result);
      };
      request.onerror = () => {
        window.clearTimeout(timeout);
        reject(request.error);
      };
      request.onblocked = () => {
        window.clearTimeout(timeout);
        settled = true;
        reject(new Error('Browser storage is blocked. Close older TOVAPOS tabs and try again.'));
      };
    });
    dbPromise = pending;
    void pending.catch(() => {
      if (dbPromise === pending) dbPromise = null;
    });
  }

  return dbPromise;
}

async function getAll<T>(storeName: StoreName): Promise<T[]> {
  if (shouldUsePostgresStore()) {
    try {
      const records = await apiRequest<T[]>(storeName);
      void putManyInBrowser(
        storeName,
        records.filter(
          (record): record is T & { id: string } =>
            Boolean(record) &&
            typeof record === 'object' &&
            typeof (record as { id?: unknown }).id === 'string'
        )
      ).catch((error) => console.warn(`Unable to cache ${storeName} in this browser`, error));
      return records;
    } catch (error) {
      console.error(`Failed to load ${storeName} from Postgres store`, error);
    }
  }

  return getAllFromBrowser<T>(storeName);
}

async function putOne<T extends { id: string }>(storeName: StoreName, item: T): Promise<void> {
  if (shouldUsePostgresStore()) {
    try {
      await apiRequest<{ ok: true }>(storeName, {
        method: 'PUT',
        body: JSON.stringify(item),
      });
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
    }
    await putOneInBrowser(storeName, item);
    return;
  }

  if (!canUseIndexedDb()) {
    const existing = await getAll<T>(storeName);
    const cleanItem = cleanForBrowserStorage(item, storeName);
    const next = [...existing.filter((record) => record.id !== item.id), cleanItem];
    window.localStorage.setItem(storageKey(storeName), JSON.stringify(next));
    return;
  }

  await putOneInBrowser(storeName, item);
}

async function putMany<T extends { id: string }>(storeName: StoreName, items: T[]): Promise<void> {
  if (shouldUsePostgresStore()) {
    try {
      await apiRequest<{ ok: true }>(storeName, {
        method: 'PUT',
        body: JSON.stringify(items),
      });
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
    }
    await putManyInBrowser(storeName, items);
    return;
  }

  if (!canUseIndexedDb()) {
    const existing = await getAll<T>(storeName);
    const cleanItems = items.map((item) => cleanForBrowserStorage(item, storeName));
    const incoming = new Map(cleanItems.map((item) => [item.id, item]));
    const next = [...existing.filter((record) => !incoming.has(record.id)), ...cleanItems];
    window.localStorage.setItem(storageKey(storeName), JSON.stringify(next));
    return;
  }

  await putManyInBrowser(storeName, items);
}

async function deleteOne(storeName: StoreName, id: string): Promise<void> {
  if (shouldUsePostgresStore()) {
    await apiRequest<{ ok: true }>(storeName, {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    });
    return;
  }

  if (!canUseIndexedDb()) {
    const existing = await getAll<{ id: string }>(storeName);
    window.localStorage.setItem(
      storageKey(storeName),
      JSON.stringify(existing.filter((record) => record.id !== id))
    );
    return;
  }

  const db = await openDb();
  const transaction = db.transaction(storeName, 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(storeName).delete(id);
  await done;
}

export async function loadInventory(seed: InventoryItem[]): Promise<InventoryItem[]> {
  if (shouldUsePostgresStore()) {
    try {
      const result = await apiRequest<InventoryPageResult>('inventory', undefined, {
        limit: 100,
      });
      void putManyInBrowser('inventory', result.items).catch((error) =>
        console.warn('Unable to cache inventory in this browser', error)
      );
      if (result.items.length > 0 || seed.length === 0) {
        return result.items.map(normalizeInventoryItem);
      }
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
    }
  }

  const existing = await getAll<InventoryItem>('inventory');
  if (existing.length > 0) {
    return existing.map(normalizeInventoryItem);
  }

  const seeded = seed.map((item) => normalizeInventoryItem(item));
  await putMany('inventory', seeded);
  return seeded;
}

export async function loadInventoryPage(
  input: InventoryPageInput = {}
): Promise<InventoryPageResult> {
  if (shouldUsePostgresStore()) {
    try {
      const result = await apiRequest<InventoryPageResult>('inventory', undefined, {
        ...input,
        limit: input.limit ?? 100,
      });
      void putManyInBrowser('inventory', result.items).catch((error) =>
        console.warn('Unable to cache inventory in this browser', error)
      );
      return {
        ...result,
        items: result.items.map(normalizeInventoryItem),
      };
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
    }
  }

  const allItems = (await getAllFromBrowser<InventoryItem>('inventory')).map(
    normalizeInventoryItem
  );
  const q = input.q?.trim().toLowerCase();
  const filtered = allItems
    .filter((item) => {
      const matchesQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.genericName.toLowerCase().includes(q) ||
        item.sku.toLowerCase().startsWith(q) ||
        item.barcode?.toLowerCase().startsWith(q) ||
        item.batchLot.toLowerCase().includes(q);
      const matchesCategory =
        !input.category || input.category === 'all' || item.category === input.category;
      const matchesSupplier =
        !input.supplier || input.supplier === 'all' || item.supplier === input.supplier;
      const matchesStatus =
        !input.status || input.status === 'all' || item.stockStatus === input.status;
      return matchesQuery && matchesCategory && matchesSupplier && matchesStatus;
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const limit = Math.max(1, Math.min(500, Math.floor(input.limit ?? 100)));
  return {
    items: filtered.slice(0, limit),
    nextCursor: filtered.length > limit ? 'browser-next-page-unavailable' : null,
    limit,
    total: input.includeTotal ? filtered.length : undefined,
  };
}

export async function loadInventoryMetrics(expiryAlertDays = 30): Promise<InventoryMetrics> {
  if (shouldUsePostgresStore()) {
    return apiRequest<InventoryMetrics>('inventory', undefined, {
      metrics: true,
      expiryAlertDays,
    });
  }

  const allItems = (await getAllFromBrowser<InventoryItem>('inventory')).map(
    normalizeInventoryItem
  );
  return {
    totalProducts: allItems.length,
    totalUnits: allItems.reduce((sum, item) => sum + item.currentQty, 0),
    lowStock: allItems.filter(
      (item) => item.stockStatus === 'low' || item.stockStatus === 'critical'
    ).length,
    criticalStock: allItems.filter((item) => item.stockStatus === 'critical').length,
    outOfStock: allItems.filter((item) => item.stockStatus === 'out').length,
    expired: allItems.filter((item) => item.stockStatus === 'expired').length,
    expiringSoon: allItems.filter((item) => {
      const days = Math.floor(
        (new Date(item.expiryDate).getTime() - new Date().setHours(0, 0, 0, 0)) /
          (1000 * 60 * 60 * 24)
      );
      return days >= 0 && days <= expiryAlertDays;
    }).length,
    totalValue: allItems.reduce((sum, item) => sum + item.currentQty * item.unitCost, 0),
    potentialProfit: allItems.reduce(
      (sum, item) => sum + item.currentQty * (item.sellingPrice - item.unitCost),
      0
    ),
  };
}

export async function loadSalesMetrics(
  input: { from?: string; to?: string } = {}
): Promise<SalesMetrics> {
  if (shouldUsePostgresStore()) {
    return apiRequest<SalesMetrics>('sales', undefined, {
      metrics: true,
      from: input.from,
      to: input.to,
    });
  }

  const [sales, expenses] = await Promise.all([loadSales(), loadExpenses()]);
  const inRange = (value: string) =>
    (!input.from || value.slice(0, 10) >= input.from) &&
    (!input.to || value.slice(0, 10) <= input.to);
  const completed = sales.filter((sale) => sale.status === 'completed' && inRange(sale.timestamp));
  const recordedExpenses = expenses.filter(
    (expense) => expense.status === 'recorded' && inRange(expense.incurredAt)
  );
  const topProducts = new Map<string, SalesMetrics['topProducts'][number]>();
  completed.forEach((sale) => {
    sale.items.forEach((item) => {
      const current = topProducts.get(item.inventoryItemId) ?? {
        inventoryItemId: item.inventoryItemId,
        name: item.name,
        qty: 0,
        revenue: 0,
        profit: 0,
      };
      const revenue = item.unitPrice * item.quantity * (1 - item.discount / 100);
      current.qty += item.quantity;
      current.revenue += revenue;
      current.profit +=
        (item.unitPrice * (1 - item.discount / 100) - item.unitCost) * item.quantity;
      topProducts.set(item.inventoryItemId, current);
    });
  });
  const grossProfit = [...topProducts.values()].reduce((sum, item) => sum + item.profit, 0);
  const expenseTotal = recordedExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const expenseCategories = new Map<string, number>();
  recordedExpenses.forEach((expense) => {
    expenseCategories.set(
      expense.category,
      (expenseCategories.get(expense.category) ?? 0) + expense.amount
    );
  });

  return {
    completedCount: completed.length,
    refundedCount: sales.filter((sale) => sale.status === 'refunded' && inRange(sale.timestamp))
      .length,
    voidedCount: sales.filter((sale) => sale.status === 'voided' && inRange(sale.timestamp)).length,
    revenue: completed.reduce((sum, sale) => sum + sale.grandTotal, 0),
    grossProfit,
    expenses: expenseTotal,
    netProfit: grossProfit - expenseTotal,
    receivables: completed.reduce((sum, sale) => sum + Number(sale.amountDue ?? 0), 0),
    cashSales: completed
      .filter((sale) => sale.paymentMethod === 'cash')
      .reduce((sum, sale) => sum + sale.grandTotal, 0),
    nonCashSales: completed
      .filter((sale) => sale.paymentMethod !== 'cash')
      .reduce((sum, sale) => sum + sale.grandTotal, 0),
    topProducts: [...topProducts.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    expenseCategories: [...expenseCategories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
  };
}

export async function loadReportRows<T = unknown>(input: {
  report: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<ReportRowsResult<T>> {
  if (shouldUsePostgresStore()) {
    return apiRequest<ReportRowsResult<T>>('sales', undefined, {
      report: input.report,
      from: input.from,
      to: input.to,
      limit: input.limit ?? 100,
      offset: input.offset ?? 0,
    });
  }

  return {
    rows: [],
    limit: input.limit ?? 100,
    offset: input.offset ?? 0,
  };
}

export async function loadInventoryByIds(ids: string[]): Promise<InventoryItem[]> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  if (shouldUsePostgresStore()) {
    try {
      const records = await apiRequest<InventoryItem[]>('inventory', undefined, {
        ids: uniqueIds.join(','),
      });
      void putManyInBrowser('inventory', records).catch((error) =>
        console.warn('Unable to cache inventory in this browser', error)
      );
      return records.map(normalizeInventoryItem);
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
    }
  }

  const allItems = await getAllFromBrowser<InventoryItem>('inventory');
  const wanted = new Set(uniqueIds);
  return allItems.filter((item) => wanted.has(item.id)).map(normalizeInventoryItem);
}

export async function lookupInventoryItem(rawCode: string): Promise<InventoryItem | null> {
  const scan = rawCode.trim();
  if (!scan) return null;

  if (shouldUsePostgresStore()) {
    try {
      const result = await apiRequest<{ item: InventoryItem | null }>('inventory', undefined, {
        scan,
      });
      if (result.item) {
        void putOneInBrowser('inventory', result.item).catch((error) =>
          console.warn('Unable to cache the product in this browser', error)
        );
      }
      return result.item ? normalizeInventoryItem(result.item) : null;
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
    }
  }

  const { findInventoryItemByScan } = await import('./stock');
  const allItems = (await getAllFromBrowser<InventoryItem>('inventory')).map(
    normalizeInventoryItem
  );
  return findInventoryItemByScan(allItems, scan) ?? null;
}

export async function loadUsers(seed: TovaUser[]): Promise<TovaUser[]> {
  const existing = await getAll<TovaUser>('users');
  if (existing.length > 0) return existing;
  await putMany('users', seed);
  return seed;
}

export async function saveUser(user: TovaUser): Promise<void> {
  await putOne('users', user);
}

export async function deleteUser(userId: string): Promise<void> {
  await deleteOne('users', userId);
}

export async function loadCustomers(seed: Customer[]): Promise<Customer[]> {
  const existing = await getAll<Customer>('customers');
  if (existing.length > 0) return existing;
  await putMany('customers', seed);
  return seed;
}

export async function saveCustomer(customer: Customer): Promise<void> {
  await putOne('customers', customer);
}

export async function loadVendors(seed: Vendor[]): Promise<Vendor[]> {
  const existing = await getAll<Vendor>('vendors');
  if (existing.length > 0) return existing;
  await putMany('vendors', seed);
  return seed;
}

export async function saveVendor(vendor: Vendor): Promise<void> {
  await putOne('vendors', vendor);
}

export async function loadSettings(seed: BusinessSettings): Promise<BusinessSettings> {
  const existing = await getAll<BusinessSettings>('settings');
  if (existing.length > 0) return normalizeSettings(existing[0], seed);
  await putOne('settings', seed);
  return seed;
}

export async function saveSettings(settings: BusinessSettings): Promise<void> {
  await putOne('settings', normalizeSettings(settings, defaultSettings));
}

function normalizeSettings(settings: BusinessSettings, seed: BusinessSettings): BusinessSettings {
  return {
    ...seed,
    ...settings,
    notificationChannels: {
      inApp: settings.notificationChannels?.inApp ?? seed.notificationChannels?.inApp ?? true,
      dashboard:
        settings.notificationChannels?.dashboard ?? seed.notificationChannels?.dashboard ?? true,
      email: settings.notificationChannels?.email ?? seed.notificationChannels?.email ?? false,
    },
    branches: settings.branches?.length ? settings.branches : seed.branches,
    productCategories: settings.productCategories?.length
      ? settings.productCategories
      : seed.productCategories,
    expenseCategories: settings.expenseCategories?.length
      ? settings.expenseCategories
      : seed.expenseCategories,
    paymentMethods: settings.paymentMethods?.length ? settings.paymentMethods : seed.paymentMethods,
    subscriptionPlanId: settings.subscriptionPlanId ?? seed.subscriptionPlanId ?? 'starter',
    subscriptionStatus: settings.subscriptionStatus ?? seed.subscriptionStatus ?? 'active',
    subscriptionRenewsAt: settings.subscriptionRenewsAt ?? seed.subscriptionRenewsAt,
  };
}

export async function saveInventoryItem(item: InventoryItem): Promise<void> {
  await putOne('inventory', normalizeInventoryItem(item));
}

export async function saveInventoryItems(items: InventoryItem[]): Promise<void> {
  await putMany('inventory', items.map(normalizeInventoryItem));
}

export async function loadStockMovements(): Promise<StockMovement[]> {
  const movements = await getAll<StockMovement>('stockMovements');
  return movements.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveStockMovements(movements: StockMovement[]): Promise<void> {
  await putMany('stockMovements', movements);
}

export async function loadSales(): Promise<SaleTransaction[]> {
  if (shouldUsePostgresStore()) {
    try {
      const sales = await apiRequest<SaleTransaction[]>('sales', undefined, { limit: 500 });
      void putManyInBrowser('sales', sales).catch((error) =>
        console.warn('Unable to cache sales in this browser', error)
      );
      return sales.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
    }
  }

  const sales = await getAll<SaleTransaction>('sales');
  return sales.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function saveSale(sale: SaleTransaction): Promise<void> {
  await putOne('sales', sale);
}

export async function loadExpenses(): Promise<ExpenseRecord[]> {
  if (shouldUsePostgresStore()) {
    try {
      const expenses = await apiRequest<ExpenseRecord[]>('expenses', undefined, { limit: 500 });
      void putManyInBrowser('expenses', expenses).catch((error) =>
        console.warn('Unable to cache expenses in this browser', error)
      );
      return expenses.sort((a, b) => b.incurredAt.localeCompare(a.incurredAt));
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
    }
  }

  const expenses = await getAll<ExpenseRecord>('expenses');
  return expenses.sort((a, b) => b.incurredAt.localeCompare(a.incurredAt));
}

export async function saveExpense(expense: ExpenseRecord): Promise<void> {
  await putOne('expenses', expense);
}

export async function loadSyncQueue(): Promise<SyncQueueItem[]> {
  const queue = await getAllFromBrowser<SyncQueueItem>('syncQueue');
  return queue.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveSyncQueueItem(item: SyncQueueItem): Promise<void> {
  await putOne('syncQueue', item);
}

export async function saveSyncQueueItems(items: SyncQueueItem[]): Promise<void> {
  await putMany('syncQueue', items);
}

/**
 * Persists every part of an offline checkout as one IndexedDB transaction.
 * A browser/process interruption therefore leaves either the complete sale or
 * none of it, never inventory without its matching sale and replay command.
 */
export async function saveOfflineSaleBundle(input: {
  inventory: InventoryItem[];
  stockMovements: StockMovement[];
  sale: SaleTransaction;
  customer?: Customer | null;
  queueItems: SyncQueueItem[];
}): Promise<void> {
  if (!canUseIndexedDb()) {
    // localStorage has no cross-key transactions. Keep snapshots so ordinary
    // quota/write failures can still be rolled back on legacy browsers.
    const stores: StoreName[] = ['inventory', 'stockMovements', 'sales', 'customers', 'syncQueue'];
    const snapshots = new Map(
      stores.map((store) => [store, window.localStorage.getItem(storageKey(store))])
    );
    try {
      await putManyInBrowser('inventory', input.inventory.map(normalizeInventoryItem));
      await putManyInBrowser('stockMovements', input.stockMovements);
      await putOneInBrowser('sales', input.sale);
      if (input.customer) await putOneInBrowser('customers', input.customer);
      await putManyInBrowser('syncQueue', input.queueItems);
    } catch (error) {
      snapshots.forEach((value, store) => {
        if (value === null) window.localStorage.removeItem(storageKey(store));
        else window.localStorage.setItem(storageKey(store), value);
      });
      throw error;
    }
    return;
  }

  const db = await openDb();
  const transaction = db.transaction(
    ['inventory', 'stockMovements', 'sales', 'customers', 'syncQueue'],
    'readwrite'
  );
  const done = transactionDone(transaction);
  input.inventory.forEach((item) =>
    transaction
      .objectStore('inventory')
      .put(cleanForBrowserStorage(normalizeInventoryItem(item), 'inventory'))
  );
  input.stockMovements.forEach((item) =>
    transaction.objectStore('stockMovements').put(cleanForBrowserStorage(item, 'stockMovements'))
  );
  transaction.objectStore('sales').put(cleanForBrowserStorage(input.sale, 'sales'));
  if (input.customer) {
    transaction.objectStore('customers').put(cleanForBrowserStorage(input.customer, 'customers'));
  }
  input.queueItems.forEach((item) =>
    transaction.objectStore('syncQueue').put(cleanForBrowserStorage(item, 'syncQueue'))
  );
  await done;
}

/** Persist an offline inventory adjustment and its replay record atomically. */
export async function saveOfflineStockBundle(input: {
  inventory: InventoryItem;
  stockMovement?: StockMovement | null;
  queueItems: SyncQueueItem[];
}): Promise<void> {
  if (!canUseIndexedDb()) {
    const stores: StoreName[] = ['inventory', 'stockMovements', 'syncQueue'];
    const snapshots = new Map(
      stores.map((store) => [store, window.localStorage.getItem(storageKey(store))])
    );
    try {
      await putOneInBrowser('inventory', normalizeInventoryItem(input.inventory));
      if (input.stockMovement) await putOneInBrowser('stockMovements', input.stockMovement);
      await putManyInBrowser('syncQueue', input.queueItems);
    } catch (error) {
      snapshots.forEach((value, store) => {
        if (value === null) window.localStorage.removeItem(storageKey(store));
        else window.localStorage.setItem(storageKey(store), value);
      });
      throw error;
    }
    return;
  }

  const db = await openDb();
  const transaction = db.transaction(['inventory', 'stockMovements', 'syncQueue'], 'readwrite');
  const done = transactionDone(transaction);
  transaction
    .objectStore('inventory')
    .put(cleanForBrowserStorage(normalizeInventoryItem(input.inventory), 'inventory'));
  if (input.stockMovement) {
    transaction
      .objectStore('stockMovements')
      .put(cleanForBrowserStorage(input.stockMovement, 'stockMovements'));
  }
  input.queueItems.forEach((item) =>
    transaction.objectStore('syncQueue').put(cleanForBrowserStorage(item, 'syncQueue'))
  );
  await done;
}

export async function cacheInventoryLocally(items: InventoryItem[]): Promise<void> {
  await putManyInBrowser('inventory', items.map(normalizeInventoryItem));
}

export async function cacheSalesLocally(items: SaleTransaction[]): Promise<void> {
  await putManyInBrowser('sales', items);
}

export async function cacheCustomersLocally(items: Customer[]): Promise<void> {
  await putManyInBrowser('customers', items);
}

export async function cacheStockMovementsLocally(items: StockMovement[]): Promise<void> {
  await putManyInBrowser('stockMovements', items);
}

export async function cacheSyncQueueLocally(items: SyncQueueItem[]): Promise<void> {
  await putManyInBrowser('syncQueue', items);
}

export function createSyncQueueItem(
  input: Pick<SyncQueueItem, 'entity' | 'entityId' | 'action' | 'payload'> &
    Partial<Pick<SyncQueueItem, 'operationId' | 'conflictStrategy' | 'dependsOn'>>
): SyncQueueItem {
  const now = new Date().toISOString();
  const operationId = input.operationId ?? `op-${input.entity}-${input.entityId}-${Date.now()}`;
  return {
    ...input,
    id: `sync-${operationId}-${input.entity}`,
    operationId,
    idempotencyKey: `${input.entity}:${input.action}:${input.entityId}:${operationId}`,
    createdAt: now,
    createdOffline: typeof navigator === 'undefined' ? true : !navigator.onLine,
    attempts: 0,
    status: 'pending',
  };
}
