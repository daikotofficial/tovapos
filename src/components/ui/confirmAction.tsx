'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface ConfirmActionOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning';
}

export function confirmAction({
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
}: ConfirmActionOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const toastId = toast.custom(
      () => (
        <div className="w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-border bg-card p-4 text-foreground shadow-modal">
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'
              }`}
            >
              <AlertTriangle size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                toast.dismiss(toastId);
                resolve(false);
              }}
              className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                toast.dismiss(toastId);
                resolve(true);
              }}
              className={`rounded-lg px-3 py-2 text-xs font-semibold text-white ${
                tone === 'danger' ? 'bg-danger' : 'bg-warning'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      ),
      { duration: Infinity }
    );
  });
}
