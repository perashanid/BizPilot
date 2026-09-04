import { Collection, Db, Document, MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI is not set. Copy .env.example to .env.local and configure it.');
}

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var _mongoIndexesEnsured: Promise<void> | undefined;
}

// Reuse the client across serverless invocations / hot reloads. Opening a new
// connection per request is a correctness bug on Vercel, not just slow.
function getClientPromise(): Promise<MongoClient> {
  if (!global._mongoClientPromise) {
    const client = new MongoClient(uri as string, { maxPoolSize: 10 });
    global._mongoClientPromise = client.connect();
  }
  return global._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  const db = client.db(process.env.MONGODB_DB || undefined);
  if (!global._mongoIndexesEnsured) {
    global._mongoIndexesEnsured = ensureIndexes(db).catch((err) => {
      global._mongoIndexesEnsured = undefined;
      throw err;
    });
  }
  await global._mongoIndexesEnsured;
  return db;
}

export async function col<T extends Document = Document>(name: string): Promise<Collection<T>> {
  const db = await getDb();
  return db.collection<T>(name);
}

export const COLLECTIONS = {
  businesses: 'businesses',
  users: 'users',
  customers: 'customers',
  products: 'products',
  inventory: 'inventory',
  stockMovements: 'stockMovements',
  suppliers: 'suppliers',
  purchaseOrders: 'purchaseOrders',
  sales: 'sales',
  invoices: 'invoices',
  payments: 'payments',
  expenses: 'expenses',
  employees: 'employees',
  tasks: 'tasks',
  insights: 'insights',
  auditLog: 'auditLog',
  counters: 'counters',
  generatedReports: 'generatedReports',
} as const;

async function ensureIndexes(db: Db): Promise<void> {
  const bId = { businessId: 1 } as const;
  // `listDocs` (lib/repo.ts) defaults every unsorted list query to `sort: createdAt desc` — every
  // collection listed through it needs a supporting index or Mongo sorts the whole result set in
  // memory, which gets slower (and eventually hits Mongo's in-memory sort limit) as it grows.
  const byCreatedAt = { businessId: 1, createdAt: 1 } as const;
  await Promise.all([
    db.collection(COLLECTIONS.businesses).createIndex({ _id: 1 }),
    db.collection(COLLECTIONS.users).createIndex(bId),
    db.collection(COLLECTIONS.users).createIndex({ businessId: 1, email: 1 }, { unique: true }),
    // Non-unique: login only has an email+password, no businessId, so we look up candidates
    // across all businesses by email and verify the password hash for each match.
    db.collection(COLLECTIONS.users).createIndex({ email: 1 }),
    db.collection(COLLECTIONS.customers).createIndex(bId),
    db.collection(COLLECTIONS.customers).createIndex(byCreatedAt),
    db.collection(COLLECTIONS.customers).createIndex(
      { businessId: 1, email: 1 },
      // MongoDB partial indexes only support $eq/$gt/$gte/$lt/$lte/$type/$exists — not $ne — so
      // "non-empty string" is expressed as $gt: '' (an empty string is the lexical minimum).
      { unique: true, partialFilterExpression: { email: { $exists: true, $gt: '' } } }
    ),
    db.collection(COLLECTIONS.products).createIndex(bId),
    db.collection(COLLECTIONS.products).createIndex(byCreatedAt),
    db.collection(COLLECTIONS.products).createIndex({ businessId: 1, sku: 1 }, { unique: true }),
    db.collection(COLLECTIONS.inventory).createIndex(bId),
    db.collection(COLLECTIONS.inventory).createIndex(
      { businessId: 1, productId: 1, variantId: 1, location: 1 },
      { unique: true }
    ),
    db.collection(COLLECTIONS.stockMovements).createIndex(bId),
    db.collection(COLLECTIONS.stockMovements).createIndex({ businessId: 1, productId: 1 }),
    db.collection(COLLECTIONS.stockMovements).createIndex({ businessId: 1, timestamp: 1 }),
    db.collection(COLLECTIONS.suppliers).createIndex(bId),
    db.collection(COLLECTIONS.suppliers).createIndex(byCreatedAt),
    db.collection(COLLECTIONS.purchaseOrders).createIndex(bId),
    db.collection(COLLECTIONS.purchaseOrders).createIndex(byCreatedAt),
    db.collection(COLLECTIONS.purchaseOrders).createIndex({ businessId: 1, status: 1 }),
    db.collection(COLLECTIONS.purchaseOrders).createIndex({ businessId: 1, supplierId: 1 }),
    db.collection(COLLECTIONS.sales).createIndex(bId),
    db.collection(COLLECTIONS.sales).createIndex({ businessId: 1, status: 1 }),
    db.collection(COLLECTIONS.sales).createIndex({ businessId: 1, date: 1 }),
    db.collection(COLLECTIONS.sales).createIndex({ businessId: 1, customerId: 1 }),
    db.collection(COLLECTIONS.invoices).createIndex(bId),
    db.collection(COLLECTIONS.invoices).createIndex(byCreatedAt),
    db.collection(COLLECTIONS.invoices).createIndex({ businessId: 1, status: 1 }),
    db.collection(COLLECTIONS.invoices).createIndex({ businessId: 1, customerId: 1 }),
    db.collection(COLLECTIONS.invoices).createIndex({ businessId: 1, dueDate: 1 }),
    db.collection(COLLECTIONS.payments).createIndex(bId),
    db.collection(COLLECTIONS.payments).createIndex({ businessId: 1, date: 1 }),
    db.collection(COLLECTIONS.payments).createIndex({ businessId: 1, customerId: 1 }),
    db.collection(COLLECTIONS.expenses).createIndex(bId),
    db.collection(COLLECTIONS.expenses).createIndex({ businessId: 1, date: 1 }),
    db.collection(COLLECTIONS.employees).createIndex(bId),
    db.collection(COLLECTIONS.employees).createIndex(byCreatedAt),
    db.collection(COLLECTIONS.tasks).createIndex(bId),
    db.collection(COLLECTIONS.tasks).createIndex(byCreatedAt),
    db.collection(COLLECTIONS.tasks).createIndex({ businessId: 1, status: 1 }),
    db.collection(COLLECTIONS.insights).createIndex(bId),
    db.collection(COLLECTIONS.auditLog).createIndex(bId),
    db.collection(COLLECTIONS.auditLog).createIndex(byCreatedAt),
    db.collection(COLLECTIONS.counters).createIndex({ businessId: 1, name: 1 }, { unique: true }),
    db.collection(COLLECTIONS.generatedReports).createIndex(bId),
    db.collection(COLLECTIONS.generatedReports).createIndex(byCreatedAt),
  ]);
}

/** Atomically allocates the next sequential number for a per-business counter (e.g. invoice numbers). */
export async function nextSequence(businessId: string, name: string): Promise<number> {
  const counters = await col<{ businessId: string; name: string; value: number }>('counters');
  // mongodb driver v6: findOneAndUpdate returns the document directly (not wrapped), by default.
  const result = await counters.findOneAndUpdate(
    { businessId, name },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  if (!result) throw new Error('Failed to allocate sequence number');
  return result.value;
}
