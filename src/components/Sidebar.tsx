'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import AppLogo from '@/components/ui/AppLogo';
import {
  ShoppingCart,
  Package,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  TrendingUp,
  Users,
  Settings,
  LogOut,
  LayoutDashboard,
  ShieldCheck,
  Truck,
  WalletCards,
  Bell,
  Tags,
  History,
  LifeBuoy,
} from 'lucide-react';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import { Permission } from '@/lib/pos/types';

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
  badgeColor?: string;
  group: string;
  permission: Permission;
  order: number;
  adminOnly?: boolean;
}

interface ReportNavItem {
  id: string;
  label: string;
  href: string;
  permission?: Permission;
}

const navItems: NavItem[] = [
  {
    id: 'nav-dashboard',
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    group: 'Dashboard',
    permission: 'dashboard',
    order: 1,
  },
  {
    id: 'nav-sales',
    label: 'POS / Sales',
    href: '/sales',
    icon: ShoppingCart,
    group: 'Operations',
    permission: 'checkout',
    order: 1,
  },
  {
    id: 'nav-inventory',
    label: 'Products & Inventory',
    href: '/inventory-management',
    icon: Package,
    badge: 4,
    badgeColor: 'bg-warning text-white',
    group: 'Operations',
    permission: 'inventory',
    order: 2,
  },
  {
    id: 'nav-categories',
    label: 'Categories',
    href: '/categories',
    icon: Tags,
    group: 'Operations',
    permission: 'categories',
    order: 3,
  },
  {
    id: 'nav-vendors',
    label: 'Suppliers',
    href: '/vendors',
    icon: Truck,
    group: 'Relationships',
    permission: 'vendors',
    order: 2,
  },
  {
    id: 'nav-expenses',
    label: 'Expenses',
    href: '/expenses',
    icon: WalletCards,
    group: 'Money',
    permission: 'expenses',
    order: 1,
  },
  {
    id: 'nav-expense-heads',
    label: 'Expense Heads',
    href: '/expense-heads',
    icon: Tags,
    group: 'Money',
    permission: 'expense-heads',
    order: 2,
  },
  {
    id: 'nav-credit-sales',
    label: 'Credit Sales',
    href: '/credit-sales',
    icon: WalletCards,
    group: 'Money',
    permission: 'credit-sales',
    order: 3,
  },
  {
    id: 'nav-customers',
    label: 'Customers',
    href: '/customers',
    icon: Users,
    group: 'Relationships',
    permission: 'customers',
    order: 1,
  },
  {
    id: 'nav-users',
    label: 'Users & Roles',
    href: '/users',
    icon: ShieldCheck,
    group: 'Admin',
    permission: 'users',
    order: 1,
  },
  {
    id: 'nav-sync-logs',
    label: 'Sync Logs',
    href: '/sync-logs',
    icon: History,
    group: 'Admin',
    permission: 'sync-logs',
    order: 2,
    adminOnly: true,
  },
  {
    id: 'nav-notifications',
    label: 'Notifications',
    href: '/notifications',
    icon: Bell,
    group: 'Admin',
    permission: 'notifications',
    order: 3,
  },
  {
    id: 'nav-support',
    label: 'Support',
    href: '/support',
    icon: LifeBuoy,
    group: 'Admin',
    permission: 'dashboard',
    order: 4,
  },
  {
    id: 'nav-settings',
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    group: 'Admin',
    permission: 'dashboard',
    order: 5,
  },
];

