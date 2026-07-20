import React from 'react';
import { Package, AlertTriangle, Clock, XCircle, TrendingUp } from 'lucide-react';
import type { InventoryItem } from '@/lib/pos/types';
import { formatMoney } from '@/lib/pos/money';
import { getDaysUntilExpiry } from '@/lib/pos/stock';
import type { InventoryMetrics } from '@/lib/pos/local-store';

interface InventoryKPICardsProps {
  items: InventoryItem[];
  metrics?: InventoryMetrics | null;
  expiryAlertDays: number;
  activeFilter: string;
  onFilter: (filter: string) => void;
}

export default function InventoryKPICards({
  items,
  metrics,
  expiryAlertDays,
  activeFilter,
  onFilter,
}: InventoryKPICardsProps) {
  const totalUnits = metrics?.totalUnits ?? items.reduce((sum, item) => sum + item.currentQty, 0);
  const totalProducts = metrics?.totalProducts ?? items.length;
  const lowStock =
    metrics?.lowStock ??
    items.filter((i) => i.stockStatus === 'low' || i.stockStatus === 'critical').length;
  const criticalStock =
    metrics?.criticalStock ?? items.filter((i) => i.stockStatus === 'critical').length;
  const outOfStock = metrics?.outOfStock ?? items.filter((i) => i.stockStatus === 'out').length;
  const expired = metrics?.expired ?? items.filter((i) => i.stockStatus === 'expired').length;

  const expiringSoon =
    metrics?.expiringSoon ??
    items.filter((i) => {
      const days = getDaysUntilExpiry(i.expiryDate);
      return days >= 0 && days <= expiryAlertDays;
    }).length;

  const totalValue =
    metrics?.totalValue ?? items.reduce((sum, i) => sum + i.currentQty * i.unitCost, 0);
  const potentialProfit =
    metrics?.potentialProfit ??
    items.reduce((sum, i) => sum + i.currentQty * (i.sellingPrice - i.unitCost), 0);

  const cards = [
    {
      id: 'kpi-total',
      label: 'Total Inventory',
      value: totalUnits.toLocaleString(),
      sub: `${totalProducts.toLocaleString()} SKU${totalProducts === 1 ? '' : 's'}`,
      icon: Package,
      color: 'bg-primary/5 border-primary/20',
      iconColor: 'text-primary',
      valueColor: 'text-foreground',
    },
    {
      id: 'kpi-low',
      label: 'Low Stock Alerts',
      value: lowStock.toString(),
      sub: `${criticalStock} critical`,
      icon: AlertTriangle,
      filter: 'low-stock',
      color: lowStock > 0 ? 'bg-warning/10 border-warning/30' : 'bg-muted border-border',
      iconColor: lowStock > 0 ? 'text-warning' : 'text-muted-foreground',
      valueColor: lowStock > 0 ? 'text-warning' : 'text-foreground',
    },
    {
      id: 'kpi-expiring',
      label: `Expiring ≤ ${expiryAlertDays} Days`,
      value: expiringSoon.toString(),
      sub: `${expired} already expired`,
      icon: Clock,
      filter: 'expiring-soon',
      color: expiringSoon > 0 ? 'bg-warning/10 border-warning/30' : 'bg-muted border-border',
      iconColor: expiringSoon > 0 ? 'text-warning' : 'text-muted-foreground',
      valueColor: expiringSoon > 0 ? 'text-warning' : 'text-foreground',
    },
    {
      id: 'kpi-out',
      label: 'Out of Stock',
      value: outOfStock.toString(),
      sub: `${expired} expired items`,
      icon: XCircle,
      filter: 'out',
      color: outOfStock > 0 ? 'bg-danger/10 border-danger/30' : 'bg-muted border-border',
      iconColor: outOfStock > 0 ? 'text-danger' : 'text-muted-foreground',
      valueColor: outOfStock > 0 ? 'text-danger' : 'text-foreground',
    },
    {
      id: 'kpi-potential-profit',
      label: 'Potential Profit',
      value: formatMoney(potentialProfit),
      sub: 'If all stock sells',
      icon: TrendingUp,
      color: 'bg-primary/5 border-primary/15',
      iconColor: 'text-primary',
      valueColor: 'text-foreground',
    },
    {
      id: 'kpi-value',
      label: 'Inventory Value',
      value: formatMoney(totalValue),
      sub: 'At cost price',
      icon: TrendingUp,
      color: 'bg-success/5 border-success/15',
      iconColor: 'text-success',
      valueColor: 'text-foreground',
    },
  ];

  return (
    <div className="mb-4 grid min-w-0 grid-cols-2 gap-2 sm:mb-6 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => {
        const Icon = card.icon;
        const clickable = Boolean(card.filter);
        const active = card.filter && activeFilter === card.filter;
        const Component = clickable ? 'button' : 'div';
        return (
          <Component
            key={card.id}
            type={clickable ? 'button' : undefined}
            onClick={clickable ? () => onFilter(card.filter!) : undefined}
            className={`min-w-0 rounded-lg border bg-card p-3 text-left shadow-card transition-all duration-200 sm:rounded-xl sm:p-4 ${card.color} ${
              clickable
                ? 'hover:-translate-y-0.5 hover:shadow-card-hover focus:outline-none focus:ring-2 focus:ring-primary/30'
                : ''
            } ${active ? 'ring-2 ring-primary/35' : ''}`}
          >
            <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide leading-tight">
                {card.label}
              </span>
              <Icon size={16} className={card.iconColor} />
            </div>
            <p
              className={`mb-1 break-words text-xl font-bold leading-none font-tabular sm:text-2xl ${card.valueColor}`}
            >
              {card.value}
            </p>
            <p className="text-[10px] text-muted-foreground">{card.sub}</p>
          </Component>
        );
      })}
    </div>
  );
}
