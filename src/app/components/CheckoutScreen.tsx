'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import CartPanel from './CartPanel';
import PaymentPanel from './PaymentPanel';
import ReceiptModal from './ReceiptModal';
import RefundModal from './RefundModal';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import { InventoryItem, PaymentMethod, SaleTransaction } from '@/lib/pos/types';
import { loadInventoryByIds, loadInventoryPage, lookupInventoryItem } from '@/lib/pos/local-store';
import { assertSellable, getDaysUntilExpiry } from '@/lib/pos/stock';
import { formatMoney } from '@/lib/pos/money';
import { getProductDiscountPercent, money, resolveTaxRate } from '@/lib/pos/sale-calculations';
import { loyaltyRedemption } from '@/lib/pos/loyalty';

export interface CartItem {
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
  baseDiscount: number;
  customerDiscountLocked?: boolean;
  taxApplicable: boolean;
  taxRate: number;
  taxMode: 'inclusive' | 'exclusive';
  requiresApproval: boolean;
  isControlled: boolean;
  category: string;
  availableQty: number;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to complete the operation';
}

export default function CheckoutScreen() {
  const {
    isHydrated,
    pendingSyncCount,
    completeSale,
    settings,
    currentUser,
    hasPermission,
    customers,
  } = usePosStore();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [scanInput, setScanInput] = useState('');
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [loyaltyPointsToRedeem, setLoyaltyPointsToRedeem] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cashTendered, setCashTendered] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [showRefund, setShowRefund] = useState(false);
  const [completedSale, setCompletedSale] = useState<SaleTransaction | null>(null);
  const [completedTaxLabel, setCompletedTaxLabel] = useState('0%');
  const [isScanning, setIsScanning] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<InventoryItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const scanRef = useRef<HTMLInputElement>(null);
  const globalScanBufferRef = useRef('');
  const lastGlobalScanKeyAtRef = useRef(0);
  const cartRef = useRef<CartItem[]>([]);
  const scanQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  const subtotal = money(cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
  const itemDiscountTotal = money(
    cart.reduce((sum, item) => sum + item.unitPrice * item.quantity * (item.discount / 100), 0)
  );
  const subtotalAfterLineDiscounts = money(subtotal - itemDiscountTotal);
  const orderDiscountEligibleSubtotal = money(
    cart.reduce(
      (sum, item) =>
        sum +
        (item.customerDiscountLocked
          ? 0
          : item.unitPrice * item.quantity * (1 - item.discount / 100)),
      0
    )
  );
  const orderDiscountTotal = money(orderDiscountEligibleSubtotal * (globalDiscount / 100));
  const discountTotal = money(itemDiscountTotal + orderDiscountTotal);
  const discountedSubtotal = money(subtotalAfterLineDiscounts - orderDiscountTotal);
  const defaultTaxRate = Math.max(0, Number(settings.taxRate) || 0);
  const taxLines = cart.map((item) => {
    const gross = money(item.unitPrice * item.quantity);
    const lineTaxRate =
      item.taxMode === 'inclusive'
        ? resolveTaxRate(item.taxApplicable, item.taxRate, defaultTaxRate)
        : 0;
    const combinedDiscount = item.customerDiscountLocked
      ? item.discount
      : 100 * (1 - (1 - item.discount / 100) * (1 - globalDiscount / 100));
    const discountedGross = money(gross * (1 - combinedDiscount / 100));
    const taxAmount = money(discountedGross * (lineTaxRate / 100));

    return {
      lineTaxRate,
      taxMode: item.taxMode,
      taxAmount,
      exclusiveTaxAmount: taxAmount,
    };
  });
  const taxAmount = money(taxLines.reduce((sum, line) => sum + line.taxAmount, 0));
  const exclusiveTaxAmount = money(
    taxLines.reduce((sum, line) => sum + line.exclusiveTaxAmount, 0)
  );
  const grandTotal = money(discountedSubtotal + exclusiveTaxAmount);
  const selectedCustomer = customers.find(
    (customer) =>
      customer.name.toLowerCase() === customerName.trim().toLowerCase() ||
      customer.phone === customerName.trim()
  );
  const loyaltyPreview = loyaltyRedemption(
    selectedCustomer,
    loyaltyPointsToRedeem,
    grandTotal,
    settings,
    paymentMethod
  );
  const amountToPay = money(Math.max(0, grandTotal - loyaltyPreview.credit));
  const appliedTaxRates = Array.from(
    new Set(taxLines.filter((line) => line.lineTaxRate > 0).map((line) => line.lineTaxRate))
  );
  const taxLabel =
    appliedTaxRates.length === 0
      ? '0%'
      : appliedTaxRates.length === 1
        ? `${appliedTaxRates[0]}%`
        : 'mixed';

  useEffect(() => {
    const selectedCustomer = customers.find(
      (customer) =>
        customer.name.toLowerCase() === customerName.trim().toLowerCase() ||
        customer.phone === customerName.trim()
    );
    setCart((current) =>
      current.map((item) => {
        const rule = selectedCustomer?.discountRules?.find(
          (candidate) => candidate.inventoryItemId === item.inventoryItemId && candidate.active
        );
        if (!rule) {
          return {
            ...item,
            discount: item.baseDiscount,
            customerDiscountLocked: false,
          };
        }
        const customerDiscount =
          rule.type === 'percentage'
            ? Math.min(100, Math.max(0, rule.value))
            : Math.max(0, ((item.unitPrice - rule.value) / item.unitPrice) * 100);
        return {
          ...item,
          discount: customerDiscount,
          customerDiscountLocked: true,
        };
      })
    );
  }, [customerName, customers]);

  useEffect(() => {
    if (!selectedCustomer || paymentMethod === 'credit') setLoyaltyPointsToRedeem(0);
  }, [paymentMethod, selectedCustomer]);
  const quickProducts = useMemo(() => [], []);

  useEffect(() => {
    const query = scanInput.trim();
    if (query.length < 2 || isScanning) {
      setSearchSuggestions([]);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void loadInventoryPage({ q: query, limit: 8 })
        .then((result) => {
          if (cancelled) return;
          setSearchSuggestions(
            result.items.filter(
              (item) => item.productStatus !== 'inactive' && item.stockStatus !== 'expired'
            )
          );
        })
        .catch(() => {
          if (!cancelled) setSearchSuggestions([]);
        });
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [isScanning, scanInput]);

  const handleScan = useCallback(
    async (rawCode: string) => {
      globalScanBufferRef.current = '';
      if (!isHydrated) {
        toast.error('Inventory is still loading. Try again in a moment.');
        return;
      }

      setIsScanning(true);
      try {
        const product = await lookupInventoryItem(rawCode);
        if (!product) {
          toast.error(`Product "${rawCode}" was not found by barcode, SKU, or name`);
          setScanInput('');
          return;
        }

        if (product.productStatus === 'inactive') {
          toast.error(`${product.name} is inactive and cannot be sold`);
          setScanInput('');
          return;
        }

        const currentCartQty =
          cartRef.current.find((item) => item.inventoryItemId === product.id)?.quantity ?? 0;

        assertSellable(product, currentCartQty + 1);

        const daysUntilExpiry = getDaysUntilExpiry(product.expiryDate);
        if (daysUntilExpiry <= 30) {
          toast.warning(
            `${product.name} expires in ${daysUntilExpiry} day(s). Confirm before selling.`
          );
        }

        if (product.isControlled) {
          toast.warning('Controlled item. Manager approval may be required before selling.');
        }

        const selectedCustomer = customers.find(
          (customer) =>
            customer.name.toLowerCase() === customerName.trim().toLowerCase() ||
            customer.phone === customerName.trim()
        );
        const rule = selectedCustomer?.discountRules?.find(
          (candidate) => candidate.inventoryItemId === product.id && candidate.active
        );
        const customerDiscount = rule
          ? rule.type === 'percentage'
            ? Math.min(100, Math.max(0, rule.value))
            : Math.max(0, ((product.sellingPrice - rule.value) / product.sellingPrice) * 100)
          : 0;
        setCart((prev) => {
          const existing = prev.find((item) => item.inventoryItemId === product.id);
          if (existing) {
            const next = prev.map((item) =>
              item.inventoryItemId === product.id
                ? { ...item, quantity: item.quantity + 1, availableQty: product.currentQty }
                : item
            );
            cartRef.current = next;
            return next;
          }

          const newItem: CartItem = {
            id: `cart-${product.id}`,
            inventoryItemId: product.id,
            productId: product.id,
            name: product.name,
            genericName: product.genericName,
            sku: product.sku,
            barcode: product.barcode,
            batchLot: product.batchLot,
            expiryDate: product.expiryDate,
            quantity: 1,
            unitPrice: product.sellingPrice,
            unitCost: product.unitCost,
            discount: rule ? customerDiscount : getProductDiscountPercent(product),
            baseDiscount: getProductDiscountPercent(product),
            customerDiscountLocked: Boolean(rule),
            taxApplicable: Boolean(
              product.taxMode === 'inclusive' &&
              (product.taxApplicable || Number(product.taxRate) > 0)
            ),
            taxRate: Number(product.taxRate) || Number(settings.taxRate) || 0,
            taxMode: product.taxMode ?? settings.taxMode ?? 'exclusive',
            requiresApproval: product.requiresApproval,
            isControlled: product.isControlled,
            category: product.category,
            availableQty: product.currentQty,
          };
          const next = [...prev, newItem];
          cartRef.current = next;
          return next;
        });

        setScanInput('');
        setSearchSuggestions([]);
        toast.success(`Added: ${product.name}`);
      } catch (error) {
        toast.error(getErrorMessage(error));
        setScanInput('');
      } finally {
        setIsScanning(false);
      }
    },
    [customers, customerName, isHydrated, settings.taxMode, settings.taxRate]
  );

  const queueScan = useCallback(
    (rawCode: string) => {
      const queued = scanQueueRef.current.catch(() => undefined).then(() => handleScan(rawCode));
      scanQueueRef.current = queued;
      return queued;
    },
    [handleScan]
  );

  useEffect(() => {
    const captureScannerInput = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || showReceipt || showRefund) return;
      const target = event.target as HTMLElement | null;
      const isEditable =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;
      if (isEditable) return;

      if (event.key === 'Enter') {
        const code = globalScanBufferRef.current.trim();
        if (!code) return;
        event.preventDefault();
        globalScanBufferRef.current = '';
        setScanInput('');
        void queueScan(code);
        return;
      }

      if (event.key.length !== 1) return;
      const now = performance.now();
      if (now - lastGlobalScanKeyAtRef.current > 150) {
        globalScanBufferRef.current = '';
      }
      lastGlobalScanKeyAtRef.current = now;
      globalScanBufferRef.current += event.key;
      setScanInput(globalScanBufferRef.current);
      event.preventDefault();
    };

    window.addEventListener('keydown', captureScannerInput, true);
    return () => window.removeEventListener('keydown', captureScannerInput, true);
  }, [queueScan, showReceipt, showRefund]);

  useEffect(() => {
    if (isScanning || isProcessing || showReceipt || showRefund) return;
    const frame = window.requestAnimationFrame(() => scanRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isProcessing, isScanning, showReceipt, showRefund]);

  const handleScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && scanInput.trim()) {
      e.preventDefault();
      void queueScan(scanInput.trim());
    }
  };

  const removeItem = (id: string) => {
    setRemovingIds((prev) => new Set([...prev, id]));
    setTimeout(() => {
      setCart((prev) => prev.filter((item) => item.id !== id));
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 250);
  };

  const updateQuantity = async (id: string, qty: number) => {
    const cartItem = cart.find((item) => item.id === id);
    if (!cartItem) return;

    if (qty <= 0) {
      removeItem(id);
      return;
    }

    const [inventoryItem] = await loadInventoryByIds([cartItem.inventoryItemId]);
    if (!inventoryItem) {
      toast.error('This item no longer exists in inventory');
      return;
    }

    try {
      assertSellable(inventoryItem, qty);
    } catch (error) {
      toast.error(getErrorMessage(error));
      return;
    }

    setCart((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, quantity: qty, availableQty: inventoryItem.currentQty } : item
      )
    );
  };

  const updateItemDiscount = (id: string, discount: number) => {
    const item = cart.find((cartItem) => cartItem.id === id);
    if (item?.customerDiscountLocked) {
      toast.info('This customer has a fixed discount for this product.');
      return;
    }
    if (!settings.allowCashierDiscounts && !hasPermission('give-discount')) {
      toast.error('You do not have permission to apply discounts');
      return;
    }
    setCart((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, discount: Math.min(100, Math.max(0, discount)) } : item
      )
    );
  };

  const updateGlobalDiscount = (discount: number) => {
    if (!settings.allowCashierDiscounts && !hasPermission('give-discount')) {
      toast.error('You do not have permission to apply discounts');
      return;
    }
    setGlobalDiscount(discount);
  };

  const clearCart = () => {
    setCart([]);
    setGlobalDiscount(0);
    setCashTendered('');
    setCustomerName('');
    setLoyaltyPointsToRedeem(0);
    setPaymentMethod('cash');
  };

  const processPayment = async () => {
    if (!hasPermission('checkout')) {
      toast.error('Your current role does not have permission to complete sales.');
      return;
    }

    if (cart.length === 0) {
      toast.error('Cart is empty. Add items before processing payment.');
      return;
    }

    const tendered = paymentMethod === 'cash' ? parseFloat(cashTendered) : undefined;
    if (paymentMethod === 'cash' && (!tendered || tendered < amountToPay)) {
      toast.error(
        `Cash tendered is less than total (${formatMoney(amountToPay, settings.currency)})`
      );
      return;
    }

    if (paymentMethod === 'credit' && !customerName.trim()) {
      toast.error('Select or enter a customer before posting a sale to credit.');
      return;
    }

    setIsProcessing(true);
    try {
      const sale = await completeSale({
        items: cart.map((item) => ({
          inventoryItemId: item.inventoryItemId,
          quantity: item.quantity,
          discount: item.customerDiscountLocked
            ? item.discount
            : 100 * (1 - (1 - item.discount / 100) * (1 - globalDiscount / 100)),
          unitPrice: item.unitPrice,
        })),
        subtotal,
        discountTotal,
        taxAmount,
        grandTotal,
        paymentMethod,
        cashTendered: tendered,
        changeGiven: paymentMethod === 'cash' && tendered ? tendered - amountToPay : undefined,
        customerName,
        loyaltyPointsToRedeem: loyaltyPreview.points,
        cashier: currentUser?.name ?? 'Unknown cashier',
      });

      setCompletedSale(sale);
      setCompletedTaxLabel(taxLabel);
      clearCart();
      setShowReceipt(true);
      toast.success(
        `Payment of ${formatMoney(grandTotal, settings.currency)} recorded. Stock updated.`
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col overflow-visible lg:h-full lg:flex-row lg:overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col border-border lg:border-r lg:overflow-hidden">
        {pendingSyncCount > 0 && (
          <div className="px-4 py-2 bg-warning/10 border-b border-warning/20 text-xs font-medium text-warning">
            {pendingSyncCount} sale{pendingSyncCount === 1 ? '' : 's'} waiting to be sent. This will
            happen automatically when the connection returns.
          </div>
        )}
        <CartPanel
          cart={cart}
          scanInput={scanInput}
          setScanInput={setScanInput}
          onScanKeyDown={handleScanKeyDown}
          onScan={queueScan}
          isScanning={isScanning}
          scanRef={scanRef}
          searchSuggestions={searchSuggestions}
          onUpdateQuantity={updateQuantity}
          onUpdateDiscount={updateItemDiscount}
          onRemoveItem={removeItem}
          removingIds={removingIds}
          onClearCart={clearCart}
          onShowRefund={() => setShowRefund(true)}
          canRefund={hasPermission('refunds')}
          currency={settings.currency}
          quickProducts={quickProducts}
        />
      </div>

      <div className="flex w-full shrink-0 flex-col bg-card lg:w-80 lg:overflow-hidden xl:w-96">
        <PaymentPanel
          cart={cart}
          subtotal={subtotal}
          discountTotal={discountTotal}
          taxAmount={taxAmount}
          globalDiscount={globalDiscount}
          setGlobalDiscount={updateGlobalDiscount}
          customerName={customerName}
          setCustomerName={setCustomerName}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          cashTendered={cashTendered}
          setCashTendered={setCashTendered}
          onProcessPayment={processPayment}
          isProcessing={isProcessing}
          currency={settings.currency}
          taxLabel={taxLabel}
          loyaltyPointsToRedeem={loyaltyPointsToRedeem}
          setLoyaltyPointsToRedeem={setLoyaltyPointsToRedeem}
          loyaltyCreditAmount={loyaltyPreview.credit}
          amountToPay={amountToPay}
        />
      </div>

      {completedSale && (
        <ReceiptModal
          open={showReceipt}
          onClose={() => setShowReceipt(false)}
          sale={completedSale}
          currency={settings.currency}
          businessName={settings.businessName}
          businessLogo={settings.logoUrl}
          businessPhone={settings.phone}
          businessEmail={settings.email}
          businessAddress={settings.address}
          showLogo={settings.receiptShowLogo}
          showBusinessDetails={settings.receiptShowBusinessDetails}
          showCustomer={settings.receiptShowCustomer}
          receiptFooter={settings.receiptFooter}
          taxLabel={completedTaxLabel}
        />
      )}

      {hasPermission('refunds') && (
        <RefundModal open={showRefund} onClose={() => setShowRefund(false)} />
      )}
    </div>
  );
}
