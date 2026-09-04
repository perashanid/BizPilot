import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { parseQuery, ok, withErrorHandling } from '@/lib/api-helpers';
import { col, COLLECTIONS } from '@/lib/db';
import type { InventoryRecord, Paginated } from '@/lib/types';

export const runtime = 'nodejs';

interface InventoryRow extends InventoryRecord {
  productName: string;
  sku: string;
  reorderPoint: number;
  available: number;
  status: 'out' | 'low' | 'ok';
}

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  const query = parseQuery(req.nextUrl.searchParams);

  const matchStage: Record<string, unknown> = { businessId: session.businessId };
  const searchStage: Record<string, unknown>[] = [];
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    searchStage.push({
      $match: {
        $or: [
          { 'product.name': { $regex: escaped, $options: 'i' } },
          { 'product.sku': { $regex: escaped, $options: 'i' } },
        ],
      },
    });
  }

  const sortField = query.sort || 'productName';
  const sortDir = query.order === 'asc' ? 1 : -1;
  const skip = (query.page - 1) * query.limit;

  const inventoryCol = await col<InventoryRecord>(COLLECTIONS.inventory);
  const pipeline: Record<string, unknown>[] = [
    { $match: matchStage },
    {
      $lookup: {
        from: COLLECTIONS.products,
        let: { productId: '$productId' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$_id', '$$productId'] }, { $eq: ['$businessId', session.businessId] }] } } },
        ],
        as: 'product',
      },
    },
    { $unwind: '$product' },
    ...searchStage,
    {
      $addFields: {
        available: { $subtract: ['$quantityOnHand', '$quantityReserved'] },
      },
    },
    {
      $addFields: {
        status: {
          $switch: {
            branches: [
              { case: { $lte: ['$available', 0] }, then: 'out' },
              { case: { $lte: ['$available', '$product.reorderPoint'] }, then: 'low' },
            ],
            default: 'ok',
          },
        },
        productName: '$product.name',
        sku: '$product.sku',
        reorderPoint: '$product.reorderPoint',
      },
    },
    { $project: { product: 0 } },
    { $sort: { [sortField]: sortDir } },
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: query.limit }],
        totalCount: [{ $count: 'count' }],
      },
    },
  ];

  const [result] = await inventoryCol.aggregate<{ data: InventoryRow[]; totalCount: { count: number }[] }>(pipeline).toArray();
  const data = result?.data ?? [];
  const total = result?.totalCount[0]?.count ?? 0;

  const response: Paginated<InventoryRow> = {
    data,
    pagination: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
  };
  return ok(response);
});
