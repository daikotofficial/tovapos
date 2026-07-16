import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  Barcode,
  BarChart3,
  Cloud,
  Database,
  Package,
  Pill,
  Receipt,
  ShieldCheck,
  Store,
  Truck,
  Users,
} from 'lucide-react';
import PricingSection from './components/PricingSection';

const navItems = [
  { label: 'Home', href: '#home' },
  { label: 'Products', href: '#products' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Features', href: '#features' },
  { label: 'About us', href: 'https://daikot.com.ng', external: true },
];

const solutionPillars = [
  {
    title: 'Checkout without delays',
    text: 'Barcode search, cart discounts, VAT-aware receipts, credit sales, refunds, and fast payment capture.',
    icon: Barcode,
  },
  {
    title: 'Inventory that stays accountable',
    text: 'Batches, expiry dates, vendors, reorder levels, stock movement logs, and controlled item visibility.',
    icon: Package,
  },
  {
    title: 'Owner-grade oversight',
    text: 'Role permissions, sales history, support visibility, offline sync logs, and practical reporting.',
    icon: BarChart3,
  },
];

const featureRows = [
  [
    'VAT and discount clarity',
    'Show product-level tax and discounts through checkout and receipt records.',
  ],
  [
    'Operational dashboard',
    'Track sales, profit, top products, low stock, pending sync, and staff activity signals.',
  ],
  [
    'Vendor and customer records',
    'Keep supplier contacts, customer credit, loyalty, and purchase history close.',
  ],
  ['Barcode scan', 'Sell and search by barcode, SKU, product name, or batch.'],
  [
    'Audit-ready reports',
    'Review stock movement, sales performance, customer spend, and user actions.',
  ],
  [
    'Access control',
    'Create practical roles for owners, managers, cashiers, stock teams, and auditors.',
  ],
  [
    'Offline-aware selling',
    'Keep working during short outages with sync visibility and conflict-safe reconciliation.',
  ],
  [
    'Platform support',
    'Send tickets from the app and receive platform notifications from TOVAPOS support.',
  ],
];

const businessTypes = [
  {
    title: 'Supermarkets',
    text: 'Fast counters, barcode shelves, and restock alerts.',
    icon: Store,
  },
  {
    title: 'Pharmacies',
    text: 'Batch, expiry, supplier, and controlled-item awareness.',
    icon: Pill,
  },
  {
    title: 'Retail teams',
    text: 'Boutiques, mini-marts, electronics shops, and wholesalers.',
    icon: Users,
  },
];

const primaryButton =
  'inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#19b8a6] px-5 text-sm font-bold text-white shadow-card transition-colors hover:bg-[#139b8d]';
const secondaryButton =
  'inline-flex h-11 items-center justify-center gap-2 rounded-md border border-white/20 bg-white/10 px-5 text-sm font-bold text-white transition-colors hover:bg-white/20';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#f6f8f8] text-[#071412]">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/20 bg-[#071412]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="#home" className="flex items-center gap-3 text-white">
            <Image
              src="/assets/brand/tovapos-mark.svg"
              alt="TOVAPOS logo"
              width={40}
              height={40}
              priority
              unoptimized
              className="h-10 w-10"
            />
            <div className="leading-tight">
              <p className="text-base font-bold">TOVAPOS</p>
              <p className="text-xs font-semibold text-white/70">Your trusted sales agent...</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-6 lg:flex">
            {navItems.map((item) =>
              item.external ? (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-white/70 transition-colors hover:text-white"
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm font-semibold text-white/70 transition-colors hover:text-white"
                >
                  {item.label}
                </Link>
              )
            )}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/sign-up-login"
              className="hidden h-10 items-center rounded-md px-3 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              Login
            </Link>
            <Link href="/sign-up-login?tab=signup" className={primaryButton}>
              Sign up
            </Link>
          </div>
        </div>
      </header>

      <section id="home" className="relative min-h-[78svh] overflow-hidden bg-[#071412]">
        <Image
          src="/assets/images/tovapos-hero.png"
          alt="Modern retail checkout counter with POS terminal and product shelves"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center opacity-50"
        />
        <div className="absolute inset-0 bg-[#071412]/60" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,20,18,0.98)_0%,rgba(7,20,18,0.86)_46%,rgba(7,20,18,0.42)_100%)]" />

        <div className="relative mx-auto flex min-h-[78svh] max-w-7xl items-center px-4 pb-12 pt-24 sm:px-6 lg:px-8">
          <div className="max-w-2xl text-white">
            <p className="text-xs font-bold uppercase text-[#19b8a6]">
              Retail POS, inventory, teams, and support
            </p>
            <h1 className="mt-4 text-4xl font-bold leading-[1.05] sm:text-5xl">
              Run sales, stock, staff, and receipts from one serious retail system.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/75 sm:text-lg">
              TOVAPOS gives supermarkets, pharmacies, mini-marts, boutiques, wholesalers, and
              product-selling teams the daily controls they need: fast checkout, clean inventory,
              VAT/discount accuracy, user permissions, reporting, and offline-aware sync.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/sign-up-login?tab=signup" className={primaryButton}>
                Create account
                <ArrowRight size={17} />
              </Link>
              <Link href="#pricing" className={secondaryButton}>
                View pricing
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-6 sm:grid-cols-3 sm:px-6 lg:px-8">
          {[
            [
              'Built for Nigeria-ready retail',
              'VAT, receipts, business roles, and realistic phone/contact flows',
            ],
            [
              'Controls that matter',
              'Sales, inventory, customers, vendors, staff, support, and admin oversight',
            ],
            [
              'Prepared for scale',
              'Offline-aware sync, subscriptions, platform admin, and secure access',
            ],
          ].map(([label, value]) => (
            <div key={label} className="border-l border-[#19b8a6] bg-[#f6f8f8] px-4 py-4">
              <p className="text-[11px] font-bold uppercase text-[#66736f]">{label}</p>
              <p className="mt-1 text-sm font-bold leading-6 text-[#071412]">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="products" className="bg-[#f6f8f8] py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
            <div>
              <p className="text-xs font-bold uppercase text-[#128174]">Product</p>
              <h2 className="mt-3 text-3xl font-bold leading-tight text-[#071412] sm:text-4xl">
                Built around the pressure points of everyday retail.
              </h2>
              <p className="mt-4 text-sm leading-7 text-[#596662] sm:text-base">
                Cashiers need speed, stock teams need accuracy, managers need control, and owners
                need trustworthy numbers. TOVAPOS keeps those jobs connected without making the
                interface heavy.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {solutionPillars.map((pillar) => {
                const Icon = pillar.icon;
                return (
                  <article
                    key={pillar.title}
                    className="border border-[#dfe7e4] bg-white p-5 shadow-card"
                  >
                    <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-md bg-[#e7f8f5] text-[#128174]">
                      <Icon size={20} />
                    </div>
                    <h3 className="text-base font-bold text-[#071412]">{pillar.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-[#66736f]">{pillar.text}</p>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="border border-[#dfe7e4] bg-white p-5 shadow-card sm:p-6">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-bold text-[#128174]">Operations overview</p>
                  <h3 className="mt-1 text-xl font-bold text-[#071412]">
                    The numbers people actually check every day.
                  </h3>
                </div>
                <span className="w-fit rounded-md bg-[#e7f8f5] px-3 py-1 text-xs font-bold text-[#128174]">
                  Synced
                </span>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Sales', 'NGN 1.82M'],
                  ['Profit', 'NGN 418K'],
                  ['Receipts', '386'],
                  ['Stock Alerts', '14'],
                ].map(([label, value]) => (
                  <div key={label} className="border border-[#e5ece9] bg-[#f8fbfa] p-4">
                    <p className="text-xs font-semibold text-[#66736f]">{label}</p>
                    <p className="mt-2 text-xl font-bold tabular-nums text-[#071412]">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-[#dfe7e4] bg-[#071412] p-5 text-white shadow-card sm:p-6">
              <p className="text-sm font-bold text-[#19b8a6]">Solution coverage</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  ['Sales Records', Receipt],
                  ['Vendor Tracking', Truck],
                  ['Offline Sync', Cloud],
                  ['Customer Tracking', Users],
                  ['Access Control', ShieldCheck],
                  ['Reports', Database],
                ].map(([label, Icon]) => (
                  <div key={label as string} className="flex items-center gap-3 text-sm">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-[#19b8a6]">
                      {typeof Icon !== 'string' && <Icon size={16} />}
                    </div>
                    <span className="font-semibold text-white/80">{label as string}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <PricingSection />

      <section id="features" className="bg-[#f6f8f8] py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase text-[#128174]">Features</p>
            <h2 className="mt-3 text-3xl font-bold leading-tight text-[#071412] sm:text-4xl">
              A practical control surface for growing retail teams.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[#596662] sm:text-base">
              Built around the questions operators ask every day: what sold, what is low, who did
              what, which customer owes, which batch expires soon, and what needs action now.
            </p>
          </div>

          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {featureRows.map(([title, text]) => (
              <div key={title} className="border-t border-[#d4dfdc] pt-5">
                <h3 className="text-base font-bold text-[#071412]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#66736f]">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#071412] py-16 text-white sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_0.95fr] lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase text-[#19b8a6]">Built for real businesses</p>
            <h2 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
              From one counter to multi-location retail operations.
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {businessTypes.map((business) => {
              const Icon = business.icon;
              return (
                <article key={business.title} className="border border-white/10 bg-white/5 p-5">
                  <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-md bg-white/10 text-[#19b8a6]">
                    <Icon size={20} />
                  </div>
                  <h3 className="text-base font-bold">{business.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/60">{business.text}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-white py-14">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 sm:px-6 lg:flex-row lg:items-center lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase text-[#128174]">Ready to modernize retail?</p>
            <h2 className="mt-2 text-2xl font-bold leading-tight text-[#071412] sm:text-3xl">
              Give your counter, stock room, and management team a better way to work.
            </h2>
          </div>
          <Link href="/sign-up-login?tab=signup" className={primaryButton}>
            Get started
            <ArrowRight size={17} />
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[#071412] px-4 py-8 text-white">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <p className="text-lg font-black tracking-tight">TOVAPOS</p>
            <p className="mt-1 text-xs font-medium text-white/55">
              &copy; 2026 TOVAPOS. All rights reserved.
            </p>
          </div>
          <a
            href="https://daikot.com.ng"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/5 px-4 py-2 text-xs font-black tracking-wide text-[#19b8a6] transition-colors hover:border-[#19b8a6]/50 hover:bg-[#19b8a6]/10 hover:text-white"
          >
            POWERED BY DAIKOT
          </a>
        </div>
      </footer>
    </main>
  );
}
