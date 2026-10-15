'use client';

import React, { useMemo } from 'react';
import NiceSelect from './NiceSelect';

function formatTimeLabel(value: string): string {
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const hour12 = hour % 12 || 12;
  const meridiem = hour < 12 ? 'AM' : 'PM';
  return `${value} (${hour12}:${minuteText} ${meridiem})`;
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
  const options = useMemo(
    () => [
      { value: '', label: placeholder },
      ...Array.from({ length: 24 * 60 }, (_, minute) => {
        const hour = Math.floor(minute / 60);
        const minuteOfHour = minute % 60;
        const time = `${String(hour).padStart(2, '0')}:${String(minuteOfHour).padStart(2, '0')}`;
        return { value: time, label: formatTimeLabel(time) };
      }),
    ],
    [placeholder]
  );

  return (
    <div className={disabled ? 'pointer-events-none opacity-60' : undefined}>
      <NiceSelect value={value} options={options} onChange={onChange} placeholder={placeholder} />
    </div>
  );
}
