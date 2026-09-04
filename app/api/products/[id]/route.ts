import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { parseJson, ok, withErrorHandling } from '@/lib/api-helpers';
import { getDocOr404, updateDocById } from '@/lib/repo';
import { recordAudit } from '@/lib/audit';
import { getAvailableQuantity } from '@/lib/inventory';
import { marginPercent } from '@/lib/money';
import { COLLECTIONS } from '@/lib/db';
import { zProductInput, type Product, type ProductWithStock } from '@/lib/types';

export const runtime = 'nodejs';

export const GET = withErrorHandling(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const product = await getDocOr404<Product>(COLLECTIONS.products, session.businessId, params.id, 'Product');
  const available = await getAvailableQuantity(session.businessId, product._id);
  const result: ProductWithStock = {
    ...product,
    available,
    margin: marginPercent(product.salePrice, product.costPrice),
  };
  return ok(result);
});

export const PATCH = withErrorHandling(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const before = await getDocOr404<Product>(COLLECTIONS.products, session.businessId, params.id, 'Product');
  const input = await parseJson(req, zProductInput.partial());
  const after = await updateDocById<Product>(
    COLLECTIONS.products,
    session.businessId,
    params.id,
    input,
    'Product'
  );
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'update',
    entityType: COLLECTIONS.products,
    entityId: params.id,
    before,
    after,
  });
  return ok(after);
});

export const DELETE = withErrorHandling(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const before = await getDocOr404<Product>(COLLECTIONS.products, session.businessId, params.id, 'Product');
  const after = await updateDocById<Product>(
    COLLECTIONS.products,
    session.businessId,
    params.id,
    { status: 'archived' },
    'Product'
  );
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'delete',
    entityType: COLLECTIONS.products,
    entityId: params.id,
    before,
    after,
  });
  return ok(after);
});
