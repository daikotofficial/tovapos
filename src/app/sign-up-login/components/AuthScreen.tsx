'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, BarChart3, CheckCircle2, ShieldCheck, Wifi, LockKeyhole } from 'lucide-react';
import LoginForm from './LoginForm';
import SignupForm from './SignupForm';

const authFeatures = [
  {
    title: 'Counter-ready checkout',
    text: 'Barcode sales, payments, discounts, refunds, and receipts.',
    icon: CheckCircle2,
  },
  {
    title: 'Inventory confidence',
    text: 'Stock levels, vendor records, batches, expiry dates, and alerts.',
    icon: BarChart3,
  },
  {
    title: 'Controlled access',
    text: 'Roles for owners, managers, stock officers, and cashiers.',
    icon: ShieldCheck,
  },
  {
    title: 'Resilient during outages',
    text: 'Keep selling during short internet interruptions and update automatically afterward.',
    icon: Wifi,
  },
];

const authStats = [
  { value: 'Fast', label: 'Checkout' },
  { value: 'Ready', label: 'During outages' },
  { value: 'Strict', label: 'Access control' },
];

interface AuthScreenProps {
  initialTab?: 'login' | 'signup';
  initialError?: string;
}

export default function AuthScreen({ initialTab = 'login', initialError = '' }: AuthScreenProps) {
  const tab = initialTab;

  const formWidth = tab === 'signup' ? 'max-w-[620px]' : 'max-w-[480px] lg:self-center';
  return (
    <main className="min-h-screen bg-[#f4f7f6] text-[#071412]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex h-14 shrink-0 items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/assets/brand/tovapos-mark.svg"
              alt="TOVAPOS logo"
              width={40}
              height={40}
              priority
              unoptimized
              className="h-10 w-10"
            />
            <div>
              <p className="text-base font-bold leading-tight">TOVAPOS</p>
              <p className="text-xs font-semibold text-[#66736f]">Your trusted sales agent...</p>
            </div>
          </Link>

          <Link
            href="/"
            className="inline-flex h-9 items-center gap-2 rounded-md px-2 text-sm font-semibold text-[#66736f] transition-colors hover:bg-white hover:text-[#071412]"
          >
            <ArrowLeft size={16} />
            Home
          </Link>
        </header>

        <div className="grid flex-1 items-center gap-6 py-6 lg:grid-cols-[0.95fr_1.05fr] lg:gap-10 lg:py-8">
          <aside className="hidden lg:block">
            <div className="overflow-hidden rounded-xl border border-[#d7e2df] bg-[#071412] shadow-[0_24px_70px_rgba(7,20,18,0.18)]">
              <div className="border-b border-white/10 px-8 py-7">
                <div className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-1.5 text-xs font-bold uppercase text-[#8ee8df]">
                  <LockKeyhole size={14} />
                  Secure business access
                </div>
                <h1 className="mt-5 text-4xl font-bold leading-tight text-white">
                  Sales, stock, access, and insight in one reliable system.
                </h1>
                <p className="mt-4 max-w-xl text-sm leading-7 text-white/70">
                  Built for daily retail operations where cashiers need speed, owners need control,
                  and managers need the numbers without hunting.
                </p>
              </div>

              <div className="grid gap-0 divide-y divide-white/10">
                {authFeatures.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="flex gap-4 px-8 py-5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#19b8a6]/20 text-[#19b8a6]">
                        <Icon size={19} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{item.title}</p>
                        <p className="mt-1 text-xs leading-5 text-white/60">{item.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10">
                {authStats.map((stat) => (
                  <div key={stat.label} className="px-8 py-5">
                    <p className="text-xl font-bold text-white">{stat.value}</p>
                    <p className="mt-1 text-xs text-white/50">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <section className="flex justify-center">
            <div
              className={`w-full ${formWidth} rounded-xl border border-[#d7e2df] bg-white p-4 shadow-[0_18px_60px_rgba(7,20,18,0.10)] sm:p-6 lg:p-8`}
            >
              <div className="mb-5 lg:hidden">
                <p className="text-xs font-bold uppercase text-[#128174]">Retail operations</p>
                <h1 className="mt-2 text-2xl font-bold leading-tight">
                  POS access for your store team.
                </h1>
                <p className="mt-2 text-sm leading-6 text-[#66736f]">
                  Sign in or create the owner account to manage sales, stock, reports, and roles.
                </p>
              </div>

              <div className="mb-6 grid grid-cols-2 gap-1 rounded-md bg-[#edf3f1] p-1">
                <Link
                  href="/sign-up-login?tab=login"
                  className={`h-11 rounded-md text-sm font-bold transition-colors ${
                    tab === 'login'
                      ? 'bg-[#071412] text-white shadow-card'
                      : 'text-[#66736f] hover:bg-white hover:text-[#071412]'
                  } flex items-center justify-center`}
                >
                  Sign In
                </Link>
                <Link
                  href="/sign-up-login?tab=signup"
                  className={`h-11 rounded-md text-sm font-bold transition-colors ${
                    tab === 'signup'
                      ? 'bg-[#071412] text-white shadow-card'
                      : 'text-[#66736f] hover:bg-white hover:text-[#071412]'
                  } flex items-center justify-center`}
                >
                  Register
                </Link>
              </div>

              {tab === 'login' ? (
                <LoginForm initialError={initialTab === 'login' ? initialError : ''} />
              ) : (
                <SignupForm initialError={initialTab === 'signup' ? initialError : ''} />
              )}
            </div>
          </section>
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-[#dbe5e2] py-4 text-xs text-[#66736f]">
          <span>&copy; 2026 TOVAPOS. All rights reserved.</span>
          <a
            href="https://daikot.com.ng"
            target="_blank"
            rel="noreferrer"
            className="font-bold text-[#128174] hover:text-[#071412]"
          >
            POWERED BY DAIKOT
          </a>
        </footer>
      </div>
    </main>
  );
}
