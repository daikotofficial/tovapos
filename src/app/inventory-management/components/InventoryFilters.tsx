'use client';

import React from 'react';
import { Search, Plus, Trash2, Download, Filter } from 'lucide-react';
import NiceSelect from '@/components/ui/NiceSelect';
import type { InventoryItem } from '@/lib/pos/types';
import { usePosStore } from '@/lib/pos/PosStoreProvider';

interface InventoryFiltersProps {
  search: string;
  setSearch: (v: string) => void;
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  supplierFilter: string;
  setSupplierFilter: (v: string) => void;
  items: InventoryItem[];
  onAddProduct: () => void;
  onExport: () => void;
  selectedCount: number;
  onClearSelection: () => void;
}

const statuses = [
  'alerts',
  'in-stock',
  'low-stock',
  'low',
  'critical',
  'out',
  'expiring-soon',
  'expired',
];
const statusLabels: Record<string, string> = {
  alerts: 'All Alerts',
  'in-stock': 'In Stock',
  'low-stock': 'Low + Critical',
  low: 'Low Stock',
  critical: 'Critical',
  out: 'Out of Stock',
  'expiring-soon': 'Expiring Soon',
  expired: 'Expired',
};

export default function InventoryFilters({
  search,
  setSearch,
  categoryFilter,
  setCategoryFilter,
  statusFilter,
  setStatusFilter,
  supplierFilter,
  setSupplierFilter,
  items,
  onAddProduct,
  onExport,
  selectedCount,
  onClearSelection,
}: InventoryFiltersProps) {
  const { settings } = usePosStore();
  const suppliers = Array.from(new Set(items.map((i) => i.supplier)));
  const categories = settings.productCategories ?? [];

  return (
    <div className="mb-4 rounded-lg border border-border bg-card shadow-card sm:rounded-xl">
      <div className="flex flex-col gap-3 border-b border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Filter size={15} className="text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Filters</span>
          {(search ||
            categoryFilter !== 'all' ||
            statusFilter !== 'all' ||
            supplierFilter !== 'all') && (
            <button
              onClick={() => {
                setSearch('');
                setCategoryFilter('all');
                setStatusFilter('all');
                setSupplierFilter('all');
              }}
              className="text-xs text-primary font-medium hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          {selectedCount > 0 && (
            <>
              <span className="col-span-2 text-xs text-muted-foreground sm:col-span-1">
                {selectedCount} selected
              </span>
              <button
                onClick={onClearSelection}
                className="flex min-h-9 items-center justify-center gap-1 rounded-lg bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger transition-colors duration-150 hover:bg-danger/20"
              >
                <Trash2 size={11} />
                Delete Selected
              </button>
            </>
          )}
          <button
            onClick={onExport}
            className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors duration-150 hover:bg-muted"
          >
            <Download size={12} />
            Export CSV
          </button>
          <button
            onClick={onAddProduct}
            className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-all duration-150 hover:bg-primary/90 active:scale-95"
          >
            <Plus size={12} />
            Add Product
          </button>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-2 px-3 py-3 sm:grid-cols-2 sm:gap-3 sm:px-4 lg:grid-cols-[minmax(18rem,1fr)_auto_auto_auto]">
        {/* Search */}
        <div className="relative min-w-0">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by product name, SKU, barcode, brand, or batch..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
          />
        </div>

        {/* Category */}
        <NiceSelect
          value={categoryFilter}
          onChange={setCategoryFilter}
          className="w-full lg:min-w-36"
          options={[
            { value: 'all', label: 'All Categories' },
            ...categories.map((category) => ({ value: category, label: category })),
          ]}
        />

        {/* Status */}
        <NiceSelect
          value={statusFilter}
          onChange={setStatusFilter}
          className="w-full lg:min-w-40"
          options={[
            { value: 'all', label: 'All Statuses' },
            ...statuses.map((status) => ({ value: status, label: statusLabels[status] })),
          ]}
        />

        {/* Supplier */}
        <NiceSelect
          value={supplierFilter}
          onChange={setSupplierFilter}
          className="w-full lg:min-w-40"
          options={[
            { value: 'all', label: 'All Suppliers' },
            ...suppliers.map((supplier) => ({ value: supplier, label: supplier })),
          ]}
        />
      </div>
    </div>
  );
}
