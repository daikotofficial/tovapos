import type { Permission } from './types';

export type SubscriptionPlanId = 'starter' | 'pro' | 'delux';

export interface SubscriptionPlan {
  id: SubscriptionPlanId;
  name: string;
  monthlyPrice: number | null;
  productLimit: number | null;
  description: string;
  features: string[];
  permissions: Permission[];
  highlight?: boolean;
}

const starterPermissions: Permission[] = [
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
  'settings',
  'customers',
  'expiry-alerts',
  'manage-tax',
  'notifications',
  'categories',
];

const proPermissions: Permission[] = [
  ...starterPermissions,
  'credit-sales',
  'export-reports',
  'users',
  'vendors',
  'expenses',
  'refunds',
  'view-profit',
  'view-cost-price',
  'branches',
  'expense-heads',
];

export const subscriptionPlans: Record<SubscriptionPlanId, SubscriptionPlan> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 5000,
    productLimit: 100000,
    description: 'For stores that need reliable POS, inventory, customers, and daily visibility.',
    features: [
      'Up to 100,000 products',
      'POS sales and receipt history',
      'Barcode, SKU, and product-name checkout',
      'Inventory, batches, expiry, and reorder alerts',
      'Customer records and basic credit visibility',
      'Dashboard and standard sales reports',
      'Offline sales queue after first sign-in',
    ],
    permissions: starterPermissions,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 15000,
    productLimit: 500000,
    description:
      'For growing teams that need credit control, staff controls, expenses, suppliers, and stronger reporting.',
    highlight: true,
    features: [
      'Everything in Starter',
      'Up to 500,000 products',
      'Credit sales reconciliation with full or part payments',
      'Advanced reports and CSV/Excel/PDF/JSON exports',
      'Users, roles, and permission control',
      'Expenses, expense heads, and supplier tracking',
      'Profit, cost-price, and manager control reports',
      'Refund workflow and profit/cost visibility',
      'Multi-branch-ready controls and sync audit trail',
    ],
    permissions: proPermissions,
  },
  delux: {
    id: 'delux',
    name: 'Delux',
    monthlyPrice: null,
    productLimit: null,
    description: 'For larger operations that need tailored rollout, onboarding, and support.',
    features: [
      'Everything in Pro',
      'Custom product scale',
      'Multi-branch rollout planning',
      'Custom onboarding and training',
      'Priority support',
      'Custom reports and workflows',
    ],
    permissions: proPermissions,
  },
};

export function getSubscriptionPlan(planId?: string): SubscriptionPlan {
  return (
    subscriptionPlans[(planId as SubscriptionPlanId) || 'starter'] ?? subscriptionPlans.starter
  );
}

export function planAllowsPermission(planId: string | undefined, permission: Permission): boolean {
  return getSubscriptionPlan(planId).permissions.includes(permission);
}

export function getProductUsage(planId: string | undefined, currentProducts: number) {
  const plan = getSubscriptionPlan(planId);
  const limit = plan.productLimit;
  const percent = limit ? Math.min(100, Math.round((currentProducts / limit) * 100)) : 0;
  return {
    plan,
    limit,
    currentProducts,
    percent,
    remaining: limit ? Math.max(0, limit - currentProducts) : null,
    isNearLimit: Boolean(limit && currentProducts >= limit * 0.9),
    isAtLimit: Boolean(limit && currentProducts >= limit),
  };
}
