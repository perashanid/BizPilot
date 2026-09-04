import PDFDocument from 'pdfkit';
import { formatMoney } from './money';
import type { Business, Customer, Invoice } from './types';

/**
 * Renders a clean, professional one-page invoice as a PDF buffer using pdfkit.
 * All amounts are formatted with formatMoney against the business's currency —
 * never format money anywhere else in this file.
 */
export async function renderInvoicePdf(invoice: Invoice, business: Business, customer: Customer): Promise<Buffer> {
  const currency = business.currency;
  const money = (minorUnits: number) => formatMoney(minorUnits, currency);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks: Buffer[] = [];

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // Header: invoice title (top right) + business identity (top left)
  doc.fontSize(24).font('Helvetica-Bold').text('INVOICE', 300, 50, { width: 260, align: 'right' });

  doc.fontSize(20).font('Helvetica-Bold').text(business.name, 50, 50, { width: 240 });
  if (business.legalName && business.legalName !== business.name) {
    doc.fontSize(10).font('Helvetica').fillColor('#555555').text(business.legalName, { width: 240 });
  }
  if (business.address) {
    doc.fontSize(10).font('Helvetica').fillColor('#555555').text(business.address, { width: 240 });
  }
  doc.fillColor('#000000');

  doc.y = 130;
  const infoTop = doc.y;
  doc.fontSize(10).font('Helvetica-Bold').text('Invoice #', 300, infoTop, { continued: true, width: 245 });
  doc.font('Helvetica').text(`  ${invoice.invoiceNumber}`, { align: 'right' });
  doc.font('Helvetica-Bold').text('Issue Date', 300, doc.y, { continued: true, width: 245 });
  doc.font('Helvetica').text(`  ${formatDate(invoice.issueDate)}`, { align: 'right' });
  doc.font('Helvetica-Bold').text('Due Date', 300, doc.y, { continued: true, width: 245 });
  doc.font('Helvetica').text(`  ${formatDate(invoice.dueDate)}`, { align: 'right' });

  doc.moveDown(2);

  // Bill-to block (reset cursor to the left margin — prior lines were positioned at x=300)
  const billToTop = doc.y;
  doc.fontSize(11).font('Helvetica-Bold').text('Bill To', 50, billToTop, { width: 300 });
  doc.fontSize(10).font('Helvetica');
  doc.text(customer.businessName || customer.name, 50, doc.y, { width: 300 });
  if (customer.businessName) doc.text(customer.name, 50, doc.y, { width: 300 });
  if (customer.address) doc.text(customer.address, 50, doc.y, { width: 300 });
  if (customer.email) doc.text(customer.email, 50, doc.y, { width: 300 });
  if (customer.phone) doc.text(customer.phone, 50, doc.y, { width: 300 });

  doc.moveDown(1.5);

  // Line items table
  const tableTop = doc.y;
  const colX = { name: 50, qty: 270, unitPrice: 330, discount: 400, tax: 460, total: 500 };
  const colW = { name: 210, qty: 50, unitPrice: 60, discount: 50, tax: 40, total: 60 };

  doc.fontSize(9).font('Helvetica-Bold');
  doc.text('Item', colX.name, tableTop, { width: colW.name });
  doc.text('Qty', colX.qty, tableTop, { width: colW.qty, align: 'right' });
  doc.text('Unit Price', colX.unitPrice, tableTop, { width: colW.unitPrice, align: 'right' });
  doc.text('Discount', colX.discount, tableTop, { width: colW.discount, align: 'right' });
  doc.text('Tax %', colX.tax, tableTop, { width: colW.tax, align: 'right' });
  doc.text('Line Total', colX.total, tableTop, { width: colW.total, align: 'right' });

  doc.moveDown(0.5);
  doc
    .moveTo(50, doc.y)
    .lineTo(560, doc.y)
    .strokeColor('#cccccc')
    .stroke();
  doc.moveDown(0.5);

  doc.font('Helvetica').fontSize(9);
  for (const line of invoice.lineItems) {
    const rowY = doc.y;
    doc.text(line.name, colX.name, rowY, { width: colW.name });
    doc.text(String(line.qty), colX.qty, rowY, { width: colW.qty, align: 'right' });
    doc.text(money(line.unitPrice), colX.unitPrice, rowY, { width: colW.unitPrice, align: 'right' });
    doc.text(money(line.discount), colX.discount, rowY, { width: colW.discount, align: 'right' });
    doc.text(`${line.taxRate}%`, colX.tax, rowY, { width: colW.tax, align: 'right' });
    doc.text(money(line.lineTotal), colX.total, rowY, { width: colW.total, align: 'right' });
    doc.moveDown(0.75);
  }

  doc.moveDown(0.25);
  doc
    .moveTo(50, doc.y)
    .lineTo(560, doc.y)
    .strokeColor('#cccccc')
    .stroke();
  doc.moveDown(0.75);

  // Totals footer
  const totalsX = 400;
  const totalsW = 160;
  const totalRow = (label: string, value: string, opts?: { bold?: boolean }) => {
    doc.font(opts?.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
    const y = doc.y;
    doc.text(label, totalsX, y, { width: 90, align: 'left' });
    doc.text(value, totalsX + 90, y, { width: totalsW - 90, align: 'right' });
    doc.moveDown(0.5);
  };

  totalRow('Subtotal', money(invoice.subtotal));
  if (invoice.discountTotal > 0) totalRow('Discount', `-${money(invoice.discountTotal)}`);
  totalRow('Tax', money(invoice.taxTotal));
  totalRow('Total', money(invoice.total), { bold: true });
  totalRow('Amount Paid', money(invoice.amountPaid));
  totalRow('Amount Due', money(invoice.amountDue), { bold: true });

  // Terms footer
  const terms = invoice.terms || business.invoiceSettings.terms;
  if (terms) {
    doc.moveDown(2);
    doc.fontSize(9).font('Helvetica-Bold').text('Terms');
    doc.fontSize(9).font('Helvetica').fillColor('#555555').text(terms, { width: 510 });
    doc.fillColor('#000000');
  }

  if (invoice.notes) {
    doc.moveDown(1);
    doc.fontSize(9).font('Helvetica-Bold').text('Notes');
    doc.fontSize(9).font('Helvetica').fillColor('#555555').text(invoice.notes, { width: 510 });
    doc.fillColor('#000000');
  }

  doc.end();
  return done;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
