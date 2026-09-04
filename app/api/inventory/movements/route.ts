import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { parseQuery, ok, withErrorHandling } from '@/lib/api-helpers';
import { getStockMovementHistory } from '@/lib/inventory';
import type { Paginated, StockMovement } from '@/lib/types';

export const runtime = 'nodejs';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  const query = parseQuery(req.nextUrl.searchParams);
  const productId = req.nextUrl.searchParams.get('productId') || undefined;

  const { data, total } = await getStockMovementHistory(session.businessId, productId, query.page, query.limit);

  const response: Paginated<StockMovement> = {
    data,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
  return ok(response);
});
