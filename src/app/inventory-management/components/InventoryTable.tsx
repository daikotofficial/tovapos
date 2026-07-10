'use client';

import React from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Edit2,
  Eye,
  AlertTriangle,
  ShieldAlert,
  FileText,
  Plus,
} from 'lucide-react';
import Badge from '@/components/ui/Badge';
import NiceSelect from '@/components/ui/NiceSelect';
import type { InventoryItem, StockStatus } from '@/lib/pos/types';
import { formatMoney } from '@/lib/pos/money';
import { getDaysUntilExpiry } from '@/lib/pos/stock';

interface InventoryTableProps {
  items: InventoryItem[];
  allItems: InventoryItem[];
  sortField: keyof InventoryItem;
  sortDir: 'asc' | 'desc';
  onSort: (field: keyof InventoryItem) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onEdit: (item: InventoryItem) => void;
  onViewBatch: (item: InventoryItem) => void;
  onAddProduct: () => void;
  page: number;
  totalPages: number;
  perPage: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPerPageChange: (v: number) => void;
  expiryAlertDays: number;
}

function SortIcon({
  field,
  sortField,
  sortDir,
}: {
  field: string;
  sortField: string;
  sortDir: 'asc' | 'desc';
}) {
  if (field !== sortField) return <ChevronsUpDown size={12} className="text-muted-foreground/50" />;
  return sortDir === 'asc' ? (
    <ChevronUp size={12} className="text-primary" />
  ) : (
    <ChevronDown size={12} className="text-primary" />
  );
}

function stockStatusVariant(
  status: StockStatus
): 'in-stock' | 'low' | 'critical' | 'out' | 'expiring-soon' | 'expired' {
  return status;
}

function expiryClass(expiryDate: string, expiryAlertDays: number): string {
  const days = getDaysUntilExpiry(expiryDate);
  if (days < 0) return 'text-danger font-semibold';
  if (days <= expiryAlertDays) return 'text-warning font-semibold';
  return 'text-foreground';
}

const columns: { key: keyof InventoryItem; label: string; sortable: boolean; width?: string }[] = [
  { key: 'name', label: 'Product / Brand', sortable: true },
  { key: 'sku', label: 'SKU', sortable: true, width: 'w-28' },
  { key: 'category', label: 'Category', sortable: true, width: 'w-32' },
  { key: 'batchLot', label: 'Batch / Lot', sortable: false, width: 'w-32' },
  { key: 'currentQty', label: 'Qty', sortable: true, width: 'w-20' },
  { key: 'reorderLevel', label: 'Reorder', sortable: true, width: 'w-20' },
  { key: 'unitCost', label: 'Cost', sortable: true, width: 'w-20' },
  { key: 'sellingPrice', label: 'Price', sortable: true, width: 'w-20' },
  { key: 'expiryDate', label: 'Expiry Date', sortable: true, width: 'w-28' },
  { key: 'stockStatus', label: 'Status', sortable: true, width: 'w-28' },
];

