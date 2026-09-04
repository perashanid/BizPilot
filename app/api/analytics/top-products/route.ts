import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { ok, withErrorHandling, ApiValidationError } from '@/lib/api-helpers';
import { getTopProducts } from '@/lib/financials';

export const runtime = 'nodejs';

function resolveRange(searchParams: URLSearchParams): { from: string; to: string } {
  const to = searchParams.get('to') ?? new Date().toISOString();
  const from = searchParams.get('from') ?? new Date(Date.now() - 30 * 86400000).toISOString();
  if (from > to) throw new ApiValidationError({ from: 'Start date must be before end date.' });
  return { from, to };
}

function resolveLimit(searchParams: URLSearchParams): number {
  const raw = searchParams.get('limit');
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return 10;
  return Math.min(50, n);
}

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  const { from, to } = resolveRange(req.nextUrl.searchParams);
  const limit = resolveLimit(req.nextUrl.searchParams);
  const result = await getTopProducts(session.businessId, { from, to }, limit);
  return ok(result);
});