const reportItems: ReportNavItem[] = [
  { id: 'report-overview', label: 'Overview', href: '/reports?view=overview' },
  { id: 'report-sales', label: 'Sales', href: '/reports?view=sales' },
  {
    id: 'report-credit-sales',
    label: 'Credit Sales',
    href: '/reports?view=credit-sales',
    permission: 'credit-sales',
  },
  { id: 'report-cashier', label: 'By Cashier', href: '/reports?view=sales-by-cashier' },
  { id: 'report-product', label: 'By Product', href: '/reports?view=sales-by-product' },
  { id: 'report-category', label: 'By Category', href: '/reports?view=sales-by-category' },
  { id: 'report-payment', label: 'Payments', href: '/reports?view=payment-methods' },
  { id: 'report-profit', label: 'Profit', href: '/reports?view=profit', permission: 'view-profit' },
  { id: 'report-inventory', label: 'Inventory', href: '/reports?view=inventory' },
  { id: 'report-low-stock', label: 'Low Stock', href: '/reports?view=low-stock' },
  { id: 'report-expiring', label: 'Expiring', href: '/reports?view=expiring' },
  { id: 'report-expired', label: 'Expired', href: '/reports?view=expired' },
  { id: 'report-stock-ledger', label: 'Stock Movement', href: '/reports?view=stock-ledger' },
  {
    id: 'report-expenses',
    label: 'Expenses',
    href: '/reports?view=expenses',
    permission: 'expenses',
  },
  { id: 'report-customers', label: 'Customers', href: '/reports?view=customers' },
  {
    id: 'report-suppliers',
    label: 'Suppliers',
    href: '/reports?view=suppliers',
    permission: 'vendors',
  },
  { id: 'report-tax', label: 'VAT / Tax', href: '/reports?view=vat' },
  { id: 'report-discounts', label: 'Discounts', href: '/reports?view=discounts' },
  { id: 'report-refunds', label: 'Refunds', href: '/reports?view=refunds', permission: 'refunds' },
  { id: 'report-voided', label: 'Voided Sales', href: '/reports?view=voided' },
  { id: 'report-closing', label: 'Cashier Closing', href: '/reports?view=cashier-closing' },
  { id: 'report-eod', label: 'End of Day', href: '/reports?view=end-of-day' },
  { id: 'report-audit', label: 'Audit', href: '/reports?view=audit' },
];

const groups = ['Dashboard', 'Operations', 'Relationships', 'Money', 'Insights', 'Admin'];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}

