'use client';

import React, { useState } from 'react';
import {
  CreditCard,
  Banknote,
  Smartphone,
  User,
  ChevronDown,
  Percent,
  Loader2,
  CheckCircle2,
  Tag,
  Landmark,
  Split,
} from 'lucide-react';
import { CartItem } from './CheckoutScreen';
import { formatMoney, getCurrencyInputPrefix } from '@/lib/pos/money';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import type { PaymentMethod } from '@/lib/pos/types';

interface PaymentPanelProps {
  cart: CartItem[];
  subtotal: number;
  discountTotal: number;
  taxAmount: number;
  globalDiscount: number;
  setGlobalDiscount: (v: number) => void;
  customerName: string;
  setCustomerName: (v: string) => void;
  paymentMethod: PaymentMethod;
  setPaymentMethod: (v: PaymentMethod) => void;
  cashTendered: string;
  setCashTendered: (v: string) => void;
  onProcessPayment: () => void;
  isProcessing: boolean;
  currency: string;
  taxLabel: string;
  loyaltyPointsToRedeem: number;
  setLoyaltyPointsToRedeem: (value: number) => void;
  loyaltyCreditAmount: number;
  amountToPay: number;
}

const QUICK_AMOUNTS_BY_CURRENCY: Record<string, number[]> = {
  NGN: [1000, 5000, 10000, 20000],
  USD: [20, 50, 100, 200],
  GHS: [50, 100, 200, 500],
  KES: [500, 1000, 2000, 5000],
};

