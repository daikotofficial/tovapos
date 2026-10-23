'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, ClipboardList, Plus, RefreshCw, Warehouse } from 'lucide-react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import type {
  WarehouseLedgerEntry,
  WarehouseLocation,
  WarehouseStock,
  WarehouseTransfer,
} from '@/lib/pos/types';

const input =
  'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

type WarehousePayload = {
  locations: WarehouseLocation[];
  stock: WarehouseStock[];
  transfers: WarehouseTransfer[];
  ledger: WarehouseLedgerEntry[];
  audits: WarehouseAudit[];
};

type WarehouseAudit = {
  id: number;
  action: string;
  entityType: string;
  entityId: string;
  operationId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  beforeData?: Record<string, unknown>;
  afterData?: Record<string, unknown>;
  createdAt: string;
};

function newOperationId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `warehouse-${Date.now()}`;
}

export default function WarehouseScreen() {
  const { inventory, hasPermission } = usePosStore();
  const [payload, setPayload] = useState<WarehousePayload>({
    locations: [],
    stock: [],
    transfers: [],
    ledger: [],
    audits: [],
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [batchLot, setBatchLot] = useState('');
  const [vendor, setVendor] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [warehouseId, setWarehouseId] = useState('warehouse-main');
  const [fromLocationId, setFromLocationId] = useState('warehouse-main');
  const [toLocationId, setToLocationId] = useState('store-main');
  const [transferProductId, setTransferProductId] = useState('');
  const [transferQuantity, setTransferQuantity] = useState('');
  const [transferBatchLot, setTransferBatchLot] = useState('');
  const [inputProductId, setInputProductId] = useState('');
  const [inputBatchLot, setInputBatchLot] = useState('');
  const [inputQuantity, setInputQuantity] = useState('');
  const [outputProductId, setOutputProductId] = useState('');
  const [outputBatchLot, setOutputBatchLot] = useState('');
  const [outputQuantity, setOutputQuantity] = useState('');
  const [processingCost, setProcessingCost] = useState('0');
  const [lossQuantity, setLossQuantity] = useState('0');
  const [locationName, setLocationName] = useState('');
  const [locationKind, setLocationKind] = useState<'warehouse' | 'store'>('store');
  const [locationBranch, setLocationBranch] = useState('');
  const [receivingTransfer, setReceivingTransfer] = useState<WarehouseTransfer | null>(null);
  const [receiptLines, setReceiptLines] = useState<
    Record<string, { accepted: string; rejected: string; notes: string }>
  >({});

  const refresh = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/warehouse', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to load warehouse data');
      setPayload(data as WarehousePayload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load warehouse data');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const warehouses = payload.locations.filter((location) => location.kind === 'warehouse');
  const stores = payload.locations.filter((location) => location.kind === 'store');
  const selectedProduct = inventory.find((item) => item.id === productId);
  const selectedTransferProduct = inventory.find((item) => item.id === transferProductId);
  const availableWarehouseStock = useMemo(
    () =>
      payload.stock.filter(
        (item) => item.locationId === fromLocationId && item.state === 'available'
      ),
    [fromLocationId, payload.stock]
  );

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const response = await fetch('/api/warehouse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, operationId: newOperationId() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Warehouse operation failed');
      toast.success('Warehouse operation recorded');
      await refresh();
      return data;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Warehouse operation failed');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const receive = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProduct) return toast.error('Select a product');
    await post({
      action: 'receive',
      locationId: warehouseId,
      productId,
      quantity: Number(quantity),
      unitCost: Number(unitCost),
      batchLot,
      vendor,
      invoiceNumber,
      expiryDate,
      reason: 'Warehouse receipt',
    });
    setQuantity('');
    setUnitCost('');
    setBatchLot('');
    setVendor('');
    setInvoiceNumber('');
    setExpiryDate('');
  };
  const createLocation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!locationName.trim()) return toast.error('Enter a location name');
    if (locationKind === 'store' && !locationBranch.trim())
      return toast.error('Enter the branch name for this store');
    const result = await post({
      action: 'create-location',
      name: locationName,
      kind: locationKind,
      branch: locationBranch || locationName,
    });
    if (result) {
      setLocationName('');
      setLocationBranch('');
    }
  };
  const createTransfer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTransferProduct) return toast.error('Select a product');
    await post({
      action: 'create-transfer',
      fromLocationId,
      toLocationId,
      lines: [
        {
          productId: transferProductId,
          productName: selectedTransferProduct.name,
          sku: selectedTransferProduct.sku,
          batchLot: transferBatchLot || selectedTransferProduct.batchLot,
          quantity: Number(transferQuantity),
          unit: selectedTransferProduct.unitOfMeasurement || 'unit',
          unitCost: selectedTransferProduct.unitCost,
          sellingPrice: selectedTransferProduct.sellingPrice,
          expiryDate: selectedTransferProduct.expiryDate,
        },
      ],
    });
    setTransferQuantity('');
    setTransferBatchLot('');
  };
  const dispatch = async (transfer: WarehouseTransfer) => {
    if (!hasPermission('warehouse-dispatch'))
      return toast.error('You do not have dispatch permission');
    await post({ action: 'dispatch', transferId: transfer.id });
  };
  const processStock = async (event: React.FormEvent) => {
    event.preventDefault();
    const inputProduct = inventory.find((item) => item.id === inputProductId);
    const outputProduct = inventory.find((item) => item.id === outputProductId);
    if (!inputProduct || !outputProduct)
      return toast.error('Select both input and output products');
    await post({
      action: 'process',
      locationId: warehouseId,
      inputLines: [
        { productId: inputProductId, batchLot: inputBatchLot, quantity: Number(inputQuantity) },
      ],
      outputLines: [
        {
          productId: outputProductId,
          batchLot: outputBatchLot,
          quantity: Number(outputQuantity),
          unit: outputProduct.unitOfMeasurement || 'unit',
          sellingPrice: outputProduct.sellingPrice,
          expiryDate: outputProduct.expiryDate,
        },
      ],
      processingCost: Number(processingCost),
      lossQuantity: Number(lossQuantity),
    });
    setInputQuantity('');
    setOutputQuantity('');
    setProcessingCost('0');
    setLossQuantity('0');
  };
  const approve = async (transfer: WarehouseTransfer) => {
    if (!hasPermission('warehouse-approve'))
      return toast.error('You do not have approval permission');
    await post({ action: 'approve-transfer', transferId: transfer.id });
  };
  const openReceiving = (transfer: WarehouseTransfer) => {
    setReceivingTransfer(transfer);
    setReceiptLines(
      Object.fromEntries(
        transfer.lines.map((line) => [
          line.id,
          {
            accepted: String(
              line.quantityDispatched - line.quantityReceived - line.quantityRejected
            ),
            rejected: '0',
            notes: '',
          },
        ])
      )
    );
  };
  const receiveTransfer = async () => {
    if (!receivingTransfer) return;
    if (!hasPermission('warehouse-receive-transfer'))
      return toast.error('You do not have transfer receiving permission');
    const lines = receivingTransfer.lines.map((line) => ({
      lineId: line.id,
      accepted: Number(receiptLines[line.id]?.accepted ?? 0),
      rejected: Number(receiptLines[line.id]?.rejected ?? 0),
      notes: receiptLines[line.id]?.notes ?? '',
    }));
    const result = await post({
      action: 'receive-transfer',
      transferId: receivingTransfer.id,
      lines,
    });
    if (result) setReceivingTransfer(null);
  };

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-4 p-3 sm:p-5 lg:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">
            Phase 2 · Controlled stock movement and processing
          </p>
          <h2 className="mt-1 text-xl font-bold">Inventory House</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Warehouse quantities are separate from POS stock until a destination confirms receipt.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted"
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Locations</p>
          <p className="mt-1 text-2xl font-bold">{payload.locations.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Warehouse stock lines</p>
          <p className="mt-1 text-2xl font-bold">
            {
              payload.stock.filter((item) =>
                warehouses.some((location) => location.id === item.locationId)
              ).length
            }
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Open transfers</p>
          <p className="mt-1 text-2xl font-bold">
            {
              payload.transfers.filter(
                (transfer) => !['received', 'cancelled'].includes(transfer.status)
              ).length
            }
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Ledger entries</p>
          <p className="mt-1 text-2xl font-bold">{payload.ledger.length}</p>
        </div>
      </div>
      {hasPermission('warehouse-approve') && (
        <form
          onSubmit={createLocation}
          className="rounded-xl border border-border bg-card p-4 shadow-card"
        >
          <div className="flex items-center gap-2">
            <Warehouse size={16} className="text-primary" />
            <h3 className="font-bold">Add warehouse or selling store</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Create the Abuja store here first. Its branch name controls which POS stock receives the
            transfer.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-semibold">
              Location name
              <input
                className={input}
                value={locationName}
                onChange={(event) => setLocationName(event.target.value)}
                placeholder="Abuja Store"
                required
              />
            </label>
            <label className="text-xs font-semibold">
              Type
              <select
                className={input}
                value={locationKind}
                onChange={(event) => setLocationKind(event.target.value as 'warehouse' | 'store')}
              >
                <option value="store">Selling store</option>
                <option value="warehouse">Warehouse</option>
              </select>
            </label>
            <label className="text-xs font-semibold">
              Branch name
              <input
                className={input}
                value={locationBranch}
                onChange={(event) => setLocationBranch(event.target.value)}
                placeholder={locationKind === 'store' ? 'Abuja' : 'Jos Factory'}
                required={locationKind === 'store'}
              />
            </label>
          </div>
          <button
            disabled={busy || loading}
            className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            <Plus size={15} /> Add location
          </button>
        </form>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        {hasPermission('warehouse-receive') && (
          <form
            onSubmit={receive}
            className="rounded-xl border border-border bg-card p-4 shadow-card"
          >
            <div className="flex items-center gap-2">
              <Plus size={16} className="text-primary" />
              <h3 className="font-bold">Receive into warehouse</h3>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold">
                Warehouse
                <select
                  className={input}
                  value={warehouseId}
                  onChange={(event) => setWarehouseId(event.target.value)}
                >
                  {warehouses.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold">
                Product
                <select
                  className={input}
                  value={productId}
                  onChange={(event) => setProductId(event.target.value)}
                >
                  <option value="">Select product</option>
                  {inventory.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.sku}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold">
                Quantity
                <input
                  className={input}
                  type="number"
                  min="0.001"
                  step="any"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  required
                />
              </label>
              <label className="text-xs font-semibold">
                Unit cost
                <input
                  className={input}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={unitCost}
                  onChange={(event) => setUnitCost(event.target.value)}
                  required
                />
              </label>
              <label className="text-xs font-semibold sm:col-span-2">
                Batch / lot
                <input
                  className={input}
                  value={batchLot}
                  onChange={(event) => setBatchLot(event.target.value)}
                  placeholder="Vendor batch or production lot"
                />
              </label>
              <label className="text-xs font-semibold">
                Vendor
                <input
                  className={input}
                  value={vendor}
                  onChange={(event) => setVendor(event.target.value)}
                  placeholder="Vendor or source"
                />
              </label>
              <label className="text-xs font-semibold">
                Invoice / delivery note
                <input
                  className={input}
                  value={invoiceNumber}
                  onChange={(event) => setInvoiceNumber(event.target.value)}
                  placeholder="Reference number"
                />
              </label>
              <label className="text-xs font-semibold">
                Expiry date
                <input
                  className={input}
                  type="date"
                  value={expiryDate}
                  onChange={(event) => setExpiryDate(event.target.value)}
                />
              </label>
            </div>
            <button
              disabled={busy || loading}
              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              <Plus size={15} /> Record receipt
            </button>
          </form>
        )}
        {hasPermission('warehouse-dispatch') && (
          <form
            onSubmit={createTransfer}
            className="rounded-xl border border-border bg-card p-4 shadow-card"
          >
            <div className="flex items-center gap-2">
              <ArrowRight size={16} className="text-primary" />
              <h3 className="font-bold">Create transfer request</h3>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold">
                From
                <select
                  className={input}
                  value={fromLocationId}
                  onChange={(event) => setFromLocationId(event.target.value)}
                >
                  {warehouses.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold">
                To
                <select
                  className={input}
                  value={toLocationId}
                  onChange={(event) => setToLocationId(event.target.value)}
                >
                  {stores.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold">
                Product
                <select
                  className={input}
                  value={transferProductId}
                  onChange={(event) => setTransferProductId(event.target.value)}
                >
                  <option value="">Select product</option>
                  {inventory.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.sku}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold">
                Quantity
                <input
                  className={input}
                  type="number"
                  min="0.001"
                  step="any"
                  value={transferQuantity}
                  onChange={(event) => setTransferQuantity(event.target.value)}
                  required
                />
              </label>
              <label className="text-xs font-semibold sm:col-span-2">
                Source batch / lot
                <input
                  className={input}
                  value={transferBatchLot}
                  onChange={(event) => setTransferBatchLot(event.target.value)}
                  placeholder="Required when the product has multiple batches"
                />
              </label>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Available in source:{' '}
              {availableWarehouseStock
                .filter((item) => item.productId === transferProductId)
                .reduce((total, item) => total + item.quantity, 0)}
            </p>
            <button
              disabled={busy || loading}
              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              <ArrowRight size={15} /> Request transfer
            </button>
          </form>
        )}
        {hasPermission('warehouse-process') && (
          <form
            onSubmit={processStock}
            className="rounded-xl border border-border bg-card p-4 shadow-card sm:col-span-2"
          >
            <div className="flex items-center gap-2">
              <RefreshCw size={16} className="text-primary" />
              <h3 className="font-bold">Process / repackage stock</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Consume raw warehouse stock and create a finished-product batch. Cost is allocated
              across the output quantity.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-semibold">
                Input product
                <select
                  className={input}
                  value={inputProductId}
                  onChange={(event) => setInputProductId(event.target.value)}
                >
                  <option value="">Select input</option>
                  {inventory.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold">
                Input batch / lot
                <input
                  className={input}
                  value={inputBatchLot}
                  onChange={(event) => setInputBatchLot(event.target.value)}
                  required
                />
              </label>
              <label className="text-xs font-semibold">
                Input quantity
                <input
                  className={input}
                  type="number"
                  min="0.001"
                  step="any"
                  value={inputQuantity}
                  onChange={(event) => setInputQuantity(event.target.value)}
                  required
                />
              </label>
              <label className="text-xs font-semibold">
                Output product
                <select
                  className={input}
                  value={outputProductId}
                  onChange={(event) => setOutputProductId(event.target.value)}
                >
                  <option value="">Select output</option>
                  {inventory.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold">
                Output batch / lot
                <input
                  className={input}
                  value={outputBatchLot}
                  onChange={(event) => setOutputBatchLot(event.target.value)}
                  placeholder="Auto-generated if blank"
                />
              </label>
              <label className="text-xs font-semibold">
                Output quantity
                <input
                  className={input}
                  type="number"
                  min="0.001"
                  step="any"
                  value={outputQuantity}
                  onChange={(event) => setOutputQuantity(event.target.value)}
                  required
                />
              </label>
              <label className="text-xs font-semibold">
                Processing cost
                <input
                  className={input}
                  type="number"
                  min="0"
                  step="0.01"
                  value={processingCost}
                  onChange={(event) => setProcessingCost(event.target.value)}
                />
              </label>
              <label className="text-xs font-semibold">
                Recorded loss
                <input
                  className={input}
                  type="number"
                  min="0"
                  step="any"
                  value={lossQuantity}
                  onChange={(event) => setLossQuantity(event.target.value)}
                />
              </label>
            </div>
            <button
              disabled={busy || loading}
              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              <RefreshCw size={15} /> Post processing
            </button>
          </form>
        )}
      </div>
      <section className="rounded-xl border border-border bg-card p-4 shadow-card">
        <div className="flex items-center gap-2">
          <ClipboardList size={16} className="text-primary" />
          <h3 className="font-bold">Transfers</h3>
        </div>
        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-2 py-2">Reference</th>
                  <th className="px-2 py-2">Route</th>
                  <th className="px-2 py-2">Items</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payload.transfers.map((transfer) => (
                  <tr key={transfer.id}>
                    <td className="px-2 py-3 font-semibold">
                      {transfer.transferNumber}
                      <span className="block text-muted-foreground">
                        {new Date(transfer.requestedAt).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      {
                        payload.locations.find(
                          (location) => location.id === transfer.fromLocationId
                        )?.name
                      }{' '}
                      <ArrowRight size={13} className="mx-1 inline" />{' '}
                      {
                        payload.locations.find((location) => location.id === transfer.toLocationId)
                          ?.name
                      }
                    </td>
                    <td className="px-2 py-3">
                      {transfer.lines.reduce((sum, line) => sum + line.quantityRequested, 0)}
                    </td>
                    <td className="px-2 py-3 capitalize">{transfer.status.replace('-', ' ')}</td>
                    <td className="px-2 py-3">
                      {transfer.status === 'requested' && hasPermission('warehouse-approve') && (
                        <button
                          type="button"
                          onClick={() => void approve(transfer)}
                          className="mr-2 rounded-lg bg-warning/10 px-3 py-1.5 font-bold text-warning hover:bg-warning/20"
                        >
                          Approve
                        </button>
                      )}
                      {transfer.status === 'approved' && hasPermission('warehouse-dispatch') && (
                        <button
                          type="button"
                          onClick={() => void dispatch(transfer)}
                          className="rounded-lg bg-primary/10 px-3 py-1.5 font-bold text-primary hover:bg-primary/20"
                        >
                          Dispatch
                        </button>
                      )}
                      {['dispatched', 'partially-received'].includes(transfer.status) &&
                        hasPermission('warehouse-receive-transfer') && (
                          <button
                            type="button"
                            onClick={() => openReceiving(transfer)}
                            className="rounded-lg bg-primary/10 px-3 py-1.5 font-bold text-primary hover:bg-primary/20"
                          >
                            Confirm receipt
                          </button>
                        )}
                      {transfer.status === 'received' && (
                        <span className="inline-flex items-center gap-1 text-success">
                          <CheckCircle2 size={14} /> Received
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {payload.transfers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-2 py-8 text-center text-muted-foreground">
                      No transfers recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="rounded-xl border border-border bg-card p-4 shadow-card">
        <div className="flex items-center gap-2">
          <Warehouse size={16} className="text-primary" />
          <h3 className="font-bold">Warehouse audit ledger</h3>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Action</th>
                <th className="px-2 py-2">Product</th>
                <th className="px-2 py-2">Change</th>
                <th className="px-2 py-2">Balance</th>
                <th className="px-2 py-2">Performed by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payload.ledger.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-2 py-3">{new Date(entry.createdAt).toLocaleString()}</td>
                  <td className="px-2 py-3 capitalize">{entry.type.replace('-', ' ')}</td>
                  <td className="px-2 py-3">
                    {entry.productName}
                    <span className="block text-muted-foreground">
                      {entry.sku} · {entry.batchLot}
                    </span>
                  </td>
                  <td
                    className={`px-2 py-3 font-bold ${entry.quantityDelta < 0 ? 'text-danger' : 'text-success'}`}
                  >
                    {entry.quantityDelta > 0 ? '+' : ''}
                    {entry.quantityDelta} {entry.unit}
                  </td>
                  <td className="px-2 py-3">
                    {entry.balanceAfter} {entry.unit}
                  </td>
                  <td className="px-2 py-3">
                    {entry.performedBy}
                    <span className="block text-muted-foreground">{entry.performedByRole}</span>
                  </td>
                </tr>
              ))}
              {payload.ledger.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-2 py-8 text-center text-muted-foreground">
                    No warehouse movements recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-xl border border-border bg-card p-4 shadow-card">
        <div className="flex items-center gap-2">
          <ClipboardList size={16} className="text-primary" />
          <h3 className="font-bold">Warehouse operation history</h3>
        </div>
        <div className="mt-4 space-y-2">
          {payload.audits.map((audit) => (
            <div key={audit.id} className="rounded-lg border border-border p-3 text-xs">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-bold capitalize">{audit.action.replaceAll('.', ' ')}</span>
                <span className="text-muted-foreground">
                  {new Date(audit.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">
                Operation {audit.operationId || audit.entityId} · Performed by{' '}
                {String(audit.metadata?.performedByName || audit.userId || 'System')}
              </p>
            </div>
          ))}
          {payload.audits.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">
              No warehouse audit events recorded yet.
            </p>
          )}
        </div>
      </section>
      <Modal
        open={Boolean(receivingTransfer)}
        onClose={() => setReceivingTransfer(null)}
        title="Confirm incoming transfer"
        subtitle={receivingTransfer?.transferNumber}
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setReceivingTransfer(null)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void receiveTransfer()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Confirm receipt
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Record what physically arrived. Accepted quantities become sellable stock; rejected
            quantities remain a discrepancy for investigation.
          </p>
          {receivingTransfer?.lines.map((line) => {
            const values = receiptLines[line.id] ?? { accepted: '0', rejected: '0', notes: '' };
            return (
              <div key={line.id} className="rounded-lg border border-border p-3">
                <div className="flex justify-between gap-3 text-sm font-semibold">
                  <span>{line.productName || line.productId}</span>
                  <span>
                    Dispatched: {line.quantityDispatched} {line.unit}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <label className="text-xs font-semibold">
                    Accepted
                    <input
                      className={input}
                      type="number"
                      min="0"
                      step="any"
                      value={values.accepted}
                      onChange={(event) =>
                        setReceiptLines((current) => ({
                          ...current,
                          [line.id]: { ...values, accepted: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className="text-xs font-semibold">
                    Rejected / missing
                    <input
                      className={input}
                      type="number"
                      min="0"
                      step="any"
                      value={values.rejected}
                      onChange={(event) =>
                        setReceiptLines((current) => ({
                          ...current,
                          [line.id]: { ...values, rejected: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className="text-xs font-semibold">
                    Notes
                    <input
                      className={input}
                      value={values.notes}
                      onChange={(event) =>
                        setReceiptLines((current) => ({
                          ...current,
                          [line.id]: { ...values, notes: event.target.value },
                        }))
                      }
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
