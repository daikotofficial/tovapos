'use client';

import React from 'react';
import Modal from '@/components/ui/Modal';
import { Printer, Download, Share2, CheckCircle2 } from 'lucide-react';
import { SaleTransaction } from '@/lib/pos/types';
import { formatMoney } from '@/lib/pos/money';

interface ReceiptModalProps {
  open: boolean;
  onClose: () => void;
  sale: SaleTransaction;
  currency: string;
  businessName: string;
  receiptFooter: string;
  taxLabel: string;
}

export default function ReceiptModal({
  open,
  onClose,
  sale,
  currency,
  businessName,
  receiptFooter,
  taxLabel,
}: ReceiptModalProps) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Transaction Complete"
      subtitle={`Receipt — ${sale.transactionId}`}
      size="md"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground bg-secondary hover:bg-muted rounded-lg transition-colors duration-150"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 active:scale-95 transition-all duration-150"
          >
            <Printer size={14} />
            Print Receipt
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Success Banner */}
        <div className="flex items-center gap-3 bg-success/10 border border-success/20 rounded-xl px-4 py-3">
          <CheckCircle2 size={20} className="text-success shrink-0" />
          <div>
            <p className="text-sm font-semibold text-success">Payment Successful</p>
            <p className="text-xs text-success/80">
              {sale.paymentMethod.toUpperCase()} — {sale.timestamp}
            </p>
          </div>
          <span className="ml-auto text-lg font-bold text-success font-tabular">
            {formatMoney(sale.grandTotal, currency)}
          </span>
        </div>

        {/* Receipt Paper */}
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          {/* Header */}
          <div className="text-center px-6 py-4 border-b border-dashed border-border bg-muted/20">
            <p className="text-base font-bold text-foreground">{businessName}</p>
            <p className="text-xs text-muted-foreground">Retail Point-of-Sale</p>
            <p className="text-xs text-muted-foreground">Offline receipt copy</p>
            <p className="text-xs font-mono text-muted-foreground mt-1">{sale.transactionId}</p>
          </div>

          {/* Meta */}
          <div className="px-6 py-3 border-b border-dashed border-border">
            <div className="grid grid-cols-2 gap-y-1 text-xs">
              <span className="text-muted-foreground">Date:</span>
              <span className="font-medium text-foreground text-right">{sale.timestamp}</span>
              <span className="text-muted-foreground">Cashier:</span>
              <span className="font-medium text-foreground text-right">{sale.cashier}</span>
              <span className="text-muted-foreground">Customer:</span>
              <span className="font-medium text-foreground text-right">{sale.customerName}</span>
              <span className="text-muted-foreground">Payment:</span>
              <span className="font-medium text-foreground text-right uppercase">
                {sale.paymentMethod}
              </span>
            </div>
          </div>

          {/* Items */}
          <div className="px-6 py-3 border-b border-dashed border-border">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              Items Sold
            </p>
            <div className="space-y-2">
              {sale.items.map((item) => (
                <div key={`receipt-${item.id}`} className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground leading-tight">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {item.batchLot} | Exp: {item.expiryDate}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {item.quantity} x {formatMoney(item.unitPrice, currency)}
                      {item.discount > 0 ? ` (${item.discount}% off)` : ''}
                    </p>
                    {(item.discount > 0 || (item.taxApplicable && Number(item.taxRate) > 0)) && (
                      <div className="mt-1 space-y-0.5">
                        {item.discount > 0 && (
                          <p className="text-[10px] text-success">
                            Discount: -
                            {formatMoney(
                              item.discountAmount ??
                                item.unitPrice * item.quantity * (item.discount / 100),
                              currency
                            )}
                          </p>
                        )}
                        {item.taxApplicable && Number(item.taxRate) > 0 && (
                          <p className="text-[10px] text-primary">
                            VAT {item.taxRate}% {item.taxMode ?? 'exclusive'}:{' '}
                            {formatMoney(
                              item.taxAmount ??
                                item.unitPrice *
                                  item.quantity *
                                  ((Number(item.taxRate) || 0) / 100),
                              currency
                            )}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-semibold font-tabular text-foreground shrink-0">
                    {formatMoney(
                      item.unitPrice * item.quantity * (1 - item.discount / 100),
                      currency
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="px-6 py-3 border-b border-dashed border-border">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-tabular font-medium">
                  {formatMoney(sale.subtotal, currency)}
                </span>
              </div>
              {sale.discountTotal > 0 && (
                <div className="flex justify-between text-success">
                  <span>Discount</span>
                  <span className="font-tabular font-medium">
                    -{formatMoney(sale.discountTotal, currency)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax ({taxLabel})</span>
                <span className="font-tabular font-medium">
                  {formatMoney(sale.taxAmount, currency)}
                </span>
              </div>
              <div className="flex justify-between text-sm font-bold pt-1 border-t border-border mt-1">
                <span>TOTAL</span>
                <span className="font-tabular">{formatMoney(sale.grandTotal, currency)}</span>
              </div>
              {sale.paymentMethod === 'cash' && sale.cashTendered !== undefined && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cash Tendered</span>
                    <span className="font-tabular font-medium">
                      {formatMoney(sale.cashTendered, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold text-success">
                    <span>Change</span>
                    <span className="font-tabular">
                      {formatMoney(sale.changeGiven ?? 0, currency)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="text-center px-6 py-4 bg-muted/10">
            <p className="text-xs text-muted-foreground">{receiptFooter}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Keep this receipt for returns and reconciliation
            </p>
            <div className="mt-2 flex justify-center">
              <div className="bg-foreground h-8 w-40 rounded-sm opacity-10" />
            </div>
            <p className="text-[9px] font-mono text-muted-foreground mt-1">{sale.transactionId}</p>
          </div>
        </div>

        {/* Action Row */}
        <div className="flex gap-2">
          <button className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium bg-secondary hover:bg-muted rounded-lg text-secondary-foreground transition-colors duration-150">
            <Download size={13} />
            Save PDF
          </button>
          <button className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium bg-secondary hover:bg-muted rounded-lg text-secondary-foreground transition-colors duration-150">
            <Share2 size={13} />
            Email Receipt
          </button>
        </div>
      </div>
    </Modal>
  );
}
