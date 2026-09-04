import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { parseQuery, ok, withErrorHandling } from '@/lib/api-helpers';
import { listDocs } from '@/lib/repo';
import { COLLECTIONS } from '@/lib/db';
import type { GeneratedReport } from '@/lib/types';

export const runtime = 'nodejs';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  const query = parseQuery(req.nextUrl.searchParams);
  const result = await listDocs<GeneratedReport>(COLLECTIONS.generatedReports, {
    businessId: session.businessId,
    ...query,
  });
  return ok(result);
});
