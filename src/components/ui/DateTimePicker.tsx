'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Clock } from 'lucide-react';

const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function parseValue(value: string) {
  const [datePart, timePart = '00:00'] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  return {
    date: new Date(year || new Date().getFullYear(), (month || 1) - 1, day || 1),
    time: `${String(hours || 0).padStart(2, '0')}:${String(minutes || 0).padStart(2, '0')}`,
  };
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function DateTimePicker({
  value,
  onChange,
  placeholder = 'Select date and time',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const parsed = parseValue(value);
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [cursor, setCursor] = useState(parsed.date);
  const ref = useRef<HTMLDivElement>(null);
  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [cursor]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const update = (date: Date, time = parsed.time) => onChange(`${isoDate(date)}T${time}`);

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => {
          setCursor(parsed.date);
          if (!open && ref.current) {
            const rect = ref.current.getBoundingClientRect();
            setDropUp(window.innerHeight - rect.bottom < 340 && rect.top > 340);
          }
          setOpen((current) => !current);
        }}
        className="flex h-10 w-full items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 text-left text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
      >
        <span className={value ? 'truncate' : 'truncate text-muted-foreground'}>
          {value
            ? `${parsed.date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} · ${parsed.time}`
            : placeholder}
        </span>
        <Calendar size={16} className="shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div
          className={`absolute right-0 z-50 w-[20rem] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-3 shadow-modal sm:left-0 sm:right-auto ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() =>
                setCursor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
              }
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <p className="text-sm font-semibold">
              {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </p>
            <button
              type="button"
              onClick={() =>
                setCursor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
              }
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              aria-label="Next month"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {weekdays.map((day) => (
              <div
                key={day}
                className="flex h-7 items-center justify-center text-[11px] font-bold uppercase text-muted-foreground"
              >
                {day}
              </div>
            ))}
            {days.map((date) => {
              const selected = isoDate(date) === isoDate(parsed.date);
              const inMonth = date.getMonth() === cursor.getMonth();
              return (
                <button
                  type="button"
                  key={date.toISOString()}
                  onClick={() => update(date)}
                  className={`flex h-9 items-center justify-center rounded-md text-sm font-semibold ${selected ? 'bg-primary text-primary-foreground' : inMonth ? 'hover:bg-muted' : 'text-muted-foreground/45 hover:bg-muted/60'}`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <label className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-xs font-semibold">
            <Clock size={15} className="text-muted-foreground" />
            <span>Time</span>
            <input
              type="time"
              value={parsed.time}
              onChange={(event) => update(parsed.date, event.target.value)}
              className="ml-auto rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      )}
    </div>
  );
}
