'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Package, ShoppingCart, TrendingUp, WalletCards, X } from 'lucide-react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import BrandLoader from './ui/BrandLoader';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import { Permission } from '@/lib/pos/types';

interface AppLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

const mobileNavItems: {
  label: string;
  href: string;
  icon: React.ElementType;
  permission: Permission;
}[] = [
  { label: 'Home', href: '/dashboard', icon: LayoutDashboard, permission: 'dashboard' },
  { label: 'Sales', href: '/sales', icon: ShoppingCart, permission: 'checkout' },
  { label: 'Stock', href: '/inventory-management', icon: Package, permission: 'inventory' },
  { label: 'Credit', href: '/credit-sales', icon: WalletCards, permission: 'credit-sales' },
  { label: 'Reports', href: '/reports', icon: TrendingUp, permission: 'reports' },
];

export default function AppLayout({ children, title, subtitle }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { isHydrated, isAuthenticated, hasPermission } = usePosStore();

  React.useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      router.replace('/sign-up-login?authError=session');
    }
  }, [isAuthenticated, isHydrated, router]);

  if (!isHydrated || !isAuthenticated) {
    return (
      <BrandLoader message={isHydrated ? 'Taking you to sign in...' : 'Preparing TOVAPOS...'} />
    );
  }

  return (
    <div className="pos-app-shell flex h-screen overflow-hidden bg-background text-foreground">
      <div className="hidden lg:block">
        <Suspense fallback={<div className="h-screen w-60 border-r border-border bg-card" />}>
          <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
        </Suspense>
      </div>
      <div className="flex flex-col flex-1 overflow-hidden">
        <Topbar title={title} subtitle={subtitle} onOpenMenu={() => setMobileMenuOpen(true)} />
        <main className="flex flex-1 flex-col overflow-y-auto bg-background pb-20 scrollbar-thin lg:pb-0">
          <div className="flex-1">{children}</div>
          <footer className="border-t border-border bg-card/95 px-4 py-4 text-xs text-muted-foreground">
            <div className="mx-auto flex max-w-screen-2xl flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm font-black tracking-tight text-foreground">TOVAPOS</p>
                <p className="mt-0.5">&copy; 2026 TOVAPOS. All rights reserved.</p>
              </div>
              <a
                href="https://daikot.com.ng"
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-md border border-border bg-background px-3 py-1.5 font-black tracking-wide text-primary hover:border-primary/40 hover:bg-primary/10 hover:text-foreground"
              >
                POWERED BY DAIKOT
              </a>
            </div>
          </footer>
        </main>
      </div>
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation overlay"
          />
          <div className="relative h-full w-[min(86vw,320px)] bg-card shadow-modal">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close navigation"
            >
              <X size={17} />
            </button>
            <Suspense fallback={<div className="h-screen w-full bg-card" />}>
              <Sidebar
                collapsed={false}
                onToggle={() => setMobileMenuOpen(false)}
                onNavigate={() => setMobileMenuOpen(false)}
              />
            </Suspense>
          </div>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-2 py-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
          {mobileNavItems
            .filter((item) => hasPermission(item.permission))
            .map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex h-12 flex-col items-center justify-center gap-1 rounded-md text-[10px] font-semibold transition-colors ${
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon size={17} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
        </div>
      </nav>
    </div>
  );
}
