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
  grandTotal: number;
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
  taxRate: number;
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
  grandTotal,
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
  taxRate,
}: PaymentPanelProps) {
  const { customers } = usePosStore();
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const quickAmounts = QUICK_AMOUNTS_BY_CURRENCY[currency] ?? QUICK_AMOUNTS_BY_CURRENCY.NGN;
  const currencyPrefix = getCurrencyInputPrefix(currency);
  const change =
    paymentMethod === 'cash' && cashTendered ? parseFloat(cashTendered) - grandTotal : 0;
  const isChangeReady = paymentMethod === 'cash' && parseFloat(cashTendered) >= grandTotal;

  return (
    <div className="flex flex-col h-full border-l border-border overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-muted/30 shrink-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Payment
        </p>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
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
                <div className="py-1">
                  <div
                    className="px-3 py-2 hover:bg-muted cursor-pointer"
                    onMouseDown={() => {
                      setCustomerName('Walk-in Customer');
                    }}
                  >
                    <p className="text-sm text-foreground">Walk-in Customer</p>
                    <p className="text-[10px] text-muted-foreground">No loyalty points</p>
                  </div>
                  {customers
                    .filter((customer) =>
                      customer.name.toLowerCase().includes(customerName.toLowerCase())
                    )
                    .slice(0, 6)
                    .map((c) => (
                      <div
                        key={c.id}
                        className="px-3 py-2 hover:bg-muted cursor-pointer"
                        onMouseDown={() => setCustomerName(c.name)}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-foreground">{c.name}</p>
                          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                            {c.loyaltyPoints.toLocaleString()} pts
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

        {/* Order Discount */}
        <div className="px-4 py-3 border-b border-border">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Order Discount
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
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
              <span className="text-muted-foreground">Tax ({taxRate}%)</span>
              <span className="font-tabular font-medium text-foreground">
                {formatMoney(taxAmount, currency)}
              </span>
            </div>
            <div className="flex justify-between text-base font-bold pt-2 border-t border-border mt-2">
              <span className="text-foreground">Total</span>
              <span className="font-tabular text-primary text-lg">
                {formatMoney(grandTotal, currency)}
              </span>
            </div>
          </div>
        </div>

        {/* Payment Method */}
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Payment Method
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { id: 'cash', label: 'Cash', icon: Banknote },
                { id: 'card', label: 'Card', icon: CreditCard },
                { id: 'mobile', label: 'Mobile', icon: Smartphone },
                { id: 'bank-transfer', label: 'Transfer', icon: Landmark },
                { id: 'split', label: 'Split', icon: Split },
                { id: 'credit', label: 'Credit', icon: User },
              ] as { id: PaymentMethod; label: string; icon: React.ElementType }[]
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={`pm-${id}`}
                onClick={() => setPaymentMethod(id)}
                className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all duration-150 active:scale-95 ${
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
            <div className="flex gap-1.5 mt-2">
              {quickAmounts.map((amt) => (
                <button
                  key={`cash-${amt}`}
                  onClick={() => setCashTendered(amt.toString())}
                  className="flex-1 py-1.5 text-xs font-semibold bg-secondary hover:bg-muted rounded-md transition-colors duration-100 text-foreground active:scale-95"
                >
                  {formatMoney(amt, currency)}
                </button>
              ))}
              <button
                onClick={() => setCashTendered(grandTotal.toFixed(2))}
                className="flex-1 py-1.5 text-xs font-semibold bg-primary/10 hover:bg-primary/20 rounded-md transition-colors duration-100 text-primary active:scale-95"
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
                  {formatMoney(grandTotal, currency)}
                </span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Process Button */}
      <div className="px-4 py-4 border-t border-border bg-card shrink-0">
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
              <span>Charge {formatMoney(grandTotal, currency)}</span>
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
