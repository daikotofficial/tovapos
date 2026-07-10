'use client';

import React from 'react';
import {
  X,
  Package,
  Calendar,
  Truck,
  MapPin,
  ShieldAlert,
  FileText,
  TrendingDown,
  Hash,
  AlertTriangle,
  Scan,
} from 'lucide-react';
import Badge from '@/components/ui/Badge';
import type { InventoryItem, StockMovement } from '@/lib/pos/types';
import { formatMoney } from '@/lib/pos/money';
import { getDaysUntilExpiry } from '@/lib/pos/stock';

interface BatchDetailDrawerProps {
  item: InventoryItem | null;
  movements: StockMovement[];
  onClose: () => void;
}

export default function BatchDetailDrawer({ item, movements, onClose }: BatchDetailDrawerProps) {
  if (!item) return null;

  const daysUntilExpiry = getDaysUntilExpiry(item.expiryDate);
  const stockPct = Math.min(100, (item.currentQty / item.maxStock) * 100);
  const margin = item.sellingPrice - item.unitCost;
  const marginPct = (item.profitMargin ?? (margin / item.sellingPrice) * 100).toFixed(1);

  const movementHistory = movements
    .filter((movement) => movement.inventoryItemId === item.id)
    .slice(0, 8);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border-l border-border shadow-modal h-full overflow-y-auto scrollbar-thin slide-in-right">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-5 py-4 z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-foreground leading-tight">{item.name}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {item.genericName} - {item.sku}
              </p>
              {item.variantName && (
                <p className="text-[10px] text-muted-foreground">{item.variantName}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-150 shrink-0"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant={item.stockStatus} />
            {item.requiresApproval && <Badge variant="approval" />}
            {item.isControlled && <Badge variant="controlled" />}
            {!item.requiresApproval && <Badge variant="standard" />}
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Expiry Alert */}
          {daysUntilExpiry < 0 && (
            <div className="flex items-center gap-2.5 bg-danger/10 border border-danger/20 rounded-xl px-4 py-3">
              <AlertTriangle size={16} className="text-danger shrink-0" />
              <div>
                <p className="text-sm font-semibold text-danger">This batch has expired</p>
                <p className="text-xs text-danger/80">Remove from active inventory immediately</p>
              </div>
            </div>
          )}
          {daysUntilExpiry >= 0 && daysUntilExpiry <= 30 && (
            <div className="flex items-center gap-2.5 bg-warning/10 border border-warning/20 rounded-xl px-4 py-3">
              <AlertTriangle size={16} className="text-warning shrink-0" />
              <div>
                <p className="text-sm font-semibold text-warning">
                  Expiring in {daysUntilExpiry} days
                </p>
                <p className="text-xs text-warning/80">
                  Prioritize dispensing — contact supplier for exchange
                </p>
              </div>
            </div>
          )}

          {/* Stock Level */}
          <div className="bg-muted/30 rounded-xl p-4 border border-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Stock Level
              </span>
              <span className="text-xl font-bold font-tabular text-foreground">
                {item.currentQty}{' '}
                <span className="text-sm font-normal text-muted-foreground">units</span>
              </span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  item.currentQty === 0
                    ? 'bg-danger'
                    : item.currentQty <= item.reorderLevel * 0.5
                      ? 'bg-danger'
                      : item.currentQty <= item.reorderLevel
                        ? 'bg-warning'
                        : 'bg-success'
                }`}
                style={{ width: `${stockPct}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
              <span>0</span>
              <span>Reorder: {item.reorderLevel}</span>
              <span>Max: {item.maxStock}</span>
            </div>
          </div>

          {/* Batch Details */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Batch / Lot Information
            </p>
            <div className="space-y-2.5">
              {[
                { icon: Hash, label: 'Batch / Lot Number', value: item.batchLot, mono: true },
                { icon: Scan, label: 'Barcode', value: item.barcode ?? 'Not assigned', mono: true },
                { icon: Calendar, label: 'Manufacture Date', value: item.manufactureDate },
                {
                  icon: Calendar,
                  label: 'Expiry Date',
                  value: item.expiryDate,
                  highlight:
                    daysUntilExpiry < 0 ? 'danger' : daysUntilExpiry <= 30 ? 'warning' : null,
                },
                { icon: Truck, label: 'Supplier', value: item.supplier },
                { icon: MapPin, label: 'Storage Location', value: item.location },
                { icon: Package, label: 'Last Restocked', value: item.lastRestocked },
              ].map((row) => (
                <div key={`detail-${row.label}`} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <row.icon size={13} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground">{row.label}</p>
                    <p
                      className={`text-sm font-medium leading-tight ${
                        row.highlight === 'danger'
                          ? 'text-danger'
                          : row.highlight === 'warning'
                            ? 'text-warning'
                            : 'text-foreground'
                      } ${row.mono ? 'font-mono' : ''}`}
                    >
                      {row.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Pricing & Margin
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: 'Unit Cost',
                  value: formatMoney(item.unitCost),
                  sub: 'Purchase price',
                  color: 'text-foreground',
                },
                {
                  label: 'Selling Price',
                  value: formatMoney(item.sellingPrice),
                  sub: 'Retail price',
                  color: 'text-primary',
                },
                {
                  label: 'Gross Margin',
                  value: `${marginPct}%`,
                  sub: `${formatMoney(margin)}/unit`,
                  color: 'text-success',
                },
              ].map((p) => (
                <div
                  key={`price-${p.label}`}
                  className="bg-muted/30 rounded-xl p-3 border border-border text-center"
                >
                  <p className="text-[10px] text-muted-foreground mb-1">{p.label}</p>
                  <p className={`text-base font-bold font-tabular ${p.color}`}>{p.value}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">{p.sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Controlled Item */}
          {item.isControlled && (
            <div className="bg-danger/5 border border-danger/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <ShieldAlert size={15} className="text-danger" />
                <p className="text-sm font-semibold text-danger">Controlled Item Protocol</p>
              </div>
              <ul className="space-y-1 text-xs text-danger/80 list-disc list-inside">
                <li>Requires manager approval before sale or adjustment</li>
                <li>Customer identity may be required depending on product policy</li>
                <li>Log every movement for audit purposes</li>
                <li>Report discrepancies to the store manager immediately</li>
              </ul>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Recent Movement
            </p>
            <div className="space-y-1.5">
              {movementHistory.length === 0 && (
                <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center">
                  <p className="text-xs font-medium text-foreground">No stock movement yet</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Sales, initial stock, and manual quantity changes will appear here.
                  </p>
                </div>
              )}
              {movementHistory.map((movement) => (
                <div
                  key={movement.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors duration-100"
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                      movement.quantityDelta > 0 ? 'bg-success/10' : 'bg-muted'
                    }`}
                  >
                    {movement.quantityDelta > 0 ? (
                      <TrendingDown size={11} className="text-success rotate-180" />
                    ) : (
                      <TrendingDown size={11} className="text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium capitalize text-foreground">
                      {movement.type.replace('-', ' ')}
                    </p>
                    <p className="text-[10px] font-mono text-muted-foreground truncate">
                      {movement.referenceLabel}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`text-xs font-semibold font-tabular ${
                        movement.quantityDelta > 0 ? 'text-success' : 'text-muted-foreground'
                      }`}
                    >
                      {movement.quantityDelta > 0 ? '+' : ''}
                      {movement.quantityDelta}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {movement.createdAt.slice(0, 10)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-border">
            <button className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium bg-primary text-white rounded-xl hover:bg-primary/90 active:scale-95 transition-all duration-150">
              <Package size={14} />
              Restock This Item
            </button>
            <button className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-secondary text-secondary-foreground rounded-xl hover:bg-muted active:scale-95 transition-all duration-150">
              <FileText size={14} />
              Export
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
