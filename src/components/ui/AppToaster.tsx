'use client';

import { Toaster } from 'sonner';

export default function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: 'border border-border bg-card text-foreground shadow-modal',
          title: 'text-sm font-semibold',
          description: 'text-xs text-muted-foreground',
          actionButton: 'bg-primary text-white',
          cancelButton: 'bg-muted text-foreground',
        },
      }}
    />
  );
}
