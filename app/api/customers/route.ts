import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { parseJson, parseQuery, ok, withErrorHandling } from '@/lib/api-helpers';
import { listDocs, insertDoc } from '@/lib/repo';
import { recordAudit } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/db';
import { zCustomerInput, type Customer } from '@/lib/types';

export const runtime = 'nodejs';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  const query = parseQuery(req.nextUrl.searchParams);
  const result = await listDocs<Customer>(COLLECTIONS.customers, {
    businessId: session.businessId,
    ...query,
    searchFields: ['name', 'businessName', 'email'],
  });
  return ok(result);
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  const input = await parseJson(req, zCustomerInput);
  const customer = await insertDoc<Customer>(COLLECTIONS.customers, session.businessId, input);
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'create',
    entityType: COLLECTIONS.customers,
    entityId: customer._id,
    after: customer,
  });
  return ok(customer, 201);
});
