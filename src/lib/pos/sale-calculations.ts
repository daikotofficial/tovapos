import type { InventoryItem } from './types';

export type TaxMode = 'inclusive' | 'exclusive';

export interface TaxableSaleLine {
  unitPrice: number;
  quantity: number;
  discount: number;
  taxApplicable?: boolean;
  taxRate?: number;
  taxMode?: TaxMode;
}

export interface SaleLineCalculation {
  gross: number;
  discountAmount: number;
  lineTotal: number;
  taxApplicable: boolean;
  taxRate: number;
  taxMode: TaxMode;
  taxAmount: number;
  exclusiveTaxAmount: number;
}

export interface SaleTotals {
  subtotal: number;
  discountTotal: number;
  discountedSubtotal: number;
  taxAmount: number;
  exclusiveTaxAmount: number;
  grandTotal: number;
}

export function money(value: number): number {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2));
}

export function getProductDiscountPercent(product: InventoryItem): number {
  const sellingPrice = Number(product.sellingPrice) || 0;
  const discountValue = Math.max(0, Number(product.discountValue) || 0);
  if (sellingPrice <= 0 || discountValue <= 0 || product.discountType === 'none') return 0;
  if (product.discountType === 'percentage') return Math.min(100, discountValue);
  if (product.discountType === 'fixed') {
    return Math.min(100, (discountValue / sellingPrice) * 100);
  }
  return 0;
}

export function resolveTaxRate(
  taxApplicable: boolean | undefined,
  taxRate: number | undefined,
  defaultTaxRate: number
): number {
  const productTaxRate = Math.max(0, Number(taxRate) || 0);
  const fallbackTaxRate = Math.max(0, Number(defaultTaxRate) || 0);
  return taxApplicable || productTaxRate > 0 ? productTaxRate || fallbackTaxRate : 0;
}

export function calculateLineTax(
  taxBasis: number,
  taxRate: number,
  taxMode: TaxMode = 'exclusive'
): { taxAmount: number; exclusiveTaxAmount: number } {
  if (taxRate <= 0 || taxBasis <= 0) {
    return { taxAmount: 0, exclusiveTaxAmount: 0 };
  }

  const taxAmount =
    taxMode === 'inclusive'
      ? money(taxBasis - taxBasis / (1 + taxRate / 100))
      : money(taxBasis * (taxRate / 100));

  return {
    taxAmount,
    exclusiveTaxAmount: taxMode === 'exclusive' ? taxAmount : 0,
  };
}

export function calculateSaleLine(
  line: TaxableSaleLine,
  defaultTaxRate: number
): SaleLineCalculation {
  const gross = money((Number(line.unitPrice) || 0) * (Number(line.quantity) || 0));
  const discountPercent = Math.min(100, Math.max(0, Number(line.discount) || 0));
  const discountAmount = money(gross * (discountPercent / 100));
  const lineTotal = money(Math.max(0, gross - discountAmount));
  const taxRate = resolveTaxRate(line.taxApplicable, line.taxRate, defaultTaxRate);
  const taxMode = line.taxMode ?? 'exclusive';
  const tax = calculateLineTax(gross, taxRate, taxMode);

  return {
    gross,
    discountAmount,
    lineTotal,
    taxApplicable: taxRate > 0,
    taxRate,
    taxMode,
    taxAmount: tax.taxAmount,
    exclusiveTaxAmount: tax.exclusiveTaxAmount,
  };
}

export function calculateSaleTotals(lines: TaxableSaleLine[], defaultTaxRate: number): SaleTotals {
  return lines.reduce<SaleTotals>(
    (totals, line) => {
      const calculated = calculateSaleLine(line, defaultTaxRate);
      const subtotal = money(totals.subtotal + calculated.gross);
      const discountTotal = money(totals.discountTotal + calculated.discountAmount);
      const discountedSubtotal = money(totals.discountedSubtotal + calculated.lineTotal);
      const taxAmount = money(totals.taxAmount + calculated.taxAmount);
      const exclusiveTaxAmount = money(totals.exclusiveTaxAmount + calculated.exclusiveTaxAmount);

      return {
        subtotal,
        discountTotal,
        discountedSubtotal,
        taxAmount,
        exclusiveTaxAmount,
        grandTotal: money(discountedSubtotal + exclusiveTaxAmount),
      };
    },
    {
      subtotal: 0,
      discountTotal: 0,
      discountedSubtotal: 0,
      taxAmount: 0,
      exclusiveTaxAmount: 0,
      grandTotal: 0,
    }
  );
}
