'use client';

import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import RefundModal from '@/app/components/RefundModal';

export default function RefundsPage() {
  const [open, setOpen] = useState(true);

  return (
    <AppLayout title="Refunds & Returns" subtitle="Find a completed sale and return it securely">
      <PermissionGate permission="refunds">
        <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-7">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-danger/10 p-3 text-danger">
                <RotateCcw size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-foreground">Process a refund</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Search by receipt or customer, select the completed transaction, and provide a
                  reason. The refund restores the sold quantity to inventory.
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="mt-5 inline-flex items-center gap-2 rounded-lg bg-danger px-4 py-2.5 text-sm font-semibold text-white hover:bg-danger/90"
                >
                  <RotateCcw size={16} />
                  Find sale to refund
                </button>
              </div>
            </div>
          </div>
        </div>
        <RefundModal open={open} onClose={() => setOpen(false)} />
      </PermissionGate>
    </AppLayout>
  );
}
