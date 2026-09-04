'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Download, FileText, Lock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { REPORT_TYPES, type GeneratedReport, type Paginated, type PublicUser, type ReportType } from '@/lib/types';

function canViewFinancialsClient(role: string): boolean {
  return role === 'owner' || role === 'manager' || role === 'accountant';
}

// Mirrors FINANCIAL_REPORT_TYPES in app/api/reports/[type]/route.ts — used to disable the
// "Generate" action for roles that would get a 403 rather than let them hit that error.
const FINANCIAL_REPORT_TYPES = new Set<ReportType>([
  'profit-loss',
  'revenue',
  'expenses',
  'cash-flow',
  'aging-receivable',
  'aging-payable',
  'top-customers',
]);

const REPORT_META: Record<ReportType, { label: string; description: string }> = {
  'profit-loss': { label: 'Profit & Loss', description: 'Revenue, COGS, and net profit for a period.' },
  revenue: { label: 'Revenue', description: 'Revenue and expenses by period.' },
  expenses: { label: 'Expenses', description: 'Expense breakdown by category.' },
  'cash-flow': { label: 'Cash Flow', description: 'Cash in vs. cash out by period.' },
  'aging-receivable': { label: 'Accounts Receivable Aging', description: 'Outstanding customer invoices, grouped by age.' },
  'aging-payable': { label: 'Accounts Payable Aging', description: 'Outstanding supplier bills, grouped by age.' },
  'top-products': { label: 'Top Products', description: 'Best-selling products by revenue.' },
  'top-customers': { label: 'Top Customers', description: 'Highest-spending customers.' },
  sales: { label: 'Sales', description: 'Individual sales orders for a period.' },
  inventory: { label: 'Inventory', description: 'Current stock levels and valuation.' },
};

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 86400000);
  return { from: format(from, 'yyyy-MM-dd'), to: format(to, 'yyyy-MM-dd') };
}

export default function ReportsPage() {
  const [me, setMe] = useState<PublicUser | null>(null);
  const [configType, setConfigType] = useState<ReportType | null>(null);
  const [dialogFrom, setDialogFrom] = useState(defaultRange().from);
  const [dialogTo, setDialogTo] = useState(defaultRange().to);
  const [dialogFormat, setDialogFormat] = useState<'json' | 'csv' | 'pdf'>('csv');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [jsonRows, setJsonRows] = useState<Record<string, unknown>[] | null>(null);

  const [history, setHistory] = useState<Paginated<GeneratedReport> | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((body: { user: PublicUser | null }) => {
        if (body.user) setMe(body.user);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    fetch(`/api/reports?page=${historyPage}&limit=10&sort=generatedAt&order=desc`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load report history.');
        return (await res.json()) as Paginated<GeneratedReport>;
      })
      .then((body) => {
        if (!cancelled) setHistory(body);
      })
      .catch((err) => {
        if (!cancelled) setHistoryError(err instanceof Error ? err.message : 'Could not load report history.');
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [historyPage, refreshKey]);

  const role = me?.role ?? 'staff';
  const canViewFinancials = canViewFinancialsClient(role);

  function openConfig(type: ReportType) {
    const range = defaultRange();
    setConfigType(type);
    setDialogFrom(range.from);
    setDialogTo(range.to);
    setDialogFormat('csv');
    setGenerateError(null);
    setJsonRows(null);
  }

  async function handleGenerate() {
    if (!configType) return;
    setGenerating(true);
    setGenerateError(null);
    setJsonRows(null);

    const params = new URLSearchParams({
      from: new Date(dialogFrom).toISOString(),
      to: new Date(`${dialogTo}T23:59:59.999`).toISOString(),
      format: dialogFormat,
    });
    const url = `/api/reports/${configType}?${params.toString()}`;

    try {
      if (dialogFormat === 'json') {
        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error?.message ?? 'Could not generate this report.');
        }
        const rows = (await res.json()) as Record<string, unknown>[];
        setJsonRows(rows);
      } else {
        window.open(url, '_blank');
      }
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Could not generate this report.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">Generate and download reports, or view them as data.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORT_TYPES.map((type) => {
          const meta = REPORT_META[type];
          const locked = FINANCIAL_REPORT_TYPES.has(type) && !canViewFinancials;
          return (
            <Card key={type}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  {meta.label}
                </CardTitle>
                <CardDescription>{meta.description}</CardDescription>
              </CardHeader>
              <CardContent>
                {locked ? (
                  <Button variant="outline" size="sm" disabled className="gap-1.5">
                    <Lock className="h-3.5 w-3.5" /> Requires financial access
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => openConfig(type)}>
                    Configure &amp; generate
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Report history</CardTitle>
          <CardDescription>Previously generated reports.</CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : historyError ? (
            <ErrorState message={historyError} onRetry={() => setRefreshKey((k) => k + 1)} />
          ) : !history || history.data.length === 0 ? (
            <EmptyState icon={FileText} title="No reports generated yet" description="Generate a report above and it will show up here." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead>Date range</TableHead>
                    <TableHead>Generated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.data.map((r) => (
                    <TableRow key={r._id}>
                      <TableCell>{REPORT_META[r.type]?.label ?? r.type}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.format.toUpperCase()}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs tabular-nums">
                        {format(new Date(r.from), 'MMM d, yyyy')} – {format(new Date(r.to), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="font-mono text-xs tabular-nums">
                        {format(new Date(r.generatedAt), 'MMM d, yyyy h:mm a')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {history && history.pagination.totalPages > 1 ? (
            <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Page {history.pagination.page} of {history.pagination.totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={historyPage <= 1} onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={historyPage >= history.pagination.totalPages}
                  onClick={() => setHistoryPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={configType !== null} onOpenChange={(open) => !open && setConfigType(null)}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{configType ? REPORT_META[configType].label : ''}</DialogTitle>
            <DialogDescription>Choose a date range and format, then generate.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="report-from">From</Label>
                <Input id="report-from" type="date" value={dialogFrom} onChange={(e) => setDialogFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="report-to">To</Label>
                <Input id="report-to" type="date" value={dialogTo} onChange={(e) => setDialogTo(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Format</Label>
                <Select value={dialogFormat} onValueChange={(v) => setDialogFormat(v as 'json' | 'csv' | 'pdf')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="json">JSON (view here)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {generateError ? <p className="text-sm text-destructive">{generateError}</p> : null}
            {jsonRows ? (
              jsonRows.length === 0 ? (
                <EmptyState title="No rows" description="No data for this date range." />
              ) : (
                <div className="max-h-80 overflow-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {Object.keys(jsonRows[0]).map((col) => (
                          <TableHead key={col}>{col}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jsonRows.map((row, i) => (
                        <TableRow key={i}>
                          {Object.values(row).map((v, j) => (
                            <TableCell key={j} className="text-xs">
                              {v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfigType(null)} disabled={generating}>
              Close
            </Button>
            <Button onClick={handleGenerate} disabled={generating} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              {generating ? 'Generating...' : dialogFormat === 'json' ? 'Load data' : 'Download'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
