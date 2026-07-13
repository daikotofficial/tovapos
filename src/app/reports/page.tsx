'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  BarChart3,
  Boxes,
  Calendar,
  CircleDollarSign,
  Download,
  FileText,
  History,
  Package,
  Receipt,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import DatePicker from '@/components/ui/DatePicker';
import NiceSelect from '@/components/ui/NiceSelect';
import { formatMoney } from '@/lib/pos/money';
import {
  loadInventoryMetrics,
  loadReportRows,
  loadSalesMetrics,
  type InventoryMetrics,
  type SalesMetrics,
} from '@/lib/pos/local-store';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import type { Permission, SaleTransaction } from '@/lib/pos/types';

type ReportView = string;

type ReportPreset = 'today' | '7d' | '1m' | '2m' | 'custom' | 'all';

interface ReportRange {
  from: string;
  to: string;
  preset: ReportPreset;
}

const rangePresets: { id: ReportPreset; label: string; days?: number }[] = [
  { id: 'today', label: 'Today', days: 0 },
  { id: '7d', label: '7 Days', days: 6 },
  { id: '1m', label: '1 Month', days: 30 },
  { id: '2m', label: '2 Months', days: 60 },
  { id: 'all', label: 'All Time' },
];

const reports: { id: ReportView; label: string; description: string; icon: React.ElementType }[] = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'Business summary and operating signals',
    icon: FileText,
  },
  {
    id: 'sales',
    label: 'Sales',
    description: 'Daily, weekly, monthly, custom date, receipts, and transactions',
    icon: Receipt,
  },
  {
    id: 'sales-by-cashier',
    label: 'Sales by Cashier',
    description: 'Cashier performance and closing support',
    icon: Users,
  },
  {
    id: 'sales-by-product',
    label: 'Sales by Product',
    description: 'Units, revenue, product velocity, and top sellers',
    icon: Package,
  },
  {
    id: 'sales-by-category',
    label: 'Sales by Category',
    description: 'Category revenue and product mix',
    icon: Boxes,
  },
  {
    id: 'payment-methods',
    label: 'Payment Methods',
    description: 'Cash, card, transfer, mobile, split, and credit totals',
    icon: Receipt,
  },
  {
    id: 'credit-sales',
    label: 'Credit Sales',
    description: 'Unpaid customer credit and receivables',
    icon: Users,
  },
  {
    id: 'profit',
    label: 'Profit',
    description: 'Revenue, cost of goods, expenses, and net profit',
    icon: CircleDollarSign,
  },
  {
    id: 'expenses',
    label: 'Expenses',
    description: 'Expense ledger and category pressure',
    icon: TrendingDown,
  },
  {
    id: 'inventory',
    label: 'Inventory',
    description: 'Valuation, stock value, alerts, expiry, and reorder risk',
    icon: Boxes,
  },
  {
    id: 'low-stock',
    label: 'Low Stock',
    description: 'Products at or below reorder level',
    icon: Boxes,
  },
  {
    id: 'expiring',
    label: 'Expiring Products',
    description: 'Batches nearing expiry',
    icon: Calendar,
  },
  {
    id: 'expired',
    label: 'Expired Products',
    description: 'Expired stock requiring action',
    icon: Calendar,
  },
  {
    id: 'stock-ledger',
    label: 'Stock Ledger',
    description: 'Auditable item movements from sales and adjustments',
    icon: History,
  },
  {
    id: 'customers',
    label: 'Customers',
    description: 'Customer value, loyalty, and credit exposure',
    icon: Users,
  },
  {
    id: 'suppliers',
    label: 'Suppliers',
    description: 'Supplier records and purchase relationships',
    icon: Users,
  },
  {
    id: 'vat',
    label: 'VAT / Tax',
    description: 'VAT collected, taxable sales, and tax settings',
    icon: FileText,
  },
  {
    id: 'discounts',
    label: 'Discounts',
    description: 'Discount usage and value given',
    icon: TrendingDown,
  },
  {
    id: 'refunds',
    label: 'Refunds',
    description: 'Returned sales and stock restoration',
    icon: History,
  },
  {
    id: 'voided',
    label: 'Voided Sales',
    description: 'Voided transactions and audit trail',
    icon: History,
  },
  {
    id: 'cashier-closing',
    label: 'Cashier Closing',
    description: 'End-of-shift tender and sales summary',
    icon: FileText,
  },
  {
    id: 'end-of-day',
    label: 'End of Day',
    description: 'Daily sales, expenses, profit, and sync summary',
    icon: FileText,
  },
  {
    id: 'audit',
    label: 'Audit Trail',
    description: 'Important local actions and pending sync events',
    icon: History,
  },
];

function profitForSale(sale: {
  items: { unitPrice: number; unitCost: number; discount: number; quantity: number }[];
}): number {
  return sale.items.reduce(
    (sum, item) =>
      sum + (item.unitPrice * (1 - item.discount / 100) - item.unitCost) * item.quantity,
    0
  );
}

function isCreditSale(sale: Pick<SaleTransaction, 'paymentMethod' | 'amountDue'>): boolean {
  return sale.paymentMethod === 'credit' || Number(sale.amountDue ?? 0) > 0;
}

function salePaymentStatus(sale: SaleTransaction): string {
  if (isCreditSale(sale)) return Number(sale.amountDue ?? sale.grandTotal) > 0 ? 'Unpaid' : 'Paid';
  return sale.paymentStatus === 'partial' ? 'Partial' : 'Paid';
}

function paymentMethodLabel(method: string): string {
  if (method === 'credit') return 'Customer Credit';
  return method.replace('-', ' ');
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function createRange(preset: ReportPreset): ReportRange {
  const today = new Date();
  const to = toDateInputValue(today);
  if (preset === 'all') return { from: '', to, preset };
  const config = rangePresets.find((item) => item.id === preset);
  const days = config?.days ?? 30;
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - days);
  return { from: toDateInputValue(fromDate), to, preset };
}

