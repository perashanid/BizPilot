import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { ok, withErrorHandling } from '@/lib/api-helpers';
import { getDocOr404 } from '@/lib/repo';
import { col, COLLECTIONS } from '@/lib/db';
import type { Product, Sale } from '@/lib/types';

export const runtime = 'nodejs';

interface MonthlySalesRow {
  month: string;
  unitsSold: number;
  revenue: number;
}

export const GET = withErrorHandling(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  await getDocOr404<Product>(COLLECTIONS.products, session.businessId, params.id, 'Product');

  const salesCol = await col<Sale>(COLLECTIONS.sales);
  const rows = await salesCol
    .aggregate<MonthlySalesRow>([
      {
        $match: {
          businessId: session.businessId,
          status: { $in: ['confirmed', 'fulfilled'] },
          'lineItems.productId': params.id,
        },
      },
      { $unwind: '$lineItems' },
      { $match: { 'lineItems.productId': params.id } },
      {
        $addFields: {
          month: { $dateToString: { format: '%Y-%m', date: { $dateFromString: { dateString: '$date' } } } },
        },
      },
      {
        $group: {
          _id: '$month',
          unitsSold: { $sum: '$lineItems.qty' },
          revenue: { $sum: '$lineItems.lineTotal' },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, month: '$_id', unitsSold: 1, revenue: 1 } },
    ])
    .toArray();

  return ok(rows);
});
