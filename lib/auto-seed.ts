import { getDb, COLLECTIONS } from './db';

/**
 * Called once from instrumentation.ts when the server starts. If the database has no
 * businesses yet, runs the same seed script `npm run seed` uses (with force:false, so it never
 * wipes real data — it only ever acts on a genuinely empty database). Failures are logged, never
 * thrown, so a seeding problem can't prevent the app itself from starting.
 */
export async function autoSeedIfEmpty(): Promise<void> {
  try {
    const db = await getDb();
    const count = await db.collection(COLLECTIONS.businesses).countDocuments();
    if (count > 0) return;

    // eslint-disable-next-line no-console
    console.log('[auto-seed] Database is empty — seeding demo data (this runs once)...');
    const { runSeed } = await import('../scripts/seed');
    await runSeed(false);
    // eslint-disable-next-line no-console
    console.log('[auto-seed] Done. Demo login: demo@smecopilot.app / demo1234');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[auto-seed] Failed — the app will still start. Run `npm run seed` manually:', err);
  }
}
