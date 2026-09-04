import { col, COLLECTIONS } from './db';
import { newId } from './id';
import { BusinessRuleError, NotFoundError } from './api-helpers';
import type { Invoice, Payment, PaymentInput, PurchaseOrder } from './types';

/** Recomputes an invoice's paid/due amounts and status from its own amountPaid field. */
function invoiceStatusFor(total: number, amountPaid: number, currentStatus: Invoice['status']): Invoice['status'] {
  if (currentStatus === 'void') return 'void';
  if (amountPaid >= total) return 'paid';
  if (amountPaid > 0) return 'partially_paid';
  return currentStatus === 'draft' ? 'draft' : 'sent';
}

export async function recordPayment(businessId: string, userId: string, input: PaymentInput): Promise<Payment> {
  if (input.invoiceId) {
    await applyPaymentToInvoice(businessId, input.invoiceId, input.amount);
  }
  if (input.purchaseOrderId) {
    await applyPaymentToPurchaseOrder(businessId, input.purchaseOrderId, input.amount);
  }

  const now = new Date().toISOString();
  const payment: Payment = {
    _id: newId(),
    businessId,
    ...input,
    createdAt: now,
    updatedAt: now,
  };
  const payments = await col<Payment>(COLLECTIONS.payments);
  await payments.insertOne(payment);
  return payment;
}

async function applyPaymentToInvoice(businessId: string, invoiceId: string, amount: number): Promise<void> {
  const invoices = await col<Invoice>(COLLECTIONS.invoices);
  const invoice = await invoices.findOne({ _id: invoiceId, businessId });
  if (!invoice) throw new NotFoundError('Invoice not found.');
  if (invoice.status === 'void') throw new BusinessRuleError('Cannot record a payment against a voided invoice.');

  const newAmountPaid = invoice.amountPaid + amount;
  if (newAmountPaid > invoice.total) {
    throw new BusinessRuleError(
      `Payment of ${amount} exceeds the amount due (${invoice.total - invoice.amountPaid}).`,
      'OVERPAYMENT',
      { amount: 'This payment is larger than the remaining balance.' }
    );
  }

  await invoices.updateOne(
    { _id: invoiceId, businessId },
    {
      $set: {
        amountPaid: newAmountPaid,
        amountDue: invoice.total - newAmountPaid,
        status: invoiceStatusFor(invoice.total, newAmountPaid, invoice.status),
        updatedAt: new Date().toISOString(),
      },
    }
  );
}

async function applyPaymentToPurchaseOrder(businessId: string, poId: string, amount: number): Promise<void> {
  const pos = await col<PurchaseOrder>(COLLECTIONS.purchaseOrders);
  const po = await pos.findOne({ _id: poId, businessId });
  if (!po) throw new NotFoundError('Purchase order not found.');
  if (po.status === 'cancelled') throw new BusinessRuleError('Cannot record a payment against a cancelled PO.');

  const newAmountPaid = po.amountPaid + amount;
  if (newAmountPaid > po.total) {
    throw new BusinessRuleError(
      `Payment of ${amount} exceeds the amount owed (${po.total - po.amountPaid}).`,
      'OVERPAYMENT',
      { amount: 'This payment is larger than the remaining balance.' }
    );
  }

  await pos.updateOne(
    { _id: poId, businessId },
    { $set: { amountPaid: newAmountPaid, updatedAt: new Date().toISOString() } }
  );
}
