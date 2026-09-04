import { NextRequest } from 'next/server';
import { requireSession, canViewFinancials } from '@/lib/auth';
import { ok, withErrorHandling, ApiValidationError } from '@/lib/api-helpers';
import { col, COLLECTIONS } from '@/lib/db';
import {
  getProfitLoss,
  getCurrentCashPosition,
  getReceivablesAging,
  getCashFlowProjection,
} from '@/lib/financials';
import type { Product } from '@/lib/types';

export const runtime = 'nodejs';

function resolveRange(searchParams: URLSearchParams): { from: string; to: string } {
  const to = searchParams.get('to') ?? new Date().toISOString();
  const from = searchParams.get('from') ?? new Date(Date.now() - 30 * 86400000).toISOString();
  if (from > to) throw new ApiValidationError({ from: 'Start date must be before end date.' });
  return { from, to };
}

/** Counts products that track inventory and whose available quantity across all locations is at or below reorder point. */
async function getLowStockCount(businessId: string): Promise<number> {
  const products = await col<Product>(COLLECTIONS.products);
  const rows = await products
    .aggregate<{ count: number }>([
      { $match: { businessId, trackInventory: true, status: 'active' } },
      {
        $lookup: {
          from: COLLECTIONS.inventory,
          let: { pid: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $and: [{ $eq: ['$productId', '$$pid'] }, { $eq: ['$businessId', businessId] }] },
              },
            },
            { $group: { _id: null, available: { $sum: { $subtract: ['$quantityOnHand', '$quantityReserved'] } } } },
          ],
          as: 'inv',
        },
      },
      { $addFields: { available: { $ifNull: [{ $first: '$inv.available' }, 0] } } },
      { $match: { $expr: { $lte: ['$available', '$reorderPoint'] } } },
      { $count: 'count' },
    ])
    .toArray();
  return rows[0]?.count ?? 0;
}

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  const { from, to } = resolveRange(req.nextUrl.searchParams);

  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  const lengthMs = Math.max(1, toMs - fromMs);
  const priorFrom = new Date(fromMs - lengthMs).toISOString();
  const priorTo = new Date(fromMs).toISOString();

  if (!canViewFinancials(session.role)) {
    const lowStockCount = await getLowStockCount(session.businessId);
    return ok({ lowStockCount });
  }

  const [current, prior, cashPosition, receivables, lowStockCount, cashFlowProjection] = await Promise.all([
    getProfitLoss(session.businessId, { from, to }),
    getProfitLoss(session.businessId, { from: priorFrom, to: priorTo }),
    getCurrentCashPosition(session.businessId),
    getReceivablesAging(session.businessId),
    getLowStockCount(session.businessId),
    getCashFlowProjection(session.businessId),
  ]);

  return ok({
    profitLoss: { current, prior },
    cashPosition,
    receivablesSummary: receivables.summary,
    lowStockCount,
    cashFlowProjection,
  });
});
