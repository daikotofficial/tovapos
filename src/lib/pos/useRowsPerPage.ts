'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePosStore } from './PosStoreProvider';

export const ROWS_PER_PAGE_OPTIONS = [10, 20, 50, 100] as const;
const DEFAULT_ROWS_PER_PAGE = 10;
const ROWS_PER_PAGE_EVENT = 'tovapos:rows-per-page-changed';

function validRowsPerPage(value: number): number {
  return ROWS_PER_PAGE_OPTIONS.includes(value as (typeof ROWS_PER_PAGE_OPTIONS)[number])
    ? value
    : DEFAULT_ROWS_PER_PAGE;
}

export function useRowsPerPage(): [number, (value: number) => void] {
  const { tenant } = usePosStore();
  const storageKey = useMemo(
    () => `tovapos.${tenant?.id ?? 'anonymous'}.rowsPerPage`,
    [tenant?.id]
  );
  const [rowsPerPage, setRowsPerPageState] = useState(DEFAULT_ROWS_PER_PAGE);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(storageKey));
    if (Number.isFinite(stored)) setRowsPerPageState(validRowsPerPage(stored));

    const handleChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ key?: string; value?: number }>;
      if (customEvent.detail?.key === storageKey && typeof customEvent.detail.value === 'number') {
        setRowsPerPageState(validRowsPerPage(customEvent.detail.value));
      }
    };
    window.addEventListener(ROWS_PER_PAGE_EVENT, handleChange);
    return () => window.removeEventListener(ROWS_PER_PAGE_EVENT, handleChange);
  }, [storageKey]);

  const setRowsPerPage = (value: number) => {
    const next = validRowsPerPage(value);
    window.localStorage.setItem(storageKey, String(next));
    setRowsPerPageState(next);
    window.dispatchEvent(
      new CustomEvent(ROWS_PER_PAGE_EVENT, { detail: { key: storageKey, value: next } })
    );
  };

  return [rowsPerPage, setRowsPerPage];
}
