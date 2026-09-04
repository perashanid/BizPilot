/**
 * Next.js instrumentation hook — runs once when the server process starts (both `next dev` and
 * each serverless cold start). Used here purely for the "auto-seed on first run" convenience
 * described in the README: a fresh clone with an empty database gets demo data automatically.
 * Guarded to the Node.js runtime since it touches MongoDB directly.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { autoSeedIfEmpty } = await import('./lib/auto-seed');
    await autoSeedIfEmpty();
  }
}