export default function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { inventory, hasPermission, currentUser, signOut } = usePosStore();
  const [reportsOpen, setReportsOpen] = useState(pathname === '/reports');
  const activeReport = searchParams.get('view') ?? 'overview';
  const lowStockCount = inventory.filter(
    (item) =>
      item.stockStatus === 'low' ||
      item.stockStatus === 'critical' ||
      item.stockStatus === 'out' ||
      item.stockStatus === 'expiring-soon' ||
      item.stockStatus === 'expired'
  ).length;

  return (
    <aside
      className="relative flex h-screen min-h-0 flex-col border-r border-border bg-card shadow-sidebar transition-all duration-300 ease-smooth"
      style={{ width: collapsed ? 64 : 268 }}
    >
      {/* Logo */}
      <div
        className={`flex items-center gap-3 px-4 py-4 border-b border-border ${collapsed ? 'justify-center px-2' : ''}`}
      >
        <AppLogo size={32} />
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-sm text-foreground leading-tight">TOVAPOS</span>
            <span className="text-xs text-muted-foreground leading-tight">Retail POS</span>
          </div>
        )}
      </div>

      {/* Alerts Banner */}
      {!collapsed && (
        <div className="mx-3 mt-3 mb-1 flex items-center gap-2 bg-warning/10 border border-warning/20 rounded-md px-3 py-2">
          <AlertTriangle size={13} className="text-warning shrink-0" />
          <span className="text-xs text-warning font-medium">
            {lowStockCount} stock alert{lowStockCount === 1 ? '' : 's'}
          </span>
        </div>
      )}

      {/* Nav */}
      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin py-2 pb-4">
        {groups.map((group) => {
          const items = navItems
            .filter(
              (n) =>
                n.group === group &&
                hasPermission(n.permission) &&
                (!n.adminOnly ||
                  currentUser?.role === 'owner' ||
                  currentUser?.role === 'super-admin')
            )
            .sort((a, b) => a.order - b.order);
          const showReports = group === 'Insights' && hasPermission('reports');
          if (items.length === 0 && !showReports) return null;
          return (
            <div key={`group-${group}`} className="mb-1">
              {!collapsed && (
                <p className="px-4 pt-3 pb-1 text-[10px] font-600 uppercase text-muted-foreground/70">
                  {group}
                </p>
              )}
              {showReports && (
                <div className="relative group px-2">
                  <button
                    type="button"
                    onClick={() => setReportsOpen((open) => !open)}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors duration-150 ${
                      pathname === '/reports'
                        ? 'bg-primary/10 font-semibold text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    } ${collapsed ? 'justify-center px-2' : ''}`}
                  >
                    <TrendingUp size={18} className="shrink-0" />
                    {!collapsed && <span className="flex-1 truncate text-sm">Reports</span>}
                    {!collapsed && (
                      <ChevronDown
                        size={14}
                        className={`transition-transform ${reportsOpen ? 'rotate-180' : ''}`}
                      />
                    )}
                  </button>
                  {collapsed && (
                    <div className="absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 pointer-events-none opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                      <div className="rounded-md bg-foreground px-2 py-1.5 text-xs font-medium text-background shadow-modal">
                        Reports
                      </div>
                    </div>
                  )}
                  {!collapsed && reportsOpen && (
                    <div className="ml-6 mt-1 space-y-1 border-l border-border pl-2">
                      {reportItems
                        .filter((report) => !report.permission || hasPermission(report.permission))
                        .map((report) => {
                          const isReportActive =
                            pathname === '/reports' && report.href.includes(`view=${activeReport}`);
                          return (
                            <Link
                              key={report.id}
                              href={report.href}
                              onClick={onNavigate}
                              className={`block rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                                isReportActive
                                  ? 'bg-primary/10 text-primary'
                                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                              }`}
                            >
                              {report.label}
                            </Link>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}

              {items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                const badge = item.id === 'nav-inventory' ? lowStockCount : (item.badge ?? 0);
                const badgeColor = item.badgeColor ?? 'bg-warning text-white';
                return (
                  <div key={item.id} className="relative group px-2">
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-150 ${
                        isActive
                          ? 'bg-primary/10 text-primary font-semibold'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      } ${collapsed ? 'justify-center px-2' : ''}`}
                    >
                      <Icon size={18} className="shrink-0" />
                      {!collapsed && <span className="text-sm flex-1 truncate">{item.label}</span>}
                      {!collapsed && badge > 0 && (
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badgeColor}`}
                        >
                          {badge}
                        </span>
                      )}
                    </Link>
                    {/* Tooltip for collapsed */}
                    {collapsed && (
                      <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                        <div className="bg-foreground text-background text-xs font-medium px-2 py-1.5 rounded-md whitespace-nowrap shadow-modal flex items-center gap-2">
                          {item.label}
                          {badge > 0 && (
                            <span
                              className={`text-[9px] font-semibold px-1 py-0.5 rounded-full ${badgeColor}`}
                            >
                              {badge}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {collapsed && badge > 0 && (
                      <span
                        className={`absolute top-1 right-1 text-[8px] font-bold w-4 h-4 flex items-center justify-center rounded-full ${badgeColor}`}
                      >
                        {badge}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Bottom: User + Collapse */}
      <div className="border-t border-border">
        {!collapsed && (
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-xs font-semibold text-primary">AK</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {currentUser?.name ?? 'No user'}
              </p>
              <p className="text-xs text-muted-foreground truncate capitalize">
                {currentUser?.role.replace('-', ' ') ?? 'Unassigned'}
              </p>
            </div>
            <button
              onClick={async () => {
                try {
                  await signOut();
                  router.replace('/sign-up-login');
                  router.refresh();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Unable to sign out');
                }
              }}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-danger transition-colors duration-150"
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
        <button
          onClick={onToggle}
          className={`w-full flex items-center justify-center py-3 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150 border-t border-border ${collapsed ? '' : 'gap-2'}`}
        >
          {collapsed ? (
            <ChevronRight size={16} />
          ) : (
            <>
              <ChevronLeft size={16} />
              <span className="text-xs font-medium">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
