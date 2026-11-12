'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import bwipjs from '@bwip-js/browser';
import { Barcode, Printer, Search } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import type { InventoryItem } from '@/lib/pos/types';
import { formatMoney } from '@/lib/pos/money';
import { loadInventoryPage } from '@/lib/pos/local-store';
import { toast } from 'sonner';

interface BarcodeQueueEntry {
  quantity: number;
  value: string;
  labelText: string;
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function searchableValues(item: InventoryItem): string[] {
  return [
    item.name,
    item.genericName,
    item.sku,
    item.barcode,
    item.batchLot,
    ...(item.skuAliases ?? []).map((alias) => alias.code),
    ...(item.barcodeAliases ?? []).map((alias) => alias.code),
  ].filter((value): value is string => Boolean(value));
}

function matchesLocalQuery(item: InventoryItem, query: string): boolean {
  const normalizedQuery = normalizeSearchValue(query);
  return (
    !normalizedQuery ||
    searchableValues(item).some((value) => normalizeSearchValue(value).includes(normalizedQuery))
  );
}

function matchesCode(item: InventoryItem, value: string): boolean {
  const codes = [
    item.barcode,
    item.sku,
    ...(item.barcodeAliases ?? []).map((alias) => alias.code),
    ...(item.skuAliases ?? []).map((alias) => alias.code),
  ].filter((code): code is string => Boolean(code));
  return codes.some((code) => normalizeSearchValue(code) === normalizeSearchValue(value));
}

function BarcodeGraphic({ value, showText }: { value: string; showText: boolean }) {
  let svg = '';
  try {
    svg = bwipjs.toSVG({
      bcid: 'code128',
      text: value,
      scale: 3,
      height: 14,
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
  const [selected, setSelected] = useState<Record<string, BarcodeQueueEntry>>({});
  const [scanValue, setScanValue] = useState('');
  const [remoteMatches, setRemoteMatches] = useState<InventoryItem[] | null>(null);
  const [searchTotal, setSearchTotal] = useState<number | undefined>();
  const [searching, setSearching] = useState(false);
  const enabled = settings.barcodePrintingEnabled ?? true;
  const labelWidthMm = Math.max(20, Math.min(settings.barcodeLabelWidthMm ?? 60, 150));
  const labelHeightMm = Math.max(15, Math.min(settings.barcodeLabelHeightMm ?? 40, 100));
  const labelMargins = {
    top: Math.max(0, Math.min(settings.barcodeMarginTopMm ?? 2, 15)),
    right: Math.max(0, Math.min(settings.barcodeMarginRightMm ?? 2, 15)),
    bottom: Math.max(0, Math.min(settings.barcodeMarginBottomMm ?? 2, 15)),
    left: Math.max(0, Math.min(settings.barcodeMarginLeftMm ?? 2, 15)),
  };
  const barcodeGraphicWidthPercent = Math.max(
    60,
    Math.min(settings.barcodeGraphicWidthPercent ?? 100, 100)
  );
  const barcodeGraphicHeightMm = Math.max(10, Math.min(settings.barcodeGraphicHeightMm ?? 20, 30));

  useEffect(() => {
    // The shared stylesheet has receipt defaults. Barcode labels need their own
    // physical page size so Chrome can preview a 6 x 4 cm label correctly.
    document.documentElement.style.setProperty('--barcode-width', `${labelWidthMm}mm`);
    document.documentElement.style.setProperty('--barcode-height', `${labelHeightMm}mm`);
    const style = document.createElement('style');
    style.dataset.barcodePrint = 'true';
    style.textContent = `@page { size: ${labelWidthMm}mm ${labelHeightMm}mm; margin: 0 !important; }`;
    document.head.appendChild(style);
    return () => {
      style.remove();
      document.documentElement.style.removeProperty('--barcode-width');
      document.documentElement.style.removeProperty('--barcode-height');
    };
  }, [labelHeightMm, labelWidthMm]);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      void loadInventoryPage({
        q,
        limit: 500,
        includeTotal: true,
        signal: controller.signal,
      })
        .then((result) => {
          if (controller.signal.aborted) return;
          setRemoteMatches(result.items);
          setSearchTotal(result.total);
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          console.warn('Barcode product search fell back to cached inventory', error);
          setRemoteMatches([]);
          setSearchTotal(0);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const matches = useMemo(() => {
    const source = query.trim() ? (remoteMatches ?? inventory) : inventory;
    const localMatches = inventory.filter((item) => matchesLocalQuery(item, query));
    const unique = new Map<string, InventoryItem>();
    [...source, ...localMatches].forEach((item) => unique.set(item.id, item));
    return Array.from(unique.values())
      .filter((item) => matchesLocalQuery(item, query))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }, [inventory, query, remoteMatches]);
  const catalog = useMemo(() => {
    const byId = new Map(inventory.map((item) => [item.id, item]));
    if (query.trim()) (remoteMatches ?? []).forEach((item) => byId.set(item.id, item));
    return byId;
  }, [inventory, query, remoteMatches]);
  const selectedItems = Array.from(catalog.values()).filter((item) => selected[item.id]);
  const labels = selectedItems.flatMap((item) =>
    Array.from({ length: selected[item.id].quantity }, () => ({
      item,
      value: selected[item.id].value,
      labelText: selected[item.id].labelText,
    }))
  );

  const addItem = (item: InventoryItem) => {
    if (!item.barcode && !item.sku) {
      toast.error('This product has no barcode or SKU to encode.');
      return;
    }
    setSelected((current) => ({
      ...current,
      [item.id]: current[item.id]
        ? { ...current[item.id], quantity: Math.min(999, current[item.id].quantity + 1) }
        : {
            quantity: 1,
            value: item.barcode || item.sku,
            labelText: item.name,
          },
    }));
  };
  const updateQueueEntry = (item: InventoryItem, changes: Partial<BarcodeQueueEntry>) => {
    setSelected((current) => ({
      ...current,
      [item.id]: { ...current[item.id], ...changes },
    }));
  };
  const scan = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = normalizeSearchValue(scanValue);
    let item = matches.find((candidate) => matchesCode(candidate, value));
    if (!item && value) {
      try {
        const result = await loadInventoryPage({ q: value, limit: 500, includeTotal: true });
        item = result.items.find((candidate) => matchesCode(candidate, value));
      } catch (error) {
        console.warn('Barcode scan lookup failed', error);
      }
    }
    if (!item) {
      toast.error(
        'No product matched that barcode, SKU, or code alias. Search the product first, then scan again.'
      );
    } else addItem(item);
    setScanValue('');
  };
  const print = () => {
    if (!labels.length) return toast.error('Select at least one product label.');
    window.print();
  };

  const barcodePrintSheet = (
    <div
      className="barcode-print-root"
      style={{
        ['--barcode-width' as string]: `${labelWidthMm}mm`,
        ['--barcode-height' as string]: `${labelHeightMm}mm`,
        ['--barcode-margin-top' as string]: `${labelMargins.top}mm`,
        ['--barcode-margin-right' as string]: `${labelMargins.right}mm`,
        ['--barcode-margin-bottom' as string]: `${labelMargins.bottom}mm`,
        ['--barcode-margin-left' as string]: `${labelMargins.left}mm`,
        ['--barcode-graphic-width' as string]: `${barcodeGraphicWidthPercent}%`,
        ['--barcode-graphic-height' as string]: `${barcodeGraphicHeightMm}mm`,
      }}
    >
      <div className="barcode-print-sheet">
        {labels.map((item, index) => (
          <div className="barcode-label" key={`${item.item.id}-${index}`}>
            <div className="barcode-label-content">
              <p className="barcode-label-name">{item.labelText}</p>
              {settings.barcodeShowDescription !== false && item.item.description && (
                <p className="barcode-label-description">{item.item.description}</p>
              )}
              <BarcodeGraphic
                value={item.value}
                showText={settings.barcodeShowCodeText !== false}
              />
              {settings.barcodeShowPrice && (
                <p className="barcode-label-price">{formatMoney(item.item.sellingPrice)}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

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
            <div className="no-print grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
              <div className="min-w-0 rounded-xl border border-border bg-card shadow-card">
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
                <div className="flex items-center justify-between border-b border-border px-4 py-2 text-[11px] text-muted-foreground">
                  <span>
                    {query.trim() && searching
                      ? 'Searching the full inventory…'
                      : `${matches.length}${searchTotal !== undefined && searchTotal > matches.length ? ` of ${searchTotal}` : ''} product${matches.length === 1 ? '' : 's'}`}
                  </span>
                  {query.trim() && <span>Searches name, SKU, barcode, batch, and aliases</span>}
                </div>
                <div className="max-h-[min(60vh,620px)] divide-y divide-border overflow-y-auto">
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
                          {selected[item.id]?.quantity ?? 0}
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
              <div className="min-w-0 space-y-4">
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
                        <div className="min-w-0 flex-1 space-y-1">
                          <span className="block truncate text-xs font-medium">{item.name}</span>
                          <label className="block text-[10px] text-muted-foreground">
                            Barcode value (what the scanner reads)
                            <input
                              value={selected[item.id].value}
                              onChange={(e) => updateQueueEntry(item, { value: e.target.value })}
                              className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-xs font-mono"
                            />
                          </label>
                          <label className="block text-[10px] text-muted-foreground">
                            Text on label
                            <input
                              value={selected[item.id].labelText}
                              onChange={(e) =>
                                updateQueueEntry(item, { labelText: e.target.value })
                              }
                              className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-xs"
                            />
                          </label>
                        </div>
                        <input
                          type="number"
                          min={1}
                          max={999}
                          value={selected[item.id].quantity}
                          onChange={(e) =>
                            updateQueueEntry(item, {
                              quantity: Math.max(1, Math.min(999, Number(e.target.value) || 1)),
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
                    The barcode is generated from the editable <strong>Barcode value</strong>. By
                    default, this is the product barcode; if it is empty, TOVAPOS uses the SKU.
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-4 shadow-card">
                  <p className="text-sm font-semibold">Live preview</p>
                  <p className="mb-3 text-xs text-muted-foreground">
                    This is the label shape and content that will print. Your printer driver still
                    needs the same paper size.
                  </p>
                  <div className="flex min-h-[280px] items-center justify-center overflow-auto rounded-lg bg-muted/40 p-4 sm:min-h-[320px]">
                    <div
                      className="barcode-label barcode-preview-label"
                      style={{
                        ['--barcode-label-aspect' as string]: `${labelWidthMm} / ${labelHeightMm}`,
                        ['--barcode-margin-top' as string]: `${labelMargins.top}mm`,
                        ['--barcode-margin-right' as string]: `${labelMargins.right}mm`,
                        ['--barcode-margin-bottom' as string]: `${labelMargins.bottom}mm`,
                        ['--barcode-margin-left' as string]: `${labelMargins.left}mm`,
                        ['--barcode-graphic-width' as string]: `${barcodeGraphicWidthPercent}%`,
                        ['--barcode-graphic-height' as string]: `${barcodeGraphicHeightMm}mm`,
                      }}
                    >
                      <div className="barcode-label-content">
                        <p className="barcode-label-name">
                          {labels[0]?.labelText || 'Product name'}
                        </p>
                        {settings.barcodeShowDescription !== false &&
                          labels[0]?.item.description && (
                            <p className="barcode-label-description">
                              {labels[0].item.description}
                            </p>
                          )}
                        <BarcodeGraphic
                          value={labels[0]?.value || '0123456789'}
                          showText={settings.barcodeShowCodeText !== false}
                        />
                        {settings.barcodeShowPrice && labels[0]?.item && (
                          <p className="barcode-label-price">
                            {formatMoney(labels[0].item.sellingPrice)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </PermissionGate>
      {typeof document !== 'undefined' ? createPortal(barcodePrintSheet, document.body) : null}
      <style jsx global>{`
        @media screen {
          .barcode-print-root {
            display: none;
          }
          .barcode-preview-label {
            box-sizing: border-box;
            position: relative;
            width: min(100%, 360px) !important;
            height: auto !important;
            aspect-ratio: var(--barcode-label-aspect, 3 / 2);
            overflow: hidden;
            padding: 8px;
            border: 1px solid #cbd5e1;
            color: #000;
            text-align: center;
            font-family: Arial, sans-serif;
            background: #fff;
          }
          .barcode-label-content {
            box-sizing: border-box;
            position: absolute;
            top: var(--barcode-margin-top, 2mm);
            right: var(--barcode-margin-right, 2mm);
            bottom: var(--barcode-margin-bottom, 2mm);
            left: var(--barcode-margin-left, 2mm);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 2px;
            overflow: hidden;
          }
          .barcode-preview-label .barcode-label-name,
          .barcode-preview-label .barcode-label-description,
          .barcode-preview-label .barcode-label-price {
            width: 100%;
            max-width: 100%;
            margin: 0;
            line-height: 1.1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .barcode-preview-label .barcode-label-name {
            font-size: 10pt;
            font-weight: 700;
          }
          .barcode-preview-label .barcode-label-description {
            font-size: 7.5pt;
          }
          .barcode-preview-label .barcode-label-price {
            font-size: 8pt;
            font-weight: 700;
          }
          .barcode-preview-label .barcode-svg {
            width: 100%;
            display: flex;
            justify-content: center;
          }
          .barcode-preview-label .barcode-svg svg {
            display: block;
            width: var(--barcode-graphic-width, 100%);
            max-width: 100%;
            height: var(--barcode-graphic-height, 20mm);
          }
        }
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: #fff !important;
            width: var(--barcode-width) !important;
            min-width: var(--barcode-width) !important;
            overflow: visible !important;
          }
          body > * {
            display: none !important;
          }
          body > .barcode-print-root {
            display: block !important;
            width: var(--barcode-width) !important;
            min-width: var(--barcode-width) !important;
            height: auto !important;
            overflow: visible !important;
          }
          body > .barcode-print-root .barcode-print-sheet {
            display: block !important;
            width: var(--barcode-width) !important;
            margin: 0 !important;
          }
          .barcode-label {
            box-sizing: border-box;
            position: relative;
            width: var(--barcode-width);
            height: var(--barcode-height);
            overflow: hidden;
            padding: 0;
            border: 0;
            color: #000;
            text-align: center;
            font-family: Arial, sans-serif;
            break-after: page;
            page-break-after: always;
          }
          .barcode-label:last-child {
            break-after: auto;
            page-break-after: auto;
          }
          .barcode-label-content {
            box-sizing: border-box;
            position: absolute;
            top: var(--barcode-margin-top, 2mm);
            right: var(--barcode-margin-right, 2mm);
            bottom: var(--barcode-margin-bottom, 2mm);
            left: var(--barcode-margin-left, 2mm);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 1mm;
            overflow: hidden;
          }
          .barcode-label-name {
            width: 100%;
            margin: 0;
            font-size: 10pt;
            line-height: 1.1;
            font-weight: 700;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .barcode-label-description {
            width: 100%;
            margin: 0;
            font-size: 7.5pt;
            line-height: 1.1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .barcode-svg {
            width: 100%;
            display: flex;
            justify-content: center;
          }
          .barcode-svg svg {
            display: block;
            width: var(--barcode-graphic-width, 100%);
            max-width: 100%;
            height: var(--barcode-graphic-height, 20mm);
          }
          .barcode-label-price {
            margin: 0;
            font-size: 8pt;
            font-weight: 700;
          }
        }
      `}</style>
    </AppLayout>
  );
}
