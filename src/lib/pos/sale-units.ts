import type { InventoryItem } from './types';

export type SaleUnit = 'piece' | 'pack' | 'carton';

export function hasPackPricing(item: InventoryItem): boolean {
  return Boolean(item.packPricingEnabled && Number(item.packPrice) > 0 && Number.isInteger(Number(item.packQuantity)) && Number(item.packQuantity) >= 1);
}

export function getSaleUnitPrice(item: InventoryItem, unit: SaleUnit): number {
  return unit !== 'piece' && hasPackPricing(item) ? Number(item.packPrice) : Number(item.sellingPrice);
}

export function getUnitsPerSale(item: InventoryItem, unit: SaleUnit): number {
  return unit !== 'piece' && hasPackPricing(item) ? Number(item.packQuantity) : 1;
}

export function getSaleUnitLabel(item: InventoryItem, unit: SaleUnit): string {
  if (unit === 'piece') return 'Piece';
  return item.packUnit === 'carton' ? 'Carton' : 'Pack';
}
