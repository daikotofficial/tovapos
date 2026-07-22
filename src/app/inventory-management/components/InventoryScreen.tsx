'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import InventoryKPICards from './InventoryKPICards';
import InventoryFilters from './InventoryFilters';
import InventoryTable from './InventoryTable';
import AddStockModal from './AddStockModal';
import BatchDetailDrawer from './BatchDetailDrawer';
import type { InventoryItem } from '@/lib/pos/types';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import {
  loadInventoryMetrics,
  loadInventoryPage,
  type InventoryMetrics,
} from '@/lib/pos/local-store';
import { getProductUsage } from '@/lib/pos/subscription';
import { useRowsPerPage } from '@/lib/pos/useRowsPerPage';

export default function InventoryScreen() {
  const searchParams = useSearchParams();
  const {
    stockMovements,
    isHydrated,
    upsertInventoryItem,
    pendingSyncCount,
    hasPermission,
    settings,
  } = usePosStore();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [metrics, setMetrics] = useState<InventoryMetrics | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [sortField, setSortField] = useState<keyof InventoryItem>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useRowsPerPage();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [drawerItem, setDrawerItem] = useState<InventoryItem | null>(null);
  const expiryAlertDays = Math.max(0, Number(settings.expiryAlertDays) || 30);
  const productUsage = getProductUsage(
    settings.subscriptionPlanId,
    metrics?.totalProducts ?? totalItems
  );

  useEffect(() => {
    const status = searchParams.get('status');
    if (status === 'alerts') setStatusFilter('alerts');
    if (status === 'expired') setStatusFilter('expired');
  }, [searchParams]);

  useEffect(() => {
    if (!isHydrated) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsLoadingPage(true);
      try {
        const [pageResult, metricResult] = await Promise.all([
          loadInventoryPage({
            q: search,
            category: categoryFilter,
            supplier: supplierFilter,
            status: statusFilter,
            offset: (page - 1) * perPage,
            limit: perPage,
            includeTotal: true,
            expiryAlertDays,
          }),
          loadInventoryMetrics(expiryAlertDays),
        ]);
        if (cancelled) return;
        setItems(pageResult.items);
        setTotalItems(pageResult.total ?? pageResult.items.length);
        setMetrics(metricResult);
        setSelectedIds(new Set());
      } catch (error) {
        if (!cancelled) console.error('Failed to load inventory page', error);
      } finally {
        if (!cancelled) setIsLoadingPage(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    categoryFilter,
    expiryAlertDays,
    isHydrated,
    page,
    perPage,
    search,
    statusFilter,
    supplierFilter,
  ]);

  const sorted = [...items].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const paginated = sorted;

  const handleSort = (field: keyof InventoryItem) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const applyKpiFilter = (filter: string) => {
    setStatusFilter(filter);
    setPage(1);
    if (filter === 'low-stock' || filter === 'out') {
      setSortField('currentQty');
      setSortDir('asc');
    }
    if (filter === 'expiring-soon') {
      setSortField('expiryDate');
      setSortDir('asc');
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginated.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(paginated.map((i) => i.id)));
  };

  const exportInventory = () => {
    const headers = [
      'Product',
      'Brand',
      'SKU',
      'Barcode',
      'Category',
      'Batch',
      'Qty',
      'Reorder',
      'Cost',
      'Price',
      'Expiry',
      'Supplier',
      'Status',
    ];
    const rows = items.map((item) => [
      item.name,
      item.genericName,
      item.sku,
      item.barcode ?? '',
      item.category,
      item.batchLot,
      item.currentQty.toString(),
      item.reorderLevel.toString(),
      item.unitCost.toFixed(2),
      item.sellingPrice.toFixed(2),
      item.expiryDate,
      item.supplier,
      item.stockStatus,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-3 py-4 sm:p-6">
      {!isHydrated && (
        <div className="mb-4 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Loading inventory...
        </div>
      )}

      {isLoadingPage && (
        <div className="mb-4 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Loading inventory page...
        </div>
      )}

      {pendingSyncCount > 0 && (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          {pendingSyncCount} update{pendingSyncCount === 1 ? '' : 's'} waiting to be sent. This will
          happen automatically when the service is available.
        </div>
      )}

      {productUsage.limit && productUsage.isNearLimit && (
        <div
          className={`mb-4 rounded-lg border px-4 py-3 text-sm font-medium ${
            productUsage.isAtLimit
              ? 'border-danger/30 bg-danger/10 text-danger'
              : 'border-warning/30 bg-warning/10 text-warning'
          }`}
        >
          {productUsage.plan.name} product usage is at {productUsage.percent}% (
          {productUsage.currentProducts.toLocaleString()} of {productUsage.limit.toLocaleString()}
          ).{' '}
          {productUsage.isAtLimit
            ? 'Upgrade to add more products.'
            : 'Upgrade before the limit is reached.'}
        </div>
      )}

      {/* KPI Cards */}
      <InventoryKPICards
        items={items}
        metrics={metrics}
        expiryAlertDays={expiryAlertDays}
        activeFilter={statusFilter}
        onFilter={applyKpiFilter}
      />

      {/* Filters + Actions */}
      <InventoryFilters
        search={search}
        setSearch={setSearch}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        supplierFilter={supplierFilter}
        setSupplierFilter={setSupplierFilter}
        items={items}
        onAddProduct={() => {
          if (!hasPermission('add-product')) return;
          setEditItem(null);
          setShowAddModal(true);
        }}
        onExport={exportInventory}
        selectedCount={selectedIds.size}
        onClearSelection={() => setSelectedIds(new Set())}
      />

      {/* Table */}
      <InventoryTable
        items={paginated}
        allItems={items}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onEdit={(item) => {
          if (!hasPermission('edit-product')) return;
          setEditItem(item);
          setShowAddModal(true);
        }}
        onViewBatch={(item) => setDrawerItem(item)}
        onAddProduct={() => {
          if (!hasPermission('add-product')) return;
          setEditItem(null);
          setShowAddModal(true);
        }}
        page={page}
        totalPages={totalPages}
        perPage={perPage}
        totalItems={totalItems}
        onPageChange={setPage}
        onPerPageChange={(v) => {
          setPerPage(v);
          setPage(1);
        }}
        expiryAlertDays={expiryAlertDays}
      />

      {/* Add / Edit Modal */}
      <AddStockModal
        open={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditItem(null);
        }}
        editItem={editItem}
        onSave={async (item) => {
          await upsertInventoryItem(item);
          const [pageResult, metricResult] = await Promise.all([
            loadInventoryPage({
              q: search,
              category: categoryFilter,
              supplier: supplierFilter,
              status: statusFilter,
              offset: (page - 1) * perPage,
              limit: perPage,
              includeTotal: true,
              expiryAlertDays,
            }),
            loadInventoryMetrics(expiryAlertDays),
          ]);
          setItems(pageResult.items);
          setTotalItems(pageResult.total ?? pageResult.items.length);
          setMetrics(metricResult);
          setShowAddModal(false);
          setEditItem(null);
        }}
      />

      {/* Batch Detail Drawer */}
      <BatchDetailDrawer
        item={drawerItem}
        movements={stockMovements}
        onClose={() => setDrawerItem(null)}
      />
    </div>
  );
}
