'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Banknote,
  Boxes,
  CircleDollarSign,
  PackageCheck,
  Receipt,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import { formatMoney } from '@/lib/pos/money';
import {
  loadInventoryMetrics,
  loadSalesMetrics,
  type InventoryMetrics,
  type SalesMetrics,
} from '@/lib/pos/local-store';
import { usePosStore } from '@/lib/pos/PosStoreProvider';

function dayKey(value: string): string {
  return value.slice(0, 10);
}

function monthKey(value: string): string {
  return value.slice(0, 7);
}

function saleProfit(sale: {
  items: { unitPrice: number; unitCost: number; discount: number; quantity: number }[];
}): number {
  return sale.items.reduce(
    (sum, item) =>
      sum + (item.unitPrice * (1 - item.discount / 100) - item.unitCost) * item.quantity,
    0
  );
}

export default function DashboardPage() {
  const { sales, expenses, inventory, settings, pendingSyncCount } = usePosStore();
  const [salesMetrics, setSalesMetrics] = useState<SalesMetrics | null>(null);
  const [inventoryMetrics, setInventoryMetrics] = useState<InventoryMetrics | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadMetrics() {
      try {
        const [nextSalesMetrics, nextInventoryMetrics] = await Promise.all([
          loadSalesMetrics(),
          loadInventoryMetrics(Number(settings.expiryAlertDays) || 30),
        ]);
        if (cancelled) return;
        setSalesMetrics(nextSalesMetrics);
        setInventoryMetrics(nextInventoryMetrics);
      } catch (error) {
        if (!cancelled) console.error('Failed to load dashboard metrics', error);
      }
    }
    void loadMetrics();
    return () => {
      cancelled = true;
    };
  }, [settings.expiryAlertDays]);

  const data = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const month = new Date().toISOString().slice(0, 7);
    const completedSales = sales.filter((sale) => sale.status === 'completed');
    const recordedExpenses = expenses.filter((expense) => expense.status === 'recorded');
    const todaySales = completedSales.filter((sale) => dayKey(sale.timestamp) === today);
    const monthSales = completedSales.filter((sale) => monthKey(sale.timestamp) === month);
    const monthExpenses = recordedExpenses.filter(
      (expense) => monthKey(expense.incurredAt) === month
    );

    const revenue = completedSales.reduce((sum, sale) => sum + sale.grandTotal, 0);
    const todayRevenue = todaySales.reduce((sum, sale) => sum + sale.grandTotal, 0);
    const monthRevenue = monthSales.reduce((sum, sale) => sum + sale.grandTotal, 0);
    const grossProfit = completedSales.reduce((sum, sale) => sum + saleProfit(sale), 0);
    const todayProfit = todaySales.reduce((sum, sale) => sum + saleProfit(sale), 0);
    const monthProfit = monthSales.reduce((sum, sale) => sum + saleProfit(sale), 0);
    const expenseTotal = recordedExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const monthExpenseTotal = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const stockValue = inventory.reduce((sum, item) => sum + item.currentQty * item.unitCost, 0);
    const retailStockValue = inventory.reduce(
      (sum, item) => sum + item.currentQty * item.sellingPrice,
      0
    );
    const potentialMargin = retailStockValue - stockValue;
    const stockAlerts = inventory.filter((item) =>
      ['low', 'critical', 'out', 'expired'].includes(item.stockStatus)
    );
    const expiredItems = inventory.filter((item) => item.stockStatus === 'expired');
    const cashSales = completedSales
      .filter((sale) => sale.paymentMethod === 'cash')
      .reduce((sum, sale) => sum + sale.grandTotal, 0);
    const nonCashSales = revenue - cashSales;

    const productMap = new Map<
      string,
      { name: string; qty: number; revenue: number; profit: number }
    >();
    completedSales.forEach((sale) => {
      sale.items.forEach((item) => {
        const current = productMap.get(item.inventoryItemId) ?? {
          name: item.name,
          qty: 0,
          revenue: 0,
          profit: 0,
        };
        const lineRevenue = item.unitPrice * item.quantity * (1 - item.discount / 100);
        current.qty += item.quantity;
        current.revenue += lineRevenue;
        current.profit +=
          (item.unitPrice * (1 - item.discount / 100) - item.unitCost) * item.quantity;
        productMap.set(item.inventoryItemId, current);
      });
    });

    const topProducts = [...productMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    const expenseCategories = recordedExpenses.reduce((acc, expense) => {
      acc.set(expense.category, (acc.get(expense.category) ?? 0) + expense.amount);
      return acc;
    }, new Map<string, number>());

    const metricRevenue = salesMetrics?.revenue ?? revenue;
    const metricGrossProfit = salesMetrics?.grossProfit ?? grossProfit;
    const metricExpenseTotal = salesMetrics?.expenses ?? expenseTotal;
    const metricStockValue = inventoryMetrics?.totalValue ?? stockValue;
    const metricPotentialMargin = inventoryMetrics?.potentialProfit ?? potentialMargin;
    const metricTopProducts = salesMetrics?.topProducts ?? topProducts;
    const metricExpenseCategories =
      salesMetrics?.expenseCategories ??
      [...expenseCategories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    return {
      completedSales,
      recordedExpenses,
      todaySales,
      revenue: metricRevenue,
      todayRevenue,
      monthRevenue,
      grossProfit: metricGrossProfit,
      todayProfit,
      monthProfit,
      expenseTotal: metricExpenseTotal,
      monthExpenseTotal,
      netProfit: metricGrossProfit - metricExpenseTotal,
      monthNetProfit: monthProfit - monthExpenseTotal,
      stockValue: metricStockValue,
      retailStockValue,
      potentialMargin: metricPotentialMargin,
      stockAlerts,
      expiredItems,
      cashSales: salesMetrics?.cashSales ?? cashSales,
      nonCashSales: salesMetrics?.nonCashSales ?? nonCashSales,
      vatCollected:
        salesMetrics?.vatCollected ??
        completedSales
          .filter((sale) => sale.paymentMethod !== 'credit')
          .reduce((sum, sale) => sum + Number(sale.taxAmount || 0), 0),
      topProducts: metricTopProducts,
      expenseCategories: metricExpenseCategories,
      totalProducts: inventoryMetrics?.totalProducts ?? inventory.length,
    };
  }, [expenses, inventory, inventoryMetrics, sales, salesMetrics]);

  const kpis = [
    {
      label: 'Today Sales',
      value: formatMoney(data.todayRevenue, settings.currency),
      helper: `${data.todaySales.length} transaction${data.todaySales.length === 1 ? '' : 's'} today`,
      icon: Receipt,
      tone: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: 'Net Profit',
      value: formatMoney(data.netProfit, settings.currency),
      helper: `${formatMoney(data.monthNetProfit, settings.currency)} this month`,
      icon: CircleDollarSign,
      tone: data.netProfit >= 0 ? 'text-success' : 'text-danger',
      bg: data.netProfit >= 0 ? 'bg-success/10' : 'bg-danger/10',
    },
    {
      label: 'Expenses',
      value: formatMoney(data.expenseTotal, settings.currency),
      helper: `${formatMoney(data.monthExpenseTotal, settings.currency)} this month`,
      icon: TrendingDown,
      tone: 'text-danger',
      bg: 'bg-danger/10',
    },
    {
      label: 'VAT Collected',
      value: formatMoney(data.vatCollected, settings.currency),
      helper: 'Paid sales only',
      icon: Receipt,
      tone: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: 'Total Stock Value',
      value: formatMoney(data.stockValue, settings.currency),
      helper: `${data.stockAlerts.length} item${data.stockAlerts.length === 1 ? '' : 's'} need attention`,
      icon: Boxes,
      tone: 'text-foreground',
      bg: 'bg-muted',
    },
  ];

  return (
    <AppLayout title="Dashboard" subtitle="Business summary">
      <PermissionGate permission="dashboard">
        <div className="mx-auto w-full max-w-screen-2xl space-y-4 px-3 py-4 sm:space-y-5 sm:p-6">
          <section className="overflow-hidden rounded-lg border border-border bg-[#071412] text-white shadow-card sm:rounded-xl">
            <div className="grid min-w-0 gap-4 p-4 lg:grid-cols-[1fr_420px] lg:p-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-[#19b8a6]/20 px-3 py-1 text-xs font-bold uppercase text-[#8ee8df]">
                    Summary
                  </span>
                  <span className="rounded-md bg-white/10 px-3 py-1 text-xs font-semibold text-white/70">
                    {pendingSyncCount} pending sync
                  </span>
                </div>
                <div className="mt-4 grid min-w-0 gap-3 sm:mt-5 sm:grid-cols-3">
                  <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.06] p-3">
                    <p className="text-[11px] font-bold uppercase text-white/50">Month Revenue</p>
                    <p className="mt-1 break-words text-lg font-bold font-tabular sm:text-xl">
                      {formatMoney(data.monthRevenue, settings.currency)}
                    </p>
                  </div>
                  <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.06] p-3">
                    <p className="text-[11px] font-bold uppercase text-white/50">Gross Profit</p>
                    <p className="mt-1 break-words text-lg font-bold font-tabular sm:text-xl">
                      {formatMoney(data.grossProfit, settings.currency)}
                    </p>
                  </div>
                  <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.06] p-3">
                    <p className="text-[11px] font-bold uppercase text-white/50">
                      Potential Stock Profit
                    </p>
                    <p className="mt-1 break-words text-lg font-bold font-tabular sm:text-xl">
                      {formatMoney(data.potentialMargin, settings.currency)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.06] p-4">
                <p className="text-sm font-bold">Cash position</p>
                <div className="mt-4 space-y-3">
                  {[
                    ['Cash sales', data.cashSales, 'bg-success'],
                    ['Card / mobile', data.nonCashSales, 'bg-primary'],
                    ['Recorded expenses', data.expenseTotal, 'bg-danger'],
                  ].map(([label, amount, color]) => {
                    const value = Number(amount);
                    const max = Math.max(data.revenue, data.expenseTotal, 1);
                    return (
                      <div key={String(label)}>
                        <div className="mb-1 flex min-w-0 justify-between gap-3 text-xs">
                          <span className="min-w-0 text-white/65">{label}</span>
                          <span className="shrink-0 font-semibold font-tabular">
                            {formatMoney(value, settings.currency)}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/10">
                          <div
                            className={`h-full rounded-full ${color}`}
                            style={{ width: `${Math.max(4, (value / max) * 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {kpis.map((item) => {
              const Icon = item.icon;
              return (
                <article
                  key={item.label}
                  className="min-w-0 rounded-lg border border-border bg-white p-4 shadow-card sm:rounded-xl"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase text-muted-foreground">
                        {item.label}
                      </p>
                      <p
                        className={`mt-2 break-words text-[1.65rem] font-bold leading-tight font-tabular sm:text-2xl ${item.tone}`}
                      >
                        {item.value}
                      </p>
                    </div>
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-md ${item.bg} ${item.tone}`}
                    >
                      <Icon size={18} />
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">{item.helper}</p>
                </article>
              );
            })}
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-[1fr_360px]">
            <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-white shadow-card sm:rounded-xl">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <p className="text-sm font-bold">Product performance</p>
                  <p className="text-xs text-muted-foreground">Top sellers by revenue and margin</p>
                </div>
                <TrendingUp size={18} className="text-primary" />
              </div>
              <div className="overflow-x-auto overscroll-x-contain scrollbar-thin">
                <table className="w-full min-w-[760px]">
                  <thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3">Units</th>
                      <th className="px-4 py-3">Revenue</th>
                      <th className="px-4 py-3">Profit</th>
                      <th className="px-4 py-3">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.topProducts.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-10 text-center text-sm text-muted-foreground"
                        >
                          No product sales yet.
                        </td>
                      </tr>
                    ) : (
                      data.topProducts.map((product) => (
                        <tr key={product.name}>
                          <td className="px-4 py-3 font-medium">{product.name}</td>
                          <td className="px-4 py-3 font-tabular">{product.qty}</td>
                          <td className="px-4 py-3 font-tabular">
                            {formatMoney(product.revenue, settings.currency)}
                          </td>
                          <td className="px-4 py-3 font-tabular text-success">
                            {formatMoney(product.profit, settings.currency)}
                          </td>
                          <td className="px-4 py-3 font-tabular">
                            {product.revenue > 0
                              ? `${Math.round((product.profit / product.revenue) * 100)}%`
                              : '0%'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="min-w-0 space-y-4 sm:space-y-5">
              <div className="min-w-0 rounded-lg border border-border bg-white p-4 shadow-card sm:rounded-xl">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold">Stock risk</p>
                  <AlertTriangle size={18} className="text-warning" />
                </div>
                <div className="mt-4 grid min-w-0 grid-cols-3 gap-2">
                  <div className="rounded-md bg-warning/10 p-3 text-warning">
                    <p className="text-[10px] font-bold uppercase">Alerts</p>
                    <p className="mt-1 text-2xl font-bold font-tabular">
                      {data.stockAlerts.length}
                    </p>
                  </div>
                  <div className="rounded-md bg-danger/10 p-3 text-danger">
                    <p className="text-[10px] font-bold uppercase">Expired</p>
                    <p className="mt-1 text-2xl font-bold font-tabular">
                      {data.expiredItems.length}
                    </p>
                  </div>
                  <div className="rounded-md bg-success/10 p-3 text-success">
                    <p className="text-[10px] font-bold uppercase">SKUs</p>
                    <p className="mt-1 text-2xl font-bold font-tabular">{data.totalProducts}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Link
                    href="/inventory-management?status=alerts"
                    className="rounded-md border border-border px-3 py-2 text-center text-xs font-semibold text-warning hover:bg-warning/10"
                  >
                    View stock alerts
                  </Link>
                  <Link
                    href="/inventory-management?status=expired"
                    className="rounded-md border border-border px-3 py-2 text-center text-xs font-semibold text-danger hover:bg-danger/10"
                  >
                    View expired
                  </Link>
                </div>
                <div className="mt-4 divide-y divide-border">
                  {data.stockAlerts.slice(0, 5).map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.sku} · {item.stockStatus}
                        </p>
                      </div>
                      <p className="font-bold font-tabular">{item.currentQty}</p>
                    </div>
                  ))}
                  {data.stockAlerts.length === 0 && (
                    <p className="py-5 text-center text-sm text-muted-foreground">
                      No active stock alerts.
                    </p>
                  )}
                </div>
              </div>

              <div className="min-w-0 rounded-lg border border-border bg-white p-4 shadow-card sm:rounded-xl">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold">Expense pressure</p>
                  <Banknote size={18} className="text-danger" />
                </div>
                <div className="mt-4 space-y-3">
                  {data.expenseCategories.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      No expenses recorded yet.
                    </p>
                  ) : (
                    data.expenseCategories.map(([category, amount]) => (
                      <div key={category}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span>{category}</span>
                          <span className="font-semibold font-tabular">
                            {formatMoney(amount, settings.currency)}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-danger"
                            style={{
                              width: `${Math.max(5, (amount / Math.max(data.expenseTotal, 1)) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-3">
            {[
              {
                label: 'Operational health',
                icon: ShieldCheck,
                lines: [
                  `${data.completedSales.length} completed sale${data.completedSales.length === 1 ? '' : 's'}`,
                  `${data.recordedExpenses.length} recorded expense${data.recordedExpenses.length === 1 ? '' : 's'}`,
                  `${pendingSyncCount} update${pendingSyncCount === 1 ? '' : 's'} waiting to be sent`,
                ],
              },
              {
                label: 'Inventory posture',
                icon: PackageCheck,
                lines: [
                  `${formatMoney(data.retailStockValue, settings.currency)} retail value`,
                  `${formatMoney(data.stockValue, settings.currency)} cost value`,
                  `${formatMoney(data.potentialMargin, settings.currency)} potential gross margin`,
                ],
              },
              {
                label: 'Profit bridge',
                icon: TrendingUp,
                lines: [
                  `${formatMoney(data.revenue, settings.currency)} revenue`,
                  `${formatMoney(data.grossProfit, settings.currency)} gross profit`,
                  `${formatMoney(data.netProfit, settings.currency)} after expenses`,
                ],
              },
            ].map((panel) => {
              const Icon = panel.icon;
              return (
                <article
                  key={panel.label}
                  className="min-w-0 rounded-lg border border-border bg-white p-4 shadow-card sm:rounded-xl"
                >
                  <div className="flex items-center gap-2">
                    <Icon size={18} className="text-primary" />
                    <p className="text-sm font-bold">{panel.label}</p>
                  </div>
                  <div className="mt-3 space-y-2">
                    {panel.lines.map((line) => (
                      <div
                        key={line}
                        className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
                      >
                        {line}
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </section>
        </div>
      </PermissionGate>
    </AppLayout>
  );
}
