import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { withErrorHandling, NotFoundError } from '@/lib/api-helpers';
import { getDocOr404 } from '@/lib/repo';
import { getBusinessOr404 } from '@/lib/business';
import { renderInvoicePdf } from '@/lib/invoice-pdf';
import { col, COLLECTIONS } from '@/lib/db';
import type { Customer, Invoice } from '@/lib/types';

export const runtime = 'nodejs';

export const GET = withErrorHandling(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const invoice = await getDocOr404<Invoice>(COLLECTIONS.invoices, session.businessId, params.id, 'Invoice');
  const business = await getBusinessOr404(session.businessId);

  const customers = await col<Customer>(COLLECTIONS.customers);
  const customer = await customers.findOne({ _id: invoice.customerId, businessId: session.businessId });
  if (!customer) throw new NotFoundError('Customer not found.');

  const buffer = await renderInvoicePdf(invoice, business, customer);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`,
      'Content-Length': String(buffer.length),
    },
  });
});
