/**
 * Dev/build-time helper only — NOT part of the shipped app or any user-facing npm script.
 * Boots an in-memory MongoDB, seeds it with the same logic as scripts/seed.ts, then runs a
 * handful of sanity assertions to catch data-consistency regressions before they reach a real
 * database. Run directly: `npx tsx scripts/seed-memory-server.ts`.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

async function main(): Promise<void> {
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri();
  process.env.MONGODB_DB = 'sme_copilot_test';
  if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = 'test-secret-not-for-production-use-only';

  let exitCode = 0;
  try {
    const { runSeed } = await import('./seed');
    await runSeed(true);

    const { getDb, COLLECTIONS } = await import('../lib/db');
    const db = await getDb();

    const checks: Array<[string, () => Promise<boolean>]> = [
      [
        'At least one confirmed/fulfilled sale exists with grandTotal > 0',
        async () => {
          const agg = await db
            .collection(COLLECTIONS.sales)
            .aggregate([{ $match: { status: { $in: ['confirmed', 'fulfilled'] } } }, { $group: { _id: null, total: { $sum: '$grandTotal' } } }])
            .toArray();
          return (agg[0]?.total ?? 0) > 0;
        },
      ],
      [
        "Every invoice's amountPaid equals the sum of its linked payments",
        async () => {
          const invoices = await db.collection<{ _id: string; amountPaid: number }>(COLLECTIONS.invoices).find({}).toArray();
          for (const inv of invoices) {
            const pays = await db
              .collection<{ amount: number }>(COLLECTIONS.payments)
              .find({ invoiceId: inv._id })
              .toArray();
            const sum = pays.reduce((s, p) => s + p.amount, 0);
            if (sum !== inv.amountPaid) {
              console.error(`  Mismatch on invoice ${inv._id}: amountPaid=${inv.amountPaid}, sum(payments)=${sum}`);
              return false;
            }
          }
          return true;
        },
      ],
      [
        'No inventory record has negative quantityOnHand',
        async () => {
          const count = await db.collection(COLLECTIONS.inventory).countDocuments({ quantityOnHand: { $lt: 0 } });
          return count === 0;
        },
      ],
      [
        'The demo business has isDemo:true',
        async () => {
          const biz = await db.collection(COLLECTIONS.businesses).findOne({ isDemo: true });
          return !!biz;
        },
      ],
      [
        'At least one product is at or below its reorder point',
        async () => {
          const products = await db.collection<{ _id: string; reorderPoint: number }>(COLLECTIONS.products).find({}).toArray();
          const inventory = await db
            .collection<{ productId: string; quantityOnHand: number; quantityReserved: number }>(COLLECTIONS.inventory)
            .find({})
            .toArray();
          const availableByProduct = new Map(inventory.map((i) => [i.productId, i.quantityOnHand - i.quantityReserved]));
          return products.some((p) => (availableByProduct.get(p._id) ?? 0) <= p.reorderPoint);
        },
      ],
    ];

    let allPassed = true;
    for (const [label, check] of checks) {
      const passed = await check();
      console.log(`${passed ? 'PASS' : 'FAIL'} — ${label}`);
      if (!passed) allPassed = false;
    }
    exitCode = allPassed ? 0 : 1;
  } catch (err) {
    console.error('seed-memory-server failed:', err);
    exitCode = 1;
  } finally {
    await mem.stop();
  }
  process.exit(exitCode);
}

main();
