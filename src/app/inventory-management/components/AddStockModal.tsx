'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import Modal from '@/components/ui/Modal';
import DatePicker from '@/components/ui/DatePicker';
import NiceSelect from '@/components/ui/NiceSelect';
import { Loader2, Plus, Save, ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import type { InventoryItem, StockStatus } from '@/lib/pos/types';
import {
  computeProfitMargin,
  computeSellingPriceFromMargin,
  computeStockStatus,
  getTodayIso,
} from '@/lib/pos/stock';
import { usePosStore } from '@/lib/pos/PosStoreProvider';

interface AddStockModalProps {
  open: boolean;
  onClose: () => void;
  editItem: InventoryItem | null;
  onSave: (item: InventoryItem) => void | Promise<void>;
}

type FormData = Omit<InventoryItem, 'id' | 'stockStatus'> & { id?: string };

export default function AddStockModal({ open, onClose, editItem, onSave }: AddStockModalProps) {
  const { settings, updateSettings } = usePosStore();
  const skuInputRef = useRef<HTMLInputElement | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [pricingMode, setPricingMode] = useState<'manual' | 'margin'>('manual');
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>();
  const unitCost = Number(watch('unitCost')) || 0;
  const profitMargin = Number(watch('profitMargin')) || 0;
  const selectedCategory = watch('category') ?? '';
  const selectedUnit = watch('unitOfMeasurement') ?? 'unit';
  const selectedStatus = watch('productStatus') ?? 'active';
  const selectedDiscountType = watch('discountType') ?? 'none';
  const selectedTaxMode = watch('taxMode') ?? 'exclusive';
  const selectedTaxRate = Number(watch('taxRate')) || 0;
  const selectedTaxId = watch('taxId') ?? '';
  const taxOptions = settings.taxRates?.filter((tax) => tax.active) ?? [];
  const manufactureDate = watch('manufactureDate') ?? '';
  const expiryDate = watch('expiryDate') ?? '';
  const categoryOptions = useMemo(
    () => Array.from(new Set([...(settings.productCategories ?? []), 'General'])).sort(),
    [settings.productCategories]
  );
  const skuRegistration = register('sku', { required: 'SKU, barcode, or QR code is required' });
  const unitCostRegistration = register('unitCost', {
    required: 'Unit cost is required',
    min: { value: 0.01, message: 'Must be greater than 0' },
  });
  const profitMarginRegistration = register('profitMargin', {
    min: { value: 0, message: 'Cannot be negative' },
    validate: (value) =>
      Number.isFinite(Number(value)) ? true : 'Enter a valid profit margin percentage',
  });
  const sellingPriceRegistration = register('sellingPrice', {
    required: 'Selling price is required',
    min: { value: 0.01, message: 'Must be greater than 0' },
  });

  useEffect(() => {
    if (editItem) {
      setPricingMode('manual');
      reset({
        name: editItem.name,
        genericName: editItem.genericName,
        sku: editItem.sku,
        barcode: editItem.barcode,
        variantName: editItem.variantName,
        description: editItem.description,
        category: editItem.category,
        batchLot: editItem.batchLot,
        currentQty: editItem.currentQty,
        reorderLevel: editItem.reorderLevel,
        maxStock: editItem.maxStock,
        unitCost: editItem.unitCost,
        sellingPrice: editItem.sellingPrice,
        profitMargin: editItem.profitMargin,
        discountType: editItem.discountType ?? 'none',
        discountValue: editItem.discountValue ?? 0,
        taxApplicable: editItem.taxApplicable ?? false,
        taxId: editItem.taxId ?? '',
        taxRate: editItem.taxRate ?? settings.taxRate,
        taxMode: editItem.taxMode ?? settings.taxMode ?? 'exclusive',
        expiryDate: editItem.expiryDate,
        manufactureDate: editItem.manufactureDate || '',
        supplier: editItem.supplier || '',
        unitOfMeasurement: editItem.unitOfMeasurement ?? 'unit',
        imageUrl: editItem.imageUrl,
        productStatus: editItem.productStatus ?? 'active',
        requiresApproval: editItem.requiresApproval,
        isControlled: editItem.isControlled,
        location: editItem.location,
        lastRestocked: editItem.lastRestocked,
      });
    } else {
      setPricingMode('manual');
      const today = getTodayIso();
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      reset({
        category: 'General',
        currentQty: 0,
        reorderLevel: 20,
        maxStock: 200,
        unitCost: 0,
        sellingPrice: 0,
        profitMargin: 0,
        discountType: 'none',
        discountValue: 0,
        taxApplicable: settings.taxRate > 0,
        taxId: '',
        taxRate: settings.taxRate,
        taxMode: settings.taxMode ?? 'exclusive',
        unitOfMeasurement: 'unit',
        productStatus: 'active',
        requiresApproval: false,
        isControlled: false,
        manufactureDate: '',
        expiryDate: nextYear.toISOString().slice(0, 10),
        lastRestocked: today,
      });
    }
  }, [editItem, reset, open, settings.taxMode, settings.taxRate]);

  useEffect(() => {
    if (pricingMode !== 'margin' || unitCost <= 0 || profitMargin <= 0) return;
    setValue('sellingPrice', computeSellingPriceFromMargin(unitCost, profitMargin), {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [pricingMode, profitMargin, setValue, unitCost]);

  useEffect(() => {
    if (selectedTaxRate > 0) {
      setValue('taxApplicable', true, { shouldDirty: true });
    }
  }, [selectedTaxRate, setValue]);

  const onSubmit = async (data: FormData) => {
    const expiryDate = data.expiryDate || '2099-12-31';
    const status: StockStatus = computeStockStatus(
      Number(data.currentQty),
      Number(data.reorderLevel),
      expiryDate
    );
    const saved: InventoryItem = {
      ...data,
      id: editItem?.id ?? `inv-${Date.now()}`,
      sku: data.sku.trim(),
      barcode: data.barcode?.trim() || data.sku.trim(),
      batchLot: data.batchLot?.trim() || 'N/A',
      supplier: data.supplier?.trim() || 'Unassigned',
      manufactureDate: data.manufactureDate || '',
      expiryDate,
      currentQty: Number(data.currentQty) || 0,
      reorderLevel: Number(data.reorderLevel) || 1,
      maxStock: Number(data.maxStock) || Math.max(Number(data.currentQty) || 0, 1),
      unitCost: Number(data.unitCost),
      sellingPrice: Number(data.sellingPrice),
      profitMargin:
        pricingMode === 'margin' && Number(data.profitMargin) > 0
          ? Number(data.profitMargin)
          : computeProfitMargin(Number(data.unitCost), Number(data.sellingPrice)),
      discountType: data.discountType ?? 'none',
      discountValue: Number(data.discountValue) || 0,
      taxApplicable: Boolean(
        data.taxMode === 'inclusive' && (data.taxApplicable || Number(data.taxRate) > 0)
      ),
      taxRate: Number(data.taxRate) || 0,
      taxMode: data.taxMode ?? 'exclusive',
      unitOfMeasurement: data.unitOfMeasurement?.trim() || 'unit',
      productStatus: data.productStatus ?? 'active',
      requiresApproval: Boolean(data.requiresApproval),
      isControlled: Boolean(data.isControlled),
      stockStatus: status,
      createdAt: editItem?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      await onSave(saved);
      toast.success(
        editItem ? `${saved.name} updated successfully` : `${saved.name} added to inventory`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save product';
      toast.error(message);
    }
  };

  const focusScannerField = () => {
    skuInputRef.current?.focus();
    skuInputRef.current?.select();
    toast.info('Scanner ready. Scan the product barcode or QR code now.');
  };

  const addCategory = async () => {
    const category = newCategory.trim();
    if (!category) return;
    const nextCategories = Array.from(new Set([...(settings.productCategories ?? []), category]))
      .filter(Boolean)
      .sort();
    await updateSettings({ ...settings, productCategories: nextCategories });
    setValue('category', category, { shouldDirty: true, shouldValidate: true });
    setNewCategory('');
    setShowCategoryModal(false);
    toast.success(`${category} added to product categories`);
  };

  const inputClass =
    'w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150';
  const labelClass = 'block text-xs font-medium text-muted-foreground mb-1';
  const errorClass = 'text-[11px] text-danger mt-1';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editItem ? 'Edit Product Record' : 'Add Product / Stock'}
      subtitle={
        editItem
          ? `Editing: ${editItem.name}`
          : 'Create a product and set stock, pricing, barcode, and vendor'
      }
      size="lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground bg-secondary hover:bg-muted rounded-lg transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-stock-form"
            disabled={isSubmitting}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-primary text-white rounded-lg hover:bg-primary/90 active:scale-95 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {editItem ? 'Save Changes' : 'Add to Inventory'}
          </button>
        </>
      }
    >
      <form id="add-stock-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 pb-2 border-b border-border">
            Product Identity
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className={labelClass}>
                Product Name <span className="text-danger">*</span>
              </label>
              <input
                {...register('name', { required: 'Product name is required' })}
                className={inputClass}
                placeholder="Product name"
              />
              {errors.name && <p className={errorClass}>{errors.name.message}</p>}
            </div>
            <div>
              <label className={labelClass}>
                Brand / Description <span className="text-danger">*</span>
              </label>
              <input
                {...register('genericName', { required: 'Brand or description is required' })}
                className={inputClass}
                placeholder="Brand, description, size, or color"
              />
              {errors.genericName && <p className={errorClass}>{errors.genericName.message}</p>}
            </div>
            <div>
              <label className={labelClass}>
                SKU / Barcode / QR Code <span className="text-danger">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  {...skuRegistration}
                  ref={(element) => {
                    skuRegistration.ref(element);
                    skuInputRef.current = element;
                  }}
                  className={`${inputClass} font-mono`}
                  placeholder="Focus here, then scan barcode or QR code"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={focusScannerField}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 text-xs font-semibold text-secondary-foreground hover:bg-muted"
                >
                  <ScanLine size={14} />
                  Scan
                </button>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Barcode scanners work like keyboards. Click Scan, then scan the product code.
              </p>
              {errors.sku && <p className={errorClass}>{errors.sku.message}</p>}
            </div>
            <div>
              <label className={labelClass}>Barcode</label>
              <input
                {...register('barcode')}
                className={`${inputClass} font-mono`}
                placeholder="Barcode"
              />
            </div>
            <div>
              <label className={labelClass}>Variant / Pack Size</label>
              <input
                {...register('variantName')}
                className={inputClass}
                placeholder="Pack size, color, or variant"
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Description</label>
              <textarea
                {...register('description')}
                className={`${inputClass} min-h-20`}
                placeholder="Optional product notes, supplier description, or handling instruction"
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-3">
                <label className={labelClass}>
                  Category <span className="text-danger">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(true)}
                  className="mb-1 flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  <Plus size={12} />
                  Add new
                </button>
              </div>
              <input
                type="hidden"
                {...register('category', { required: 'Category is required' })}
              />
              <NiceSelect
                value={selectedCategory}
                placeholder="Select category..."
                onChange={(category) =>
                  setValue('category', category, { shouldDirty: true, shouldValidate: true })
                }
                options={categoryOptions.map((category) => ({
                  value: category,
                  label: category,
                }))}
              />
              {errors.category && <p className={errorClass}>{errors.category.message}</p>}
            </div>
            <div>
              <label className={labelClass}>Storage Location</label>
              <input
                {...register('location')}
                className={inputClass}
                placeholder="Shelf, aisle, fridge, or store room"
              />
            </div>
            <div>
              <label className={labelClass}>Unit of Measurement</label>
              <input type="hidden" {...register('unitOfMeasurement')} />
              <NiceSelect
                value={selectedUnit}
                onChange={(unitOfMeasurement) =>
                  setValue('unitOfMeasurement', unitOfMeasurement, { shouldDirty: true })
                }
                options={['unit', 'pack', 'carton', 'kg', 'g', 'litre', 'ml', 'box', 'bottle'].map(
                  (unit) => ({
                    value: unit,
                    label: unit,
                  })
                )}
              />
            </div>
            <div>
              <label className={labelClass}>Product Status</label>
              <input type="hidden" {...register('productStatus')} />
              <NiceSelect
                value={selectedStatus}
                onChange={(productStatus) =>
                  setValue('productStatus', productStatus as FormData['productStatus'], {
                    shouldDirty: true,
                  })
                }
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                ]}
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Product Image URL</label>
              <input {...register('imageUrl')} className={inputClass} placeholder="https://..." />
            </div>
          </div>

          <div className="flex flex-col gap-3 mt-3 sm:flex-row sm:items-center sm:gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                {...register('requiresApproval')}
                className="rounded border-border accent-primary w-4 h-4"
              />
              <span className="text-sm text-foreground font-medium">
                Restricted / Approval Required
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                {...register('isControlled')}
                className="rounded border-border accent-danger w-4 h-4"
              />
              <span className="text-sm text-danger font-medium">High Control Item</span>
            </label>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 pb-2 border-b border-border">
            Batch & Expiry Tracking
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={labelClass}>Batch / Lot Number</label>
              <p className="text-[10px] text-muted-foreground mb-1">
                Used for recall tracking and compliance
              </p>
              <input
                {...register('batchLot')}
                className={`${inputClass} font-mono`}
                placeholder="Batch or lot number"
              />
            </div>
            <div>
              <label className={labelClass}>Supplier</label>
              <input
                {...register('supplier')}
                className={inputClass}
                placeholder="Vendor or supplier name"
              />
            </div>
            <div>
              <label className={labelClass}>Manufacture Date</label>
              <input type="hidden" {...register('manufactureDate')} />
              <DatePicker
                value={manufactureDate}
                onChange={(value) => setValue('manufactureDate', value, { shouldDirty: true })}
              />
            </div>
            <div>
              <label className={labelClass}>Expiry Date</label>
              <input type="hidden" {...register('expiryDate')} />
              <DatePicker
                value={expiryDate}
                onChange={(value) =>
                  setValue('expiryDate', value, { shouldDirty: true, shouldValidate: true })
                }
              />
              {errors.expiryDate && <p className={errorClass}>{errors.expiryDate.message}</p>}
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 pb-2 border-b border-border">
            Stock Levels
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Current Qty</label>
              <input
                type="number"
                {...register('currentQty', {
                  min: { value: 0, message: 'Cannot be negative' },
                })}
                className={`${inputClass} font-tabular`}
                min={0}
              />
              {errors.currentQty && <p className={errorClass}>{errors.currentQty.message}</p>}
            </div>
            <div>
              <label className={labelClass}>
                Reorder Level <span className="text-danger">*</span>
              </label>
              <p className="text-[10px] text-muted-foreground mb-1">Alert triggers below this</p>
              <input
                type="number"
                {...register('reorderLevel', {
                  required: 'Reorder level is required',
                  min: { value: 1, message: 'Must be at least 1' },
                })}
                className={`${inputClass} font-tabular`}
                min={1}
              />
              {errors.reorderLevel && <p className={errorClass}>{errors.reorderLevel.message}</p>}
            </div>
            <div>
              <label className={labelClass}>Max Stock Capacity</label>
              <input
                type="number"
                {...register('maxStock', { min: { value: 1, message: 'Must be at least 1' } })}
                className={`${inputClass} font-tabular`}
                min={1}
              />
              {errors.maxStock && <p className={errorClass}>{errors.maxStock.message}</p>}
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 pb-2 border-b border-border">
            Pricing
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={labelClass}>
                Unit Cost (Purchase Price) <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  {settings.currency}
                </span>
                <input
                  type="number"
                  step="0.01"
                  {...unitCostRegistration}
                  className={`${inputClass} pl-14 font-tabular`}
                  placeholder="0.00"
                />
              </div>
              {errors.unitCost && <p className={errorClass}>{errors.unitCost.message}</p>}
            </div>
            <div>
              <label className={labelClass}>Profit Margin (%)</label>
              <input
                type="number"
                step="0.01"
                {...profitMarginRegistration}
                onChange={(event) => {
                  profitMarginRegistration.onChange(event);
                  setPricingMode('margin');
                  setValue(
                    'sellingPrice',
                    computeSellingPriceFromMargin(unitCost, Number(event.target.value) || 0),
                    {
                      shouldDirty: true,
                      shouldValidate: true,
                    }
                  );
                }}
                className={`${inputClass} font-tabular`}
                placeholder="0"
              />
              {errors.profitMargin && <p className={errorClass}>{errors.profitMargin.message}</p>}
            </div>
            <div>
              <label className={labelClass}>
                Selling Price <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  {settings.currency}
                </span>
                <input
                  type="number"
                  step="0.01"
                  {...sellingPriceRegistration}
                  onChange={(event) => {
                    sellingPriceRegistration.onChange(event);
                    setPricingMode('manual');
                    setValue('profitMargin', 0, {
                      shouldDirty: true,
                      shouldValidate: false,
                    });
                  }}
                  className={`${inputClass} pl-14 font-tabular`}
                  placeholder="0.00"
                />
              </div>
              {errors.sellingPrice && <p className={errorClass}>{errors.sellingPrice.message}</p>}
            </div>
            <div>
              <label className={labelClass}>Discount Type</label>
              <input type="hidden" {...register('discountType')} />
              <NiceSelect
                value={selectedDiscountType}
                onChange={(discountType) =>
                  setValue('discountType', discountType as FormData['discountType'], {
                    shouldDirty: true,
                  })
                }
                options={[
                  { value: 'none', label: 'No discount' },
                  { value: 'percentage', label: 'Percentage' },
                  { value: 'fixed', label: 'Fixed amount' },
                ]}
              />
            </div>
            <div>
              <label className={labelClass}>Discount Value</label>
              <input
                type="number"
                step="0.01"
                {...register('discountValue', { min: { value: 0, message: 'Cannot be negative' } })}
                className={`${inputClass} font-tabular`}
                placeholder="0"
              />
              {errors.discountValue && <p className={errorClass}>{errors.discountValue.message}</p>}
            </div>
            <div>
              <label className={labelClass}>VAT / Tax type</label>
              <input type="hidden" {...register('taxId')} />
              <NiceSelect
                value={selectedTaxId}
                onChange={(taxId) => {
                  const tax = taxOptions.find((candidate) => candidate.id === taxId);
                  setValue('taxId', taxId, { shouldDirty: true });
                  setValue('taxApplicable', Boolean(tax && tax.mode === 'inclusive'), {
                    shouldDirty: true,
                  });
                  setValue('taxRate', tax?.rate ?? 0, { shouldDirty: true });
                  setValue('taxMode', tax?.mode ?? settings.taxMode ?? 'exclusive', {
                    shouldDirty: true,
                  });
                }}
                options={[
                  { value: '', label: 'No VAT / tax' },
                  ...taxOptions.map((tax) => ({
                    value: tax.id,
                    label: `${tax.name} (${tax.rate}%)`,
                  })),
                ]}
              />
              {taxOptions.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Add tax types in Settings to use them here.
                </p>
              )}
            </div>
            <div>
              <label className={labelClass}>Applied rate</label>
              <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm font-tabular">
                {selectedTaxRate}%
              </p>
            </div>
            <div>
              <label className={labelClass}>VAT Pricing Mode</label>
              <input type="hidden" {...register('taxMode')} />
              <NiceSelect
                value={selectedTaxMode}
                onChange={(taxMode) => {
                  setValue('taxMode', taxMode as FormData['taxMode'], { shouldDirty: true });
                  setValue('taxApplicable', taxMode === 'inclusive' && selectedTaxRate > 0, {
                    shouldDirty: true,
                  });
                }}
                options={[
                  { value: 'exclusive', label: 'VAT exempt (no VAT)' },
                  { value: 'inclusive', label: 'VAT applies (add separately)' },
                ]}
              />
            </div>
          </div>
        </div>
      </form>
      <Modal
        open={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        title="Add Product Category"
        subtitle="New categories appear immediately in the product category dropdown."
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowCategoryModal(false)}
              className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={addCategory}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
            >
              Add Category
            </button>
          </>
        }
      >
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Category Name</span>
          <input
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addCategory();
              }
            }}
            className={inputClass}
            placeholder="e.g. Cosmetics"
            autoFocus
          />
        </label>
      </Modal>
    </Modal>
  );
}
