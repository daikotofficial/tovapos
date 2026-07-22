'use client';

import RowsPerPageSelect from './RowsPerPageSelect';

export default function ListPagination({
  page,
  totalItems,
  rowsPerPage,
  onPageChange,
}: {
  page: number;
  totalItems: number;
  rowsPerPage: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / rowsPerPage));
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/20 px-4 py-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <RowsPerPageSelect />
        <span>
          Showing {totalItems === 0 ? 0 : (page - 1) * rowsPerPage + 1}-
          {Math.min(page * rowsPerPage, totalItems)} of {totalItems}
        </span>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            className="rounded px-2 py-1 text-xs disabled:opacity-40"
          >
            Previous
          </button>
          <span className="px-2 text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="rounded px-2 py-1 text-xs disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
