'use client';

import React from 'react';
import {
  Scan,
  Trash2,
  Plus,
  Minus,
  X,
  RefreshCw,
  Search,
  ShieldAlert,
  FileText,
  Calendar,
  Package,
} from 'lucide-react';
import Badge from '@/components/ui/Badge';
import { CartItem } from './CheckoutScreen';
import { formatMoney } from '@/lib/pos/money';
import { getDaysUntilExpiry } from '@/lib/pos/stock';

interface CartPanelProps {
  cart: CartItem[];
  scanInput: string;
  setScanInput: (v: string) => void;
  onScanKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onScan: (barcode: string) => Promise<void>;
  isScanning: boolean;
  scanRef: React.RefObject<HTMLInputElement | null>;
  onUpdateQuantity: (id: string, qty: number) => Promise<void>;
  onUpdateDiscount: (id: string, discount: number) => void;
  onRemoveItem: (id: string) => void;
  removingIds: Set<string>;
  onClearCart: () => void;
  onShowRefund: () => void;
  canRefund: boolean;
  currency: string;
  quickProducts: { id: string; barcode: string; name: string }[];
}

export default function CartPanel({
  cart,
  scanInput,
  setScanInput,
  onScanKeyDown,
  onScan,
  isScanning,
  scanRef,
  onUpdateQuantity,
  onUpdateDiscount,
  onRemoveItem,
  removingIds,
  onClearCart,
  onShowRefund,
  canRefund,
  currency,
  quickProducts,
}: CartPanelProps) {
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Scan Bar */}
      <div className="px-4 py-3 bg-card border-b border-border">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Scan size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary" />
            <input
              ref={scanRef}
              type="text"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={onScanKeyDown}
              placeholder="Scan barcode or type product name / SKU..."
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 scan-pulse font-tabular"
              disabled={isScanning}
              autoFocus
            />
          </div>
          <button
            onClick={() => {
              if (scanInput) void onScan(scanInput);
            }}
            disabled={isScanning || !scanInput.trim()}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 active:scale-95 transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Search size={14} />
            <span className="hidden sm:inline">{isScanning ? 'Finding...' : 'Scan'}</span>
          </button>
          {canRefund && (
            <button
              onClick={onShowRefund}
              className="flex items-center gap-1.5 px-3 py-2.5 bg-secondary text-secondary-foreground text-sm font-medium rounded-lg hover:bg-muted active:scale-95 transition-all duration-150"
              title="Process refund or return"
            >
              <RefreshCw size={14} />
              <span className="hidden sm:inline">Refund</span>
            </button>
          )}
        </div>

        <p className="mt-1.5 text-[10px] font-medium text-muted-foreground">
          Scanner always ready — scan a barcode anywhere on this page. Press Enter to search typed
          names or SKUs.
        </p>

        {quickProducts.length > 0 && (
          <div className="flex items-center gap-2 mt-2 overflow-x-auto scrollbar-thin pb-1">
            <span className="text-[10px] font-medium text-muted-foreground shrink-0">Quick:</span>
            {quickProducts.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  void onScan(p.barcode);
                }}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-md text-xs font-medium text-primary transition-colors duration-100"
              >
                <Plus size={10} />
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cart Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Cart</span>
          {cart.length > 0 && (
            <span className="bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {cart.reduce((s, i) => s + i.quantity, 0)} items
            </span>
          )}
        </div>
        {cart.length > 0 && (
          <button
            onClick={onClearCart}
            className="flex items-center gap-1 text-xs text-danger hover:text-danger/80 font-medium transition-colors duration-150"
          >
            <Trash2 size={12} />
            Clear All
          </button>
        )}
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
            <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center">
              <Package size={28} className="text-primary/40" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Cart is empty</p>
              <p className="text-xs text-muted-foreground mt-1">
                Scan a barcode or use Quick Add to begin
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {cart.map((item) => (
              <div
                key={item.id}
                className={`px-4 py-3 hover:bg-muted/30 transition-all duration-150 ${removingIds.has(item.id) ? 'cart-item-exit' : 'fade-in'}`}
              >
                <div className="flex items-start gap-3">
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-foreground leading-tight truncate max-w-[200px]">
                        {item.name}
                      </span>
                      {item.requiresApproval && <Badge variant="approval" />}
                      {item.isControlled && <Badge variant="controlled" />}
                      {!item.requiresApproval && !item.isControlled && <Badge variant="standard" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.genericName}</p>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Package size={9} />
                        <span className="font-mono">{item.sku}</span>
                      </span>
                      {item.barcode && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Scan size={9} />
                          <span className="font-mono">{item.barcode}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <FileText size={9} />
                        {item.batchLot}
                      </span>
                      <span
                        className={`flex items-center gap-1 text-[10px] font-medium ${(() => {
                          const days = getDaysUntilExpiry(item.expiryDate);
                          return days <= 30 ? 'text-warning' : 'text-muted-foreground';
                        })()}`}
                      >
                        <Calendar size={9} />
                        Exp: {item.expiryDate}
                      </span>
                    </div>
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => onRemoveItem(item.id)}
                    className="p-1.5 rounded-md hover:bg-danger/10 text-muted-foreground hover:text-danger transition-colors duration-150 shrink-0 mt-0.5"
                    title="Remove from cart"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Qty + Price Row */}
                <div className="flex items-center justify-between mt-2.5 gap-3">
                  {/* Quantity Controls */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        void onUpdateQuantity(item.id, item.quantity - 1);
                      }}
                      className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center hover:bg-muted text-foreground transition-colors duration-100 active:scale-95"
                    >
                      <Minus size={11} />
                    </button>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => {
                        void onUpdateQuantity(item.id, parseInt(e.target.value) || 1);
                      }}
                      className="w-10 text-center text-sm font-semibold text-foreground bg-secondary border border-border rounded-md py-0.5 focus:outline-none focus:ring-1 focus:ring-primary/30 font-tabular"
                      min={1}
                    />
                    <button
                      onClick={() => {
                        void onUpdateQuantity(item.id, item.quantity + 1);
                      }}
                      className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center hover:bg-muted text-foreground transition-colors duration-100 active:scale-95"
                    >
                      <Plus size={11} />
                    </button>
                    <span className="text-xs text-muted-foreground">
                      x {formatMoney(item.unitPrice, currency)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Stock: {item.availableQty}
                    </span>
                  </div>

                  {/* Discount + Subtotal */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">Disc:</span>
                      <div className="relative">
                        <input
                          type="number"
                          value={item.discount}
                          onChange={(e) =>
                            onUpdateDiscount(item.id, parseFloat(e.target.value) || 0)
                          }
                          className="w-12 text-center text-xs font-medium bg-secondary border border-border rounded py-0.5 pr-3 focus:outline-none focus:ring-1 focus:ring-primary/30 font-tabular"
                          min={0}
                          max={100}
                        />
                        <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground">
                          %
                        </span>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-foreground font-tabular min-w-[56px] text-right">
                      {formatMoney(
                        item.unitPrice * item.quantity * (1 - item.discount / 100),
                        currency
                      )}
                    </span>
                  </div>
                </div>

                {/* Controlled item warning */}
                {item.isControlled && (
                  <div className="mt-2 flex items-center gap-1.5 bg-danger/5 border border-danger/20 rounded-md px-2.5 py-1.5">
                    <ShieldAlert size={11} className="text-danger shrink-0" />
                    <span className="text-[10px] text-danger font-medium">
                      Controlled item - manager approval may be required
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
