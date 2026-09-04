'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarRange } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface DateRangeValue {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const PRESETS: { label: string; days: number | 'ytd' }[] = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'This year', days: 'ytd' },
];

/**
 * Generic date-range control: controlled purely by `value`/`onChange`. The convention for
 * syncing this to the URL (?from=&to=) lives in the consumer (components/shell/topbar.tsx),
 * so any server component can read the same query params.
 */
export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(value.from);
  const [draftTo, setDraftTo] = useState(value.to);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setDraftFrom(value.from);
      setDraftTo(value.to);
    }
  }

  function applyPreset(days: number | 'ytd') {
    const now = new Date();
    const to = isoDate(now);
    const from =
      days === 'ytd' ? isoDate(new Date(now.getFullYear(), 0, 1)) : isoDate(new Date(now.getTime() - days * 86400000));
    onChange({ from, to });
    setOpen(false);
  }

  function applyCustom() {
    if (!draftFrom || !draftTo || draftFrom > draftTo) return;
    onChange({ from: draftFrom, to: draftTo });
    setOpen(false);
  }

  let label = 'Select dates';
  try {
    label = `${format(new Date(value.from), 'MMM d, yyyy')} – ${format(new Date(value.to), 'MMM d, yyyy')}`;
  } catch {
    // keep fallback label on an unparsable value
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <CalendarRange className="h-4 w-4" />
          <span className="hidden lg:inline">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((preset) => (
            <Button key={preset.label} variant="secondary" size="sm" onClick={() => applyPreset(preset.days)}>
              {preset.label}
            </Button>
          ))}
        </div>
        <div className="space-y-2 border-t border-border pt-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="date-range-from" className="text-xs">
                From
              </Label>
              <Input
                id="date-range-from"
                type="date"
                value={draftFrom}
                max={draftTo}
                onChange={(e) => setDraftFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="date-range-to" className="text-xs">
                To
              </Label>
              <Input
                id="date-range-to"
                type="date"
                value={draftTo}
                min={draftFrom}
                onChange={(e) => setDraftTo(e.target.value)}
              />
            </div>
          </div>
          <Button size="sm" className="w-full" onClick={applyCustom}>
            Apply custom range
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
