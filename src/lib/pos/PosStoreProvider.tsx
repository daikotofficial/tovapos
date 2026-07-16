'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BusinessSettings,
  CompleteSaleInput,
  Customer,
  ExpenseRecord,
  InventoryItem,
  Permission,
  RegisterBusinessInput,
  RecordExpenseInput,
  ReconcileCreditSaleInput,
  SaleTransaction,
  StockMovement,
  SyncQueueItem,
  TovaUser,
  UserRole,
  Vendor,
} from './types';
import { assertSellable, normalizeInventoryItem } from './stock';
import {
  createSyncQueueItem,
  cacheCustomersLocally,
  cacheInventoryLocally,
  cacheSalesLocally,
  cacheStockMovementsLocally,
  cacheSyncQueueLocally,
  deleteUser as deleteStoredUser,
  ensureCleanLocalDatabase,
  loadCustomers,
  loadExpenses,
  loadInventory,
  loadInventoryByIds,
  loadSales,
  loadSettings,
  loadStockMovements,
  loadSyncQueue,
  loadUsers,
  loadVendors,
  saveCustomer,
  saveExpense,
  saveInventoryItems,
  saveOfflineSaleBundle,
  saveOfflineStockBundle,
  saveSale,
  saveSettings,
  saveStockMovements,
  saveSyncQueueItem,
  saveUser,
  saveVendor,
  setLocalTenant,
  warmInventoryCache,
} from './local-store';
import { defaultCustomers, defaultSettings, defaultUsers, defaultVendors } from './seeds';
import { getProductUsage, planAllowsPermission } from './subscription';

interface PosStoreValue {
  tenant: { id: string; slug: string; name: string; status?: 'active' | 'suspended' } | null;
  inventory: InventoryItem[];
  stockMovements: StockMovement[];
  sales: SaleTransaction[];
  expenses: ExpenseRecord[];
  users: TovaUser[];
  customers: Customer[];
  vendors: Vendor[];
  settings: BusinessSettings;
  syncQueue: SyncQueueItem[];
  isHydrated: boolean;
  isOnline: boolean;
  connectivity: {
    status: 'checking' | 'online' | 'degraded' | 'offline';
    latencyMs: number | null;
    lastCheckedAt: string | null;
  };
  syncProgress: { isSyncing: boolean; total: number; completed: number; failed: number };
  pendingSyncCount: number;
  retrySyncOperation: (operationId: string) => Promise<void>;
  cancelFailedOfflineSale: (operationId: string) => Promise<void>;
  activeUserId: string;
  currentUser: TovaUser | null;
  isAuthenticated: boolean;
  setActiveUserId: (userId: string) => void;
  signIn: (email: string, password: string, remember: boolean) => Promise<TovaUser>;
  signOut: () => Promise<void>;
  registerBusiness: (input: RegisterBusinessInput) => Promise<{
    message: string;
    developmentVerificationUrl?: string;
    emailDeliveryFailed?: boolean;
  }>;
  hasPermission: (permission: Permission) => boolean;
  upsertInventoryItem: (item: InventoryItem) => Promise<InventoryItem>;
  upsertUser: (user: TovaUser) => Promise<TovaUser>;
  deleteUser: (userId: string) => Promise<void>;
  upsertCustomer: (customer: Customer) => Promise<Customer>;
  upsertVendor: (vendor: Vendor) => Promise<Vendor>;
  updateSettings: (settings: BusinessSettings) => Promise<BusinessSettings>;
  completeSale: (input: CompleteSaleInput) => Promise<SaleTransaction>;
  reconcileCreditSale: (
    saleId: string,
    input: ReconcileCreditSaleInput
  ) => Promise<SaleTransaction>;
  refundSale: (saleId: string, reason: string) => Promise<SaleTransaction>;
  recordExpense: (input: RecordExpenseInput) => Promise<ExpenseRecord>;
}

const PosStoreContext = createContext<PosStoreValue | null>(null);

type VersionedInventoryItem = InventoryItem & {
  _expectedUpdatedAt?: string;
};

const OFFLINE_SESSION_KEY = 'tovapos.offlineSession';

type CachedSession = {
  user: TovaUser;
  tenant: { id: string; slug: string; name: string; status?: 'active' | 'suspended' };
};

function createTransactionId(): string {
  const date = new Date();
  const stamp = date.toISOString().replace(/\D/g, '').slice(0, 14);
  return `TXN-${stamp}-${Math.floor(Math.random() * 900 + 100)}`;
}

function createExpenseId(): string {
  const date = new Date();
  const stamp = date.toISOString().replace(/\D/g, '').slice(0, 14);
  return `EXP-${stamp}-${Math.floor(Math.random() * 900 + 100)}`;
}

function createOperationId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  return `${prefix}-${random}`;
}

