'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

/**
 * Lightweight searchable dropdown built from Popover + Input (no Command/cmdk lib available).
 * Debounces the query, fetches `fetchUrl(query)`, and renders results via `renderItem`.
 */
export function SearchCombobox<T>({
  placeholder,
  fetchUrl,
  renderItem,
  getKey,
  onSelect,
  triggerLabel,
  disabled,
}: {
  placeholder: string;
  fetchUrl: (query: string) => string;
  renderItem: (item: T) => React.ReactNode;
  getKey: (item: T) => string;
  onSelect: (item: T) => void;
  triggerLabel: React.ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetch(fetchUrl(query))
        .then((r) => r.json())
        .then((data) => setResults(data.data ?? []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            'flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          <span className="truncate">{triggerLabel}</span>
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-2" align="start">
        <Input
          autoFocus
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-2"
        />
        <ScrollArea className="max-h-56">
          {loading ? (
            <p className="p-2 text-sm text-muted-foreground">Searching…</p>
          ) : results.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">No results.</p>
          ) : (
            <div className="space-y-0.5">
              {results.map((item) => (
                <button
                  key={getKey(item)}
                  type="button"
                  className="block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    onSelect(item);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  {renderItem(item)}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
