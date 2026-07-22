'use client';

import React, { useState } from 'react';
import { Plus, Tags, Trash2 } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import Modal from '@/components/ui/Modal';
import { usePosStore } from '@/lib/pos/PosStoreProvider';
import { useRowsPerPage } from '@/lib/pos/useRowsPerPage';
import ListPagination from '@/components/ui/ListPagination';

export default function CategoriesPage() {
  const { settings, updateSettings, inventory } = usePosStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [rowsPerPage] = useRowsPerPage();
  const [page, setPage] = useState(1);
  const categories = settings.productCategories ?? [];
  const totalPages = Math.max(1, Math.ceil(categories.length / rowsPerPage));
  const visibleCategories = categories.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  React.useEffect(() => setPage(1), [categories.length, rowsPerPage]);

  const addCategory = async () => {
    const category = name.trim();
    if (!category) return;
    const next = Array.from(new Set([...categories, category])).sort();
    await updateSettings({ ...settings, productCategories: next });
    setName('');
    setOpen(false);
  };

  const removeCategory = async (category: string) => {
    const inUse = inventory.some((item) => item.category === category);
    if (inUse) return;
    await updateSettings({
      ...settings,
      productCategories: categories.filter((item) => item !== category),
    });
  };

  return (
    <AppLayout title="Categories" subtitle="Manage product categories used when adding inventory">
      <PermissionGate permission="categories">
        <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
          <section className="rounded-xl border border-border bg-card shadow-card">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Tags size={16} className="text-primary" />
                <span className="text-sm font-semibold">Product Categories</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90"
              >
                <Plus size={14} />
                Add Category
              </button>
            </div>
            <div className="divide-y divide-border">
              {categories.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No categories yet. Add your first product category.
                </div>
              ) : (
                visibleCategories.map((category) => {
                  const count = inventory.filter((item) => item.category === category).length;
                  const inUse = count > 0;
                  return (
                    <div
                      key={category}
                      className="flex items-center justify-between gap-4 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-foreground">{category}</p>
                        <p className="text-xs text-muted-foreground">
                          {count} product{count === 1 ? '' : 's'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeCategory(category)}
                        disabled={inUse}
                        className="inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-semibold text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
                        title={inUse ? 'Category is in use' : 'Delete category'}
                      >
                        <Trash2 size={13} />
                        Delete
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <ListPagination
              page={Math.min(page, totalPages)}
              totalItems={categories.length}
              rowsPerPage={rowsPerPage}
              onPageChange={setPage}
            />
          </section>
        </div>

        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Add Category"
          subtitle="This category will appear in the Add Product dropdown."
          size="sm"
          footer={
            <>
              <button
                type="button"
                onClick={() => setOpen(false)}
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
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addCategory();
                }
              }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="e.g. Cosmetics"
              autoFocus
            />
          </label>
        </Modal>
      </PermissionGate>
    </AppLayout>
  );
}
