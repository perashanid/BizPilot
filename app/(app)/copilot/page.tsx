'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { ChatPanel } from '@/components/copilot/chat-panel';
import { INSIGHT_SEVERITIES, type Insight, type InsightSeverity } from '@/lib/types';

// Mirrors app/(app)/dashboard/page.tsx's severityBadgeVariant, kept identical for a consistent
// severity -> badge-color mapping across the app.
function severityBadgeVariant(severity: InsightSeverity): 'destructive' | 'warning' | 'secondary' {
  if (severity === 'critical') return 'destructive';
  if (severity === 'warning') return 'warning';
  return 'secondary';
}

type ActionDecision = 'execute' | 'dismiss' | 'snooze';

export default function CopilotPage() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'insights' ? 'insights' : 'chat';
  const [tab, setTab] = useState(initialTab);

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Copilot</h1>
        <p className="text-sm text-muted-foreground">Ask questions about your business, or review its suggestions.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="w-fit">
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>
        <TabsContent value="chat" className="min-h-0 flex-1">
          <Card className="flex h-full min-h-0 flex-col overflow-hidden">
            <ChatPanel variant="page" />
          </Card>
        </TabsContent>
        <TabsContent value="insights" className="min-h-0 flex-1 overflow-y-auto">
          <InsightsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InsightsTab() {
  const { toast } = useToast();
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'all' | InsightSeverity>('all');
  const [statusFilter, setStatusFilter] = useState<'default' | 'all'>('default');
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (statusFilter === 'all') params.set('status', 'all');
    if (severityFilter !== 'all') params.set('severity', severityFilter);

    fetch(`/api/copilot/insights?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load insights.');
        const body = (await res.json()) as { data: Insight[] };
        return body.data;
      })
      .then((data) => {
        if (!cancelled) setInsights(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load insights.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [severityFilter, statusFilter, refreshKey]);

  async function handleAction(insight: Insight, decision: ActionDecision) {
    const snapshot = insights;
    setBusyIds((b) => ({ ...b, [insight._id]: true }));
    // Optimistic: the user has handled this insight, so remove it from view immediately.
    setInsights((prev) => (prev ? prev.filter((i) => i._id !== insight._id) : prev));

    try {
      const res = await fetch(`/api/copilot/insights/${insight._id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? 'Could not complete this action.');
      }
      toast({
        title: decision === 'execute' ? 'Action executed' : decision === 'dismiss' ? 'Insight dismissed' : 'Insight snoozed',
        variant: 'success',
      });
    } catch (err) {
      setInsights(snapshot);
      toast({
        title: 'Could not complete this action',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setBusyIds((b) => {
        const next = { ...b };
        delete next[insight._id];
        return next;
      });
    }
  }

  return (
    <div className="space-y-4 py-1">
      <div className="flex flex-wrap gap-3">
        <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v as 'all' | InsightSeverity)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            {INSIGHT_SEVERITIES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'default' | 'all')}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Active (excludes dismissed)</SelectItem>
            <SelectItem value="all">All (including dismissed)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={() => setRefreshKey((k) => k + 1)} />
      ) : !insights || insights.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No insights right now"
          description="Copilot will surface things worth your attention here as data comes in."
        />
      ) : (
        <div className="space-y-3">
          {insights.map((insight) => (
            <InsightCard key={insight._id} insight={insight} busy={Boolean(busyIds[insight._id])} onAction={handleAction} />
          ))}
        </div>
      )}
    </div>
  );
}

function InsightCard({
  insight,
  busy,
  onAction,
}: {
  insight: Insight;
  busy: boolean;
  onAction: (insight: Insight, decision: ActionDecision) => void;
}) {
  const dataEntries = Object.entries(insight.data ?? {}).filter(
    ([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-sm font-semibold">{insight.title}</CardTitle>
          <Badge variant={severityBadgeVariant(insight.severity)}>{insight.severity}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{insight.body}</p>
        {dataEntries.length > 0 ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-muted/50 p-2.5 text-xs sm:grid-cols-3">
            {dataEntries.map(([key, value]) => (
              <div key={key} className="flex flex-col">
                <dt className="text-muted-foreground">{key}</dt>
                <dd className="font-mono tabular-nums">{String(value)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {insight.status === 'dismissed' ? (
          <p className="text-xs text-muted-foreground">Dismissed</p>
        ) : insight.status === 'snoozed' ? (
          <p className="text-xs text-muted-foreground">Snoozed{insight.snoozedUntil ? ` until ${insight.snoozedUntil.slice(0, 10)}` : ''}</p>
        ) : insight.status === 'accepted' ? (
          <p className="text-xs text-success">Accepted</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {insight.suggestedAction.type !== 'none' ? (
              <Button size="sm" onClick={() => onAction(insight, 'execute')} disabled={busy}>
                {insight.suggestedAction.label || 'Execute'}
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => onAction(insight, 'snooze')} disabled={busy}>
              Snooze
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onAction(insight, 'dismiss')} disabled={busy}>
              Dismiss
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
