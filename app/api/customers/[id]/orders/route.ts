import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { parseQuery, ok, withErrorHandling } from '@/lib/api-helpers';
import { getDocOr404, listDocs } from '@/lib/repo';
import { COLLECTIONS } from '@/lib/db';
import type { Customer, Sale } from '@/lib/types';

export const runtime = 'nodejs';

export const GET = withErrorHandling(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  await getDocOr404<Customer>(COLLECTIONS.customers, session.businessId, params.id, 'Customer');
  const query = parseQuery(req.nextUrl.searchParams);
  const result = await listDocs<Sale>(COLLECTIONS.sales, {
    businessId: session.businessId,
    ...query,
    extraFilter: { customerId: params.id },
  });
  return ok(result);
});
