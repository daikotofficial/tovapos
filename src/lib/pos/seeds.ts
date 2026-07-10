import { BusinessSettings, Customer, ProductCategory, TovaUser, Vendor } from './types';

const now = new Date().toISOString();

export const defaultUsers: TovaUser[] = [];

export const defaultCustomers: Customer[] = [];

export const defaultVendors: Vendor[] = [];

export const defaultProductCategories: ProductCategory[] = [
  'Groceries',
  'Beverages',
  'Household',
  'Personal Care',
  'Health',
  'Electronics',
  'Fashion',
  'Stationery',
  'General',
];

export const defaultSettings: BusinessSettings = {
  id: 'settings',
  businessName: 'TOVAPOS',
  logoUrl: '',
  address: '',
  phone: '',
  email: '',
  taxNumber: '',
  currency: 'NGN',
  taxRate: 0,
  taxMode: 'exclusive',
  receiptFooter: 'Thank you for shopping with us.',
  subscriptionPlanId: 'starter',
  subscriptionStatus: 'active',
  allowOfflineSales: true,
  allowNegativeStock: false,
  allowSellingBelowCost: false,
  allowCashierDiscounts: true,
  allowCashierPriceOverride: false,
  requireManagerForRefunds: true,
  lowStockAlertDays: 30,
  expiryAlertDays: 30,
  notificationRecipients: '',
  expiryEmailRecipients: '',
  notificationChannels: {
    inApp: true,
    dashboard: true,
    email: false,
  },
  themeColor: '#19b8a6',
  themeMode: 'light',
  fontFamily: 'Inter',
  receiptPrefix: 'TXN',
  nextReceiptNumber: 1,
  branches: ['Main Store'],
  productCategories: defaultProductCategories,
  expenseCategories: [
    'Rent',
    'Utilities',
    'Salaries',
    'Transport',
    'Inventory Purchase',
    'Repairs',
    'Marketing',
    'Taxes',
    'Bank Charges',
    'Miscellaneous',
  ],
  paymentMethods: ['cash', 'card', 'mobile', 'bank-transfer', 'split', 'credit'],
  updatedAt: now,
};
