import React from 'react';

type BadgeVariant =
  | 'in-stock'
  | 'low'
  | 'critical'
  | 'out'
  | 'expiring-soon'
  | 'expired'
  | 'approval'
  | 'controlled'
  | 'standard'
  | 'completed'
  | 'refunded'
  | 'voided'
  | 'pending';

interface BadgeProps {
  variant: BadgeVariant;
  label?: string;
  className?: string;
}

const variantMap: Record<BadgeVariant, { className: string; defaultLabel: string }> = {
  'in-stock': { className: 'status-badge-in-stock', defaultLabel: 'In Stock' },
  low: { className: 'status-badge-low', defaultLabel: 'Low Stock' },
  critical: { className: 'status-badge-critical', defaultLabel: 'Critical' },
  out: { className: 'status-badge-out', defaultLabel: 'Out of Stock' },
  'expiring-soon': { className: 'status-badge-low', defaultLabel: 'Expiring Soon' },
  expired: { className: 'status-badge-expired', defaultLabel: 'Expired' },
  approval: { className: 'bg-info/10 text-info', defaultLabel: 'Approval' },
  controlled: { className: 'bg-danger/10 text-danger', defaultLabel: 'Controlled' },
  standard: { className: 'bg-primary/10 text-primary', defaultLabel: 'Standard' },
  completed: { className: 'status-badge-in-stock', defaultLabel: 'Completed' },
  refunded: { className: 'status-badge-expired', defaultLabel: 'Refunded' },
  voided: { className: 'status-badge-out', defaultLabel: 'Voided' },
  pending: { className: 'status-badge-low', defaultLabel: 'Pending' },
};

export default function Badge({ variant, label, className = '' }: BadgeProps) {
  const { className: variantClass, defaultLabel } = variantMap[variant];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${variantClass} ${className}`}
    >
      {label ?? defaultLabel}
    </span>
  );
}
