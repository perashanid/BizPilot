import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { ok, withErrorHandling } from '@/lib/api-helpers';
import { refreshInsights } from '@/lib/insights';
import type { Insight, InsightSeverity } from '@/lib/types';
import { INSIGHT_SEVERITIES } from '@/lib/types';

export const runtime = 'nodejs';

function isInsightSeverity(value: string): value is InsightSeverity {
  return (INSIGHT_SEVERITIES as readonly string[]).includes(value);
}

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  const insights = await refreshInsights(session.businessId);

  const statusParam = req.nextUrl.searchParams.get('status');
  const severityParam = req.nextUrl.searchParams.get('severity');

  let filtered: Insight[] = insights;
  if (statusParam !== 'all') {
    filtered = filtered.filter((i) => i.status !== 'dismissed');
  }
  if (severityParam && isInsightSeverity(severityParam)) {
    filtered = filtered.filter((i) => i.severity === severityParam);
  }

  return ok({ data: filtered });
});
