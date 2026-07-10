'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value: string): Date {
  if (!value) return new Date();
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function formatDisplay(value: string, placeholder: string): string {
  if (!value) return placeholder;
  return parseIsoDate(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  className = '',
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => parseIsoDate(value));
  const ref = useRef<HTMLDivElement | null>(null);
  const selectedDate = value ? parseIsoDate(value) : null;

  useEffect(() => {
    if (value) setCursor(parseIsoDate(value));
  }, [value]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const calendarDays = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const start = new Date(year, month, 1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [cursor]);

  const moveMonth = (delta: number) => {
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-full items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 text-left text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
      >
        <span className={value ? 'truncate' : 'truncate text-muted-foreground'}>
          {formatDisplay(value, placeholder)}
        </span>
        <Calendar size={16} className="shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[20rem] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-3 shadow-modal">
          <div className="mb-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <p className="text-sm font-semibold text-foreground">
              {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </p>
            <button
              type="button"
              onClick={() => moveMonth(1)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Next month"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => (
              <div
                key={day}
                className="flex h-7 items-center justify-center text-[11px] font-bold uppercase text-muted-foreground"
              >
                {day}
              </div>
            ))}
            {calendarDays.map((date) => {
              const iso = toIsoDate(date);
              const inMonth = date.getMonth() === cursor.getMonth();
              const active = selectedDate && iso === toIsoDate(selectedDate);
              const today = iso === toIsoDate(new Date());
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                  className={`flex h-9 items-center justify-center rounded-md text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : today
                        ? 'bg-primary/10 text-primary hover:bg-primary/15'
                        : inMonth
                          ? 'text-foreground hover:bg-muted'
                          : 'text-muted-foreground/45 hover:bg-muted/60'
                  }`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
