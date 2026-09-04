import { NextRequest } from 'next/server';
import { Filter, Sort } from 'mongodb';
import { requireSession, AuthError, canEditFinancials } from '@/lib/auth';
import { parseJson, parseQuery, ok, withErrorHandling } from '@/lib/api-helpers';
import { listDocs } from '@/lib/repo';
import { col, COLLECTIONS } from '@/lib/db';
import { createInvoice, withDerivedStatus } from '@/lib/invoicing';
import { recordAudit } from '@/lib/audit';
import { zInvoiceInput, type Invoice } from '@/lib/types';

export const runtime = 'nodejs';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  const query = parseQuery(req.nextUrl.searchParams);
  const status = req.nextUrl.searchParams.get('status');

  // "overdue" is never stored — it's derived at read time. To filter by it we must fetch a
  // superset from Mongo (amountDue > 0 and not void), derive status in application code, filter
  // to exactly 'overdue', and recompute pagination against that filtered set.
  if (status === 'overdue') {
    const invoices = await col<Invoice>(COLLECTIONS.invoices);
    const filter: Record<string, unknown> = {
      businessId: session.businessId,
      amountDue: { $gt: 0 },
      status: { $ne: 'void' },
    };
    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.invoiceNumber = { $regex: escaped, $options: 'i' };
    }
    const sortField = query.sort || 'createdAt';
    const sort: Sort = { [sortField]: query.order === 'asc' ? 1 : -1 };
    const superset = await invoices
      .find(filter as unknown as Filter<Invoice>)
      .sort(sort)
      .toArray();
    const derived = superset.map(withDerivedStatus).filter((inv) => inv.status === 'overdue');

    const total = derived.length;
    const skip = (query.page - 1) * query.limit;
    const data = derived.slice(skip, skip + query.limit);
    return ok({
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    });
  }

  const extraFilter: Record<string, unknown> = {};
  if (status) extraFilter.status = status;

  const result = await listDocs<Invoice>(COLLECTIONS.invoices, {
    businessId: session.businessId,
    ...query,
    searchFields: ['invoiceNumber'],
    extraFilter,
  });
  return ok({ ...result, data: result.data.map(withDerivedStatus) });
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  if (!canEditFinancials(session.role)) {
    throw new AuthError('You do not have permission to create invoices.', 403, 'FORBIDDEN');
  }
  const input = await parseJson(req, zInvoiceInput);
  const invoice = await createInvoice(session.businessId, input);
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'create',
    entityType: COLLECTIONS.invoices,
    entityId: invoice._id,
    after: invoice,
  });
  return ok(invoice, 201);
});
