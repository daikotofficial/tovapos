import { InventoryItem, StockStatus } from './types';

const DAY_IN_MS = 1000 * 60 * 60 * 24;

export function getTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getDaysUntilExpiry(expiryDate: string, todayIso = getTodayIso()): number {
  const today = new Date(todayIso);
  const expiry = new Date(expiryDate);
  return Math.floor((expiry.getTime() - today.getTime()) / DAY_IN_MS);
}

export function computeStockStatus(
  qty: number,
  reorderLevel: number,
  expiryDate: string,
  expiryAlertDays = 30
): StockStatus {
  const daysUntilExpiry = getDaysUntilExpiry(expiryDate);
  if (daysUntilExpiry < 0) return 'expired';
  if (qty === 0) return 'out';
  if (daysUntilExpiry <= expiryAlertDays) return 'expiring-soon';
  if (qty <= reorderLevel * 0.5) return 'critical';
  if (qty <= reorderLevel) return 'low';
  return 'in-stock';
}

export function computeProfitMargin(unitCost: number, sellingPrice: number): number {
  if (unitCost <= 0 || sellingPrice <= 0) return 0;
  return Number((((sellingPrice - unitCost) / unitCost) * 100).toFixed(2));
}

export function computeSellingPriceFromMargin(unitCost: number, profitMargin: number): number {
  if (unitCost <= 0) return 0;
  const margin = Math.max(0, profitMargin) / 100;
  return Number((unitCost * (1 + margin)).toFixed(2));
}

export function getDiscountedSellingPrice(item: InventoryItem): number {
  const sellingPrice = Number(item.sellingPrice) || 0;
  const discountValue = Math.max(0, Number(item.discountValue) || 0);
  if (item.discountType === 'percentage') {
    return Number((sellingPrice * (1 - Math.min(100, discountValue) / 100)).toFixed(2));
  }
  if (item.discountType === 'fixed') {
    return Number(Math.max(0, sellingPrice - discountValue).toFixed(2));
  }
  return sellingPrice;
}

export function normalizeInventoryItem(item: InventoryItem): InventoryItem {
  const currentQty = Number(item.currentQty) || 0;
  const reorderLevel = Number(item.reorderLevel) || 1;
  const unitCost = Number(item.unitCost) || 0;
  const sellingPrice = Number(item.sellingPrice) || 0;
  const taxRate = Number(item.taxRate) || 0;

  return {
    ...item,
    currentQty,
    reorderLevel,
    maxStock: Number(item.maxStock) || Math.max(currentQty, reorderLevel),
    unitCost,
    sellingPrice,
    profitMargin: computeProfitMargin(unitCost, sellingPrice),
    discountType: item.discountType ?? 'none',
    discountValue: Number(item.discountValue) || 0,
    taxApplicable: Boolean(item.taxMode === 'inclusive' && (item.taxApplicable || taxRate > 0)),
    taxRate,
    taxMode: item.taxMode ?? 'exclusive',
    unitOfMeasurement: item.unitOfMeasurement ?? 'unit',
    productStatus: item.productStatus ?? 'active',
    createdAt: item.createdAt ?? item.updatedAt ?? new Date().toISOString(),
    stockStatus: computeStockStatus(currentQty, reorderLevel, item.expiryDate),
    updatedAt: item.updatedAt ?? new Date().toISOString(),
  };
}

export function findInventoryItemByScan(
  items: InventoryItem[],
  rawCode: string
): InventoryItem | undefined {
  const code = rawCode.trim().toLowerCase();
  if (!code) return undefined;

  return items.find((item) => {
    const barcode = item.barcode?.toLowerCase();
    return (
      item.sku.toLowerCase() === code ||
      barcode === code ||
      item.name.toLowerCase() === code ||
      item.name.toLowerCase().includes(code)
    );
  });
}

export function assertSellable(item: InventoryItem, requestedQty: number): void {
  if (getDaysUntilExpiry(item.expiryDate) < 0) {
    throw new Error(`${item.name} is expired and cannot be sold`);
  }

  if (item.currentQty <= 0) {
    throw new Error(`${item.name} is out of stock`);
  }

  if (requestedQty > item.currentQty) {
    throw new Error(`${item.name} only has ${item.currentQty} unit(s) available`);
  }
}
