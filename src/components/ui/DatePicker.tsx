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

function normalizeTypedDate(value: string): string | null {
  const trimmed = value.trim();
  const iso = /^(\d{4})[-\/]?(\d{1,2})[-\/]?(\d{1,2})$/.exec(trimmed);
  const dayFirst = /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/.exec(trimmed);
  const parts = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : dayFirst
      ? [Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1])]
      : null;
  if (!parts) return null;
  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day)
    return null;
  return toIsoDate(date);
}

export default function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  className = '',
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [cursor, setCursor] = useState(() => parseIsoDate(value));
  const ref = useRef<HTMLDivElement | null>(null);
  const selectedDate = value ? parseIsoDate(value) : null;
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    setInputValue(value);
    if (value) setCursor(parseIsoDate(value));
  }, [value]);

  const commitInput = () => {
    const next = normalizeTypedDate(inputValue);
    if (!next) {
      setInputValue(value);
      return;
    }
    setInputValue(next);
    setCursor(parseIsoDate(next));
    onChange(next);
  };

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

  const toggleOpen = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setDropUp(window.innerHeight - rect.bottom < 340 && rect.top > 340);
    }
    setOpen((current) => !current);
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div className="flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 shadow-sm transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25">
        <input
          type="text"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onBlur={commitInput}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitInput();
            }
          }}
          inputMode="numeric"
          autoComplete="off"
          placeholder="YYYY-MM-DD"
          aria-label={placeholder}
          className="min-w-0 flex-1 select-text touch-manipulation bg-transparent text-base sm:text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={toggleOpen}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Open date calendar"
        >
          <Calendar size={16} />
        </button>
      </div>

      {open && (
        <div
          className={`absolute right-0 z-50 w-[20rem] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-3 shadow-modal sm:left-0 sm:right-auto ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex min-w-0 items-center justify-center gap-2">
              <p className="text-sm font-semibold text-foreground">
                {cursor.toLocaleDateString(undefined, { month: 'long' })}
              </p>
              <input
                type="number"
                value={cursor.getFullYear()}
                min={1900}
                max={2200}
                onChange={(event) => {
                  const year = Number(event.target.value);
                  if (!Number.isInteger(year) || year < 1) return;
                  setCursor((current) => new Date(year, current.getMonth(), 1));
                }}
                className="h-8 w-[4.5rem] rounded-md border border-border bg-background px-2 text-center text-sm font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
                aria-label="Calendar year"
              />
            </div>
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
                    setInputValue(iso);
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
