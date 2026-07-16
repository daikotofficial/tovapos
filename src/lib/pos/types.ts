export type StockStatus = 'in-stock' | 'low' | 'critical' | 'out' | 'expiring-soon' | 'expired';

export type ProductCategory = string;

export interface InventoryItem {
  id: string;
  name: string;
  genericName: string;
  sku: string;
  barcode?: string;
  variantName?: string;
  description?: string;
  category: ProductCategory;
  batchLot: string;
  currentQty: number;
  reorderLevel: number;
  maxStock: number;
  unitCost: number;
  sellingPrice: number;
  profitMargin?: number;
  discountType?: 'none' | 'percentage' | 'fixed';
  discountValue?: number;
  taxApplicable?: boolean;
  taxRate?: number;
  taxMode?: 'inclusive' | 'exclusive';
  expiryDate: string;
  manufactureDate: string;
  supplier: string;
  unitOfMeasurement?: string;
  imageUrl?: string;
  productStatus?: 'active' | 'inactive';
  requiresApproval: boolean;
  isControlled: boolean;
  stockStatus: StockStatus;
  location: string;
  lastRestocked: string;
  createdAt?: string;
  updatedAt?: string;
}

export type PaymentMethod = 'cash' | 'card' | 'mobile' | 'bank-transfer' | 'split' | 'credit';

export type CreditPaymentMethod = Exclude<PaymentMethod, 'credit'>;

export interface CreditPayment {
  id: string;
  amount: number;
  method: CreditPaymentMethod;
  recordedAt: string;
  recordedBy: string;
  notes?: string;
}

export interface SaleLineItem {
  id: string;
  inventoryItemId: string;
  productId: string;
  name: string;
  genericName: string;
  sku: string;
  barcode?: string;
  batchLot: string;
  expiryDate: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discount: number;
  lineTotal: number;
  discountAmount?: number;
  taxApplicable?: boolean;
  taxRate?: number;
  taxMode?: 'inclusive' | 'exclusive';
  taxAmount?: number;
  requiresApproval: boolean;
  isControlled: boolean;
  category: string;
}

export interface SaleTransaction {
  id: string;
  transactionId: string;
  items: SaleLineItem[];
  subtotal: number;
  discountTotal: number;
  taxAmount: number;
  grandTotal: number;
  paymentMethod: PaymentMethod;
  paymentStatus?: 'paid' | 'unpaid' | 'partial';
  amountPaid?: number;
  amountDue?: number;
  creditPayments?: CreditPayment[];
  cashTendered?: number;
  changeGiven?: number;
  customerName?: string;
  timestamp: string;
  cashier: string;
  status: 'completed' | 'voided' | 'refunded';
  syncStatus: 'pending' | 'synced' | 'failed';
}

export interface StockMovement {
  id: string;
  operationId: string;
  inventoryItemId: string;
  productName: string;
  sku: string;
  barcode?: string;
  batchLot: string;
  type: 'sale' | 'restock' | 'adjustment' | 'refund' | 'sync-correction';
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  unitCost: number;
  unitPrice?: number;
  referenceId: string;
  referenceLabel: string;
  reason: string;
  createdAt: string;
  createdBy: string;
  syncStatus: 'pending' | 'synced' | 'failed';
}

export type ExpenseCategory = string;

export type ExpensePaymentMethod = 'cash' | 'card' | 'bank-transfer' | 'mobile';

export interface ExpenseRecord {
  id: string;
  expenseId: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  vendorName?: string;
  notes?: string;
  incurredAt: string;
  recordedBy: string;
  status: 'recorded' | 'voided';
  syncStatus: 'pending' | 'synced' | 'failed';
  createdAt: string;
  updatedAt?: string;
}

export interface RecordExpenseInput {
  title: string;
  category: ExpenseCategory;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  vendorName?: string;
  notes?: string;
  incurredAt: string;
  recordedBy: string;
}

export type SyncEntity =
  | 'inventory'
  | 'stockMovement'
  | 'sale'
  | 'user'
  | 'customer'
  | 'vendor'
  | 'settings'
  | 'expense'
  | 'expenseHead'
  | 'report';
export type SyncAction = 'create' | 'update' | 'delete';

