'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface NiceSelectOption<T extends string = string> {
  value: T;
  label: string;
}

interface NiceSelectProps<T extends string = string> {
  value: T;
  options: NiceSelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  className?: string;
}

export default function NiceSelect<T extends string = string>({
  value,
  options,
  onChange,
  placeholder = 'Select',
  className = '',
}: NiceSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  return (
    <div ref={ref} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        onClick={() => {
          if (!open && ref.current) {
            const rect = ref.current.getBoundingClientRect();
            setDropUp(window.innerHeight - rect.bottom < 280 && rect.top > 280);
          }
          setOpen((current) => !current);
        }}
        className="flex h-10 w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 text-left text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? 'truncate' : 'truncate text-muted-foreground'}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className={`absolute left-0 right-0 z-50 max-h-64 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-modal ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  active
                    ? 'bg-primary/12 font-semibold text-primary'
                    : 'text-foreground hover:bg-muted'
                }`}
              >
                <span className="truncate">{option.label}</span>
                {active && <Check size={15} className="shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
