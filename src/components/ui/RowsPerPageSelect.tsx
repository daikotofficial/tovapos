'use client';

import NiceSelect from './NiceSelect';
import { ROWS_PER_PAGE_OPTIONS, useRowsPerPage } from '@/lib/pos/useRowsPerPage';

export default function RowsPerPageSelect({ className = 'w-24' }: { className?: string }) {
  const [rowsPerPage, setRowsPerPage] = useRowsPerPage();
  return (
    <div className="flex items-center gap-1.5">
      <span className="whitespace-nowrap text-xs text-muted-foreground">Rows:</span>
      <NiceSelect
        value={String(rowsPerPage)}
        onChange={(value) => setRowsPerPage(Number(value))}
        className={className}
        options={ROWS_PER_PAGE_OPTIONS.map((value) => ({
          value: String(value),
          label: String(value),
        }))}
      />
    </div>
  );
}
