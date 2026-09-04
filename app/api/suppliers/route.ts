import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { parseJson, parseQuery, ok, withErrorHandling } from '@/lib/api-helpers';
import { listDocs, insertDoc } from '@/lib/repo';
import { recordAudit } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/db';
import { zSupplierInput, type Supplier } from '@/lib/types';

export const runtime = 'nodejs';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  const query = parseQuery(req.nextUrl.searchParams);
  const result = await listDocs<Supplier>(COLLECTIONS.suppliers, {
    businessId: session.businessId,
    ...query,
    searchFields: ['name', 'contactPerson', 'email'],
  });
  return ok(result);
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  const input = await parseJson(req, zSupplierInput);
  const supplier = await insertDoc<Supplier>(COLLECTIONS.suppliers, session.businessId, input);
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'create',
    entityType: COLLECTIONS.suppliers,
    entityId: supplier._id,
    after: supplier,
  });
  return ok(supplier, 201);
});
