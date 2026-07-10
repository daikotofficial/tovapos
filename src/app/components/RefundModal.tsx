'use client';

import React, { useState } from 'react';
import Modal from '@/components/ui/Modal';
import NiceSelect from '@/components/ui/NiceSelect';
import { Search, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatMoney } from '@/lib/pos/money';
import { usePosStore } from '@/lib/pos/PosStoreProvider';

interface RefundModalProps {
  open: boolean;
  onClose: () => void;
}

export default function RefundModal({ open, onClose }: RefundModalProps) {
  const { sales, refundSale } = usePosStore();
  const [search, setSearch] = useState('');
  const [selectedTxn, setSelectedTxn] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const completedSales = sales.filter((sale) => sale.status === 'completed');
  const filtered = completedSales.filter(
    (t) =>
      t.transactionId.toLowerCase().includes(search.toLowerCase()) ||
      t.customerName?.toLowerCase().includes(search.toLowerCase())
  );

  const handleRefund = async () => {
    if (!selectedTxn || !reason) {
      toast.error('Select a transaction and provide a refund reason');
      return;
    }
    setIsProcessing(true);
    try {
      const refunded = await refundSale(selectedTxn, reason);
      toast.success(`Refund processed for ${refunded.transactionId}`);
      setSelectedTxn(null);
      setReason('');
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to process refund';
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Process Refund / Return"
      subtitle="Search for a transaction to refund"
      size="md"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground bg-secondary hover:bg-muted rounded-lg transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            onClick={handleRefund}
            disabled={!selectedTxn || !reason || isProcessing}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-danger text-white rounded-lg hover:bg-danger/90 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CheckCircle2 size={14} />
            )}
            Process Refund
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 bg-warning/10 border border-warning/20 rounded-lg px-3 py-2.5">
          <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
          <p className="text-xs text-warning">
            Refunds require manager approval for large amounts or high-control items.
          </p>
        </div>

        {/* Search */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Search Transaction
          </label>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Transaction ID or customer name..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
            />
          </div>
        </div>

        {/* Transaction List */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Completed Transactions</p>
          {filtered.map((txn) => (
            <div
              key={txn.id}
              onClick={() => setSelectedTxn(selectedTxn === txn.id ? null : txn.id)}
              className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all duration-150 ${
                selectedTxn === txn.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/30 hover:bg-muted/30'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center transition-colors duration-100 ${
                  selectedTxn === txn.id ? 'border-primary bg-primary' : 'border-border'
                }`}
              >
                {selectedTxn === txn.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono font-semibold text-foreground">
                    {txn.transactionId}
                  </span>
                  <span className="text-sm font-bold font-tabular text-foreground">
                    {formatMoney(txn.grandTotal)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {txn.customerName ?? 'Walk-in Customer'} - {txn.timestamp.slice(0, 16)}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {txn.items.map((item) => `${item.name} x ${item.quantity}`).join(', ')}
                </p>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-center text-muted-foreground py-4">No transactions found</p>
          )}
        </div>

        {/* Reason */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Refund Reason <span className="text-danger">*</span>
          </label>
          <NiceSelect
            value={reason}
            onChange={setReason}
            placeholder="Select a reason..."
            options={[
              { value: 'wrong-item', label: 'Wrong item sold' },
              { value: 'customer-returned', label: 'Customer returned item' },
              { value: 'duplicate-sale', label: 'Duplicate sale / billing error' },
              { value: 'damaged-item', label: 'Damaged item' },
              { value: 'price-correction', label: 'Price correction' },
              { value: 'quality-issue', label: 'Quality issue reported' },
              { value: 'other', label: 'Other (requires manager note)' },
            ]}
          />
        </div>
      </div>
    </Modal>
  );
}