function isWithinRange(value: string, range: ReportRange): boolean {
  if (range.preset === 'all') return true;
  const dateKey = value.slice(0, 10);
  return (!range.from || dateKey >= range.from) && (!range.to || dateKey <= range.to);
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pdfEscape(value: string): string {
  return value
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function downloadTextFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function truncatePdfText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  if (maxChars <= 3) return value.slice(0, maxChars);
  return `${value.slice(0, maxChars - 3)}...`;
}

function pdfText(
  value: string,
  x: number,
  y: number,
  font = 'F1',
  size = 8,
  color = '0.07 0.12 0.11'
): string {
  return [
    'BT',
    `${color} rg`,
    `/${font} ${size} Tf`,
    `${x.toFixed(2)} ${y.toFixed(2)} Td`,
    `(${pdfEscape(value)}) Tj`,
    'ET',
  ].join('\n');
}

function downloadPdfFile({
  filename,
  businessName,
  title,
  rangeLabel,
  generatedAt,
  headers,
  rows,
}: {
  filename: string;
  businessName: string;
  title: string;
  rangeLabel: string;
  generatedAt: string;
  headers: string[];
  rows: string[][];
}): void {
  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 28;
  const tableWidth = pageWidth - margin * 2;
  const rowHeight = 20;
  const tableTop = 438;
  const footerY = 24;
  const fontSize = headers.length > 11 ? 5.8 : headers.length > 8 ? 6.6 : 7.5;
  const colWidth = tableWidth / Math.max(1, headers.length);
  const maxChars = Math.max(5, Math.floor((colWidth - 8) / (fontSize * 0.48)));
  const rowsPerPage = Math.max(1, Math.floor((tableTop - 54) / rowHeight) - 1);
  const rowPages = Array.from(
    { length: Math.max(1, Math.ceil(rows.length / rowsPerPage)) },
    (_, index) => rows.slice(index * rowsPerPage, (index + 1) * rowsPerPage)
  );
  const objects: string[] = [];
  const addObject = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const boldFontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pageIds: number[] = [];
  const contentIds: number[] = [];

  rowPages.forEach((pageRows, pageIndex) => {
    const commands: string[] = [
      '0.99 1 0.99 rg',
      `0 0 ${pageWidth} ${pageHeight} re f`,
      pdfText(businessName || 'TOVAPOS', margin, 558, 'F2', 17, '0.02 0.08 0.07'),
      pdfText(title, margin, 535, 'F2', 12, '0.05 0.24 0.21'),
      pdfText(`Range: ${rangeLabel}`, margin, 516, 'F1', 8, '0.28 0.35 0.33'),
      pdfText(`Generated: ${generatedAt}`, margin + 210, 516, 'F1', 8, '0.28 0.35 0.33'),
      pdfText(
        `Page ${pageIndex + 1} of ${rowPages.length}`,
        pageWidth - margin - 72,
        footerY,
        'F1',
        7,
        '0.38 0.45 0.43'
      ),
      pdfText('Powered by DAIKOT', margin, footerY, 'F2', 7, '0.05 0.58 0.52'),
    ];

    const drawCell = (
      value: string,
      colIndex: number,
      y: number,
      fill: string,
      isHeader = false
    ) => {
      const x = margin + colIndex * colWidth;
      commands.push(fill);
      commands.push(
        `${x.toFixed(2)} ${(y - rowHeight).toFixed(2)} ${colWidth.toFixed(2)} ${rowHeight} re f`
      );
      commands.push('0.78 0.86 0.83 RG');
      commands.push(
        `${x.toFixed(2)} ${(y - rowHeight).toFixed(2)} ${colWidth.toFixed(2)} ${rowHeight} re S`
      );
      commands.push(
        pdfText(
          truncatePdfText(String(value), maxChars),
          x + 4,
          y - 13,
          isHeader ? 'F2' : 'F1',
          fontSize,
          isHeader ? '1 1 1' : '0.07 0.12 0.11'
        )
      );
    };

    headers.forEach((header, colIndex) =>
      drawCell(header, colIndex, tableTop, '0.05 0.58 0.52 rg', true)
    );
    pageRows.forEach((row, rowIndex) => {
      const y = tableTop - rowHeight * (rowIndex + 1);
      headers.forEach((_, colIndex) =>
        drawCell(
          row[colIndex] ?? '',
          colIndex,
          y,
          rowIndex % 2 === 0 ? '1 1 1 rg' : '0.96 0.98 0.97 rg'
        )
      );
    });

    if (rows.length === 0) {
      commands.push('1 1 1 rg');
      commands.push(`${margin} ${tableTop - rowHeight * 3} ${tableWidth} ${rowHeight * 2} re f`);
      commands.push('0.78 0.86 0.83 RG');
      commands.push(`${margin} ${tableTop - rowHeight * 3} ${tableWidth} ${rowHeight * 2} re S`);
      commands.push(pdfText('No records for this report.', margin + 10, tableTop - 50, 'F1', 9));
    }

    const text = commands.join('\n');
    const contentId = addObject(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
    contentIds.push(contentId);
    pageIds.push(0);
  });

  const pagesId = objects.length + rowPages.length + 1;
  contentIds.forEach((contentId, index) => {
    pageIds[index] = addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
  });

  const finalPagesId = addObject(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`
  );
  const catalogId = addObject(`<< /Type /Catalog /Pages ${finalPagesId} 0 R >>`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  downloadTextFile(filename, pdf, 'application/pdf');
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<ReportsShellFallback />}>
      <ReportsContent />
    </Suspense>
  );
}

function ReportsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const {
    sales,
    expenses,
    inventory,
    stockMovements,
    customers,
    vendors,
    syncQueue,
    settings,
    hasPermission,
  } = usePosStore();
  const requestedView = searchParams.get('view') as ReportView | null;
  const requiredPermission: Partial<Record<ReportView, Permission>> = {
    'credit-sales': 'credit-sales',
    profit: 'view-profit',
    expenses: 'expenses',
    suppliers: 'vendors',
    refunds: 'refunds',
  };
  const requestedPermission = requestedView ? requiredPermission[requestedView] : undefined;
  const activeView: ReportView =
    reports.some((report) => report.id === requestedView) &&
    (!requestedPermission || hasPermission(requestedPermission))
      ? requestedView!
      : 'overview';
  const [range, setRange] = useState<ReportRange>(() => createRange('1m'));
  const [salesMetrics, setSalesMetrics] = useState<SalesMetrics | null>(null);
  const [inventoryMetrics, setInventoryMetrics] = useState<InventoryMetrics | null>(null);
  const [serverReportRows, setServerReportRows] = useState<Record<string, unknown[]>>({});

  useEffect(() => {
    let cancelled = false;
    async function loadServerMetrics() {
      try {
        const [nextSalesMetrics, nextInventoryMetrics] = await Promise.all([
          loadSalesMetrics({
            from: range.preset === 'all' ? undefined : range.from,
            to: range.preset === 'all' ? undefined : range.to,
          }),
          loadInventoryMetrics(Number(settings.expiryAlertDays) || 30),
        ]);
        if (cancelled) return;
        setSalesMetrics(nextSalesMetrics);
        setInventoryMetrics(nextInventoryMetrics);
      } catch (error) {
        if (!cancelled) console.error('Failed to load report metrics', error);
      }
    }
    void loadServerMetrics();
    return () => {
      cancelled = true;
    };
  }, [range.from, range.preset, range.to, settings.expiryAlertDays]);

  useEffect(() => {
    let cancelled = false;
    async function loadRows() {
      const from = range.preset === 'all' ? undefined : range.from;
      const to = range.preset === 'all' ? undefined : range.to;
      try {
        const rowReports = [
          'sales',
          'credit-sales',
          'expenses',
          'sales-by-product',
          'sales-by-category',
          'payment-methods',
          'refunds',
          'voided',
        ];
        const results = await Promise.all(
          rowReports.map(async (report) => [
            report,
            (
              await loadReportRows({
                report,
                from,
                to,
                limit: 100,
              })
            ).rows,
          ])
        );
        if (!cancelled) setServerReportRows(Object.fromEntries(results));
      } catch (error) {
        if (!cancelled) console.error('Failed to load server report rows', error);
      }
    }
    void loadRows();
    return () => {
      cancelled = true;
    };
  }, [range.from, range.preset, range.to]);

  const data = useMemo(() => {
    const completedSales = sales.filter(
      (sale) => sale.status === 'completed' && isWithinRange(sale.timestamp, range)
    );
    const paidSales = completedSales.filter((sale) => !isCreditSale(sale));
    const creditSales = completedSales.filter(isCreditSale);
    const creditPaymentRows = sales
      .filter((sale) => sale.status === 'completed' && isCreditSale(sale))
      .flatMap((sale) =>
        (sale.creditPayments ?? []).map((payment) => ({
          sale,
          payment,
          profit:
            sale.grandTotal > 0 ? profitForSale(sale) * (payment.amount / sale.grandTotal) : 0,
        }))
      )
      .filter((row) => isWithinRange(row.payment.recordedAt, range));
    const recordedExpenses = expenses.filter(
      (expense) => expense.status === 'recorded' && isWithinRange(expense.incurredAt, range)
    );
    const periodStockMovements = stockMovements.filter((movement) =>
      isWithinRange(movement.createdAt, range)
    );
    const creditCollections = creditPaymentRows.reduce((sum, row) => sum + row.payment.amount, 0);
    const revenue = paidSales.reduce((sum, sale) => sum + sale.grandTotal, 0) + creditCollections;
    const receivables = creditSales.reduce(
      (sum, sale) => sum + Number(sale.amountDue ?? sale.grandTotal),
      0
    );
    const grossProfit =
      paidSales.reduce((sum, sale) => sum + profitForSale(sale), 0) +
      creditPaymentRows.reduce((sum, row) => sum + row.profit, 0);
    const expenseTotal = recordedExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const stockCostValue = inventory.reduce(
      (sum, item) => sum + item.currentQty * item.unitCost,
      0
    );
    const stockRetailValue = inventory.reduce(
      (sum, item) => sum + item.currentQty * item.sellingPrice,
      0
    );
    const lowStock = inventory.filter((item) =>
      ['low', 'critical', 'out', 'expiring-soon', 'expired'].includes(item.stockStatus)
    );
    const pendingSync = syncQueue.filter((item) => item.status !== 'synced').length;

    const reportPaymentMethods = Array.from(
      new Set([...(settings.paymentMethods ?? ['cash', 'card', 'mobile']), 'credit'])
    );
    const paymentTotals = reportPaymentMethods.map((method) => {
      const methodSales = completedSales.filter((sale) => sale.paymentMethod === method);
      return {
        method,
        total: methodSales.reduce((sum, sale) => sum + sale.grandTotal, 0),
        collected: methodSales
          .filter((sale) => !isCreditSale(sale))
          .reduce((sum, sale) => sum + sale.grandTotal, 0),
        creditCollected:
          method === 'credit'
            ? creditPaymentRows.reduce((sum, row) => sum + row.payment.amount, 0)
            : 0,
        receivable: methodSales
          .filter(isCreditSale)
          .reduce((sum, sale) => sum + Number(sale.amountDue ?? sale.grandTotal), 0),
        count: methodSales.length,
      };
    });

    const expensesByCategory = recordedExpenses.reduce((map, expense) => {
      map.set(expense.category, (map.get(expense.category) ?? 0) + expense.amount);
      return map;
    }, new Map<string, number>());

    const productRows = new Map<
      string,
      { name: string; qty: number; revenue: number; profit: number }
    >();
    const creditDueByCustomer = new Map<string, number>();
    sales
      .filter((sale) => sale.status === 'completed' && isCreditSale(sale))
      .forEach((sale) => {
        const key = (sale.customerName ?? 'Walk-in Customer').trim().toLowerCase();
        creditDueByCustomer.set(
          key,
          (creditDueByCustomer.get(key) ?? 0) + Number(sale.amountDue ?? sale.grandTotal)
        );
      });
    paidSales.forEach((sale) => {
      sale.items.forEach((item) => {
        const current = productRows.get(item.inventoryItemId) ?? {
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
        productRows.set(item.inventoryItemId, current);
      });
    });

    const metricRevenue = salesMetrics?.revenue ?? revenue;
    const metricReceivables = salesMetrics?.receivables ?? receivables;
    const metricGrossProfit = salesMetrics?.grossProfit ?? grossProfit;
    const metricExpenseTotal = salesMetrics?.expenses ?? expenseTotal;
    const metricProductRows =
      salesMetrics?.topProducts ?? [...productRows.values()].sort((a, b) => b.revenue - a.revenue);
    const metricExpenseCategories =
      salesMetrics?.expenseCategories ??
      [...expensesByCategory.entries()].sort((a, b) => b[1] - a[1]);
    const metricStockCostValue = inventoryMetrics?.totalValue ?? stockCostValue;
    const metricStockMargin =
      inventoryMetrics?.potentialProfit ?? stockRetailValue - stockCostValue;

    return {
      completedSales,
      paidSales,
      creditSales,
      creditPaymentRows,
      recordedExpenses,
      revenue: metricRevenue,
      receivables: metricReceivables,
      grossProfit: metricGrossProfit,
      expenseTotal: metricExpenseTotal,
      cogs: metricRevenue - metricGrossProfit,
      netProfit: metricGrossProfit - metricExpenseTotal,
      stockCostValue: metricStockCostValue,
      stockRetailValue: metricStockCostValue + metricStockMargin,
      stockMargin: metricStockMargin,
      lowStock,
      pendingSync,
      paymentTotals,
      expensesByCategory: metricExpenseCategories,
      productRows: metricProductRows,
      stockMovements: periodStockMovements,
      customerValue: [...customers].sort((a, b) => b.totalSpend - a.totalSpend),
      creditDueByCustomer,
    };
  }, [
    customers,
    expenses,
    inventory,
    inventoryMetrics,
    range,
    sales,
    salesMetrics,
    settings.paymentMethods,
    stockMovements,
    syncQueue,
  ]);

  const serverSalesRows = (serverReportRows.sales ?? []) as SaleTransaction[];
  const serverCreditSalesRows = (serverReportRows['credit-sales'] ?? []) as SaleTransaction[];
  const serverExpenseRows = (serverReportRows.expenses ?? []) as typeof expenses;
  const serverProductRows = (serverReportRows['sales-by-product'] ?? []) as {
    name: string;
    qty: number;
    revenue: number;
    profit: number;
  }[];
  const serverCategoryRows = (serverReportRows['sales-by-category'] ?? []) as {
    category: string;
    qty: number;
    revenue: number;
  }[];
  const serverPaymentRows = (serverReportRows['payment-methods'] ?? []) as {
    method: string;
    count: number;
    collected: number;
    receivable: number;
    total: number;
  }[];
  const serverRefundRows = (serverReportRows.refunds ?? []) as SaleTransaction[];
  const serverVoidedRows = (serverReportRows.voided ?? []) as SaleTransaction[];

  const displaySalesRows = serverSalesRows.length > 0 ? serverSalesRows : data.completedSales;
  const displayCreditSalesRows =
    serverCreditSalesRows.length > 0 ? serverCreditSalesRows : data.creditSales;
  const displayExpenseRows =
    serverExpenseRows.length > 0 ? serverExpenseRows : data.recordedExpenses;
  const displayProductRows = serverProductRows.length > 0 ? serverProductRows : data.productRows;
  const displayCategoryRows =
    serverCategoryRows.length > 0
      ? serverCategoryRows
      : Object.entries(
          data.paidSales.reduce(
            (map, sale) => {
              sale.items.forEach((item) => {
                const current = map[item.category] ?? { qty: 0, revenue: 0 };
                current.qty += item.quantity;
                current.revenue += item.lineTotal;
                map[item.category] = current;
              });
              return map;
            },
            {} as Record<string, { qty: number; revenue: number }>
          )
        ).map(([category, row]) => ({ category, ...row }));
  const displayPaymentRows = serverPaymentRows.length > 0 ? serverPaymentRows : data.paymentTotals;
  const displayRefundRows =
    serverRefundRows.length > 0
      ? serverRefundRows
      : sales.filter((sale) => sale.status === 'refunded' && isWithinRange(sale.timestamp, range));
  const displayVoidedRows =
    serverVoidedRows.length > 0
      ? serverVoidedRows
      : sales.filter((sale) => sale.status === 'voided' && isWithinRange(sale.timestamp, range));

  const summaryCards = [
    {
      label: 'Sales Collected',
      value: formatMoney(data.revenue, settings.currency),
      icon: TrendingUp,
      tone: 'text-success',
    },
    {
      label: 'Credit Due',
      value: formatMoney(data.receivables, settings.currency),
      icon: Users,
      tone: 'text-warning',
    },
    {
      label: 'Gross Profit',
      value: formatMoney(data.grossProfit, settings.currency),
      icon: BarChart3,
      tone: 'text-primary',
    },
    {
      label: 'Expenses',
      value: formatMoney(data.expenseTotal, settings.currency),
      icon: TrendingDown,
      tone: 'text-danger',
    },
    {
      label: 'Net Profit',
      value: formatMoney(data.netProfit, settings.currency),
      icon: CircleDollarSign,
      tone: data.netProfit >= 0 ? 'text-success' : 'text-danger',
    },
    {
      label: 'Product Value',
      value: formatMoney(data.stockRetailValue, settings.currency),
      icon: Boxes,
      tone: 'text-primary',
    },
  ];

  const maxPayment = Math.max(
    ...data.paymentTotals.map((item) => item.total + item.creditCollected),
    1
  );
  const maxExpense = Math.max(...data.expensesByCategory.map((item) => item[1]), 1);
  const rangeLabel =
    range.preset === 'all' ? 'All time' : `${range.from || 'Start'} to ${range.to || 'Today'}`;
  const activeReportInfo = reports.find((report) => report.id === activeView) ?? reports[0];

  const exportTable = useMemo(() => {
    if (activeView === 'sales') {
      return {
        filename: 'sales-report',
        headers: [
          'Receipt',
          'Date',
          'Customer',
          'Cashier',
          'Items',
          'Payment',
          'Payment Status',
          'Subtotal',
          'Discount',
          'Tax',
          'Total',
          'Collected',
          'Credit Due',
          'Sync',
        ],
        rows: displaySalesRows.map((sale) => [
          sale.transactionId,
          new Date(sale.timestamp).toLocaleString(),
          sale.customerName ?? 'Walk-in Customer',
          sale.cashier,
          sale.items.reduce((sum, item) => sum + item.quantity, 0).toString(),
          paymentMethodLabel(sale.paymentMethod),
          salePaymentStatus(sale),
          sale.subtotal.toFixed(2),
          sale.discountTotal.toFixed(2),
          sale.taxAmount.toFixed(2),
          sale.grandTotal.toFixed(2),
          isCreditSale(sale) ? '0.00' : sale.grandTotal.toFixed(2),
          isCreditSale(sale) ? Number(sale.amountDue ?? sale.grandTotal).toFixed(2) : '0.00',
          sale.syncStatus,
        ]),
      };
    }

    if (activeView === 'credit-sales') {
      return {
        filename: 'credit-sales-report',
        headers: [
          'Receipt',
          'Date',
          'Customer',
          'Items',
          'Total',
          'Paid',
          'Amount Due',
          'Status',
          'Cashier',
          'Sync',
        ],
        rows: displayCreditSalesRows.map((sale) => [
          sale.transactionId,
          new Date(sale.timestamp).toLocaleString(),
          sale.customerName ?? 'Walk-in Customer',
          sale.items.reduce((sum, item) => sum + item.quantity, 0).toString(),
          sale.grandTotal.toFixed(2),
          Number(sale.amountPaid ?? 0).toFixed(2),
          Number(sale.amountDue ?? sale.grandTotal).toFixed(2),
          salePaymentStatus(sale),
          sale.cashier,
          sale.syncStatus,
        ]),
      };
    }

    if (activeView === 'profit') {
      return {
        filename: 'profit-report',
        headers: ['Product', 'Units', 'Revenue', 'Profit', 'Margin'],
        rows: displayProductRows.map((product) => [
          product.name,
          product.qty.toString(),
          product.revenue.toFixed(2),
          product.profit.toFixed(2),
          product.revenue > 0 ? `${Math.round((product.profit / product.revenue) * 100)}%` : '0%',
        ]),
      };
    }

    if (activeView === 'expenses') {
      return {
        filename: 'expense-report',
        headers: ['Expense', 'Category', 'Date', 'Method', 'Recorded By', 'Amount'],
        rows: displayExpenseRows.map((expense) => [
          expense.title,
          expense.category,
          expense.incurredAt,
          expense.paymentMethod.replace('-', ' '),
          expense.recordedBy,
          expense.amount.toFixed(2),
        ]),
      };
    }

    if (activeView === 'payment-methods') {
      return {
        filename: 'payment-methods-report',
        headers: ['Method', 'Transactions', 'Collected', 'Credit Due', 'Total'],
        rows: displayPaymentRows.map((item) => [
          paymentMethodLabel(item.method),
          item.count.toString(),
          (item.collected + ('creditCollected' in item ? Number(item.creditCollected) : 0)).toFixed(
            2
          ),
          item.receivable.toFixed(2),
          (item.total + ('creditCollected' in item ? Number(item.creditCollected) : 0)).toFixed(2),
        ]),
      };
    }

    if (activeView === 'inventory') {
      return {
        filename: 'inventory-report',
        headers: [
          'Product',
          'Brand',
          'SKU',
          'Barcode',
          'Category',
          'Batch',
          'Supplier',
          'Qty',
          'Reorder',
          'Cost',
          'Price',
          'Cost Value',
          'Retail Value',
          'Expiry',
          'Location',
          'Status',
        ],
        rows: inventory.map((item) => [
          item.name,
          item.genericName,
          item.sku,
          item.barcode ?? '',
          item.category,
          item.batchLot,
          item.supplier,
          item.currentQty.toString(),
          item.reorderLevel.toString(),
          item.unitCost.toFixed(2),
          item.sellingPrice.toFixed(2),
          (item.currentQty * item.unitCost).toFixed(2),
          (item.currentQty * item.sellingPrice).toFixed(2),
          item.expiryDate,
          item.location,
          item.stockStatus,
        ]),
      };
    }

    if (activeView === 'stock-ledger') {
      return {
        filename: 'stock-ledger-report',
        headers: [
          'Date',
          'Product',
          'SKU',
          'Batch',
          'Type',
          'Ref',
          'Before',
          'Delta',
          'After',
          'Reason',
          'By',
          'Sync',
        ],
        rows: data.stockMovements.map((movement) => [
          new Date(movement.createdAt).toLocaleString(),
          movement.productName,
          movement.sku,
          movement.batchLot,
          movement.type,
          movement.referenceLabel,
          movement.quantityBefore.toString(),
          movement.quantityDelta.toString(),
          movement.quantityAfter.toString(),
          movement.reason,
          movement.createdBy,
          movement.syncStatus,
        ]),
      };
    }

    if (activeView === 'customers') {
      return {
        filename: 'customer-report',
        headers: [
          'Customer',
          'Phone',
          'Email',
          'Address',
          'Loyalty',
          'Credit Limit',
          'Credit Due',
          'Total Spend',
        ],
        rows: data.customerValue.map((customer) => [
          customer.name,
          customer.phone || '-',
          customer.email || '-',
          customer.address || '-',
          customer.loyaltyPoints.toString(),
          customer.creditLimit.toFixed(2),
          (data.creditDueByCustomer.get(customer.name.trim().toLowerCase()) ?? 0).toFixed(2),
          customer.totalSpend.toFixed(2),
        ]),
      };
    }

    return {
      filename: 'overview-report',
      headers: ['Metric', 'Value'],
      rows: [
        ['Sales Collected', data.revenue.toFixed(2)],
        ['Credit Due', data.receivables.toFixed(2)],
        ['Gross Profit', data.grossProfit.toFixed(2)],
        ['Expenses', data.expenseTotal.toFixed(2)],
        ['Net Profit', data.netProfit.toFixed(2)],
        ['Pending Sync', data.pendingSync.toString()],
      ],
    };
  }, [
    activeView,
    data,
    displayCreditSalesRows,
    displayExpenseRows,
    displayPaymentRows,
    displayProductRows,
    displaySalesRows,
    inventory,
  ]);

  const exportReport = (format: 'csv' | 'json' | 'excel' | 'pdf') => {
    const activeReport = reports.find((report) => report.id === activeView);
    const reportLabel = activeReport?.label ?? activeView;
    const reportTitle = `${reportLabel} Report`;
    const generatedAt = new Date().toLocaleString();
    const baseName = `${exportTable.filename}-${range.from || 'all'}-${range.to || 'today'}`;
    const metadataRows = [
      ['Organization', settings.businessName || 'TOVAPOS'],
      ['Report', reportTitle],
      ['Range', rangeLabel],
      ['Generated', generatedAt],
    ];
    const fullRows = [...metadataRows, [], exportTable.headers, ...exportTable.rows];

    if (format === 'json') {
      downloadTextFile(
        `${baseName}.json`,
        JSON.stringify(
          {
            organization: settings.businessName || 'TOVAPOS',
            report: reportTitle,
            range: rangeLabel,
            currency: settings.currency,
            generatedAt: new Date().toISOString(),
            headers: exportTable.headers,
            rows: exportTable.rows,
          },
          null,
          2
        ),
        'application/json;charset=utf-8'
      );
      return;
    }

    if (format === 'excel') {
      const worksheet = `<!doctype html><html><head><meta charset="utf-8" /><style>
        body{font-family:Arial,sans-serif;color:#071412}
        h1{font-size:20px;margin:0}
        h2{font-size:15px;margin:4px 0 14px;color:#0d9488}
        .meta{margin:0 0 14px;font-size:12px;color:#485653}
        table{border-collapse:collapse;width:100%}
        th{background:#0d9488;color:#fff;font-weight:700}
        th,td{border:1px solid #b8c7c3;padding:7px 8px;font-size:12px;vertical-align:top}
        tr:nth-child(even) td{background:#f6faf9}
      </style></head><body>
        <h1>${htmlEscape(settings.businessName || 'TOVAPOS')}</h1>
        <h2>${htmlEscape(reportTitle)}</h2>
        <p class="meta">Range: ${htmlEscape(rangeLabel)} &nbsp; | &nbsp; Generated: ${htmlEscape(generatedAt)}</p>
        <table><thead><tr>${exportTable.headers
          .map((header) => `<th>${htmlEscape(String(header))}</th>`)
          .join('')}</tr></thead><tbody>${exportTable.rows
          .map(
            (row) =>
              `<tr>${exportTable.headers
                .map((_, index) => `<td>${htmlEscape(String(row[index] ?? ''))}</td>`)
                .join('')}</tr>`
          )
          .join('')}</tbody></table>
      </body></html>`;
      downloadTextFile(`${baseName}.xls`, worksheet, 'application/vnd.ms-excel;charset=utf-8');
      return;
    }

    if (format === 'pdf') {
      downloadPdfFile({
        filename: `${baseName}.pdf`,
        businessName: settings.businessName || 'TOVAPOS',
        title: reportTitle,
        rangeLabel,
        generatedAt,
        headers: exportTable.headers,
        rows: exportTable.rows,
      });
      return;
    }

    const csv = fullRows
      .map((row) => row.map((cell) => csvEscape(String(cell))).join(','))
      .join('\n');

    downloadTextFile(`${baseName}.csv`, csv, 'text/csv;charset=utf-8');
  };

  return (
    <AppLayout title="Reports" subtitle="Sales, profit, expenses, inventory, customers">
      <PermissionGate permission="reports">
        <div className="mx-auto max-w-screen-2xl space-y-5 p-4 sm:p-6">
          <section className="rounded-xl border border-border bg-white p-4 shadow-card sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase text-primary">Reports</p>
                <h2 className="mt-1 text-2xl font-bold">Business reports</h2>
                <p className="mt-1 text-sm text-muted-foreground">{activeReportInfo.description}</p>
              </div>
              <div className="w-full lg:w-[360px]">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">
                  Select report
                </label>
                <NiceSelect
                  value={activeView}
                  onChange={(value) => router.push(`/reports?view=${value}`)}
                  className="mt-1"
                  options={reports
                    .filter((report) => {
                      const permission = requiredPermission[report.id];
                      return !permission || hasPermission(permission);
                    })
                    .map((report) => ({
                      value: report.id,
                      label: report.label,
                    }))}
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-white p-4 shadow-card">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex h-9 items-center gap-2 rounded-md bg-muted px-3 text-xs font-bold uppercase text-muted-foreground">
                  <Calendar size={14} />
                  Period
                </div>
                {rangePresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setRange(createRange(preset.id))}
                    className={`h-9 rounded-md border px-3 text-sm font-semibold transition-colors ${
                      range.preset === preset.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-white text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">
                      From
                    </span>
                    <DatePicker
                      value={range.from}
                      onChange={(from) =>
                        setRange((current) => ({
                          ...current,
                          from,
                          preset: 'custom',
                        }))
                      }
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">
                      To
                    </span>
                    <DatePicker
                      value={range.to}
                      onChange={(to) =>
                        setRange((current) => ({
                          ...current,
                          to,
                          preset: 'custom',
                        }))
                      }
                    />
                  </label>
                </div>

                {hasPermission('export-reports') && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => exportReport('csv')}
                      className="flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-white hover:bg-primary/90"
                    >
                      <Download size={14} />
                      CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => exportReport('excel')}
                      className="flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Download size={14} />
                      Excel
                    </button>
                    <button
                      type="button"
                      onClick={() => exportReport('pdf')}
                      className="flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Download size={14} />
                      PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => exportReport('json')}
                      className="flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Download size={14} />
                      JSON
                    </button>
                  </div>
                )}
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Showing {rangeLabel}. Sales, profit, expenses, and stock ledger use this period;
              inventory and customer balances show their current state.
            </p>
          </section>

          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
            {summaryCards.map((card) => {
              const Icon = card.icon;
              return (
                <article
                  key={card.label}
                  className="rounded-xl border border-border bg-white p-4 shadow-card"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase text-muted-foreground">
                      {card.label}
                    </p>
                    <Icon size={17} className={card.tone} />
                  </div>
                  <p className={`mt-2 text-2xl font-bold font-tabular ${card.tone}`}>
                    {card.value}
                  </p>
                </article>
              );
            })}
          </section>

          {activeView === 'overview' && (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
              <ReportTable
                title="Recent sales movement"
                subtitle={`${data.pendingSync} update${data.pendingSync === 1 ? '' : 's'} waiting to be sent`}
                headers={['Receipt', 'Customer', 'Payment', 'Status', 'Collected', 'Credit Due']}
                empty="No sales recorded yet."
                rows={displaySalesRows
                  .slice(0, 12)
                  .map((sale) => [
                    sale.transactionId,
                    sale.customerName ?? 'Walk-in Customer',
                    paymentMethodLabel(sale.paymentMethod),
                    salePaymentStatus(sale),
                    isCreditSale(sale)
                      ? formatMoney(0, settings.currency)
                      : formatMoney(sale.grandTotal, settings.currency),
                    isCreditSale(sale)
                      ? formatMoney(Number(sale.amountDue ?? sale.grandTotal), settings.currency)
                      : formatMoney(0, settings.currency),
                  ])}
              />
              <ReportPanel title="Payment mix">
                <div className="space-y-4">
                  {data.paymentTotals.map((item) => (
                    <MetricBar
                      key={item.method}
                      label={`${paymentMethodLabel(item.method)} (${item.count})`}
                      value={
                        item.receivable > 0
                          ? `${formatMoney(item.receivable, settings.currency)} due`
                          : formatMoney(item.collected + item.creditCollected, settings.currency)
                      }
                      percent={((item.total + item.creditCollected) / maxPayment) * 100}
                    />
                  ))}
                </div>
              </ReportPanel>
            </div>
          )}

          {activeView === 'sales' && (
            <ReportTable
              title="Sales report"
              subtitle="Completed transactions split into collected sales and customer credit"
              headers={[
                'Receipt',
                'Date',
                'Customer',
                'Cashier',
                'Items',
                'Payment',
                'Status',
                'Subtotal',
                'Discount',
                'Tax',
                'Total',
                'Collected',
                'Credit Due',
                'Sync',
              ]}
              empty="No sales recorded yet."
              rows={displaySalesRows.map((sale) => [
                sale.transactionId,
                new Date(sale.timestamp).toLocaleString(),
                sale.customerName ?? 'Walk-in Customer',
                sale.cashier,
                sale.items.reduce((sum, item) => sum + item.quantity, 0).toString(),
                paymentMethodLabel(sale.paymentMethod),
                salePaymentStatus(sale),
                formatMoney(sale.subtotal, settings.currency),
                formatMoney(sale.discountTotal, settings.currency),
                formatMoney(sale.taxAmount, settings.currency),
                formatMoney(sale.grandTotal, settings.currency),
                isCreditSale(sale)
                  ? formatMoney(0, settings.currency)
                  : formatMoney(sale.grandTotal, settings.currency),
                isCreditSale(sale)
                  ? formatMoney(Number(sale.amountDue ?? sale.grandTotal), settings.currency)
                  : formatMoney(0, settings.currency),
                sale.syncStatus,
              ])}
            />
          )}

          {activeView === 'credit-sales' && (
            <ReportTable
              title="Credit sales"
              subtitle="Unpaid customer credit for the selected period"
              headers={[
                'Receipt',
                'Date',
                'Customer',
                'Items',
                'Total',
                'Paid',
                'Amount Due',
                'Status',
                'Cashier',
                'Sync',
              ]}
              empty="No credit sales recorded for this period."
              rows={displayCreditSalesRows.map((sale) => [
                sale.transactionId,
                new Date(sale.timestamp).toLocaleString(),
                sale.customerName ?? 'Walk-in Customer',
                sale.items.reduce((sum, item) => sum + item.quantity, 0).toString(),
                formatMoney(sale.grandTotal, settings.currency),
                formatMoney(Number(sale.amountPaid ?? 0), settings.currency),
                formatMoney(Number(sale.amountDue ?? sale.grandTotal), settings.currency),
                salePaymentStatus(sale),
                sale.cashier,
                sale.syncStatus,
              ])}
            />
          )}

          {activeView === 'profit' && (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[380px_1fr]">
              <ReportPanel title="Profit bridge">
                <div className="space-y-3">
                  <SummaryLine
                    label="Sales collected"
                    value={formatMoney(data.revenue, settings.currency)}
                  />
                  <SummaryLine
                    label="Credit due"
                    value={formatMoney(data.receivables, settings.currency)}
                  />
                  <SummaryLine
                    label="Cost of goods"
                    value={`-${formatMoney(data.cogs, settings.currency)}`}
                  />
                  <SummaryLine
                    label="Gross profit"
                    value={formatMoney(data.grossProfit, settings.currency)}
                    strong
                  />
                  <SummaryLine
                    label="Expenses"
                    value={`-${formatMoney(data.expenseTotal, settings.currency)}`}
                  />
                  <SummaryLine
                    label="Net profit"
                    value={formatMoney(data.netProfit, settings.currency)}
                    strong
                  />
                </div>
              </ReportPanel>
              <ReportTable
                title="Product profit"
                subtitle="Profit contribution by sold product"
                headers={['Product', 'Units', 'Revenue', 'Profit', 'Margin']}
                empty="No product profit yet."
                rows={displayProductRows.map((product) => [
                  product.name,
                  product.qty.toString(),
                  formatMoney(product.revenue, settings.currency),
                  formatMoney(product.profit, settings.currency),
                  product.revenue > 0
                    ? `${Math.round((product.profit / product.revenue) * 100)}%`
                    : '0%',
                ])}
              />
            </div>
          )}

          {activeView === 'expenses' && (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[380px_1fr]">
              <ReportPanel title="Expense categories">
                <div className="space-y-4">
                  {data.expensesByCategory.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No expenses recorded yet.
                    </p>
                  ) : (
                    data.expensesByCategory.map(([category, amount]) => (
                      <MetricBar
                        key={category}
                        label={category}
                        value={formatMoney(amount, settings.currency)}
                        percent={(amount / maxExpense) * 100}
                        color="bg-danger"
                      />
                    ))
                  )}
                </div>
              </ReportPanel>
              <ReportTable
                title="Expense ledger"
                subtitle="Recorded operating costs"
                headers={['Expense', 'Category', 'Date', 'Method', 'Recorded By', 'Amount']}
                empty="No expenses recorded yet."
                rows={displayExpenseRows.map((expense) => [
                  expense.title,
                  expense.category,
                  expense.incurredAt,
                  expense.paymentMethod.replace('-', ' '),
                  expense.recordedBy,
                  formatMoney(expense.amount, settings.currency),
                ])}
              />
            </div>
          )}

          {activeView === 'inventory' && (
            <ReportTable
              title="Inventory report"
              subtitle={`${formatMoney(data.stockCostValue, settings.currency)} cost value · ${formatMoney(data.stockRetailValue, settings.currency)} retail value`}
              headers={[
                'Product',
                'Brand',
                'SKU',
                'Category',
                'Batch',
                'Supplier',
                'Qty',
                'Reorder',
                'Cost',
                'Price',
                'Cost Value',
                'Retail Value',
                'Expiry',
                'Status',
              ]}
              empty="No inventory records."
              rows={inventory.map((item) => [
                item.name,
                item.genericName,
                item.sku,
                item.category,
                item.batchLot,
                item.supplier,
                item.currentQty.toString(),
                item.reorderLevel.toString(),
                formatMoney(item.unitCost, settings.currency),
                formatMoney(item.sellingPrice, settings.currency),
                formatMoney(item.currentQty * item.unitCost, settings.currency),
                formatMoney(item.currentQty * item.sellingPrice, settings.currency),
                item.expiryDate,
                item.stockStatus,
              ])}
            />
          )}

          {activeView === 'stock-ledger' && (
            <ReportTable
              title="Stock movement ledger"
              subtitle="Every local stock deduction is recorded as a delta for safer offline sync"
              headers={[
                'Date',
                'Product',
                'SKU',
                'Batch',
                'Type',
                'Ref',
                'Before',
                'Delta',
                'After',
                'Reason',
                'By',
                'Sync',
              ]}
              empty="No stock movement records yet."
              rows={data.stockMovements.map((movement) => [
                new Date(movement.createdAt).toLocaleString(),
                movement.productName,
                movement.sku,
                movement.batchLot,
                movement.type,
                movement.referenceLabel,
                movement.quantityBefore.toString(),
                movement.quantityDelta.toString(),
                movement.quantityAfter.toString(),
                movement.reason,
                movement.createdBy,
                movement.syncStatus,
              ])}
            />
          )}

          {activeView === 'customers' && (
            <ReportTable
              title="Customer report"
              subtitle="Customer spend, loyalty points, and credit exposure"
              headers={[
                'Customer',
                'Phone',
                'Email',
                'Address',
                'Loyalty',
                'Credit Limit',
                'Credit Due',
                'Total Spend',
              ]}
              empty="No customer records."
              rows={data.customerValue.map((customer) => [
                customer.name,
                customer.phone || '-',
                customer.email || '-',
                customer.address || '-',
                customer.loyaltyPoints.toString(),
                formatMoney(customer.creditLimit, settings.currency),
                formatMoney(
                  data.creditDueByCustomer.get(customer.name.trim().toLowerCase()) ?? 0,
                  settings.currency
                ),
                formatMoney(customer.totalSpend, settings.currency),
              ])}
            />
          )}

          {activeView === 'sales-by-cashier' && (
            <ReportTable
              title="Sales by cashier"
              subtitle="Cashier totals for the selected period"
              headers={['Cashier', 'Transactions', 'Revenue', 'Profit']}
              empty="No cashier sales recorded yet."
              rows={Object.entries(
                data.paidSales.reduce(
                  (map, sale) => {
                    const current = map[sale.cashier] ?? { count: 0, revenue: 0, profit: 0 };
                    current.count += 1;
                    current.revenue += sale.grandTotal;
                    current.profit += profitForSale(sale);
                    map[sale.cashier] = current;
                    return map;
                  },
                  {} as Record<string, { count: number; revenue: number; profit: number }>
                )
              ).map(([cashier, row]) => [
                cashier,
                row.count.toString(),
                formatMoney(row.revenue, settings.currency),
                formatMoney(row.profit, settings.currency),
              ])}
            />
          )}

          {activeView === 'sales-by-product' && (
            <ReportTable
              title="Sales by product"
              subtitle="Product units, revenue, and profit"
              headers={['Product', 'Units', 'Revenue', 'Profit']}
              empty="No product sales recorded yet."
              rows={displayProductRows.map((product) => [
                product.name,
                product.qty.toString(),
                formatMoney(product.revenue, settings.currency),
                formatMoney(product.profit, settings.currency),
              ])}
            />
          )}

          {activeView === 'sales-by-category' && (
            <ReportTable
              title="Sales by category"
              subtitle="Category sales performance"
              headers={['Category', 'Units', 'Revenue']}
              empty="No category sales recorded yet."
              rows={displayCategoryRows.map((row) => [
                row.category,
                row.qty.toString(),
                formatMoney(row.revenue, settings.currency),
              ])}
            />
          )}

          {activeView === 'payment-methods' && (
            <ReportTable
              title="Payment methods"
              subtitle="Tender totals by payment method, with customer credit separated as receivable"
              headers={['Method', 'Transactions', 'Collected', 'Credit Due', 'Total']}
              empty="No payments recorded yet."
              rows={displayPaymentRows.map((item) => [
                paymentMethodLabel(item.method),
                item.count.toString(),
                formatMoney(
                  item.collected + ('creditCollected' in item ? Number(item.creditCollected) : 0),
                  settings.currency
                ),
                formatMoney(item.receivable, settings.currency),
                formatMoney(item.total, settings.currency),
              ])}
            />
          )}

          {activeView === 'low-stock' && (
            <ReportTable
              title="Low stock report"
              subtitle="Products at or below reorder level"
              headers={['Product', 'SKU', 'Qty', 'Reorder', 'Status']}
              empty="No low-stock products."
              rows={inventory
                .filter((item) => item.currentQty <= item.reorderLevel)
                .map((item) => [
                  item.name,
                  item.sku,
                  item.currentQty.toString(),
                  item.reorderLevel.toString(),
                  item.stockStatus,
                ])}
            />
          )}

          {activeView === 'expiring' && (
            <ReportTable
              title="Expiring products"
              subtitle="Products marked as expiring soon"
              headers={['Product', 'SKU', 'Batch', 'Expiry', 'Qty']}
              empty="No expiring products."
              rows={inventory
                .filter((item) => item.stockStatus === 'expiring-soon')
                .map((item) => [
                  item.name,
                  item.sku,
                  item.batchLot,
                  item.expiryDate,
                  item.currentQty.toString(),
                ])}
            />
          )}

          {activeView === 'expired' && (
            <ReportTable
              title="Expired products"
              subtitle="Products blocked from sale because expiry date has passed"
              headers={['Product', 'SKU', 'Batch', 'Expiry', 'Qty']}
              empty="No expired products."
              rows={inventory
                .filter((item) => item.stockStatus === 'expired')
                .map((item) => [
                  item.name,
                  item.sku,
                  item.batchLot,
                  item.expiryDate,
                  item.currentQty.toString(),
                ])}
            />
          )}

          {activeView === 'suppliers' && (
            <ReportTable
              title="Supplier report"
              subtitle="Supplier records and balances"
              headers={['Supplier', 'Contact', 'Phone', 'Terms', 'Balance']}
              empty="No suppliers recorded yet."
              rows={vendors.map((vendor) => [
                vendor.name,
                vendor.contactName,
                vendor.phone,
                vendor.paymentTerms,
                formatMoney(vendor.outstandingBalance, settings.currency),
              ])}
            />
          )}

          {activeView === 'vat' && (
            <ReportTable
              title="VAT / Tax report"
              subtitle={`Default VAT is ${settings.taxRate}% (${settings.taxMode ?? 'exclusive'})`}
              headers={['Receipt', 'Date', 'Tax Amount', 'Total']}
              empty="No tax records yet."
              rows={data.completedSales.map((sale) => [
                sale.transactionId,
                new Date(sale.timestamp).toLocaleString(),
                formatMoney(sale.taxAmount, settings.currency),
                formatMoney(sale.grandTotal, settings.currency),
              ])}
            />
          )}

          {activeView === 'discounts' && (
            <ReportTable
              title="Discount report"
              subtitle="Discounts applied to completed sales"
              headers={['Receipt', 'Customer', 'Discount', 'Total']}
              empty="No discounts recorded yet."
              rows={data.completedSales
                .filter((sale) => sale.discountTotal > 0)
                .map((sale) => [
                  sale.transactionId,
                  sale.customerName ?? 'Walk-in Customer',
                  formatMoney(sale.discountTotal, settings.currency),
                  formatMoney(sale.grandTotal, settings.currency),
                ])}
            />
          )}

          {activeView === 'refunds' && (
            <ReportTable
              title="Refund report"
              subtitle="Refunded sales"
              headers={['Receipt', 'Customer', 'Date', 'Total']}
              empty="No refunds recorded yet."
              rows={displayRefundRows.map((sale) => [
                sale.transactionId,
                sale.customerName ?? 'Walk-in Customer',
                new Date(sale.timestamp).toLocaleString(),
                formatMoney(sale.grandTotal, settings.currency),
              ])}
            />
          )}

          {activeView === 'voided' && (
            <ReportTable
              title="Voided sales report"
              subtitle="Voided transactions"
              headers={['Receipt', 'Customer', 'Date', 'Total']}
              empty="No voided sales recorded yet."
              rows={displayVoidedRows.map((sale) => [
                sale.transactionId,
                sale.customerName ?? 'Walk-in Customer',
                new Date(sale.timestamp).toLocaleString(),
                formatMoney(sale.grandTotal, settings.currency),
              ])}
            />
          )}

          {(activeView === 'cashier-closing' || activeView === 'end-of-day') && (
            <ReportTable
              title={
                activeView === 'cashier-closing' ? 'Cashier closing report' : 'End-of-day report'
              }
              subtitle="Sales, expenses, profit, and sync summary for the selected period"
              headers={['Metric', 'Value']}
              empty="No report data yet."
              rows={[
                ['Sales', formatMoney(data.revenue, settings.currency)],
                ['Credit Due', formatMoney(data.receivables, settings.currency)],
                ['Gross Profit', formatMoney(data.grossProfit, settings.currency)],
                ['Expenses', formatMoney(data.expenseTotal, settings.currency)],
                ['Net Profit', formatMoney(data.netProfit, settings.currency)],
                ['Pending Sync', data.pendingSync.toString()],
              ]}
            />
          )}

          {activeView === 'audit' && (
            <ReportTable
              title="Audit trail"
              subtitle="Local sync events and operation records"
              headers={['Created', 'Entity', 'Action', 'Status', 'Key']}
              empty="No audit events yet."
              rows={syncQueue.map((item) => [
                new Date(item.createdAt).toLocaleString(),
                item.entity,
                item.action,
                item.status,
                item.idempotencyKey,
              ])}
            />
          )}
        </div>
      </PermissionGate>
    </AppLayout>
  );
}

function ReportsShellFallback() {
  return (
    <AppLayout title="Reports" subtitle="Sales, profit, expenses, inventory, customers">
      <div className="mx-auto max-w-screen-2xl space-y-5 p-4 sm:p-6">
        <section className="h-28 animate-pulse rounded-xl border border-border bg-white shadow-card" />
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="h-28 animate-pulse rounded-xl border border-border bg-white shadow-card"
            />
          ))}
        </section>
        <section className="h-96 animate-pulse rounded-xl border border-border bg-white shadow-card" />
      </div>
    </AppLayout>
  );
}

function ReportPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-white p-4 shadow-card">
      <p className="text-sm font-bold">{title}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ReportTable({
  title,
  subtitle,
  headers,
  rows,
  empty,
}: {
  title: string;
  subtitle: string;
  headers: string[];
  rows: string[][];
  empty: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-white shadow-card">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-bold">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-4 py-3">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={headers.length}
                  className="px-4 py-12 text-center text-sm text-muted-foreground"
                >
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={`${row[0]}-${index}`} className="hover:bg-muted/30">
                  {row.map((cell, cellIndex) => (
                    <td
                      key={`${cell}-${cellIndex}`}
                      className={`px-4 py-3 text-sm ${cellIndex === 0 ? 'font-medium' : 'text-muted-foreground'} ${cellIndex >= row.length - 2 ? 'font-tabular' : ''}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MetricBar({
  label,
  value,
  percent,
  color = 'bg-primary',
}: {
  label: string;
  value: string;
  percent: number;
  color?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between gap-3 text-sm">
        <span className="capitalize text-muted-foreground">{label}</span>
        <span className="font-semibold font-tabular">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.max(4, percent)}%` }}
        />
      </div>
    </div>
  );
}

function SummaryLine({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-3 rounded-md px-3 py-2 ${strong ? 'bg-primary/10 text-primary' : 'bg-muted/50'}`}
    >
      <span className="text-sm font-medium">{label}</span>
      <span className="text-sm font-bold font-tabular">{value}</span>
    </div>
  );
}
