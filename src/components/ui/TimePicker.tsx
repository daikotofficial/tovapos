'use client';

import React, { useState } from 'react';

function formatTime(value: string): string {
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  if (!Number.isInteger(hour) || !/^\d{2}$/.test(minuteText ?? '')) return value;
  return `${hour % 12 || 12}:${minuteText} ${hour < 12 ? 'AM' : 'PM'}`;
}

function parseTime(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3]?.toUpperCase();
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    const hour24 = (hour % 12) + (meridiem === 'PM' ? 12 : 0);
    return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  if (hour > 23) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export default function TimePicker({
  value,
  onChange,
  placeholder = 'Select time',
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value ? formatTime(value) : '');

  return (
    <div>
      <input
        type="text"
        value={draft}
        disabled={disabled}
        placeholder={placeholder === 'Select time' ? 'e.g. 12:20 PM' : placeholder}
        inputMode="text"
        aria-label={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const parsed = parseTime(draft);
          if (parsed) {
            onChange(parsed);
            setDraft(formatTime(parsed));
          } else {
            setDraft(value ? formatTime(value) : '');
          }
        }}
        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}
