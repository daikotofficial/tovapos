'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { PackagePlus, RotateCcw, Search, ScanLine, History, Plus } from 'lucide-react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import DatePicker from '@/components/ui/DatePicker';
import AddStockModal from '@/app/inventory-management/components/AddStockModal';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import type { InventoryItem, StockBatch, StockMovement } from '@/lib/pos/types';
import { formatMoney } from '@/lib/pos/money';

const inputClass = 'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25';
const labelClass = 'mb-1.5 block text-xs font-semibold text-muted-foreground';

type Action = 'receive' | 'return';

function nextExpiry(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

export default function StockManagementScreen() {
  const { inventory, settings, upsertInventoryItem, applyInventorySnapshot } = usePosStore();
  const [query, setQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<InventoryItem | null>(null);
  const [action, setAction] = useState<Action>('receive');
  const [showActionModal, setShowActionModal] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [batches, setBatches] = useState<StockBatch[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [audits, setAudits] = useState<{ id: number; action: string; metadata?: Record<string, unknown>; createdAt: string; userId: string }[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<StockBatch | null>(null);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [expiryDate, setExpiryDate] = useState(nextExpiry());
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [supplier, setSupplier] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [batchId, setBatchId] = useState('');
  const [reason, setReason] = useState('Damaged');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const suggestions = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return inventory.slice(0, 8);
    return inventory.filter((item) => [item.name, item.sku, item.barcode ?? '', ...(item.skuAliases ?? []).map((alias) => alias.code), ...(item.barcodeAliases ?? []).map((alias) => alias.code)].some((field) => field.toLowerCase().includes(value))).slice(0, 8);
  }, [inventory, query]);

  const loadBatches = async (product: InventoryItem) => {
    setSelectedProduct(product);
    setQuery(product.name);
    setBatches([]);
    setLoadingBatches(true);
    try {
      const response = await fetch(`/api/commands/stock-management?productId=${encodeURIComponent(product.id)}`);
      const payload = (await response.json()) as { batches?: StockBatch[]; movements?: StockMovement[]; audits?: { id: number; action: string; metadata?: Record<string, unknown>; createdAt: string; userId: string }[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load product batches');
      setBatches(payload.batches ?? []);
      setMovements(payload.movements ?? []);
      setAudits(payload.audits ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load product batches');
    } finally {
      setLoadingBatches(false);
    }
  };

  const openAction = (nextAction: Action) => {
    if (!selectedProduct) {
      toast.error('Search for and select an existing product first.');
      return;
    }
    setAction(nextAction);
    setQuantity('');
    setUnitCost(nextAction === 'receive' ? String(selectedProduct.unitCost || '') : '');
    setSellingPrice(nextAction === 'receive' ? String(selectedProduct.sellingPrice || '') : '');
    setExpiryDate(nextAction === 'receive' ? nextExpiry() : '');
    setSku(nextAction === 'receive' ? selectedProduct.sku : '');
    setBarcode(nextAction === 'receive' ? selectedProduct.barcode ?? '' : '');
    setSupplier(selectedProduct.supplier ?? '');
    setSupplierPhone(selectedProduct.supplierPhone ?? '');
    setInvoiceNumber('');
    setBatchId('');
    setReason('Damaged');
    setNotes('');
    setShowActionModal(true);
  };

  const submitAction = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProduct) return;
    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) { toast.error('Enter a quantity greater than zero.'); return; }
    if (action === 'receive' && (!Number(unitCost) || Number(unitCost) <= 0)) { toast.error('Enter the purchase/cost price.'); return; }
    if (action === 'return' && !batchId) { toast.error('Select the stock batch being returned.'); return; }
    setIsSaving(true);
    try {
      const response = await fetch('/api/commands/stock-management', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, productId: selectedProduct.id, quantity: parsedQuantity, unitCost: Number(unitCost), sellingPrice: sellingPrice ? Number(sellingPrice) : undefined, expiryDate, sku, barcode, supplier, supplierPhone, invoiceNumber, batchId, reason, notes }),
      });
      const payload = (await response.json()) as { inventory?: InventoryItem; movement?: StockMovement; error?: string };
      if (!response.ok || !payload.inventory) throw new Error(payload.error ?? 'Unable to save stock transaction');
      await applyInventorySnapshot(payload.inventory, payload.movement);
      setSelectedProduct(payload.inventory);
      setShowActionModal(false);
      toast.success(action === 'receive' ? 'Stock received and average cost updated.' : 'Stock return recorded and inventory value updated.');
      void loadBatches(payload.inventory);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save stock transaction');
    } finally { setIsSaving(false); }
  };

  const printAudit = () => {
    if (!selectedProduct) return;
    const popup = window.open('', '_blank', 'width=900,height=700');
    if (!popup) { toast.error('Please allow pop-ups to print the stock audit.'); return; }
    const rows = movements.map((movement) => `<tr><td>${new Date(movement.createdAt).toLocaleString()}</td><td>${movement.type}</td><td>${movement.sku}</td><td>${movement.quantityDelta}</td><td>${movement.quantityBefore} → ${movement.quantityAfter}</td><td>${movement.reason}</td><td>${movement.createdBy}</td></tr>`).join('');
    popup.document.write(`<html><head><title>Stock Audit - ${selectedProduct.name}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f0f4f3}</style></head><body><h1>Stock Audit: ${selectedProduct.name}</h1><p>Generated ${new Date().toLocaleString()}</p><table><thead><tr><th>Date</th><th>Type</th><th>SKU</th><th>Change</th><th>Balance</th><th>Reason</th><th>By</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No movements recorded.</td></tr>'}</tbody></table></body></html>`);
    popup.document.close(); popup.focus(); popup.print();
  };

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-4 p-3 sm:p-5 lg:p-6">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Operations</p>
              <h2 className="mt-1 text-lg font-bold text-foreground">Stock Management</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Receive new batches against an existing product, preserve every SKU, and keep stock valuation accurate with weighted-average costing.</p>
            </div>
            <button type="button" onClick={() => setShowAddProduct(true)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"><Plus size={15} /> Add Product</button>
          </div>
          <div className="relative mt-5">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(event) => { setQuery(event.target.value); if (selectedProduct && event.target.value !== selectedProduct.name) setSelectedProduct(null); }} onKeyDown={(event) => { if (event.key === 'Enter' && suggestions[0]) void loadBatches(suggestions[0]); }} className={`${inputClass} pl-10`} placeholder="Search or scan product name, SKU, or barcode" autoComplete="off" />
            {query && !selectedProduct && suggestions.length > 0 && <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-modal">{suggestions.map((item) => <button key={item.id} type="button" onClick={() => void loadBatches(item)} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-muted"><span className="min-w-0"><span className="block truncate text-sm font-semibold">{item.name}</span><span className="block truncate text-xs text-muted-foreground">{item.sku} {item.barcode ? `· ${item.barcode}` : ''}</span></span><span className="shrink-0 text-xs text-primary">Qty {item.currentQty}</span></button>)}</div>}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground"><ScanLine size={13} /> Scanner input is ready — scan into the search field and press Enter.</p>
        </section>
        <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Selected Product</p>
          {selectedProduct ? <><h3 className="mt-2 text-base font-bold text-foreground">{selectedProduct.name}</h3><p className="mt-1 text-xs text-muted-foreground">{selectedProduct.genericName || 'No generic name'} · {selectedProduct.category}</p><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-lg bg-muted/40 p-3"><p className="text-[10px] uppercase text-muted-foreground">Available</p><p className="mt-1 text-lg font-bold tabular-nums">{selectedProduct.currentQty}</p></div><div className="rounded-lg bg-muted/40 p-3"><p className="text-[10px] uppercase text-muted-foreground">Avg. Cost</p><p className="mt-1 text-sm font-bold tabular-nums">{formatMoney(selectedProduct.unitCost, settings.currency)}</p></div></div><div className="mt-4 flex flex-col gap-2 sm:flex-row xl:flex-col"><button type="button" onClick={() => openAction('receive')} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90"><PackagePlus size={15} /> Receive Stock</button><button type="button" onClick={printAudit} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm font-semibold text-secondary-foreground hover:bg-muted"><History size={15} /> Print Audit</button><button type="button" onClick={() => openAction('return')} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm font-semibold text-danger hover:bg-danger/15"><RotateCcw size={15} /> Return Stock</button></div></> : <div className="flex min-h-44 flex-col items-center justify-center text-center text-sm text-muted-foreground"><PackagePlus size={28} className="mb-2 text-primary/40" /><p>Select a product to receive stock or process a return.</p></div>}
        </section>
      </div>
      <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5"><div className="flex items-center gap-2"><History size={16} className="text-primary" /><h2 className="text-sm font-semibold">Batch & SKU History</h2></div>{selectedProduct ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead><tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground"><th className="px-2 py-2">SKU / Barcode</th><th className="px-2 py-2">Received</th><th className="px-2 py-2">Remaining</th><th className="px-2 py-2">Cost</th><th className="px-2 py-2">Expiry</th><th className="px-2 py-2">Vendor / Invoice</th><th className="px-2 py-2">Status</th></tr></thead><tbody className="divide-y divide-border">{loadingBatches ? <tr><td colSpan={7} className="px-2 py-6 text-center text-muted-foreground">Loading batches...</td></tr> : batches.length ? batches.map((batch) => <tr key={batch.id} onClick={() => setSelectedBatch(batch)} className="cursor-pointer hover:bg-muted/40"><td className="px-2 py-3"><span className="font-medium">{batch.sku}</span><span className="block text-muted-foreground">{batch.barcode || '—'}</span></td><td className="px-2 py-3 tabular-nums">{batch.quantityReceived}</td><td className="px-2 py-3 tabular-nums">{batch.quantityRemaining}</td><td className="px-2 py-3">{formatMoney(batch.unitCost, settings.currency)}</td><td className="px-2 py-3">{batch.expiryDate}</td><td className="px-2 py-3"><span>{batch.supplier || '—'}</span><span className="block text-muted-foreground">{batch.invoiceNumber || '—'}</span></td><td className="px-2 py-3 capitalize">{batch.status}</td></tr>) : <tr><td colSpan={7} className="px-2 py-6 text-center text-muted-foreground">No receipt batches recorded yet.</td></tr>}</tbody></table></div> : <p className="mt-3 text-sm text-muted-foreground">Select a product to view its receipt and SKU history.</p>}</section>
      <Modal open={Boolean(selectedBatch)} onClose={() => setSelectedBatch(null)} title="Stock Batch Audit" subtitle={selectedBatch ? `${selectedProduct?.name ?? ''} · ${selectedBatch.sku}` : ''} size="lg" footer={<><button type="button" onClick={() => setSelectedBatch(null)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted">Close</button><button type="button" onClick={printAudit} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">Print / Save PDF</button></>}>
        {selectedBatch && <div className="space-y-4"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-lg bg-muted/40 p-3"><p className="text-[10px] uppercase text-muted-foreground">Received</p><p className="mt-1 font-bold">{selectedBatch.quantityReceived}</p></div><div className="rounded-lg bg-muted/40 p-3"><p className="text-[10px] uppercase text-muted-foreground">Remaining</p><p className="mt-1 font-bold">{selectedBatch.quantityRemaining}</p></div><div className="rounded-lg bg-muted/40 p-3"><p className="text-[10px] uppercase text-muted-foreground">Unit Cost</p><p className="mt-1 font-bold">{formatMoney(selectedBatch.unitCost, settings.currency)}</p></div><div className="rounded-lg bg-muted/40 p-3"><p className="text-[10px] uppercase text-muted-foreground">Status</p><p className="mt-1 font-bold capitalize">{selectedBatch.status}</p></div></div><div><h3 className="mb-2 text-sm font-semibold">Audit timeline</h3><div className="space-y-2">{audits.filter((audit) => !audit.metadata?.batch || (audit.metadata.batch as { id?: string }).id === selectedBatch.id).map((audit) => <div key={audit.id} className="rounded-lg border border-border p-3 text-xs"><div className="flex justify-between gap-3"><span className="font-semibold capitalize">{audit.action.replace('.', ' ')}</span><span className="text-muted-foreground">{new Date(audit.createdAt).toLocaleString()}</span></div><p className="mt-1 text-muted-foreground">Recorded by {audit.userId}</p></div>)}</div></div></div>}
      </Modal>
      <AddStockModal open={showAddProduct} onClose={() => setShowAddProduct(false)} editItem={null} onSave={async (item) => { await upsertInventoryItem(item); setShowAddProduct(false); toast.success('Product added successfully.'); }} />
      <Modal open={showActionModal} onClose={() => setShowActionModal(false)} title={action === 'receive' ? 'Receive Products' : 'Return Stock'} subtitle={selectedProduct ? `${selectedProduct.name} · Current stock ${selectedProduct.currentQty}` : ''} size="lg" footer={<><button type="button" onClick={() => setShowActionModal(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted">Cancel</button><button type="submit" form="stock-action-form" disabled={isSaving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{isSaving ? 'Saving...' : action === 'receive' ? 'Receive Stock' : 'Return Stock'}</button></>}>
        <form id="stock-action-form" onSubmit={submitAction} className="space-y-4">
          {action === 'return' && <div><label className={labelClass}>Stock Batch</label><select value={batchId} onChange={(event) => setBatchId(event.target.value)} className={inputClass}><option value="">Select an active batch</option>{batches.filter((batch) => batch.status === 'active' && batch.quantityRemaining > 0).map((batch) => <option key={batch.id} value={batch.id}>{batch.sku} · {batch.quantityRemaining} remaining · {formatMoney(batch.unitCost, settings.currency)}</option>)}</select></div>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><label className={labelClass}>Quantity {action === 'receive' ? 'Received' : 'Returned'} *</label><input required type="text" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/[^0-9.]/g, ''))} className={inputClass} placeholder="0" /></div>{action === 'receive' ? <><div><label className={labelClass}>Purchase / Cost Price *</label><input required type="text" inputMode="decimal" value={unitCost} onChange={(event) => setUnitCost(event.target.value.replace(/[^0-9.]/g, ''))} className={inputClass} placeholder="0.00" /></div><div><label className={labelClass}>Selling Price</label><input type="text" inputMode="decimal" value={sellingPrice} onChange={(event) => setSellingPrice(event.target.value.replace(/[^0-9.]/g, ''))} className={inputClass} placeholder="Keep existing price" /></div><div><label className={labelClass}>Expiry Date *</label><DatePicker value={expiryDate} onChange={setExpiryDate} placeholder="Expiry date" /></div><div><label className={labelClass}>New SKU</label><input value={sku} onChange={(event) => setSku(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); } }} className={inputClass} placeholder="Existing SKU if unchanged" /></div><div><label className={labelClass}>New Barcode</label><input value={barcode} onChange={(event) => setBarcode(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); } }} className={inputClass} placeholder="Scan or type barcode" /></div><div><label className={labelClass}>Vendor Name <span className="font-normal text-muted-foreground">(Optional)</span></label><input value={supplier} onChange={(event) => setSupplier(event.target.value)} className={inputClass} placeholder="Vendor or supplier name" /></div><div><label className={labelClass}>Vendor Phone <span className="font-normal text-muted-foreground">(Optional)</span></label><input value={supplierPhone} onChange={(event) => setSupplierPhone(event.target.value)} className={inputClass} placeholder="Phone number" inputMode="tel" /></div><div><label className={labelClass}>Invoice Number <span className="font-normal text-muted-foreground">(Optional)</span></label><input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} className={`${inputClass} font-mono`} placeholder="Invoice/reference number" /></div></> : <div><label className={labelClass}>Return Reason *</label><select value={reason} onChange={(event) => setReason(event.target.value)} className={inputClass}><option>Damaged</option><option>Expired</option><option>Defective</option><option>Returned to supplier</option><option>Other</option></select></div>}</div>
          {action === 'return' && <div><label className={labelClass}>Notes / Return Details</label><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className={`${inputClass} min-h-24 resize-y`} placeholder="Add return or supplier reference details" /></div>}
        </form>
      </Modal>
    </div>
  );
}
