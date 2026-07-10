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
import { hashPassword, verifyPassword } from './auth';
import { assertSellable, normalizeInventoryItem } from './stock';
import {
  createSyncQueueItem,
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
  saveInventoryItem,
  saveInventoryItems,
  saveSale,
  saveSettings,
  saveStockMovements,
  saveSyncQueueItem,
  saveSyncQueueItems,
  saveUser,
  saveVendor,
} from './local-store';
import { defaultCustomers, defaultSettings, defaultUsers, defaultVendors } from './seeds';
import { getProductUsage, planAllowsPermission } from './subscription';

interface PosStoreValue {
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
  pendingSyncCount: number;
  activeUserId: string;
  currentUser: TovaUser | null;
  isAuthenticated: boolean;
  setActiveUserId: (userId: string) => void;
  signIn: (email: string, password: string, remember: boolean) => Promise<TovaUser>;
  signOut: () => void;
  registerBusiness: (input: RegisterBusinessInput) => Promise<TovaUser>;
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
const ACTIVE_USER_KEY = 'tovapos.activeUserId';
const SESSION_KEY = 'tovapos.session';

const OWNER_PERMISSIONS: Permission[] = [
  'dashboard',
  'checkout',
  'add-product',
  'edit-product',
  'delete-product',
  'inventory',
  'adjust-stock',
  'give-discount',
  'void-sale',
  'reports',
  'credit-sales',
  'export-reports',
  'users',
  'settings',
  'customers',
  'vendors',
  'expenses',
  'refunds',
  'view-profit',
  'view-cost-price',
  'expiry-alerts',
  'manage-tax',
  'branches',
  'notifications',
  'categories',
  'expense-heads',
];

interface StoredSession {
  userId: string;
  expiresAt: string;
}

type VersionedInventoryItem = InventoryItem & {
  _expectedUpdatedAt?: string;
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

function createSession(userId: string, remember: boolean): StoredSession {
  const expiresAt = new Date(Date.now() + (remember ? 14 : 1) * 24 * 60 * 60 * 1000);
  return { userId, expiresAt: expiresAt.toISOString() };
}

function readStoredSession(): StoredSession | null {
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as StoredSession;
    if (!session.userId || new Date(session.expiresAt).getTime() <= Date.now()) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
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
  const [activeUserId, setActiveUserIdState] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const saleInFlightRef = useRef(false);

  useEffect(() => {
    setIsOnline(typeof navigator === 'undefined' ? true : navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      await ensureCleanLocalDatabase();
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
        loadInventory([]),
        loadSales(),
        loadStockMovements(),
        loadUsers(defaultUsers),
        loadExpenses(),
        loadCustomers(defaultCustomers),
        loadVendors(defaultVendors),
        loadSettings(defaultSettings),
        loadSyncQueue(),
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
      await Promise.all([
        ...reconciledSales
          .filter((sale, index) => sale.syncStatus !== storedSales[index]?.syncStatus)
          .map(saveSale),
        reconciledStockMovements.some(
          (movement, index) => movement.syncStatus !== storedStockMovements[index]?.syncStatus
        )
          ? saveStockMovements(reconciledStockMovements)
          : Promise.resolve(),
      ]);
      setInventory(sortInventory(storedInventory));
      setSales(reconciledSales);
      setStockMovements(reconciledStockMovements);
      setExpenses(storedExpenses);
      setUsers(storedUsers);
      const session = readStoredSession();
      const sessionUser = session
        ? storedUsers.find((user) => user.id === session.userId && user.status === 'active')
        : null;
      if (sessionUser) {
        setActiveUserIdState(sessionUser.id);
        setIsAuthenticated(true);
        window.localStorage.setItem(ACTIVE_USER_KEY, sessionUser.id);
      } else {
        setActiveUserIdState('');
        setIsAuthenticated(false);
        window.localStorage.removeItem(ACTIVE_USER_KEY);
      }
      setCustomers(storedCustomers);
      setVendors(storedVendors);
      setSettings(storedSettings);
      setSyncQueue(storedQueue);
      setIsHydrated(true);
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
    if (!isHydrated || !isOnline) return;
    const pending = syncQueue.filter(
      (item) => item.status === 'pending' || item.status === 'failed'
    );
    if (pending.length === 0) return;

    const timer = window.setTimeout(async () => {
      const now = new Date().toISOString();
      const synced = pending.map((item) => ({
        ...item,
        status: 'synced' as const,
        attempts: item.attempts + 1,
        lastError: undefined,
        syncedAt: now,
      }));
      await saveSyncQueueItems(synced);
      const syncedById = new Map(synced.map((item) => [item.id, item]));
      setSyncQueue((prev) => prev.map((item) => syncedById.get(item.id) ?? item));

      const syncedSales = synced
        .filter((item) => item.entity === 'sale')
        .map((item) => {
          const payload = item.payload as { sale?: SaleTransaction };
          return payload.sale ? { ...payload.sale, syncStatus: 'synced' as const } : null;
        })
        .filter(Boolean) as SaleTransaction[];
      const syncedInventory = synced
        .filter((item) => item.entity === 'inventory')
        .map((item) => item.payload as InventoryItem);
      const syncedMovements = synced
        .filter((item) => item.entity === 'stockMovement')
        .flatMap((item) => {
          const payload = item.payload as StockMovement | StockMovement[];
          return Array.isArray(payload) ? payload : [payload];
        })
        .filter(Boolean)
        .map((movement) => ({ ...movement, syncStatus: 'synced' as const }));
      const syncedCustomers = synced
        .filter((item) => item.entity === 'customer')
        .map((item) => item.payload as Customer);
      const syncedVendors = synced
        .filter((item) => item.entity === 'vendor')
        .map((item) => item.payload as Vendor);
      const syncedExpenses = synced
        .filter((item) => item.entity === 'expense')
        .map((item) => ({ ...(item.payload as ExpenseRecord), syncStatus: 'synced' as const }));

      await Promise.all([
        ...syncedSales.map(saveSale),
        syncedInventory.length > 0 ? saveInventoryItems(syncedInventory) : Promise.resolve(),
        syncedMovements.length > 0 ? saveStockMovements(syncedMovements) : Promise.resolve(),
        ...syncedCustomers.map(saveCustomer),
        ...syncedVendors.map(saveVendor),
        ...syncedExpenses.map(saveExpense),
      ]);

      if (syncedSales.length > 0) {
        const byId = new Map(syncedSales.map((sale) => [sale.id, sale]));
        setSales((prev) => prev.map((sale) => byId.get(sale.id) ?? sale));
      }
      if (syncedInventory.length > 0) {
        const byId = new Map(syncedInventory.map((item) => [item.id, item]));
        setInventory((prev) => sortInventory(prev.map((item) => byId.get(item.id) ?? item)));
      }
      if (syncedMovements.length > 0) {
        const byId = new Map(syncedMovements.map((movement) => [movement.id, movement]));
        setStockMovements((prev) => prev.map((movement) => byId.get(movement.id) ?? movement));
      }
      if (syncedCustomers.length > 0) {
        const byId = new Map(syncedCustomers.map((customer) => [customer.id, customer]));
        setCustomers((prev) => prev.map((customer) => byId.get(customer.id) ?? customer));
      }
      if (syncedVendors.length > 0) {
        const byId = new Map(syncedVendors.map((vendor) => [vendor.id, vendor]));
        setVendors((prev) => prev.map((vendor) => byId.get(vendor.id) ?? vendor));
      }
      if (syncedExpenses.length > 0) {
        const byId = new Map(syncedExpenses.map((expense) => [expense.id, expense]));
        setExpenses((prev) => prev.map((expense) => byId.get(expense.id) ?? expense));
      }
    }, 900);

    return () => window.clearTimeout(timer);
  }, [isHydrated, isOnline, syncQueue]);

  const pendingSyncCount = useMemo(
    () => syncQueue.filter((item) => item.status === 'pending' || item.status === 'failed').length,
    [syncQueue]
  );

  const currentUser = useMemo(
    () => users.find((user) => user.id === activeUserId && user.status === 'active') ?? null,
    [activeUserId, users]
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (settings.themeColor) {
      root.style.setProperty('--primary', settings.themeColor);
      root.style.setProperty('--ring', settings.themeColor);
    }
    root.dataset.theme = settings.themeMode ?? 'light';
  }, [settings.themeColor, settings.themeMode]);

  const setActiveUserId = useCallback(
    (userId: string) => {
      const nextUser = users.find((user) => user.id === userId && user.status === 'active');
      if (!nextUser) return;
      setActiveUserIdState(userId);
      setIsAuthenticated(true);
      window.localStorage.setItem(ACTIVE_USER_KEY, userId);
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(createSession(userId, true)));
    },
    [users]
  );

  const signIn = useCallback(
    async (email: string, password: string, remember: boolean) => {
      const normalizedEmail = email.trim().toLowerCase();
      const user = users.find((item) => item.email.toLowerCase() === normalizedEmail);

      if (!user || user.status !== 'active') {
        throw new Error('No active account was found for that email address');
      }

      const isValid = await verifyPassword(password, user.passwordHash, user.passwordSalt);
      if (!isValid) {
        throw new Error('Invalid email or password');
      }

      const saved = {
        ...user,
        lastLogin: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveUser(saved);
      setUsers((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
      setActiveUserIdState(saved.id);
      setIsAuthenticated(true);
      window.localStorage.setItem(ACTIVE_USER_KEY, saved.id);
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(createSession(saved.id, remember)));
      return saved;
    },
    [users]
  );

  const signOut = useCallback(() => {
    setActiveUserIdState('');
    setIsAuthenticated(false);
    window.localStorage.removeItem(ACTIVE_USER_KEY);
    window.localStorage.removeItem(SESSION_KEY);
  }, []);

  const registerBusiness = useCallback(
    async (input: RegisterBusinessInput) => {
      const normalizedEmail = input.email.trim().toLowerCase();
      if (users.some((user) => user.email.toLowerCase() === normalizedEmail && user.passwordHash)) {
        throw new Error('An account with this email already exists');
      }

      const now = new Date().toISOString();
      const credentials = await hashPassword(input.password);
      const owner: TovaUser = {
        id: `user-owner-${Date.now()}`,
        name: input.ownerName.trim(),
        email: normalizedEmail,
        role: 'owner',
        phone: input.phone.trim(),
        branch: 'Main Store',
        permissions: OWNER_PERMISSIONS,
        status: 'active',
        pin: '0000',
        ...credentials,
        passwordUpdatedAt: now,
        createdAt: now,
        updatedAt: now,
      };

      const nextSettings: BusinessSettings = {
        ...settings,
        businessName: input.businessName.trim(),
        updatedAt: now,
      };
      const userQueueItem = createSyncQueueItem({
        entity: 'user',
        entityId: owner.id,
        action: 'create',
        payload: owner,
      });
      const settingsQueueItem = createSyncQueueItem({
        entity: 'settings',
        entityId: nextSettings.id,
        action: 'update',
        payload: nextSettings,
      });

      await saveUser(owner);
      await saveSettings(nextSettings);
      await saveSyncQueueItem(userQueueItem);
      await saveSyncQueueItem(settingsQueueItem);

      setUsers((prev) => [
        ...prev.filter((user) => user.email.toLowerCase() !== normalizedEmail),
        owner,
      ]);
      setSettings(nextSettings);
      setSyncQueue((prev) => [settingsQueueItem, userQueueItem, ...prev]);
      setActiveUserIdState(owner.id);
      setIsAuthenticated(true);
      window.localStorage.setItem(ACTIVE_USER_KEY, owner.id);
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(createSession(owner.id, true)));
      return owner;
    },
    [settings, users]
  );

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
      const queueItem = createSyncQueueItem({
        operationId,
        entity: 'inventory',
        entityId: normalized.id,
        action,
        payload: normalized,
      });
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

      await saveInventoryItem(normalized);
      await saveSyncQueueItem(queueItem);
      if (movement) {
        await saveStockMovements([movement]);
        if (movementQueueItem) await saveSyncQueueItem(movementQueueItem);
      }

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
    [currentUser?.name, inventory, settings.subscriptionPlanId]
  );

  const upsertUser = useCallback(async (user: TovaUser) => {
    const saved = { ...user, updatedAt: new Date().toISOString() };
    const queueItem = createSyncQueueItem({
      entity: 'user',
      entityId: saved.id,
      action: 'update',
      payload: saved,
    });

    await saveUser(saved);
    await saveSyncQueueItem(queueItem);
    setUsers((prev) => [...prev.filter((existing) => existing.id !== saved.id), saved]);
    setSyncQueue((prev) => [queueItem, ...prev]);
    return saved;
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

  const updateSettings = useCallback(async (nextSettings: BusinessSettings) => {
    const saved = { ...nextSettings, id: 'settings' as const, updatedAt: new Date().toISOString() };
    const queueItem = createSyncQueueItem({
      entity: 'settings',
      entityId: saved.id,
      action: 'update',
      payload: saved,
    });

    await saveSettings(saved);
    await saveSyncQueueItem(queueItem);
    setSettings(saved);
    setSyncQueue((prev) => [queueItem, ...prev]);
    return saved;
  }, []);

  const completeSale = useCallback(
    async (input: CompleteSaleInput) => {
      if (saleInFlightRef.current) {
        throw new Error('A sale is already being completed. Please wait for it to finish.');
      }

      saleInFlightRef.current = true;
      const now = new Date().toISOString();
      const operationId = createOperationId('sale');

      try {
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
            lineTotal: Number(
              (line.unitPrice * line.quantity * (1 - line.discount / 100)).toFixed(2)
            ),
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

        const queueItem = createSyncQueueItem({
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
        });
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

        await saveInventoryItems(updatedInventory);
        await saveStockMovements(movements);
        if (updatedCustomer) await saveCustomer(updatedCustomer);
        await saveSale(sale);
        await saveSyncQueueItem(queueItem);
        await saveSyncQueueItem(movementQueueItem);
        if (customerQueueItem) await saveSyncQueueItem(customerQueueItem);

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
    [customers]
  );

  const reconcileCreditSale = useCallback(
    async (saleId: string, input: ReconcileCreditSaleInput) => {
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
    [sales]
  );

  const refundSale = useCallback(
    async (saleId: string, reason: string) => {
      const sale = sales.find((item) => item.id === saleId || item.transactionId === saleId);
      if (!sale) throw new Error('Transaction was not found');
      if (sale.status === 'refunded') throw new Error('This transaction has already been refunded');
      if (sale.status === 'voided') throw new Error('Voided transactions cannot be refunded');

      const now = new Date().toISOString();
      const operationId = createOperationId('refund');
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
    [currentUser?.name, inventory, sales]
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
      pendingSyncCount,
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
      pendingSyncCount,
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