export default function InventoryTable({
  items,
  allItems: _allItems,
  sortField,
  sortDir,
  onSort,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onEdit,
  onViewBatch,
  onAddProduct,
  page,
  totalPages,
  perPage,
  totalItems,
  onPageChange,
  onPerPageChange,
  expiryAlertDays,
}: InventoryTableProps) {
  const pageNumbers = Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
    if (totalPages <= 7) return i + 1;
    if (page <= 4) return i + 1;
    if (page >= totalPages - 3) return totalPages - 6 + i;
    return page - 3 + i;
  });

  return (
    <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
      {/* Table */}
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[1100px]">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={items.length > 0 && selectedIds.size === items.length}
                  onChange={onToggleSelectAll}
                  className="rounded border-border accent-primary"
                />
              </th>
              {columns.map((col) => (
                <th
                  key={`th-${col.key}`}
                  className={`px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground ${col.width ?? ''} ${col.sortable ? 'cursor-pointer hover:text-foreground select-none' : ''}`}
                  onClick={() => col.sortable && onSort(col.key)}
                >
                  <div className="flex items-center gap-1.5">
                    {col.label}
                    {col.sortable && (
                      <SortIcon field={col.key} sortField={sortField as string} sortDir={sortDir} />
                    )}
                  </div>
                </th>
              ))}
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-24">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/5 flex items-center justify-center">
                      <FileText size={22} className="text-primary/40" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">No products found</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Add the first product, or adjust the current filters.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onAddProduct}
                      className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary/90"
                    >
                      <Plus size={13} />
                      Add Product
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((item, idx) => (
                <tr
                  key={item.id}
                  className={`group hover:bg-muted/30 transition-colors duration-100 ${idx % 2 === 0 ? '' : 'bg-muted/10'} ${selectedIds.has(item.id) ? 'bg-primary/5' : ''}`}
                >
                  <td className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => onToggleSelect(item.id)}
                      className="rounded border-border accent-primary"
                    />
                  </td>
                  {/* Name + Generic */}
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium text-foreground leading-tight">
                            {item.name}
                          </span>
                          {item.isControlled && (
                            <ShieldAlert
                              size={12}
                              className="text-danger shrink-0"
                              aria-label="Controlled substance"
                            />
                          )}
                          {item.requiresApproval && !item.isControlled && (
                            <Badge variant="approval" />
                          )}
                          {!item.requiresApproval && <Badge variant="standard" />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.genericName}</p>
                        {item.variantName && (
                          <p className="text-[10px] text-muted-foreground">{item.variantName}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground">{item.location}</p>
                      </div>
                    </div>
                  </td>
                  {/* SKU */}
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono text-muted-foreground">{item.sku}</span>
                    {item.barcode && (
                      <p className="text-[10px] font-mono text-muted-foreground/80">
                        {item.barcode}
                      </p>
                    )}
                  </td>
                  {/* Category */}
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium text-foreground">{item.category}</span>
                  </td>
                  {/* Batch/Lot */}
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono text-muted-foreground">{item.batchLot}</span>
                  </td>
                  {/* Qty */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-sm font-bold font-tabular ${
                          item.currentQty === 0
                            ? 'text-danger'
                            : item.currentQty <= item.reorderLevel
                              ? 'text-warning'
                              : 'text-foreground'
                        }`}
                      >
                        {item.currentQty}
                      </span>
                      {item.currentQty > 0 && item.currentQty <= item.reorderLevel && (
                        <AlertTriangle size={11} className="text-warning" />
                      )}
                    </div>
                    {/* Stock bar */}
                    <div className="w-16 h-1 bg-muted rounded-full mt-1 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          item.currentQty === 0
                            ? 'bg-danger'
                            : item.currentQty <= item.reorderLevel * 0.5
                              ? 'bg-danger'
                              : item.currentQty <= item.reorderLevel
                                ? 'bg-warning'
                                : 'bg-success'
                        }`}
                        style={{
                          width: `${Math.min(100, (item.currentQty / item.maxStock) * 100)}%`,
                        }}
                      />
                    </div>
                  </td>
                  {/* Reorder */}
                  <td className="px-4 py-3">
                    <span className="text-xs font-tabular text-muted-foreground">
                      {item.reorderLevel}
                    </span>
                  </td>
                  {/* Cost */}
                  <td className="px-4 py-3">
                    <span className="text-xs font-tabular text-muted-foreground">
                      {formatMoney(item.unitCost)}
                    </span>
                  </td>
                  {/* Price */}
                  <td className="px-4 py-3">
                    <span className="text-sm font-semibold font-tabular text-foreground">
                      {formatMoney(item.sellingPrice)}
                    </span>
                    {item.profitMargin !== undefined && (
                      <p className="text-[10px] text-success font-tabular">
                        {item.profitMargin.toFixed(1)}% margin
                      </p>
                    )}
                  </td>
                  {/* Expiry */}
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-tabular ${expiryClass(item.expiryDate, expiryAlertDays)}`}
                    >
                      {item.expiryDate}
                    </span>
                    {(() => {
                      const days = getDaysUntilExpiry(item.expiryDate);
                      if (days < 0)
                        return <p className="text-[10px] text-danger font-medium">EXPIRED</p>;
                      if (days <= expiryAlertDays)
                        return (
                          <p className="text-[10px] text-warning font-medium">{days}d remaining</p>
                        );
                      return null;
                    })()}
                  </td>
                  {/* Status */}
                  <td className="px-4 py-3">
                    <Badge variant={stockStatusVariant(item.stockStatus)} />
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      <div className="relative group/btn">
                        <button
                          onClick={() => onViewBatch(item)}
                          className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors duration-150"
                        >
                          <Eye size={14} />
                        </button>
                        <div className="absolute bottom-full right-0 mb-1 px-2 py-1 bg-foreground text-background text-[10px] font-medium rounded whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity duration-150 pointer-events-none z-10">
                          View batch details
                        </div>
                      </div>
                      <div className="relative group/btn">
                        <button
                          onClick={() => onEdit(item)}
                          className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors duration-150"
                        >
                          <Edit2 size={14} />
                        </button>
                        <div className="absolute bottom-full right-0 mb-1 px-2 py-1 bg-foreground text-background text-[10px] font-medium rounded whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity duration-150 pointer-events-none z-10">
                          Edit stock record
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Showing {totalItems === 0 ? 0 : Math.min((page - 1) * perPage + 1, totalItems)}-
            {Math.min(page * perPage, totalItems)} of {totalItems} products
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Per page:</span>
            <NiceSelect
              value={String(perPage)}
              onChange={(value) => onPerPageChange(parseInt(value, 10))}
              className="w-24"
              options={[10, 20, 50].map((value) => ({
                value: String(value),
                label: String(value),
              }))}
            />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(1)}
            disabled={page === 1}
            className="px-2 py-1.5 text-xs font-medium rounded-md hover:bg-muted text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-100"
          >
            «
          </button>
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            className="px-2 py-1.5 text-xs font-medium rounded-md hover:bg-muted text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-100"
          >
            ‹
          </button>
          {pageNumbers.map((n) => (
            <button
              key={`page-${n}`}
              onClick={() => onPageChange(n)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors duration-100 ${
                n === page ? 'bg-primary text-white' : 'hover:bg-muted text-muted-foreground'
              }`}
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="px-2 py-1.5 text-xs font-medium rounded-md hover:bg-muted text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-100"
          >
            ›
          </button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={page >= totalPages}
            className="px-2 py-1.5 text-xs font-medium rounded-md hover:bg-muted text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-100"
          >
            »
          </button>
        </div>
      </div>
    </div>
  );
}
