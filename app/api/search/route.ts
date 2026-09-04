import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { ok, withErrorHandling } from '@/lib/api-helpers';
import { col, COLLECTIONS } from '@/lib/db';
import type { Customer, Product, Sale, Invoice, Supplier, Task } from '@/lib/types';

export const runtime = 'nodejs';

interface SearchResult {
  type: string;
  id: string;
  label: string;
  sublabel: string;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  const businessId = session.businessId;
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 1) return ok({ results: [] });

  const regex = { $regex: escapeRegex(q), $options: 'i' };

  const [customers, products, sales, invoices, suppliers, tasks] = await Promise.all([
    (await col<Customer>(COLLECTIONS.customers))
      .find({ businessId, $or: [{ name: regex }, { businessName: regex }, { email: regex }] })
      .limit(5)
      .toArray(),
    (await col<Product>(COLLECTIONS.products))
      .find({ businessId, $or: [{ name: regex }, { sku: regex }] })
      .limit(5)
      .toArray(),
    (await col<Sale>(COLLECTIONS.sales))
      .find({ businessId, orderNumber: regex })
      .limit(5)
      .toArray(),
    (await col<Invoice>(COLLECTIONS.invoices))
      .find({ businessId, invoiceNumber: regex })
      .limit(5)
      .toArray(),
    (await col<Supplier>(COLLECTIONS.suppliers))
      .find({ businessId, name: regex })
      .limit(5)
      .toArray(),
    (await col<Task>(COLLECTIONS.tasks))
      .find({ businessId, title: regex })
      .limit(5)
      .toArray(),
  ]);

  const results: SearchResult[] = [
    ...customers.map((c) => ({ type: 'customer', id: c._id, label: c.name, sublabel: c.businessName || c.email || '' })),
    ...products.map((p) => ({ type: 'product', id: p._id, label: p.name, sublabel: p.sku })),
    ...sales.map((s) => ({ type: 'sale', id: s._id, label: s.orderNumber, sublabel: s.status })),
    ...invoices.map((i) => ({ type: 'invoice', id: i._id, label: i.invoiceNumber, sublabel: i.status })),
    ...suppliers.map((s) => ({ type: 'supplier', id: s._id, label: s.name, sublabel: s.email || '' })),
    ...tasks.map((t) => ({ type: 'task', id: t._id, label: t.title, sublabel: t.status })),
  ];

  return ok({ results });
});
