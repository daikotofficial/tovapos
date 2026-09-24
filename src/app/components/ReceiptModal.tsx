'use client';

import React from 'react';
import Modal from '@/components/ui/Modal';
import { Printer, Download, Share2, CheckCircle2 } from 'lucide-react';
import { SaleTransaction } from '@/lib/pos/types';
import { formatMoney } from '@/lib/pos/money';
import AppImage from '@/components/ui/AppImage';

interface ReceiptModalProps {
  open: boolean;
  onClose: () => void;
  sale: SaleTransaction;
  currency: string;
  businessName: string;
  businessLogo?: string;
  businessPhone?: string;
  businessEmail?: string;
  businessAddress?: string;
  showLogo?: boolean;
  showBusinessDetails?: boolean;
  showCustomer?: boolean;
  receiptFooter: string;
  taxLabel: string;
}

export default function ReceiptModal({
  open,
  onClose,
  sale,
  currency,
  businessName,
  businessLogo,
  businessPhone,
  businessEmail,
  businessAddress,
  showLogo = true,
  showBusinessDetails = true,
  showCustomer = true,
  receiptFooter,
  taxLabel,
}: ReceiptModalProps) {
  const handlePrint = () => {
    const receiptPaper = document.querySelector<HTMLElement>(
      '[data-print-target="receipt"] .receipt-paper'
    );

    if (!receiptPaper) {
      return;
    }

    const printWindow = window.open('', '_blank', 'width=420,height=900');
    if (!printWindow) {
      return;
    }

    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((style) => style.outerHTML)
      .join('');

    printWindow.document.open();
    printWindow.document.write(
      '<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title>' +
        styles +
        '<style>@page{size:80mm auto;margin:0}html,body{margin:0!important;padding:0!important;width:80mm!important;min-width:80mm!important;height:auto!important;min-height:0!important;background:#fff!important}body{display:block!important;overflow:visible!important;font-family:Arial,Helvetica,sans-serif!important;line-height:1.25!important}*{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}.receipt-print-root{display:block!important;width:80mm!important;min-width:80mm!important;height:auto!important;min-height:0!important;margin:0!important;padding:0!important;overflow:visible!important;vertical-align:top!important}.receipt-paper{display:block!important;width:80mm!important;max-width:80mm!important;min-height:0!important;height:auto!important;margin:0!important;padding:0!important;overflow:visible!important;border:0!important;border-radius:0!important;box-shadow:none!important;box-sizing:border-box!important;color:#000!important;background:#fff!important;font-family:Arial,Helvetica,sans-serif!important;font-size:11px!important;line-height:1.25!important}.receipt-paper *{color:#000!important}.receipt-paper .text-base{font-size:14px!important}.receipt-paper .text-sm{font-size:12px!important}.receipt-paper .text-xs{font-size:11px!important}.receipt-paper>div{padding-top:8px!important;padding-bottom:8px!important;padding-left:12px!important;padding-right:12px!important}.receipt-paper>div:first-child{padding-top:10px!important;padding-bottom:10px!important}@media print{body>*{display:none!important}body>.receipt-print-root{display:block!important}}</style></head><body><div class="receipt-print-root">' +
        receiptPaper.outerHTML +
        '</div></body></html>'
    );
    printWindow.document.close();

    window.setTimeout(async () => {
      if (printWindow.closed) {
        return;
      }

      await printWindow.document.fonts.ready;
      const images = Array.from(printWindow.document.images);
      await Promise.all(
        images.map((image) =>
          image.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                image.addEventListener('load', () => resolve(), { once: true });
                image.addEventListener('error', () => resolve(), { once: true });
              })
        )
      );

      const printRoot = printWindow.document.querySelector<HTMLElement>('.receipt-print-root');
      const printPaper = printWindow.document.querySelector<HTMLElement>('.receipt-paper');
      if (!printRoot || !printPaper) {
        printWindow.close();
        return;
      }

      const receiptHeightPx = Math.ceil(
        Math.max(
          printRoot.scrollHeight,
          printPaper.scrollHeight,
          printRoot.getBoundingClientRect().height,
          printPaper.getBoundingClientRect().height
        ) + 2
      );
      const receiptHeightMm = Math.max(10, (receiptHeightPx * 25.4) / 96 + 1);
      printRoot.style.height = receiptHeightPx + 'px';
      printPaper.style.height = 'auto';
      printWindow.document.documentElement.style.height = receiptHeightPx + 'px';
      printWindow.document.body.style.height = receiptHeightPx + 'px';
      const pageStyle = printWindow.document.createElement('style');
      pageStyle.textContent =
        '@page { size: 80mm ' + receiptHeightMm.toFixed(2) + 'mm; margin: 0; }';
      printWindow.document.head.appendChild(pageStyle);
      printWindow.focus();
      printWindow.print();
    }, 250);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Transaction Complete"
      subtitle={`Receipt — ${sale.transactionId}`}
      size="md"
      printTarget="receipt"
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
      <div className="receipt-print-content space-y-4">
        {/* Success Banner */}
        <div className="receipt-print-hide flex items-center gap-3 bg-success/10 border border-success/20 rounded-xl px-4 py-3">
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
        <div className="receipt-paper bg-white border border-border rounded-xl overflow-hidden">
          {/* Header */}
          <div className="text-center px-6 py-4 border-b border-dashed border-border bg-muted/20">
            {showLogo && businessLogo && (
              <AppImage
                src={businessLogo}
                alt={`${businessName} logo`}
                width={56}
                height={56}
                className="mx-auto mb-2 h-14 w-14 object-contain"
                unoptimized
              />
            )}
            <p className="text-base font-bold text-foreground">{businessName}</p>
            {showBusinessDetails && (businessAddress || businessPhone) && (
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                {[businessAddress, businessPhone].filter(Boolean).join(' · ')}
              </p>
            )}
            <p className="text-xs font-mono text-muted-foreground mt-1">{sale.transactionId}</p>
          </div>

          {/* Meta */}
          <div className="px-6 py-3 border-b border-dashed border-border">
            <div className="grid grid-cols-2 gap-y-1 text-xs">
              <span className="text-muted-foreground">Date:</span>
              <span className="font-medium text-foreground text-right">{sale.timestamp}</span>
              <span className="text-muted-foreground">Cashier:</span>
              <span className="font-medium text-foreground text-right">{sale.cashier}</span>
              {showCustomer && (
                <>
                  <span className="text-muted-foreground">Customer:</span>
                  <span className="font-medium text-foreground text-right">
                    {sale.customerName || 'Walk-in Customer'}
                  </span>
                </>
              )}
              <span className="text-muted-foreground">Payment:</span>
              <span className="font-medium text-foreground text-right uppercase">
                {sale.paymentMethod}
              </span>
            </div>
          </div>

          {/* Items */}
          <div className="px-3 py-3 border-b border-dashed border-border">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              Items Sold
            </p>
            <div className="grid grid-cols-[minmax(0,1fr)_8mm_18mm_20mm] gap-x-2 border-b border-border pb-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Description</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Price</span>
              <span className="text-right">Total</span>
            </div>
            <div className="mt-2 space-y-2">
              {sale.items.map((item) => {
                const lineTotal = item.unitPrice * item.quantity * (1 - item.discount / 100);

                return (
                  <div
                    key={`receipt-${item.id}`}
                    className="grid grid-cols-[minmax(0,1fr)_8mm_18mm_20mm] items-start gap-x-2 text-[10px]"
                  >
                    <div className="min-w-0">
                      <p className="font-medium leading-tight text-foreground break-words">
                        {item.name}
                      </p>
                      {item.discount > 0 && (
                        <p className="mt-0.5 text-[9px] text-success">{item.discount}% discount</p>
                      )}
                    </div>
                    <span className="text-right font-tabular text-foreground">{item.quantity}</span>
                    <span className="text-right font-tabular text-foreground">
                      {formatMoney(item.unitPrice, currency)}
                    </span>
                    <span className="text-right font-semibold font-tabular text-foreground">
                      {formatMoney(lineTotal, currency)}
                    </span>
                  </div>
                );
              })}
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
              {sale.paymentMethod === 'split' && sale.paymentBreakdown && (
                <div className="mt-2 border-t border-dashed border-border pt-2">
                  <p className="text-muted-foreground">Payment split</p>
                  {Object.entries(sale.paymentBreakdown)
                    .filter(([, amount]) => Number(amount) > 0)
                    .map(([method, amount]) => (
                      <div key={method} className="flex justify-between">
                        <span className="capitalize">{method.replace('-', ' ')}</span>
                        <span className="font-tabular">
                          {formatMoney(Number(amount), currency)}
                        </span>
                      </div>
                    ))}
                </div>
              )}
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
              {Number(sale.loyaltyCreditAmount ?? 0) > 0 && (
                <div className="flex justify-between text-success">
                  <span>Loyalty credit</span>
                  <span className="font-tabular font-medium">
                    -{formatMoney(Number(sale.loyaltyCreditAmount), currency)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold pt-1 border-t border-border mt-1">
                <span>AMOUNT PAID</span>
                <span className="font-tabular">
                  {formatMoney(Number(sale.amountPaid ?? sale.grandTotal), currency)}
                </span>
              </div>
              {Number(sale.loyaltyPointsEarned ?? 0) > 0 && (
                <p className="pt-1 text-[11px] text-success">
                  Loyalty credit earned: {formatMoney(Number(sale.loyaltyPointsEarned), currency)}
                </p>
              )}
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
          </div>
        </div>

        {/* Action Row */}
        <div className="receipt-print-hide flex gap-2">
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
