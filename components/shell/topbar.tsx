'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Menu, Search as SearchIcon, Bell, Plus, LogOut, Settings } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, getInitials } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { DateRangePicker, type DateRangeValue } from './date-range-picker';
import { openMobileNav } from './sidebar';
import type { Insight } from '@/lib/types';

interface TopbarUser {
  name: string;
  email: string;
  role: string;
}

interface SearchResult {
  type: string;
  id: string;
  label: string;
  sublabel: string;
}

function searchResultHref(result: SearchResult): string {
  switch (result.type) {
    case 'customer':
      return `/customers/${result.id}`;
    case 'product':
      return `/products/${result.id}`;
    case 'sale':
      return `/sales/${result.id}`;
    case 'invoice':
      return `/invoices/${result.id}`;
    case 'supplier':
      return `/suppliers/${result.id}`;
    case 'task':
      return `/tasks?taskId=${result.id}`;
    default:
      return '#';
  }
}

// Convention: these links carry a `?new=1`-style query param that the corresponding list
// page (built elsewhere) can watch for on load to auto-open its own "create" modal.
const QUICK_ADD_ITEMS = [
  { label: 'New sale', href: '/sales?new=1' },
  { label: 'New invoice', href: '/invoices?new=1' },
  { label: 'New expense', href: '/expenses?new=1' },
  { label: 'New task', href: '/tasks?new=1' },
];

const DEFAULT_RANGE_DAYS = 30;

export function Topbar({ user }: { user: TopbarUser }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ---- global search ----
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error?.message ?? 'Search failed.');
        setResults(body.results ?? []);
        setSearchError(null);
      } catch {
        setSearchError('Could not search right now.');
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  // ---- date range, synced to ?from=&to= on whatever page is currently mounted ----
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const dateRange: DateRangeValue =
    from && to
      ? { from, to }
      : {
          from: new Date(Date.now() - DEFAULT_RANGE_DAYS * 86400000).toISOString().slice(0, 10),
          to: new Date().toISOString().slice(0, 10),
        };

  function handleDateRangeChange(next: DateRangeValue) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('from', next.from);
    params.set('to', next.to);
    router.push(`${pathname}?${params.toString()}`);
  }

  // ---- notifications ----
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  async function loadInsights() {
    setInsightsError(null);
    try {
      const res = await fetch('/api/copilot/insights');
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'Could not load insights.');
      setInsights((body.data ?? []).slice(0, 5));
    } catch {
      setInsightsError('Could not load insights.');
    }
  }

  useEffect(() => {
    loadInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const newInsightCount = insights?.filter((i) => i.status === 'new').length ?? 0;

  // ---- user menu ----
  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card px-4">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={() => openMobileNav()} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </Button>

      <Popover open={searchOpen && query.trim().length > 0} onOpenChange={setSearchOpen}>
        <PopoverAnchor asChild>
          <div className="relative w-full max-w-[10rem] sm:max-w-xs md:max-w-sm">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search..."
              className="pl-8"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              aria-label="Search customers, products, orders, invoices, suppliers, tasks"
            />
          </div>
        </PopoverAnchor>
        <PopoverContent align="start" className="w-80 p-1" onOpenAutoFocus={(e) => e.preventDefault()}>
          {searching ? (
            <div className="space-y-2 p-2">
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          ) : searchError ? (
            <p className="p-3 text-sm text-destructive">{searchError}</p>
          ) : results.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No results for &ldquo;{query.trim()}&rdquo;.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {results.map((r) => (
                <li key={`${r.type}-${r.id}`}>
                  <Link
                    href={searchResultHref(r)}
                    onClick={() => setSearchOpen(false)}
                    className="flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="truncate">{r.label}</span>
                    <Badge variant="outline" className="shrink-0 text-[10px] capitalize">
                      {r.type}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden sm:block">
          <DateRangePicker value={dateRange} onChange={handleDateRangeChange} />
        </div>

        <DropdownMenu
          onOpenChange={(open) => {
            if (open) loadInsights();
          }}
        >
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Bell className="h-4 w-4" />
              {newInsightCount > 0 ? (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Insights</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {insightsError ? (
              <p className="px-2 py-3 text-sm text-destructive">{insightsError}</p>
            ) : insights === null ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">Loading...</p>
            ) : insights.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">No new insights right now.</p>
            ) : (
              insights.slice(0, 3).map((insight) => (
                <DropdownMenuItem key={insight._id} asChild>
                  <Link href="/copilot?tab=insights" className="flex flex-col items-start gap-0.5 whitespace-normal">
                    <span className="text-sm font-medium">{insight.title}</span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">{insight.body}</span>
                  </Link>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/copilot?tab=insights" className="justify-center text-sm font-medium text-primary">
                View all insights
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Quick add</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {QUICK_ADD_ITEMS.map((item) => (
              <DropdownMenuItem key={item.href} asChild>
                <Link href={item.href}>{item.label}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-0.5">
                <span className="text-sm font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                <span className="text-xs capitalize text-muted-foreground">{user.role}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="gap-2 text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