export interface SyncQueueItem {
  id: string;
  operationId: string;
  idempotencyKey: string;
  entity: SyncEntity;
  entityId: string;
  action: SyncAction;
  payload: unknown;
  createdAt: string;
  createdOffline: boolean;
  attempts: number;
  status: 'pending' | 'processing' | 'failed' | 'synced';
  lastError?: string;
  conflictStrategy?: 'server-wins' | 'client-wins' | 'merge-delta' | 'manual-review';
  dependsOn?: string[];
}

export interface SaleInputItem {
  inventoryItemId: string;
  quantity: number;
  discount: number;
  unitPrice: number;
}

export interface CompleteSaleInput {
  items: SaleInputItem[];
  subtotal: number;
  discountTotal: number;
  taxAmount: number;
  grandTotal: number;
  paymentMethod: PaymentMethod;
  cashTendered?: number;
  changeGiven?: number;
  customerName?: string;
  cashier: string;
}

export interface ReconcileCreditSaleInput {
  amount: number;
  method: CreditPaymentMethod;
  recordedBy: string;
  notes?: string;
}

export type Permission =
  | 'dashboard'
  | 'checkout'
  | 'add-product'
  | 'edit-product'
  | 'delete-product'
  | 'inventory'
  | 'adjust-stock'
  | 'give-discount'
  | 'void-sale'
  | 'reports'
  | 'credit-sales'
  | 'export-reports'
  | 'users'
  | 'settings'
  | 'customers'
  | 'vendors'
  | 'expenses'
  | 'refunds'
  | 'view-profit'
  | 'view-cost-price'
  | 'expiry-alerts'
  | 'manage-tax'
  | 'branches'
  | 'notifications'
  | 'sync-logs'
  | 'categories'
  | 'expense-heads';

export type UserRole =
  | 'super-admin'
  | 'owner'
  | 'manager'
  | 'cashier'
  | 'inventory'
  | 'accountant'
  | 'expense-clerk'
  | 'auditor'
  | 'viewer';

export interface TovaUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  permissions: Permission[];
  status: 'active' | 'suspended';
  branch?: string;
  pin: string;
  passwordHash?: string;
  passwordSalt?: string;
  passwordUpdatedAt?: string;
  newPassword?: string;
  lastLogin?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface RegisterBusinessInput {
  businessName: string;
  registrationNumber?: string;
  ownerName: string;
  email: string;
  phone: string;
  address?: string;
  password: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  loyaltyPoints: number;
  creditLimit: number;
  totalSpend: number;
  createdAt: string;
  updatedAt?: string;
}

export interface Vendor {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email?: string;
  address?: string;
  paymentTerms: string;
  outstandingBalance: number;
  createdAt: string;
  updatedAt?: string;
}

export interface BusinessSettings {
  id: 'settings';
  businessName: string;
  logoUrl?: string;
  address?: string;
  phone?: string;
  email?: string;
  taxNumber?: string;
  currency: string;
  taxRate: number;
  taxMode?: 'inclusive' | 'exclusive';
  receiptFooter: string;
  subscriptionPlanId?: 'starter' | 'pro' | 'delux';
  subscriptionStatus?: 'trialing' | 'active' | 'past-due' | 'cancelled';
  subscriptionRenewsAt?: string;
  allowOfflineSales: boolean;
  allowNegativeStock?: boolean;
  allowSellingBelowCost?: boolean;
  allowCashierDiscounts?: boolean;
  allowCashierPriceOverride?: boolean;
  requireManagerForRefunds: boolean;
  lowStockAlertDays: number;
  expiryAlertDays?: number;
  notificationRecipients?: string;
  expiryEmailRecipients?: string;
  notificationChannels?: {
    inApp: boolean;
    dashboard: boolean;
    email: boolean;
  };
  themeColor?: string;
  themeMode?: 'light' | 'dark';
  fontFamily?: string;
  receiptPrefix?: string;
  nextReceiptNumber?: number;
  branches?: string[];
  productCategories?: ProductCategory[];
  expenseCategories?: ExpenseCategory[];
  paymentMethods?: PaymentMethod[];
  updatedAt?: string;
}

export interface SupportTicket {
  id: string;
  tenantId: string;
  tenantName?: string;
  subject: string;
  message: string;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  createdBy: string;
  createdByEmail?: string;
  response?: string;
  respondedBy?: string;
  respondedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  tenantId: string;
  tenantName?: string;
  targetUserId?: string | null;
  targetUserName?: string | null;
  title: string;
  message: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
  sentBy: string;
  sentByEmail?: string;
  createdAt: string;
  readAt?: string | null;
}
