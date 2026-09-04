import { NextRequest, NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import Papa from 'papaparse';
import { requireSession, canViewFinancials, AuthError } from '@/lib/auth';
import { ok, withErrorHandling, ApiValidationError } from '@/lib/api-helpers';
import { col, COLLECTIONS } from '@/lib/db';
import { newId } from '@/lib/id';
import {
  getProfitLoss,
  getRevenueVsExpensesByPeriod,
  getExpenseBreakdown,
  getCashFlow,
  getReceivablesAging,
  getPayablesAging,
  getTopProducts,
  getTopCustomers,
  type DateRange,
} from '@/lib/financials';
import { materializeDueRecurringExpenses } from '@/lib/expenses';
import { zReportQuery, type ReportType, type GeneratedReport, type Sale, type Product } from '@/lib/types';

export const runtime = 'nodejs';

const FINANCIAL_REPORT_TYPES = new Set<ReportType>([
  'profit-loss',
  'revenue',
  'expenses',
  'cash-flow',
  'aging-receivable',
  'aging-payable',
  'top-customers',
]);

type ReportRow = Record<string, unknown>;

async function getSalesReportRows(businessId: string, range: DateRange): Promise<ReportRow[]> {
  const salesCol = await col<Sale>(COLLECTIONS.sales);
  const docs = await salesCol
    .find(
      { businessId, date: { $gte: range.from, $lte: range.to } },
      { projection: { lineItems: 0, notes: 0 } }
    )
    .sort({ date: -1 })
    .limit(500)
    .toArray();

  return docs.map((d) => ({
    id: d._id,
    orderNumber: d.orderNumber,
    customerId: d.customerId ?? '',
    channel: d.channel,
    status: d.status,
    paymentStatus: d.paymentStatus,
    subtotal: d.subtotal,
    discountTotal: d.discountTotal,
    taxTotal: d.taxTotal,
    grandTotal: d.grandTotal,
    amountPaid: d.amountPaid,
    date: d.date,
  }));
}

async function getInventoryReportRows(businessId: string): Promise<ReportRow[]> {
  const products = await col<Product>(COLLECTIONS.products);
  const rows = await products
    .aggregate<ReportRow>([
      { $match: { businessId, trackInventory: true } },
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
      {
        $project: {
          _id: 0,
          sku: 1,
          name: 1,
          category: 1,
          costPrice: 1,
          salePrice: 1,
          reorderPoint: 1,
          available: { $ifNull: [{ $first: '$inv.available' }, 0] },
        },
      },
      { $limit: 500 },
    ])
    .toArray();
  return rows;
}

async function buildReportRows(businessId: string, type: ReportType, range: DateRange): Promise<ReportRow[]> {
  switch (type) {
    case 'profit-loss': {
      const pl = await getProfitLoss(businessId, range);
      return [pl as unknown as ReportRow];
    }
    case 'revenue': {
      const points = await getRevenueVsExpensesByPeriod(businessId, range, 'month');
      return points as unknown as ReportRow[];
    }
    case 'expenses': {
      await materializeDueRecurringExpenses(businessId);
      const breakdown = await getExpenseBreakdown(businessId, range);
      return breakdown.map((b) => ({ category: b._id, total: b.total, count: b.count }));
    }
    case 'cash-flow': {
      const cf = await getCashFlow(businessId, range, 'month');
      return cf as unknown as ReportRow[];
    }
    case 'aging-receivable': {
      const { rows } = await getReceivablesAging(businessId);
      return rows as unknown as ReportRow[];
    }
    case 'aging-payable': {
      const { rows } = await getPayablesAging(businessId);
      return rows as unknown as ReportRow[];
    }
    case 'top-products': {
      const products = await getTopProducts(businessId, range, 50);
      return products.map((p) => ({ productId: p._id, name: p.name, unitsSold: p.unitsSold, revenue: p.revenue }));
    }
    case 'top-customers': {
      const customers = await getTopCustomers(businessId, range, 50);
      return customers as unknown as ReportRow[];
    }
    case 'sales':
      return getSalesReportRows(businessId, range);
    case 'inventory':
      return getInventoryReportRows(businessId);
    default:
      return [];
  }
}

function titleCase(s: string): string {
  return s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function buildReportPdf(type: string, from: string, to: string, rows: ReportRow[]): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.fontSize(18).fillColor('#111').text(`${titleCase(type)} Report`);
  doc.fontSize(10).fillColor('#555').text(`${from.slice(0, 10)} to ${to.slice(0, 10)}`);
  doc.moveDown();

  if (rows.length === 0) {
    doc.fontSize(11).fillColor('#000').text('No data for this period.');
  } else {
    const headers = Object.keys(rows[0]);
    doc.fontSize(9).fillColor('#000').font('Helvetica-Bold').text(headers.join('   |   '));
    doc.moveDown(0.5);
    doc.font('Helvetica');
    for (const row of rows) {
      const line = headers.map((h) => formatCell(row[h])).join('   |   ');
      doc.text(line);
    }
  }

  doc.end();
  return done;
}

export const GET = withErrorHandling(async (req: NextRequest, { params }: { params: { type: string } }) => {
  const session = await requireSession();
  const searchParams = req.nextUrl.searchParams;

  const parsed = zReportQuery.safeParse({
    type: params.type,
    from: searchParams.get('from'),
    to: searchParams.get('to'),
    format: searchParams.get('format') ?? 'json',
  });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    throw new ApiValidationError(fields);
  }

  const { type, from, to, format } = parsed.data;
  if (from > to) throw new ApiValidationError({ from: 'Start date must be before end date.' });

  if (FINANCIAL_REPORT_TYPES.has(type) && !canViewFinancials(session.role)) {
    throw new AuthError('You do not have permission to view financial reports.', 403, 'FORBIDDEN');
  }

  const range: DateRange = { from, to };
  const rows = await buildReportRows(session.businessId, type, range);

  try {
    const now = new Date().toISOString();
    const reportsCol = await col<GeneratedReport>(COLLECTIONS.generatedReports);
    await reportsCol.insertOne({
      _id: newId(),
      businessId: session.businessId,
      type,
      format,
      from,
      to,
      generatedBy: session.userId,
      generatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    // Best-effort history log; never fail the report response because of this.
  }

  if (format === 'csv') {
    const csv = Papa.unparse(rows);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${type}.csv"`,
      },
    });
  }

  if (format === 'pdf') {
    const pdfBuffer = await buildReportPdf(type, from, to, rows);
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${type}.pdf"`,
      },
    });
  }

  return ok(rows);
});