function sortInventory(items: InventoryItem[]): InventoryItem[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

export function PosStoreProvider({ children }: { children: React.ReactNode }) {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [sales, setSales] = useState<SaleTransaction[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [users, setUsers] = useState<TovaUser[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [settings, setSettings] = useState<BusinessSettings>(defaultSettings);
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [connectivity, setConnectivity] = useState<PosStoreValue['connectivity']>({
    status: 'checking',
    latencyMs: null,
    lastCheckedAt: null,
  });
  const [syncProgress, setSyncProgress] = useState<PosStoreValue['syncProgress']>({
    isSyncing: false,
    total: 0,
    completed: 0,
    failed: 0,
  });
  const [activeUserId, setActiveUserIdState] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [tenant, setTenant] = useState<{
    id: string;
    slug: string;
    name: string;
    status?: 'active' | 'suspended';
  } | null>(null);
  const saleInFlightRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const healthFailuresRef = useRef(0);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.error('Unable to register offline application shell', error);
      });
    }

    let cancelled = false;
    let activeController: AbortController | null = null;

    const checkHealth = async () => {
      if (!navigator.onLine) {
        healthFailuresRef.current = 2;
        setIsOnline(false);
        setConnectivity((current) => ({
          ...current,
          status: 'offline',
          lastCheckedAt: new Date().toISOString(),
        }));
        return;
      }
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      const timeout = window.setTimeout(() => controller.abort(), 4_000);
      const startedAt = performance.now();
      try {
        const response = await fetch('/api/health', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Health check returned ${response.status}`);
        if (cancelled) return;
        healthFailuresRef.current = 0;
        setIsOnline(true);
        setConnectivity({
          status: 'online',
          latencyMs: Math.round(performance.now() - startedAt),
          lastCheckedAt: new Date().toISOString(),
        });
      } catch {
        if (cancelled) return;
        healthFailuresRef.current += 1;
        const status = healthFailuresRef.current >= 2 ? 'offline' : 'degraded';
        setIsOnline(false);
        setConnectivity((current) => ({
          ...current,
          status,
          latencyMs: null,
          lastCheckedAt: new Date().toISOString(),
        }));
      } finally {
        window.clearTimeout(timeout);
      }
    };

    const handleOnline = () => {
      setConnectivity((current) => ({ ...current, status: 'checking' }));
      void checkHealth();
    };
    const handleOffline = () => void checkHealth();
    const handleFocus = () => void checkHealth();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void checkHealth();
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    void checkHealth();
    const interval = window.setInterval(
      () => void checkHealth(),
      30_000 + Math.floor(Math.random() * 15_000)
    );

    return () => {
      cancelled = true;
      activeController?.abort();
      window.clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      await ensureCleanLocalDatabase();
      let session: CachedSession | null = null;
      let sessionResponse: Response | undefined;
      let timeout: number | undefined;
      try {
        const controller = new AbortController();
        timeout = window.setTimeout(() => controller.abort(), 8_000);
        sessionResponse = await fetch('/api/auth/session', {
          cache: 'no-store',
          signal: controller.signal,
        });
      } catch (error) {
        if (!navigator.onLine || error instanceof TypeError || error instanceof DOMException) {
          const cached = window.localStorage.getItem(OFFLINE_SESSION_KEY);
          session = cached ? (JSON.parse(cached) as CachedSession) : null;
        } else {
          throw error;
        }
      } finally {
        if (timeout) window.clearTimeout(timeout);
      }

      if (sessionResponse?.ok) {
        session = (await sessionResponse.json()) as CachedSession;
        window.localStorage.setItem(OFFLINE_SESSION_KEY, JSON.stringify(session));
      } else if (sessionResponse && !sessionResponse.ok) {
        window.localStorage.removeItem(OFFLINE_SESSION_KEY);
      }

      if (!session) {
        if (cancelled) return;
        setActiveUserIdState('');
        setIsAuthenticated(false);
        setIsHydrated(true);
        return;
      }

      if (sessionResponse?.ok && navigator.onLine) {
        void warmInventoryCache().catch((error) =>
          console.warn('Unable to prepare full offline inventory cache', error)
        );
      }
      if (cancelled) return;
      setLocalTenant(session.tenant.id);
      setTenant(session.tenant);
      setUsers([session.user]);
      setActiveUserIdState(session.user.id);
      setIsAuthenticated(true);
      setIsHydrated(true);
      const can = (permission: Permission) =>
        session.user.role === 'owner' ||
        session.user.role === 'super-admin' ||
        session.user.permissions.includes(permission);
      const safely = async <T,>(label: string, task: Promise<T>, fallback: T): Promise<T> => {
        try {
          return await task;
        } catch (error) {
          console.warn(`${label} could not be loaded`, error);
          return fallback;
        }
      };
      const [
        storedInventory,
        storedSales,
        storedStockMovements,
        storedUsers,
        storedExpenses,
        storedCustomers,
        storedVendors,
        storedSettings,
        storedQueue,
      ] = await Promise.all([
        can('inventory') || can('checkout') || can('reports')
          ? safely('Inventory', loadInventory([]), [])
          : Promise.resolve([]),
        can('reports') || can('credit-sales') || can('refunds')
          ? safely('Sales', loadSales(), [])
          : Promise.resolve([]),
        can('inventory') || can('reports')
          ? safely('Stock history', loadStockMovements(), [])
          : Promise.resolve([]),
        safely('User account', loadUsers(defaultUsers), [session.user]),
        can('expenses') || can('reports')
          ? safely('Expenses', loadExpenses(), [])
          : Promise.resolve([]),
        can('customers') || can('checkout')
          ? safely('Customers', loadCustomers(defaultCustomers), [])
          : Promise.resolve([]),
        can('vendors') || can('inventory')
          ? safely('Suppliers', loadVendors(defaultVendors), [])
          : Promise.resolve([]),
        safely('Business settings', loadSettings(defaultSettings), defaultSettings),
        safely('Offline updates', loadSyncQueue(), []),
      ]);

      if (cancelled) return;
      const syncedSaleIds = new Set(
        storedQueue
          .filter((item) => item.status === 'synced' && item.entity === 'sale')
          .map((item) => item.entityId)
      );
      const syncedMovementIds = new Set(
        storedQueue
          .filter((item) => item.status === 'synced' && item.entity === 'stockMovement')
          .flatMap((item) => {
            const payload = item.payload as StockMovement | StockMovement[] | undefined;
            if (Array.isArray(payload)) return payload.map((movement) => movement.id);
            return payload?.id ? [payload.id] : [item.entityId];
          })
      );
      const reconciledSales = storedSales.map((sale) =>
        syncedSaleIds.has(sale.id) ? { ...sale, syncStatus: 'synced' as const } : sale
      );
      const reconciledStockMovements = storedStockMovements.map((movement) =>
        syncedMovementIds.has(movement.id)
          ? { ...movement, syncStatus: 'synced' as const }
          : movement
      );
      void Promise.all([
        cacheSalesLocally(
          reconciledSales.filter(
            (sale, index) => sale.syncStatus !== storedSales[index]?.syncStatus
          )
        ),
        reconciledStockMovements.some(
          (movement, index) => movement.syncStatus !== storedStockMovements[index]?.syncStatus
        )
          ? cacheStockMovementsLocally(reconciledStockMovements)
          : Promise.resolve(),
      ]).catch((error) => console.warn('Some records could not be cached in this browser', error));
      setInventory(sortInventory(storedInventory));
      setSales(reconciledSales);
      setStockMovements(reconciledStockMovements);
      setExpenses(storedExpenses);
      const sessionUser = session.user;
      setUsers(
        storedUsers.some((user) => user.id === sessionUser.id)
          ? storedUsers
          : [sessionUser, ...storedUsers]
      );
      setActiveUserIdState(sessionUser.id);
      setIsAuthenticated(true);
      setCustomers(storedCustomers);
      setVendors(storedVendors);
      setSettings(storedSettings);
      setSyncQueue(storedQueue);
    }

    hydrate().catch((error) => {
      console.error('Failed to hydrate POS store', error);
      setInventory([]);
      setIsHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated || !isOnline || syncInFlightRef.current) return;
    const pending = syncQueue
      .filter(
        (item) => (item.status === 'pending' || item.status === 'failed') && item.attempts < 5
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (pending.length === 0) return;

    const timer = window.setTimeout(
      async () => {
        syncInFlightRef.current = true;
        try {
          const operationIds = [...new Set(pending.map((item) => item.operationId))];
          setSyncProgress({
            isSyncing: true,
            total: operationIds.length,
            completed: 0,
            failed: 0,
          });
          for (const operationId of operationIds) {
            const group = pending.filter((item) => item.operationId === operationId);
            try {
              const saleQueueItem = group.find((item) => item.entity === 'sale');
              const inventoryQueueItem = group.find((item) => item.entity === 'inventory');
              if (saleQueueItem) {
                const payload = saleQueueItem.payload as { sale?: SaleTransaction };
                if (!payload.sale) throw new Error('Offline sale payload is incomplete');
                const response = await fetch('/api/commands/sale', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    operationId,
                    idempotencyKey: saleQueueItem.idempotencyKey,
                    items: payload.sale.items.map((item) => ({
                      inventoryItemId: item.inventoryItemId,
                      quantity: item.quantity,
                      discount: item.discount,
                      unitPrice: item.unitPrice,
                    })),
                    paymentMethod: payload.sale.paymentMethod,
                    cashTendered: payload.sale.cashTendered,
                    customerName: payload.sale.customerName,
                  }),
                });
                const result = (await response.json()) as {
                  sale?: SaleTransaction;
                  inventory?: InventoryItem[];
                  stockMovements?: StockMovement[];
                  customer?: Customer | null;
                  error?: string;
                };
                if (!response.ok || !result.sale) {
                  throw new Error(result.error ?? 'Offline sale could not be synchronized');
                }
                await Promise.all([
                  cacheSalesLocally([result.sale]),
                  cacheInventoryLocally(result.inventory ?? []),
                  cacheStockMovementsLocally(result.stockMovements ?? []),
                  result.customer ? cacheCustomersLocally([result.customer]) : Promise.resolve(),
                ]);
                setSales((prev) => [
                  result.sale!,
                  ...prev.filter((sale) => sale.id !== result.sale!.id),
                ]);
                const inventoryById = new Map(
                  (result.inventory ?? []).map((item) => [item.id, item])
                );
                setInventory((prev) =>
                  sortInventory(prev.map((item) => inventoryById.get(item.id) ?? item))
                );
                setStockMovements((prev) => [
                  ...(result.stockMovements ?? []),
                  ...prev.filter(
                    (movement) =>
                      !(result.stockMovements ?? []).some((item) => item.id === movement.id)
                  ),
                ]);
                if (result.customer) {
                  setCustomers((prev) =>
                    prev.map((customer) =>
                      customer.id === result.customer!.id ? result.customer! : customer
                    )
                  );
                }
              } else if (inventoryQueueItem) {
                const movementQueueItem = group.find((item) => item.entity === 'stockMovement');
                const movementPayload = movementQueueItem?.payload as
                  | StockMovement
                  | StockMovement[]
                  | undefined;
                const movement = Array.isArray(movementPayload)
                  ? movementPayload[0]
                  : movementPayload;
                const response = await fetch('/api/commands/stock-adjustment', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    operationId,
                    idempotencyKey: inventoryQueueItem.idempotencyKey,
                    product: inventoryQueueItem.payload,
                    quantityDelta: movement?.quantityDelta ?? 0,
                    reason: movement?.reason,
                  }),
                });
                const result = (await response.json()) as {
                  inventory?: InventoryItem;
                  stockMovement?: StockMovement | null;
                  error?: string;
                };
                if (!response.ok || !result.inventory) {
                  throw new Error(result.error ?? 'Stock operation could not be synchronized');
                }
                await cacheInventoryLocally([result.inventory]);
                setInventory((prev) =>
                  sortInventory([
                    ...prev.filter((item) => item.id !== result.inventory!.id),
                    result.inventory!,
                  ])
                );
                if (result.stockMovement) {
                  await cacheStockMovementsLocally([result.stockMovement]);
                  setStockMovements((prev) => [
                    result.stockMovement!,
                    ...prev.filter((item) => item.id !== result.stockMovement!.id),
                  ]);
                }
              } else {
                for (const item of group) {
                  if (item.entity === 'customer') await saveCustomer(item.payload as Customer);
                  if (item.entity === 'vendor') await saveVendor(item.payload as Vendor);
                  if (item.entity === 'expense') await saveExpense(item.payload as ExpenseRecord);
                  if (item.entity === 'settings')
                    await saveSettings(item.payload as BusinessSettings);
                }
              }

              const completed = group.map((item) => ({
                ...item,
                status: 'synced' as const,
                attempts: item.attempts + 1,
                lastError: undefined,
              }));
              await cacheSyncQueueLocally(completed);
              const completedById = new Map(completed.map((item) => [item.id, item]));
              setSyncQueue((prev) => prev.map((item) => completedById.get(item.id) ?? item));
              setSyncProgress((current) => ({
                ...current,
                completed: current.completed + 1,
              }));
            } catch (error) {
              const failed = group.map((item) => ({
                ...item,
                status: 'failed' as const,
                attempts: item.attempts + 1,
                lastError: error instanceof Error ? error.message : 'Synchronization failed',
              }));
              await cacheSyncQueueLocally(failed);
              const failedById = new Map(failed.map((item) => [item.id, item]));
              setSyncQueue((prev) => prev.map((item) => failedById.get(item.id) ?? item));
              const saleItem = group.find((item) => item.entity === 'sale');
              if (saleItem) {
                setSales((prev) => {
                  const next = prev.map((sale) =>
                    sale.id === saleItem.entityId
                      ? { ...sale, syncStatus: 'failed' as const }
                      : sale
                  );
                  void cacheSalesLocally(next.filter((sale) => sale.id === saleItem.entityId));
                  return next;
                });
              }
              const movementItem = group.find((item) => item.entity === 'stockMovement');
              if (movementItem) {
                const payload = movementItem.payload as StockMovement | StockMovement[];
                const ids = new Set(
                  (Array.isArray(payload) ? payload : [payload]).map((movement) => movement.id)
                );
                setStockMovements((prev) => {
                  const next = prev.map((movement) =>
                    ids.has(movement.id) ? { ...movement, syncStatus: 'failed' as const } : movement
                  );
                  void cacheStockMovementsLocally(next.filter((movement) => ids.has(movement.id)));
                  return next;
                });
              }
              setSyncProgress((current) => ({ ...current, failed: current.failed + 1 }));
              if (
                error instanceof TypeError ||
                (error instanceof Error && error.name === 'AbortError')
              ) {
                setIsOnline(false);
                setConnectivity((current) => ({
                  ...current,
                  status: 'offline',
                  latencyMs: null,
                  lastCheckedAt: new Date().toISOString(),
                }));
                break;
              }
            }
          }
        } finally {
          syncInFlightRef.current = false;
          setSyncProgress((current) => ({ ...current, isSyncing: false }));
        }
      },
      Math.min(30_000, 900 * 2 ** Math.max(...pending.map((item) => item.attempts)))
    );

    return () => window.clearTimeout(timer);
  }, [isHydrated, isOnline, syncQueue]);

  const pendingSyncCount = useMemo(
    () => syncQueue.filter((item) => item.status === 'pending' || item.status === 'failed').length,
    [syncQueue]
  );

  const retrySyncOperation = useCallback(
    async (operationId: string) => {
      const operationItems = syncQueue
        .filter((item) => item.operationId === operationId && item.status !== 'synced')
        .map((item) => ({
          ...item,
          status: 'pending' as const,
          attempts: 0,
          lastError: undefined,
        }));
      if (operationItems.length === 0) return;
      await cacheSyncQueueLocally(operationItems);
      const byId = new Map(operationItems.map((item) => [item.id, item]));
      setSyncQueue((prev) => prev.map((item) => byId.get(item.id) ?? item));
      const saleItem = operationItems.find((item) => item.entity === 'sale');
      if (saleItem) {
        setSales((prev) => {
          const next = prev.map((sale) =>
            sale.id === saleItem.entityId ? { ...sale, syncStatus: 'pending' as const } : sale
          );
          void cacheSalesLocally(next.filter((sale) => sale.id === saleItem.entityId));
          return next;
        });
      }
    },
    [syncQueue]
  );

  const cancelFailedOfflineSale = useCallback(
    async (operationId: string) => {
      if (!isOnline) {
        throw new Error('Reconnect before cancelling so authoritative stock can be restored.');
      }
      const operationItems = syncQueue.filter((item) => item.operationId === operationId);
      const saleItem = operationItems.find((item) => item.entity === 'sale');
      if (!saleItem || !operationItems.some((item) => item.status === 'failed')) {
        throw new Error('Only a failed offline sale can be cancelled from Sync Logs.');
      }
      const completedItems = operationItems.map((item) => ({
        ...item,
        status: 'synced' as const,
        lastError: `Cancelled locally by ${users.find((user) => user.id === activeUserId)?.name ?? 'administrator'}`,
      }));
      const sale = sales.find((item) => item.id === saleItem.entityId);
      if (!sale) throw new Error('The local sale record could not be found.');
      const cancelledSale: SaleTransaction = {
        ...sale,
        status: 'voided',
        syncStatus: 'synced',
      };
      const [authoritativeInventory, authoritativeCustomers] = await Promise.all([
        loadInventoryByIds(sale.items.map((item) => item.inventoryItemId)),
        loadCustomers(defaultCustomers),
      ]);
      await Promise.all([
        cacheSyncQueueLocally(completedItems),
        cacheSalesLocally([cancelledSale]),
      ]);
      const completedById = new Map(completedItems.map((item) => [item.id, item]));
      setSyncQueue((prev) => prev.map((item) => completedById.get(item.id) ?? item));
      setSales((prev) => prev.map((item) => (item.id === cancelledSale.id ? cancelledSale : item)));
      const inventoryById = new Map(authoritativeInventory.map((item) => [item.id, item]));
      setInventory((prev) => sortInventory(prev.map((item) => inventoryById.get(item.id) ?? item)));
      setCustomers(authoritativeCustomers);
    },
    [activeUserId, isOnline, sales, syncQueue, users]
  );

  const currentUser = useMemo(
    () => users.find((user) => user.id === activeUserId && user.status === 'active') ?? null,
    [activeUserId, users]
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (window.location.pathname.startsWith('/admin')) return;
    const root = document.documentElement;
    if (settings.themeColor) {
      root.style.setProperty('--primary', settings.themeColor);
      root.style.setProperty('--ring', settings.themeColor);
    }
    if (settings.fontFamily) {
      root.style.setProperty(
        '--font-sans',
        `${settings.fontFamily}, ui-sans-serif, system-ui, sans-serif`
      );
    }
    const themeMode = settings.themeMode ?? 'light';
    root.dataset.theme = themeMode;
    window.localStorage.setItem('tovapos.themeMode', themeMode);
  }, [settings.fontFamily, settings.themeColor, settings.themeMode]);

  const setActiveUserId = useCallback(
    (userId: string) => {
      const nextUser = users.find((user) => user.id === userId && user.status === 'active');
      if (!nextUser) return;
      setActiveUserIdState(userId);
      setIsAuthenticated(true);
    },
    [users]
  );

  const signIn = useCallback(async (email: string, password: string, remember: boolean) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, remember }),
    });
    const payload = (await response.json().catch(() => null)) as {
      user?: TovaUser;
      tenant?: { id: string; slug: string; name: string };
      error?: string;
    } | null;
    if (!response.ok || !payload?.user) {
      throw new Error(payload?.error ?? 'Unable to sign in');
    }
    setUsers([payload.user]);
    setActiveUserIdState(payload.user.id);
    setIsAuthenticated(true);
    if (payload.tenant) setTenant(payload.tenant);
    return payload.user;
  }, []);

  const signOut = useCallback(async () => {
    if (pendingSyncCount > 0) {
      throw new Error(
        `Wait for ${pendingSyncCount} offline update${pendingSyncCount === 1 ? '' : 's'} to sync before signing out.`
      );
    }
    const response = await fetch('/api/auth/logout', { method: 'POST', keepalive: true });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? 'Sign out could not be completed. Please try again.');
    }
    setLocalTenant('anonymous');
    setActiveUserIdState('');
    setIsAuthenticated(false);
    setTenant(null);
  }, [pendingSyncCount]);

  const registerBusiness = useCallback(async (input: RegisterBusinessInput) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      developmentVerificationUrl?: string;
      emailDeliveryFailed?: boolean;
      error?: string;
    } | null;
    if (!response.ok || !payload?.message) {
      throw new Error(payload?.error ?? 'Unable to register business');
    }
    return {
      message: payload.message,
      developmentVerificationUrl: payload.developmentVerificationUrl,
      emailDeliveryFailed: payload.emailDeliveryFailed,
    };
  }, []);

  const hasPermission = useCallback(
    (permission: Permission) => {
      if (!isAuthenticated || !currentUser) return false;
      const roleAllows =
        currentUser.role === 'super-admin' ||
        currentUser.role === 'owner' ||
        currentUser.permissions.includes(permission);
      return roleAllows && planAllowsPermission(settings.subscriptionPlanId, permission);
    },
    [currentUser, isAuthenticated, settings.subscriptionPlanId]
  );

  const upsertInventoryItem = useCallback(
    async (item: InventoryItem) => {
      const existingItem = inventory.find((existing) => existing.id === item.id);
      const planUsage = getProductUsage(settings.subscriptionPlanId, inventory.length);
      if (!existingItem && planUsage.isAtLimit) {
        throw new Error(
          `${planUsage.plan.name} allows ${planUsage.limit?.toLocaleString()} products. Upgrade your plan to add more inventory.`
        );
      }
      const normalizedSku = item.sku.trim().toLowerCase();
      const normalizedBarcode = item.barcode?.trim().toLowerCase();
      const duplicate = inventory.find(
        (existing) =>
          existing.id !== item.id &&
          (existing.sku.trim().toLowerCase() === normalizedSku ||
            (normalizedBarcode && existing.barcode?.trim().toLowerCase() === normalizedBarcode))
      );
      if (duplicate) {
        throw new Error(`SKU or barcode already belongs to ${duplicate.name}`);
      }

      const normalized = normalizeInventoryItem({
        ...item,
        sku: item.sku.trim(),
        barcode: item.barcode?.trim() || undefined,
        updatedAt: new Date().toISOString(),
      });
      const action = existingItem ? 'update' : 'create';
      const operationId = createOperationId(
        action === 'create' ? 'inventory-create' : 'inventory-update'
      );
      const queueItem = {
        ...createSyncQueueItem({
          operationId,
          entity: 'inventory',
          entityId: normalized.id,
          action,
          payload: normalized,
        }),
        idempotencyKey: `stock:${operationId}`,
      };
      const quantityBefore = existingItem?.currentQty ?? 0;
      const quantityDelta = normalized.currentQty - quantityBefore;
      const movement =
        quantityDelta === 0
          ? null
          : ({
              id: `move-${operationId}-${normalized.id}`,
              operationId,
              inventoryItemId: normalized.id,
              productName: normalized.name,
              sku: normalized.sku,
              barcode: normalized.barcode,
              batchLot: normalized.batchLot,
              type: action === 'create' ? 'restock' : 'adjustment',
              quantityDelta,
              quantityBefore,
              quantityAfter: normalized.currentQty,
              unitCost: normalized.unitCost,
              unitPrice: normalized.sellingPrice,
              referenceId: normalized.id,
              referenceLabel: action === 'create' ? 'Initial product stock' : 'Inventory update',
              reason:
                action === 'create'
                  ? 'Initial stock entered with product'
                  : 'Manual inventory quantity update',
              createdAt: normalized.updatedAt ?? new Date().toISOString(),
              createdBy: currentUser?.name ?? 'System',
              syncStatus: 'pending',
            } satisfies StockMovement);
      const movementQueueItem = movement
        ? createSyncQueueItem({
            operationId,
            entity: 'stockMovement',
            entityId: movement.id,
            action: 'create',
            payload: movement,
            dependsOn: [queueItem.id],
            conflictStrategy: 'merge-delta',
          })
        : null;

      if (
        process.env.NEXT_PUBLIC_STORAGE_DRIVER === 'postgres' &&
        typeof navigator !== 'undefined' &&
        isOnline
      ) {
        let response: Response | undefined;
        try {
          response = await fetch('/api/commands/stock-adjustment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              operationId,
              idempotencyKey: `stock:${operationId}`,
              product: normalized,
              quantityDelta,
              reason: movement?.reason,
            }),
          });
        } catch (error) {
          if (!(error instanceof TypeError)) throw error;
          setIsOnline(false);
        }
        if (response) {
          const payload = (await response.json().catch(() => null)) as {
            inventory?: InventoryItem;
            stockMovement?: StockMovement | null;
            error?: string;
          } | null;
          if (!response.ok || !payload?.inventory) {
            throw new Error(payload?.error ?? 'Unable to save inventory');
          }
          setInventory((prev) =>
            sortInventory([
              ...prev.filter((existing) => existing.id !== payload.inventory!.id),
              payload.inventory!,
            ])
          );
          if (payload.stockMovement) {
            setStockMovements((prev) => [payload.stockMovement!, ...prev]);
          }
          return payload.inventory;
        }
      }

      await saveOfflineStockBundle({
        inventory: normalized,
        stockMovement: movement,
        queueItems: [queueItem, movementQueueItem].filter(Boolean) as SyncQueueItem[],
      });

      setInventory((prev) => {
        const next = [...prev.filter((existing) => existing.id !== normalized.id), normalized];
        return sortInventory(next);
      });
      if (movement) setStockMovements((prev) => [movement, ...prev]);
      setSyncQueue(
        (prev) => [movementQueueItem, queueItem, ...prev].filter(Boolean) as SyncQueueItem[]
      );

      return normalized;
    },
    [currentUser?.name, inventory, isOnline, settings.subscriptionPlanId]
  );

  const upsertUser = useCallback(async (user: TovaUser) => {
    const transport = { ...user, updatedAt: new Date().toISOString() };
    await saveUser(transport);
    const {
      newPassword: _newPassword,
      passwordHash: _passwordHash,
      passwordSalt: _passwordSalt,
      ...safe
    } = transport;
    setUsers((prev) => [...prev.filter((existing) => existing.id !== safe.id), safe]);
    return safe;
  }, []);

  const deleteUser = useCallback(
    async (userId: string) => {
      const target = users.find((user) => user.id === userId);
      if (!target) return;
      if (target.id === activeUserId) {
        throw new Error('You cannot delete your own active account.');
      }
      const elevatedRoles: UserRole[] = ['super-admin', 'owner'];
      const remainingTopLevelAdmins = users.filter(
        (user) =>
          user.id !== userId && elevatedRoles.includes(user.role) && user.status === 'active'
      );
      if (elevatedRoles.includes(target.role) && remainingTopLevelAdmins.length === 0) {
        throw new Error('At least one active owner or super admin must remain.');
      }

      const queueItem = createSyncQueueItem({
        entity: 'user',
        entityId: userId,
        action: 'delete',
        payload: { id: userId, email: target.email, deletedAt: new Date().toISOString() },
      });

      await deleteStoredUser(userId);
      await saveSyncQueueItem(queueItem);
      setUsers((prev) => prev.filter((user) => user.id !== userId));
      setSyncQueue((prev) => [queueItem, ...prev]);
    },
    [activeUserId, users]
  );

  const upsertCustomer = useCallback(async (customer: Customer) => {
    const saved = { ...customer, updatedAt: new Date().toISOString() };
    const queueItem = createSyncQueueItem({
      entity: 'customer',
      entityId: saved.id,
      action: 'update',
      payload: saved,
    });

    await saveCustomer(saved);
    await saveSyncQueueItem(queueItem);
    setCustomers((prev) =>
      [...prev.filter((existing) => existing.id !== saved.id), saved].sort((a, b) =>
        a.name.localeCompare(b.name)
      )
    );
    setSyncQueue((prev) => [queueItem, ...prev]);
    return saved;
  }, []);

  const upsertVendor = useCallback(async (vendor: Vendor) => {
    const saved = { ...vendor, updatedAt: new Date().toISOString() };
    const queueItem = createSyncQueueItem({
      entity: 'vendor',
      entityId: saved.id,
      action: 'update',
      payload: saved,
    });

    await saveVendor(saved);
    await saveSyncQueueItem(queueItem);
    setVendors((prev) =>
      [...prev.filter((existing) => existing.id !== saved.id), saved].sort((a, b) =>
        a.name.localeCompare(b.name)
      )
    );
    setSyncQueue((prev) => [queueItem, ...prev]);
    return saved;
  }, []);

  const updateSettings = useCallback(
    async (nextSettings: BusinessSettings) => {
      const saved = {
        ...nextSettings,
        id: 'settings' as const,
        updatedAt: new Date().toISOString(),
      };
      const queueItem = createSyncQueueItem({
        entity: 'settings',
        entityId: saved.id,
        action: 'update',
        payload: saved,
      });

      if (
        process.env.NEXT_PUBLIC_STORAGE_DRIVER === 'postgres' &&
        typeof navigator !== 'undefined' &&
        isOnline
      ) {
        let response: Response | undefined;
        try {
          response = await fetch('/api/pos-store?store=settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(saved),
          });
        } catch (error) {
          if (!(error instanceof TypeError)) throw error;
          setIsOnline(false);
        }

        if (response) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          if (!response.ok) {
            throw new Error(payload?.error ?? 'Unable to save settings');
          }
          await saveSettings(saved);
          setSettings(saved);
          return saved;
        }
      }

      await saveSettings(saved);
      await saveSyncQueueItem(queueItem);
      setSettings(saved);
      setSyncQueue((prev) => [queueItem, ...prev]);
      return saved;
    },
    [isOnline]
  );

  const completeSale = useCallback(
    async (input: CompleteSaleInput) => {
      if (!hasPermission('checkout')) {
        throw new Error('Your role is not allowed to complete sales.');
      }
      if (input.paymentMethod === 'credit' && !hasPermission('credit-sales')) {
        throw new Error('Credit sales require the Pro plan and credit-sales permission.');
      }
      if (saleInFlightRef.current) {
        throw new Error('A sale is already being completed. Please wait for it to finish.');
      }

      saleInFlightRef.current = true;
      const now = new Date().toISOString();
      const operationId = createOperationId('sale');

      try {
        if (
          process.env.NEXT_PUBLIC_STORAGE_DRIVER === 'postgres' &&
          typeof navigator !== 'undefined' &&
          isOnline
        ) {
          let response: Response | undefined;
          try {
            response = await fetch('/api/commands/sale', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                operationId,
                idempotencyKey: `sale:${operationId}`,
                items: input.items,
                paymentMethod: input.paymentMethod,
                cashTendered: input.cashTendered,
                customerName: input.customerName,
              }),
            });
          } catch (error) {
            if (!(error instanceof TypeError)) throw error;
            setIsOnline(false);
          }
          if (response) {
            const payload = (await response.json().catch(() => null)) as {
              sale?: SaleTransaction;
              inventory?: InventoryItem[];
              stockMovements?: StockMovement[];
              customer?: Customer | null;
              error?: string;
            } | null;
            if (!response.ok || !payload?.sale) {
              throw new Error(payload?.error ?? 'Unable to complete sale');
            }
            const inventoryUpdates = new Map(
              (payload.inventory ?? []).map((item) => [item.id, item])
            );
            setInventory((prev) =>
              sortInventory(prev.map((item) => inventoryUpdates.get(item.id) ?? item))
            );
            setStockMovements((prev) => [...(payload.stockMovements ?? []), ...prev]);
            if (payload.customer) {
              await cacheCustomersLocally([payload.customer]);
              setCustomers((prev) =>
                prev.map((customer) =>
                  customer.id === payload.customer!.id ? payload.customer! : customer
                )
              );
            }
            setSales((prev) => [
              payload.sale!,
              ...prev.filter((sale) => sale.id !== payload.sale!.id),
            ]);
            return payload.sale;
          }
        }

        const latestInventory = await loadInventoryByIds(
          input.items.map((item) => item.inventoryItemId)
        );
        const inventoryById = new Map(latestInventory.map((item) => [item.id, item]));
        const requestedByItem = input.items.reduce((map, line) => {
          const current = map.get(line.inventoryItemId) ?? {
            quantity: 0,
            discount: line.discount,
            unitPrice: line.unitPrice,
          };
          current.quantity += line.quantity;
          current.discount = line.discount;
          current.unitPrice = line.unitPrice;
          map.set(line.inventoryItemId, current);
          return map;
        }, new Map<string, { quantity: number; discount: number; unitPrice: number }>());

        const updatedInventory: VersionedInventoryItem[] = [];

        const lineItems = [...requestedByItem.entries()].map(([inventoryItemId, line]) => {
          const item = inventoryById.get(inventoryItemId);
          if (!item) throw new Error('One of the scanned products no longer exists in inventory');

          assertSellable(item, line.quantity);

          const updated = normalizeInventoryItem({
            ...item,
            currentQty: item.currentQty - line.quantity,
            updatedAt: now,
          });
          updatedInventory.push({ ...updated, _expectedUpdatedAt: item.updatedAt });
          const gross = line.unitPrice * line.quantity;
          const discountAmount = Number((gross * (line.discount / 100)).toFixed(2));
          const lineTotal = Number((gross - discountAmount).toFixed(2));
          const productTaxRate = Math.max(0, Number(item.taxRate) || 0);
          const defaultTaxRate = Math.max(0, Number(settings.taxRate) || 0);
          const taxApplicable = Boolean(item.taxApplicable || productTaxRate > 0);
          const taxRate = taxApplicable ? productTaxRate || defaultTaxRate : 0;
          const taxMode = item.taxMode ?? settings.taxMode ?? 'exclusive';
          const taxAmount = taxRate > 0 ? Number((gross * (taxRate / 100)).toFixed(2)) : 0;

          return {
            id: `line-${operationId}-${item.id}`,
            inventoryItemId: item.id,
            productId: item.id,
            name: item.name,
            genericName: item.genericName,
            sku: item.sku,
            barcode: item.barcode,
            batchLot: item.batchLot,
            expiryDate: item.expiryDate,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            unitCost: item.unitCost,
            discount: line.discount,
            lineTotal,
            discountAmount,
            taxApplicable,
            taxRate,
            taxMode,
            taxAmount,
            requiresApproval: item.requiresApproval,
            isControlled: item.isControlled,
            category: item.category,
          };
        });

        const sale: SaleTransaction = {
          id: `sale-${operationId}`,
          transactionId: createTransactionId(),
          items: lineItems,
          subtotal: input.subtotal,
          discountTotal: input.discountTotal,
          taxAmount: input.taxAmount,
          grandTotal: input.grandTotal,
          paymentMethod: input.paymentMethod,
          paymentStatus: input.paymentMethod === 'credit' ? 'unpaid' : 'paid',
          amountPaid: input.paymentMethod === 'credit' ? 0 : input.grandTotal,
          amountDue: input.paymentMethod === 'credit' ? input.grandTotal : 0,
          cashTendered: input.cashTendered,
          changeGiven: input.changeGiven,
          customerName: input.customerName || 'Walk-in Customer',
          timestamp: now,
          cashier: input.cashier,
          status: 'completed',
          syncStatus: 'pending',
        };

        const movements: StockMovement[] = updatedInventory.flatMap((updated) => {
          const original = inventoryById.get(updated.id);
          const soldLine = lineItems.find((line) => line.inventoryItemId === updated.id);
          if (!original || !soldLine) return [];
          return [
            {
              id: `move-${operationId}-${updated.id}`,
              operationId,
              inventoryItemId: updated.id,
              productName: updated.name,
              sku: updated.sku,
              barcode: updated.barcode,
              batchLot: updated.batchLot,
              type: 'sale' as const,
              quantityDelta: -soldLine.quantity,
              quantityBefore: original.currentQty,
              quantityAfter: updated.currentQty,
              unitCost: updated.unitCost,
              unitPrice: soldLine.unitPrice,
              referenceId: sale.id,
              referenceLabel: sale.transactionId,
              reason: 'POS sale checkout',
              createdAt: now,
              createdBy: input.cashier,
              syncStatus: 'pending' as const,
            },
          ];
        });

        const matchedCustomer = input.customerName
          ? customers.find(
              (customer) =>
                customer.name.toLowerCase() === input.customerName?.trim().toLowerCase() ||
                customer.phone === input.customerName?.trim()
            )
          : null;
        const updatedCustomer = matchedCustomer
          ? {
              ...matchedCustomer,
              totalSpend:
                sale.paymentMethod === 'credit'
                  ? matchedCustomer.totalSpend
                  : matchedCustomer.totalSpend + sale.grandTotal,
              loyaltyPoints:
                sale.paymentMethod === 'credit'
                  ? matchedCustomer.loyaltyPoints
                  : matchedCustomer.loyaltyPoints + Math.floor(sale.grandTotal / 100),
              updatedAt: now,
            }
          : null;

        const queueItem = {
          ...createSyncQueueItem({
            operationId,
            entity: 'sale',
            entityId: sale.id,
            action: 'create',
            conflictStrategy: 'merge-delta',
            payload: {
              sale,
              stockMovements: movements,
              inventoryAdjustments: movements.map((movement) => ({
                inventoryItemId: movement.inventoryItemId,
                quantityDelta: movement.quantityDelta,
                quantityBefore: movement.quantityBefore,
                quantityAfter: movement.quantityAfter,
                baseUpdatedAt: inventoryById.get(movement.inventoryItemId)?.updatedAt,
              })),
              customerAdjustment: updatedCustomer
                ? {
                    customerId: updatedCustomer.id,
                    spendDelta: sale.paymentMethod === 'credit' ? 0 : sale.grandTotal,
                    loyaltyDelta:
                      sale.paymentMethod === 'credit' ? 0 : Math.floor(sale.grandTotal / 100),
                    creditDelta: sale.paymentMethod === 'credit' ? sale.grandTotal : 0,
                  }
                : undefined,
            },
          }),
          idempotencyKey: `sale:${operationId}`,
        };
        const movementQueueItem = createSyncQueueItem({
          operationId,
          entity: 'stockMovement',
          entityId: operationId,
          action: 'create',
          payload: movements,
          dependsOn: [queueItem.id],
          conflictStrategy: 'merge-delta',
        });
        const customerQueueItem = updatedCustomer
          ? createSyncQueueItem({
              operationId,
              entity: 'customer',
              entityId: updatedCustomer.id,
              action: 'update',
              payload: updatedCustomer,
              dependsOn: [queueItem.id],
              conflictStrategy: 'merge-delta',
            })
          : null;

        await saveOfflineSaleBundle({
          inventory: updatedInventory,
          stockMovements: movements,
          sale,
          customer: updatedCustomer,
          queueItems: [queueItem, movementQueueItem, customerQueueItem].filter(
            Boolean
          ) as SyncQueueItem[],
        });

        const updatedById = new Map(updatedInventory.map((item) => [item.id, item]));
        setInventory((prev) => sortInventory(prev.map((item) => updatedById.get(item.id) ?? item)));
        setStockMovements((prev) => [...movements, ...prev]);
        if (updatedCustomer) {
          setCustomers((prev) =>
            prev.map((customer) =>
              customer.id === updatedCustomer.id ? updatedCustomer : customer
            )
          );
        }
        setSales((prev) => [sale, ...prev]);
        setSyncQueue(
          (prev) =>
            [customerQueueItem, movementQueueItem, queueItem, ...prev].filter(
              Boolean
            ) as SyncQueueItem[]
        );

        return sale;
      } finally {
        saleInFlightRef.current = false;
      }
    },
    [customers, hasPermission, isOnline, settings.taxMode, settings.taxRate]
  );

  const reconcileCreditSale = useCallback(
    async (saleId: string, input: ReconcileCreditSaleInput) => {
      if (!hasPermission('credit-sales')) {
        throw new Error('Your role is not allowed to record credit payments.');
      }
      const sale = sales.find((item) => item.id === saleId || item.transactionId === saleId);
      if (!sale) throw new Error('Credit sale was not found');
      if (sale.status !== 'completed') throw new Error('Only completed credit sales can be paid');
      if (sale.paymentMethod !== 'credit' && Number(sale.amountDue ?? 0) <= 0) {
        throw new Error('This sale is not marked as customer credit');
      }

      const currentDue = Number(sale.amountDue ?? sale.grandTotal);
      if (currentDue <= 0) throw new Error('This credit sale has already been fully paid');

      const amount = Number(input.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Enter a payment amount greater than zero');
      }
      if (amount > currentDue) {
        throw new Error(`Payment cannot exceed outstanding balance of ${currentDue.toFixed(2)}`);
      }

      const now = new Date().toISOString();
      const operationId = createOperationId('credit-payment');
      if (process.env.NEXT_PUBLIC_STORAGE_DRIVER === 'postgres') {
        if (!isOnline) {
          throw new Error('Credit payments require an internet connection for balance validation.');
        }
        const response = await fetch('/api/commands/credit-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operationId,
            saleId: sale.id,
            amount,
            method: input.method,
            notes: input.notes,
          }),
        });
        const payload = (await response.json().catch(() => null)) as {
          sale?: SaleTransaction;
          error?: string;
        } | null;
        if (!response.ok || !payload?.sale) {
          throw new Error(payload?.error ?? 'Unable to record credit payment');
        }
        await cacheSalesLocally([payload.sale]);
        setSales((prev) =>
          prev.map((item) => (item.id === payload.sale!.id ? payload.sale! : item))
        );
        return payload.sale;
      }
      const previousPaid = Number(sale.amountPaid ?? 0);
      const nextPaid = Number((previousPaid + amount).toFixed(2));
      const nextDue = Number(Math.max(0, currentDue - amount).toFixed(2));
      const payment = {
        id: `credit-payment-${operationId}`,
        amount,
        method: input.method,
        recordedAt: now,
        recordedBy: input.recordedBy,
        notes: input.notes?.trim() || undefined,
      };
      const updatedSale: SaleTransaction = {
        ...sale,
        amountPaid: nextPaid,
        amountDue: nextDue,
        paymentStatus: nextDue === 0 ? 'paid' : 'partial',
        creditPayments: [...(sale.creditPayments ?? []), payment],
        syncStatus: 'pending',
      };
      const queueItem = createSyncQueueItem({
        operationId,
        entity: 'sale',
        entityId: updatedSale.id,
        action: 'update',
        conflictStrategy: 'merge-delta',
        payload: {
          sale: updatedSale,
          creditPayment: payment,
          amountPaidDelta: amount,
          amountDue: nextDue,
        },
      });

      await saveSale(updatedSale);
      await saveSyncQueueItem(queueItem);
      setSales((prev) => prev.map((item) => (item.id === updatedSale.id ? updatedSale : item)));
      setSyncQueue((prev) => [queueItem, ...prev]);
      return updatedSale;
    },
    [hasPermission, isOnline, sales]
  );

  const refundSale = useCallback(
    async (saleId: string, reason: string) => {
      if (!hasPermission('refunds')) {
        throw new Error('Your role is not allowed to refund sales.');
      }
      const sale = sales.find((item) => item.id === saleId || item.transactionId === saleId);
      if (!sale) throw new Error('Transaction was not found');
      if (sale.status === 'refunded') throw new Error('This transaction has already been refunded');
      if (sale.status === 'voided') throw new Error('Voided transactions cannot be refunded');

      const now = new Date().toISOString();
      const operationId = createOperationId('refund');
      if (process.env.NEXT_PUBLIC_STORAGE_DRIVER === 'postgres') {
        if (!isOnline) {
          throw new Error(
            'Refunds require an internet connection to prevent duplicate stock returns.'
          );
        }
        const response = await fetch('/api/commands/refund', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operationId, saleId: sale.id, reason: reason.trim() }),
        });
        const payload = (await response.json().catch(() => null)) as {
          sale?: SaleTransaction;
          inventory?: InventoryItem[];
          stockMovements?: StockMovement[];
          error?: string;
        } | null;
        if (!response.ok || !payload?.sale) {
          throw new Error(payload?.error ?? 'Unable to refund sale');
        }
        await Promise.all([
          cacheSalesLocally([payload.sale]),
          cacheInventoryLocally(payload.inventory ?? []),
          cacheStockMovementsLocally(payload.stockMovements ?? []),
        ]);
        const updates = new Map((payload.inventory ?? []).map((item) => [item.id, item]));
        setInventory((prev) => sortInventory(prev.map((item) => updates.get(item.id) ?? item)));
        setStockMovements((prev) => [...(payload.stockMovements ?? []), ...prev]);
        setSales((prev) =>
          prev.map((item) => (item.id === payload.sale!.id ? payload.sale! : item))
        );
        return payload.sale;
      }
      const inventoryById = new Map(inventory.map((item) => [item.id, item]));
      const updatedInventory: VersionedInventoryItem[] = [];

      const movements: StockMovement[] = sale.items.map((line) => {
        const current = inventoryById.get(line.inventoryItemId);
        if (!current) throw new Error(`${line.name} no longer exists in inventory`);

        const updated = normalizeInventoryItem({
          ...current,
          currentQty: current.currentQty + line.quantity,
          updatedAt: now,
        });
        updatedInventory.push({ ...updated, _expectedUpdatedAt: current.updatedAt });

        return {
          id: `move-${operationId}-${line.inventoryItemId}`,
          operationId,
          inventoryItemId: line.inventoryItemId,
          productName: line.name,
          sku: line.sku,
          barcode: line.barcode,
          batchLot: line.batchLot,
          type: 'refund' as const,
          quantityDelta: line.quantity,
          quantityBefore: current.currentQty,
          quantityAfter: updated.currentQty,
          unitCost: line.unitCost,
          unitPrice: line.unitPrice,
          referenceId: sale.id,
          referenceLabel: sale.transactionId,
          reason: reason.trim(),
          createdAt: now,
          createdBy: currentUser?.name ?? sale.cashier,
          syncStatus: 'pending' as const,
        };
      });

      const refundedSale: SaleTransaction = {
        ...sale,
        status: 'refunded',
        syncStatus: 'pending',
      };
      const saleQueueItem = createSyncQueueItem({
        operationId,
        entity: 'sale',
        entityId: refundedSale.id,
        action: 'update',
        payload: { sale: refundedSale, refundReason: reason.trim() },
      });
      const movementQueueItem = createSyncQueueItem({
        operationId,
        entity: 'stockMovement',
        entityId: operationId,
        action: 'create',
        payload: movements,
        dependsOn: [saleQueueItem.id],
        conflictStrategy: 'merge-delta',
      });

      await saveInventoryItems(updatedInventory);
      await saveStockMovements(movements);
      await saveSale(refundedSale);
      await saveSyncQueueItem(saleQueueItem);
      await saveSyncQueueItem(movementQueueItem);

      const updatedById = new Map(updatedInventory.map((item) => [item.id, item]));
      setInventory((prev) => sortInventory(prev.map((item) => updatedById.get(item.id) ?? item)));
      setStockMovements((prev) => [...movements, ...prev]);
      setSales((prev) => prev.map((item) => (item.id === refundedSale.id ? refundedSale : item)));
      setSyncQueue((prev) => [movementQueueItem, saleQueueItem, ...prev]);

      return refundedSale;
    },
    [currentUser?.name, hasPermission, inventory, isOnline, sales]
  );

  const recordExpense = useCallback(async (input: RecordExpenseInput) => {
    const now = new Date().toISOString();
    const expense: ExpenseRecord = {
      id: `expense-${Date.now()}`,
      expenseId: createExpenseId(),
      title: input.title.trim(),
      category: input.category,
      amount: Number(input.amount) || 0,
      paymentMethod: input.paymentMethod,
      vendorName: input.vendorName?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      incurredAt: input.incurredAt,
      recordedBy: input.recordedBy,
      status: 'recorded',
      syncStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    const queueItem = createSyncQueueItem({
      entity: 'expense',
      entityId: expense.id,
      action: 'create',
      payload: expense,
    });

    await saveExpense(expense);
    await saveSyncQueueItem(queueItem);
    setExpenses((prev) =>
      [expense, ...prev].sort((a, b) => b.incurredAt.localeCompare(a.incurredAt))
    );
    setSyncQueue((prev) => [queueItem, ...prev]);
    return expense;
  }, []);

  const value = useMemo<PosStoreValue>(
    () => ({
      tenant,
      inventory,
      stockMovements,
      sales,
      expenses,
      users,
      customers,
      vendors,
      settings,
      syncQueue,
      isHydrated,
      isOnline,
      connectivity,
      syncProgress,
      pendingSyncCount,
      retrySyncOperation,
      cancelFailedOfflineSale,
      activeUserId,
      currentUser,
      isAuthenticated,
      setActiveUserId,
      signIn,
      signOut,
      registerBusiness,
      hasPermission,
      upsertInventoryItem,
      upsertUser,
      deleteUser,
      upsertCustomer,
      upsertVendor,
      updateSettings,
      completeSale,
      reconcileCreditSale,
      refundSale,
      recordExpense,
    }),
    [
      tenant,
      inventory,
      stockMovements,
      sales,
      expenses,
      users,
      customers,
      vendors,
      settings,
      syncQueue,
      isHydrated,
      isOnline,
      connectivity,
      syncProgress,
      pendingSyncCount,
      retrySyncOperation,
      cancelFailedOfflineSale,
      activeUserId,
      currentUser,
      isAuthenticated,
      setActiveUserId,
      signIn,
      signOut,
      registerBusiness,
      hasPermission,
      upsertInventoryItem,
      upsertUser,
      deleteUser,
      upsertCustomer,
      upsertVendor,
      updateSettings,
      completeSale,
      reconcileCreditSale,
      refundSale,
      recordExpense,
    ]
  );

  return <PosStoreContext.Provider value={value}>{children}</PosStoreContext.Provider>;
}

export function usePosStore(): PosStoreValue {
  const context = useContext(PosStoreContext);
  if (!context) {
    throw new Error('usePosStore must be used within PosStoreProvider');
  }
  return context;
}
