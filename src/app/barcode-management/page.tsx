'use client';

import React, { useMemo, useState } from 'react';
import bwipjs from '@bwip-js/browser';
import { Barcode, Printer, Search } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import type { InventoryItem } from '@/lib/pos/types';
import { formatMoney } from '@/lib/pos/money';
import { toast } from 'sonner';

function BarcodeGraphic({ value, showText }: { value: string; showText: boolean }) {
  let svg = '';
  try {
    svg = bwipjs.toSVG({
      bcid: 'code128',
      text: value,
      scale: 2,
      height: 9,
      includetext: showText,
      textsize: 8,
      textxalign: 'center',
      paddingwidth: 2,
      paddingheight: 1,
      backgroundcolor: 'FFFFFF',
    });
  } catch {
    return (
      <div className="rounded border border-danger/30 p-2 text-[10px] text-danger">
        Invalid barcode text
      </div>
    );
  }
  return <div className="barcode-svg" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export default function BarcodeManagementPage() {
  const { inventory, settings } = usePosStore();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [scanValue, setScanValue] = useState('');
  const enabled = settings.barcodePrintingEnabled ?? true;
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inventory
      .filter(
        (item) =>
          !q ||
          [item.name, item.sku, item.barcode, item.genericName].some((v) =>
            v?.toLowerCase().includes(q)
          )
      )
      .slice(0, 100);
  }, [inventory, query]);
  const selectedItems = inventory.filter((item) => selected[item.id] && (item.barcode || item.sku));
  const labels = selectedItems.flatMap((item) =>
    Array.from({ length: selected[item.id] }, () => item)
  );

  const addItem = (item: InventoryItem) => {
    if (!item.barcode && !item.sku) {
      toast.error('This product has no barcode or SKU to encode.');
      return;
    }
    setSelected((current) => ({
      ...current,
      [item.id]: Math.min(999, (current[item.id] ?? 0) + 1),
    }));
  };
  const scan = (event: React.FormEvent) => {
    event.preventDefault();
    const value = scanValue.trim().toLowerCase();
    const item = inventory.find((candidate) =>
      [candidate.barcode, candidate.sku].some((code) => code?.toLowerCase() === value)
    );
    if (!item) toast.error('No product matched that barcode or SKU.');
    else addItem(item);
    setScanValue('');
  };
  const print = () => {
    if (!labels.length) return toast.error('Select at least one product label.');
    window.print();
  };

  return (
    <AppLayout
      title="Barcode Management"
      subtitle="Create, preview, and print clean Code 128 labels for your products."
    >
      <PermissionGate permission="inventory">
        {!enabled ? (
          <div className="mx-auto max-w-6xl px-3 py-6 sm:px-6">
            <div className="rounded-xl border border-warning/30 bg-warning/10 p-5 text-sm text-warning">
              Barcode printing is disabled in Business Settings.
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-6xl space-y-4 px-3 py-4 sm:p-6">
            <div className="no-print flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Print labels</p>
                <p className="text-xs text-muted-foreground">
                  Select products, adjust quantities, then print. Use your normal printer dialog or
                  label-printer driver.
                </p>
              </div>
              <button
                type="button"
                onClick={print}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
              >
                <Printer size={15} /> Print {labels.length || ''} label
                {labels.length === 1 ? '' : 's'}
              </button>
            </div>
            <div className="no-print grid gap-4 lg:grid-cols-[1fr_360px]">
              <div className="rounded-xl border border-border bg-card shadow-card">
                <div className="border-b border-border p-4">
                  <form onSubmit={scan} className="flex gap-2">
                    <div className="relative flex-1">
                      <Search
                        size={15}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      />
                      <input
                        autoFocus
                        value={scanValue}
                        onChange={(e) => setScanValue(e.target.value)}
                        placeholder="Scan barcode or SKU, then press Enter"
                        className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm"
                      />
                    </div>
                    <button className="rounded-lg border border-border px-3 text-sm font-semibold">
                      Add
                    </button>
                  </form>
                  <div className="relative mt-3">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search products"
                      className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm"
                    />
                  </div>
                </div>
                <div className="max-h-[520px] divide-y divide-border overflow-y-auto">
                  {matches.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{item.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.barcode || item.sku} · {formatMoney(item.sellingPrice)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {selected[item.id] ?? 0}
                        </span>
                        <button
                          type="button"
                          onClick={() => addItem(item)}
                          className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  ))}
                  {!matches.length && (
                    <p className="p-8 text-center text-sm text-muted-foreground">
                      No products found.
                    </p>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 shadow-card">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold">Print queue</p>
                  <button
                    type="button"
                    onClick={() => setSelected({})}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
                {selectedItems.length ? (
                  selectedItems.map((item) => (
                    <div
                      key={item.id}
                      className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2"
                    >
                      <span className="truncate text-xs font-medium">{item.name}</span>
                      <input
                        type="number"
                        min={1}
                        max={999}
                        value={selected[item.id]}
                        onChange={(e) =>
                          setSelected({
                            ...selected,
                            [item.id]: Math.max(1, Math.min(999, Number(e.target.value) || 1)),
                          })
                        }
                        className="w-16 rounded border border-border bg-background px-2 py-1 text-right text-xs"
                      />
                    </div>
                  ))
                ) : (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    Nothing selected yet.
                  </p>
                )}
                <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                  <Barcode size={15} className="mb-2 text-primary" />
                  Code 128 encodes the product barcode when available, otherwise the SKU. Labels use
                  your saved layout settings.
                </div>
              </div>
            </div>
            <div
              className="barcode-print-sheet"
              style={{
                ['--barcode-width' as string]: `${settings.barcodeLabelWidthMm ?? 50}mm`,
                ['--barcode-height' as string]: `${settings.barcodeLabelHeightMm ?? 30}mm`,
                ['--barcode-columns' as string]: settings.barcodeColumns ?? 3,
                ['--barcode-gap' as string]: `${settings.barcodeGapMm ?? 2}mm`,
              }}
            >
              {labels.map((item, index) => (
                <div className="barcode-label" key={`${item.id}-${index}`}>
                  <p className="barcode-label-name">{item.name}</p>
                  {settings.barcodeShowDescription !== false && item.description && (
                    <p className="barcode-label-description">{item.description}</p>
                  )}
                  <BarcodeGraphic
                    value={item.barcode || item.sku}
                    showText={settings.barcodeShowCodeText !== false}
                  />
                  {settings.barcodeShowPrice && (
                    <p className="barcode-label-price">{formatMoney(item.sellingPrice)}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </PermissionGate>
      <style jsx global>{`
        @media screen {
          .barcode-print-sheet {
            display: none;
          }
        }
        @media print {
          @page {
            margin: 4mm;
          }
          body {
            background: #fff !important;
          }
          body > * {
            display: none !important;
          }
          body > .pos-app-shell {
            display: block !important;
          }
          .pos-app-shell > * {
            display: none !important;
          }
          .pos-app-shell .barcode-print-sheet {
            display: grid !important;
            grid-template-columns: repeat(var(--barcode-columns), var(--barcode-width));
            gap: var(--barcode-gap);
            width: fit-content;
          }
          .barcode-label {
            box-sizing: border-box;
            width: var(--barcode-width);
            height: var(--barcode-height);
            overflow: hidden;
            padding: 2mm;
            border: 0;
            color: #000;
            text-align: center;
            font-family: Arial, sans-serif;
          }
          .barcode-label-name {
            margin: 0 0 1mm;
            font-size: 9pt;
            font-weight: 700;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .barcode-label-description {
            margin: 0 0 1mm;
            font-size: 7pt;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .barcode-svg {
            width: 100%;
          }
          .barcode-svg svg {
            display: block;
            width: 100%;
            height: auto;
            max-height: 16mm;
          }
          .barcode-label-price {
            margin: 1mm 0 0;
            font-size: 8pt;
            font-weight: 700;
          }
        }
      `}</style>
    </AppLayout>
  );
}
