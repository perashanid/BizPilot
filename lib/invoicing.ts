import { col, COLLECTIONS, nextSequence } from './db';
import { newId } from './id';
import { BusinessRuleError, NotFoundError } from './api-helpers';
import { getBusiness } from './business';
import { lineSubtotal, taxForLine } from './money';
import type { Customer, Invoice, InvoiceInput, InvoiceLineItem, InvoiceStatus, Sale } from './types';

interface ComputedLine extends InvoiceLineItem {
  lineTotal: number;
}

function priceLines(lineItems: InvoiceLineItem[]): { lines: ComputedLine[]; subtotal: number; taxTotal: number } {
  let subtotal = 0;
  let taxTotal = 0;
  const lines = lineItems.map((line) => {
    const sub = lineSubtotal(line.qty, line.unitPrice, line.discount);
    const tax = taxForLine(line.qty, line.unitPrice, line.discount, line.taxRate);
    subtotal += sub;
    taxTotal += tax;
    return { ...line, lineTotal: sub + tax };
  });
  return { lines, subtotal, taxTotal };
}

/** The persisted `status` is never literally "overdue" — that is derived here, at read time. */
export function deriveInvoiceStatus(invoice: Pick<Invoice, 'status' | 'dueDate' | 'amountDue'>): InvoiceStatus {
  if (invoice.status === 'void' || invoice.status === 'paid' || invoice.status === 'draft') return invoice.status;
  if (invoice.amountDue > 0 && new Date(invoice.dueDate).getTime() < Date.now()) return 'overdue';
  return invoice.status;
}

export function withDerivedStatus<T extends Invoice>(invoice: T): T {
  return { ...invoice, status: deriveInvoiceStatus(invoice) };
}

export async function createInvoice(businessId: string, input: InvoiceInput): Promise<Invoice> {
  const business = await getBusiness(businessId);
  if (!business) throw new NotFoundError('Business not found.');
  const customers = await col<Customer>(COLLECTIONS.customers);
  const customer = await customers.findOne({ _id: input.customerId, businessId });
  if (!customer) throw new NotFoundError('Customer not found.');

  if (new Date(input.dueDate).getTime() < new Date(input.issueDate).getTime()) {
    throw new BusinessRuleError('Due date cannot be before the issue date.', 'INVALID_DATE_RANGE', {
      dueDate: 'Due date must be on or after the issue date.',
    });
  }

  const { lines, subtotal, taxTotal } = priceLines(input.lineItems);
  const total = subtotal + taxTotal;
  const seq = await nextSequence(businessId, 'invoice');
  const now = new Date().toISOString();

  const invoice: Invoice = {
    _id: newId(),
    businessId,
    invoiceNumber: `${business.invoiceSettings.prefix}${seq}`,
    customerId: input.customerId,
    saleId: input.saleId,
    lineItems: lines,
    subtotal,
    discountTotal: 0,
    taxTotal,
    total,
    amountPaid: 0,
    amountDue: total,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    status: 'draft',
    terms: input.terms ?? business.invoiceSettings.terms,
    notes: input.notes,
    reminderHistory: [],
    createdAt: now,
    updatedAt: now,
  };

  const invoices = await col<Invoice>(COLLECTIONS.invoices);
  await invoices.insertOne(invoice);
  return invoice;
}

export async function convertSaleToInvoice(businessId: string, saleId: string): Promise<Invoice> {
  const sales = await col<Sale>(COLLECTIONS.sales);
  const sale = await sales.findOne({ _id: saleId, businessId });
  if (!sale) throw new NotFoundError('Sale not found.');
  if (!sale.customerId) {
    throw new BusinessRuleError('This sale has no customer on file, so it cannot become an invoice.');
  }

  const existing = await (await col<Invoice>(COLLECTIONS.invoices)).findOne({ businessId, saleId });
  if (existing) throw new BusinessRuleError('This sale has already been converted to an invoice.');

  const business = await getBusiness(businessId);
  const customers = await col<Customer>(COLLECTIONS.customers);
  const customer = await customers.findOne({ _id: sale.customerId, businessId });
  const termsDays = customer?.paymentTermsDays ?? 30;

  const issueDate = new Date().toISOString();
  const dueDate = new Date(Date.now() + termsDays * 86400000).toISOString();

  return createInvoice(businessId, {
    customerId: sale.customerId,
    saleId: sale._id,
    lineItems: sale.lineItems.map((l) => ({
      productId: l.productId,
      name: l.name,
      qty: l.qty,
      unitPrice: l.unitPrice,
      discount: l.discount,
      taxRate: l.taxRate,
    })),
    issueDate,
    dueDate,
    terms: business?.invoiceSettings.terms,
  });
}

export async function sendInvoice(businessId: string, invoiceId: string): Promise<Invoice> {
  const invoices = await col<Invoice>(COLLECTIONS.invoices);
  const invoice = await invoices.findOne({ _id: invoiceId, businessId });
  if (!invoice) throw new NotFoundError('Invoice not found.');
  if (invoice.status === 'void') throw new BusinessRuleError('Cannot send a voided invoice.');

  const result = await invoices.findOneAndUpdate(
    { _id: invoiceId, businessId },
    {
      $set: {
        status: invoice.status === 'draft' ? 'sent' : invoice.status,
        sentAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      $push: { reminderHistory: { sentAt: new Date().toISOString(), method: 'email' } },
    },
    { returnDocument: 'after' }
  );
  if (!result) throw new NotFoundError('Invoice not found.');
  return result;
}

export async function voidInvoice(businessId: string, invoiceId: string): Promise<Invoice> {
  const invoices = await col<Invoice>(COLLECTIONS.invoices);
  const invoice = await invoices.findOne({ _id: invoiceId, businessId });
  if (!invoice) throw new NotFoundError('Invoice not found.');
  if (invoice.amountPaid > 0) {
    throw new BusinessRuleError('Cannot void an invoice that has payments recorded.');
  }
  const result = await invoices.findOneAndUpdate(
    { _id: invoiceId, businessId },
    { $set: { status: 'void', updatedAt: new Date().toISOString() } },
    { returnDocument: 'after' }
  );
  if (!result) throw new NotFoundError('Invoice not found.');
  return result;
}
