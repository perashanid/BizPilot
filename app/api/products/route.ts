import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { parseJson, parseQuery, ok, withErrorHandling } from '@/lib/api-helpers';
import { listDocs, insertDoc } from '@/lib/repo';
import { recordAudit } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/db';
import { zProductInput, type Product } from '@/lib/types';

export const runtime = 'nodejs';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  const query = parseQuery(req.nextUrl.searchParams);
  const category = req.nextUrl.searchParams.get('category') || undefined;
  const status = req.nextUrl.searchParams.get('status') || undefined;
  const extraFilter: Record<string, unknown> = {};
  if (category) extraFilter.category = category;
  if (status) extraFilter.status = status;

  const result = await listDocs<Product>(COLLECTIONS.products, {
    businessId: session.businessId,
    ...query,
    searchFields: ['name', 'sku', 'barcode', 'category'],
    extraFilter,
  });
  return ok(result);
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  const input = await parseJson(req, zProductInput);
  const product = await insertDoc<Product>(COLLECTIONS.products, session.businessId, input);
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'create',
    entityType: COLLECTIONS.products,
    entityId: product._id,
    after: product,
  });
  return ok(product, 201);
});
