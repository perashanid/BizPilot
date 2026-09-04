import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { parseJson, parseQuery, ok, withErrorHandling } from '@/lib/api-helpers';
import { listDocs } from '@/lib/repo';
import { createSale } from '@/lib/sales';
import { recordAudit } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/db';
import { zSaleInput, type Sale } from '@/lib/types';

export const runtime = 'nodejs';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  const query = parseQuery(req.nextUrl.searchParams);
  const searchParams = req.nextUrl.searchParams;
  const extraFilter: Record<string, unknown> = {};
  const status = searchParams.get('status');
  if (status) extraFilter.status = status;
  const customerId = searchParams.get('customerId');
  if (customerId) extraFilter.customerId = customerId;

  const result = await listDocs<Sale>(COLLECTIONS.sales, {
    businessId: session.businessId,
    ...query,
    searchFields: ['orderNumber'],
    extraFilter,
  });
  return ok(result);
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  const input = await parseJson(req, zSaleInput);
  const sale = await createSale(session.businessId, session.userId, input);
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'create',
    entityType: COLLECTIONS.sales,
    entityId: sale._id,
    after: sale,
  });
  return ok(sale, 201);
});