export default function PaymentPanel({
  cart,
  subtotal,
  discountTotal,
  taxAmount,
  globalDiscount,
  setGlobalDiscount,
  customerName,
  setCustomerName,
  paymentMethod,
  setPaymentMethod,
  cashTendered,
  setCashTendered,
  onProcessPayment,
  isProcessing,
  currency,
  taxLabel,
  loyaltyPointsToRedeem,
  setLoyaltyPointsToRedeem,
  loyaltyCreditAmount,
  amountToPay,
}: PaymentPanelProps) {
  const { customers, hasPermission, settings } = usePosStore();
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const quickAmounts = QUICK_AMOUNTS_BY_CURRENCY[currency] ?? QUICK_AMOUNTS_BY_CURRENCY.NGN;
  const currencyPrefix = getCurrencyInputPrefix(currency);
  const tenderedAmount = Number(cashTendered);
  const change =
    paymentMethod === 'cash' && Number.isFinite(tenderedAmount) ? tenderedAmount - amountToPay : 0;
  const isChangeReady =
    paymentMethod === 'cash' && Number.isFinite(tenderedAmount) && tenderedAmount >= amountToPay;
  const selectedCustomer = customers.find(
    (customer) =>
      customer.name.toLowerCase() === customerName.trim().toLowerCase() ||
      customer.phone === customerName.trim()
  );
  const loyaltyEligible = Boolean(
    settings.loyaltyEnabled &&
    selectedCustomer &&
    selectedCustomer.loyaltyPoints >= Number(settings.loyaltyRedemptionThreshold ?? 0) &&
    paymentMethod !== 'credit'
  );

  return (
    <div className="flex h-auto flex-col overflow-visible border-t border-border lg:h-full lg:overflow-hidden lg:border-l lg:border-t-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-muted/30 shrink-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Payment
        </p>
      </div>

      <div className="flex-1 overflow-visible scrollbar-thin lg:overflow-y-auto">
        {/* Customer */}
        <div className="px-4 pt-4 pb-3 border-b border-border">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Customer (optional)
          </label>
          <div className="relative">
            <User
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              onFocus={() => setShowCustomerDropdown(true)}
              onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
              placeholder="Search customer..."
              className="w-full pl-9 pr-8 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
            />
            <ChevronDown
              size={12}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            {showCustomerDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-modal z-20 overflow-hidden fade-in">
                <div className="max-h-64 overflow-y-auto overscroll-contain py-1 scrollbar-thin">
                  <div
                    className="px-3 py-2 hover:bg-muted cursor-pointer"
                    onMouseDown={() => {
                      setCustomerName('Walk-in Customer');
                    }}
                  >
                    <p className="text-sm text-foreground">Walk-in Customer</p>
                    <p className="text-[10px] text-muted-foreground">No loyalty credit</p>
                  </div>
                  {customers
                    .filter((customer) =>
                      customer.name.toLowerCase().includes(customerName.toLowerCase())
                    )
                    .map((c) => (
                      <div
                        key={c.id}
                        className="px-3 py-2 hover:bg-muted cursor-pointer"
                        onMouseDown={() => setCustomerName(c.name)}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-foreground">{c.name}</p>
                          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                            {formatMoney(c.loyaltyPoints, currency)} credit
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {c.phone || c.email || 'Customer record'}
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {selectedCustomer && settings.loyaltyEnabled && (
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-foreground">Loyalty credit</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatMoney(selectedCustomer.loyaltyPoints, currency)} available
                </p>
              </div>
              <button
                type="button"
                disabled={!loyaltyEligible}
                onClick={() =>
                  setLoyaltyPointsToRedeem(
                    loyaltyPointsToRedeem > 0 ? 0 : selectedCustomer.loyaltyPoints
                  )
                }
                className="rounded-md border border-primary/30 px-2 py-1 text-xs font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loyaltyPointsToRedeem > 0 ? 'Remove' : 'Use credit'}
              </button>
            </div>
            {!loyaltyEligible && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Available after{' '}
                {formatMoney(Number(settings.loyaltyRedemptionThreshold ?? 0), currency)} credit.
              </p>
            )}
            {loyaltyEligible && loyaltyPointsToRedeem > 0 && (
              <input
                type="number"
                min="0"
                max={selectedCustomer.loyaltyPoints}
                value={loyaltyPointsToRedeem}
                onChange={(event) =>
                  setLoyaltyPointsToRedeem(Math.max(0, Number(event.target.value) || 0))
                }
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                aria-label="Loyalty credit to use"
              />
            )}
            {loyaltyCreditAmount > 0 && (
              <p className="mt-1 text-xs font-semibold text-success">
                Credit applied: -{formatMoney(loyaltyCreditAmount, currency)}
              </p>
            )}
          </div>
        )}

        {/* Order Discount */}
        <div className="px-4 py-3 border-b border-border">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Order Discount
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[8rem] flex-1">
              <Percent
                size={12}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="number"
                value={globalDiscount}
                onChange={(e) =>
                  setGlobalDiscount(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))
                }
                className="w-full pl-8 pr-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 font-tabular"
                min={0}
                max={100}
                placeholder="0"
              />
            </div>
            <span className="text-sm text-muted-foreground">%</span>
            <div className="grid w-full grid-cols-4 gap-1.5 sm:w-auto sm:flex sm:items-center">
              {[5, 10, 15, 20].map((pct) => (
                <button
                  key={`pct-${pct}`}
                  onClick={() => setGlobalDiscount(pct)}
                  className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors duration-100 ${
                    globalDiscount === pct
                      ? 'bg-primary text-white'
                      : 'bg-secondary text-secondary-foreground hover:bg-muted'
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Order Summary */}
        <div className="px-4 py-3 border-b border-border bg-muted/20">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Order Summary
          </p>
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Subtotal ({cart.reduce((s, i) => s + i.quantity, 0)} items)
              </span>
              <span className="font-tabular font-medium text-foreground">
                {formatMoney(subtotal, currency)}
              </span>
            </div>
            {discountTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-success flex items-center gap-1">
                  <Tag size={11} /> Discount
                </span>
                <span className="font-tabular font-medium text-success">
                  -{formatMoney(discountTotal, currency)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax ({taxLabel})</span>
              <span className="font-tabular font-medium text-foreground">
                {formatMoney(taxAmount, currency)}
              </span>
            </div>
            <div className="flex justify-between text-base font-bold pt-2 border-t border-border mt-2">
              <span className="text-foreground">Total</span>
              <span className="font-tabular text-primary text-lg">
                {formatMoney(amountToPay, currency)}
              </span>
            </div>
          </div>
        </div>

        {/* Payment Method */}
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Payment Method
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: 'cash', label: 'Cash', icon: Banknote },
                { id: 'card', label: 'Card', icon: CreditCard },
                { id: 'mobile', label: 'Mobile', icon: Smartphone },
                { id: 'bank-transfer', label: 'Transfer', icon: Landmark },
                { id: 'split', label: 'Split', icon: Split },
                { id: 'credit', label: 'Credit', icon: User },
              ] as { id: PaymentMethod; label: string; icon: React.ElementType }[]
            )
              .filter(({ id }) => id !== 'credit' || hasPermission('credit-sales'))
              .map(({ id, label, icon: Icon }) => (
                <button
                  key={`pm-${id}`}
                  onClick={() => setPaymentMethod(id)}
                  className={`flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border-2 px-2 py-3 transition-all duration-150 active:scale-95 ${
                    paymentMethod === id
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-primary/3'
                  }`}
                >
                  <Icon size={18} />
                  <span className="text-xs font-semibold">{label}</span>
                </button>
              ))}
          </div>
        </div>

        {/* Cash Tendered */}
        {paymentMethod === 'cash' && (
          <div className="px-4 py-3 border-b border-border fade-in">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Cash Tendered
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
                {currencyPrefix}
              </span>
              <input
                type="number"
                value={cashTendered}
                onChange={(e) => setCashTendered(e.target.value)}
                className="w-full pl-14 pr-4 py-2.5 text-lg font-bold bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 font-tabular"
                placeholder="0.00"
                min={0}
                step={0.01}
              />
            </div>
            {/* Quick amounts */}
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5 lg:flex">
              {quickAmounts.map((amt) => (
                <button
                  key={`cash-${amt}`}
                  onClick={() => setCashTendered(amt.toString())}
                  className="min-h-9 flex-1 rounded-md bg-secondary px-2 py-1.5 text-xs font-semibold text-foreground transition-colors duration-100 hover:bg-muted active:scale-95"
                >
                  {formatMoney(amt, currency)}
                </button>
              ))}
              <button
                onClick={() => setCashTendered(amountToPay.toFixed(2))}
                className="min-h-9 flex-1 rounded-md bg-primary/10 px-2 py-1.5 text-xs font-semibold text-primary transition-colors duration-100 hover:bg-primary/20 active:scale-95 sm:col-span-1"
              >
                Exact
              </button>
            </div>
            {/* Change */}
            {cashTendered && (
              <div
                className={`mt-2 flex items-center justify-between px-3 py-2 rounded-lg ${
                  isChangeReady
                    ? 'bg-success/10 border border-success/20'
                    : 'bg-danger/10 border border-danger/20'
                }`}
              >
                <span
                  className={`text-xs font-medium ${isChangeReady ? 'text-success' : 'text-danger'}`}
                >
                  {isChangeReady ? 'Change Due' : 'Insufficient Cash'}
                </span>
                <span
                  className={`text-sm font-bold font-tabular ${isChangeReady ? 'text-success' : 'text-danger'}`}
                >
                  {isChangeReady
                    ? formatMoney(change, currency)
                    : `-${formatMoney(Math.abs(change), currency)}`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Non-cash payment guidance */}
        {paymentMethod !== 'cash' && (
          <div className="px-4 py-4 border-b border-border fade-in">
            <div className="flex flex-col items-center gap-2 py-4 bg-muted/30 rounded-xl border border-dashed border-border">
              {paymentMethod === 'card' ? (
                <CreditCard size={28} className="text-primary/50" />
              ) : paymentMethod === 'mobile' ? (
                <Smartphone size={28} className="text-primary/50" />
              ) : paymentMethod === 'bank-transfer' ? (
                <Landmark size={28} className="text-primary/50" />
              ) : paymentMethod === 'split' ? (
                <Split size={28} className="text-primary/50" />
              ) : (
                <User size={28} className="text-primary/50" />
              )}
              <p className="text-sm font-medium text-muted-foreground">
                {paymentMethod === 'card'
                  ? 'Insert or tap card on terminal'
                  : paymentMethod === 'mobile'
                    ? 'Customer scans QR code'
                    : paymentMethod === 'bank-transfer'
                      ? 'Confirm transfer before completing sale'
                      : paymentMethod === 'split'
                        ? 'Record split tender at reconciliation'
                        : 'Sale will be posted to customer credit'}
              </p>
              <p className="text-xs text-muted-foreground/70">
                Amount:{' '}
                <span className="font-tabular font-semibold text-primary">
                  {formatMoney(amountToPay, currency)}
                </span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Process Button */}
      <div className="sticky bottom-16 z-20 shrink-0 border-t border-border bg-card/95 px-4 py-4 shadow-[0_-12px_28px_rgba(15,23,42,0.08)] backdrop-blur lg:static lg:shadow-none">
        <button
          onClick={onProcessPayment}
          disabled={isProcessing || cart.length === 0}
          className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-base font-bold transition-all duration-150 active:scale-[0.98] ${
            cart.length === 0
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-primary hover:bg-primary/90 text-white shadow-md hover:shadow-lg'
          }`}
        >
          {isProcessing ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Processing...</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={18} />
              <span>Charge {formatMoney(amountToPay, currency)}</span>
            </>
          )}
        </button>
        {cart.length === 0 && (
          <p className="text-center text-xs text-muted-foreground mt-2">
            Add items to cart to process payment
          </p>
        )}
      </div>
    </div>
  );
}
