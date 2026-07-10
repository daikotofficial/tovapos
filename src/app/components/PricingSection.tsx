'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { SubscriptionPlan, subscriptionPlans } from '@/lib/pos/subscription';

type PricingPlan = SubscriptionPlan & {
  cta: string;
  href: string;
  external?: boolean;
};

const pricingPlans: PricingPlan[] = [
  { ...subscriptionPlans.starter, cta: 'Start with Starter', href: '/sign-up-login?tab=signup' },
  { ...subscriptionPlans.pro, cta: 'Choose Pro', href: '/sign-up-login?tab=signup' },
  {
    ...subscriptionPlans.delux,
    cta: 'Contact us',
    href: 'https://daikot.com.ng',
    external: true,
  },
];

function formatNaira(value: number) {
  return `N${value.toLocaleString()}`;
}

export default function PricingSection() {
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const isYearly = billing === 'yearly';
  const billingLabel = isYearly ? '5% yearly discount applied' : 'Switch to yearly and save 5%';

  return (
    <section id="pricing" className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase text-[#128174]">Pricing</p>
          <h2 className="mt-3 text-3xl font-bold leading-tight text-[#071412] sm:text-4xl">
            Simple pricing for different retail stages.
          </h2>
          <p className="mt-4 text-sm leading-7 text-[#596662] sm:text-base">
            Pay monthly, or choose yearly billing and get 5% off the accumulated annual amount.
          </p>

          <div className="mt-7 inline-flex items-center gap-1 rounded-md border border-[#d4dfdc] bg-[#f5f7f7] p-1">
            {(['monthly', 'yearly'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setBilling(option)}
                className={`h-9 rounded-md px-4 text-sm font-bold transition-colors ${
                  billing === option
                    ? 'bg-[#071412] text-white shadow-card'
                    : 'text-[#596662] hover:bg-white hover:text-[#071412]'
                }`}
              >
                {option === 'monthly' ? 'Monthly' : 'Yearly'}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs font-semibold text-[#128174]">{billingLabel}</p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {pricingPlans.map((plan) => {
            const yearlyPrice =
              typeof plan.monthlyPrice === 'number' ? plan.monthlyPrice * 12 * 0.95 : null;
            const price =
              typeof plan.monthlyPrice === 'number'
                ? formatNaira(isYearly ? yearlyPrice! : plan.monthlyPrice)
                : 'Contact Us';
            const cadence =
              typeof plan.monthlyPrice === 'number' ? (isYearly ? '/Year' : '/Month') : '';

            return (
              <article
                key={plan.name}
                className={`relative flex min-h-[520px] flex-col border p-6 shadow-card ${
                  plan.highlight
                    ? 'border-[#19b8a6] bg-[#071412] text-white'
                    : 'pricing-card-light border-[#dfe7e4] bg-[#f8fbfa] text-[#071412]'
                }`}
              >
                {plan.highlight && (
                  <span className="absolute right-5 top-5 rounded-md bg-[#19b8a6] px-3 py-1 text-xs font-bold text-white">
                    Popular
                  </span>
                )}

                <p
                  className={`text-sm font-bold ${
                    plan.highlight ? 'text-[#19b8a6]' : 'text-[#128174]'
                  }`}
                >
                  {plan.name}
                </p>
                <div className="mt-5 flex items-end gap-1">
                  <span className="text-3xl font-bold sm:text-4xl">{price}</span>
                  {cadence && (
                    <span
                      className={`pb-1 text-sm font-semibold ${
                        plan.highlight ? 'text-white/60' : 'text-[#66736f]'
                      }`}
                    >
                      {cadence}
                    </span>
                  )}
                </div>

                {isYearly && typeof plan.monthlyPrice === 'number' && (
                  <p
                    className={
                      plan.highlight ? 'mt-2 text-xs text-white/60' : 'mt-2 text-xs text-[#66736f]'
                    }
                  >
                    Monthly total before discount: {formatNaira(plan.monthlyPrice * 12)}
                  </p>
                )}

                <p
                  className={`mt-5 text-sm font-bold ${
                    plan.highlight ? 'text-white' : 'text-[#071412]'
                  }`}
                >
                  {plan.productLimit
                    ? `Up to ${plan.productLimit.toLocaleString()} products`
                    : 'Custom product scale'}
                </p>
                <p
                  className={`mt-3 text-sm leading-6 ${
                    plan.highlight ? 'text-white/70' : 'text-[#66736f]'
                  }`}
                >
                  {plan.description}
                </p>

                <div className="mt-6 space-y-3">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex gap-3 text-sm">
                      <CheckCircle2
                        size={17}
                        className={`mt-0.5 shrink-0 ${
                          plan.highlight ? 'text-[#19b8a6]' : 'text-[#128174]'
                        }`}
                      />
                      <span className={plan.highlight ? 'text-white/80' : 'text-[#3f4a47]'}>
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>

                <Link
                  href={plan.href}
                  target={plan.external ? '_blank' : undefined}
                  rel={plan.external ? 'noreferrer' : undefined}
                  className={`mt-auto inline-flex h-11 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-bold transition-colors ${
                    plan.highlight
                      ? 'bg-[#19b8a6] text-white hover:bg-[#139b8d]'
                      : 'border border-[#c9d8d4] bg-white text-[#071412] hover:bg-[#edf6f4]'
                  }`}
                >
                  {plan.cta}
                  <ArrowRight size={16} />
                </Link>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
