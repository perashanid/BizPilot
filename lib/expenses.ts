import { col, COLLECTIONS } from './db';
import { newId } from './id';
import type { Expense } from './types';

function frequencyDays(freq?: Expense['recurrenceFrequency']): number {
  switch (freq) {
    case 'weekly':
      return 7;
    case 'quarterly':
      return 91;
    case 'yearly':
      return 365;
    case 'monthly':
    default:
      return 30;
  }
}

// Recurring occurrences land on day boundaries, so re-checking more than once a minute buys
// nothing but extra Mongo round trips — this is called from every expenses/analytics/reports
// read (3 separate endpoints), so a short per-business gate avoids redoing it on every request.
const lastMaterializedAt = new Map<string, number>();
const MATERIALIZE_GATE_MS = 60_000;

/**
 * Generates any recurring-expense occurrences that have come due, on read — no cron job.
 * Idempotent under concurrent calls: each occurrence is only created if this call is the one
 * that atomically advances the parent's nextOccurrenceDate past it.
 */
export async function materializeDueRecurringExpenses(businessId: string): Promise<void> {
  const last = lastMaterializedAt.get(businessId);
  if (last && Date.now() - last < MATERIALIZE_GATE_MS) return;
  lastMaterializedAt.set(businessId, Date.now());

  const expenses = await col<Expense>(COLLECTIONS.expenses);
  const templates = await expenses.find({ businessId, recurring: true }).toArray();
  const now = Date.now();

  for (const template of templates) {
    let cursor = template.nextOccurrenceDate ? new Date(template.nextOccurrenceDate).getTime() : new Date(template.date).getTime() + frequencyDays(template.recurrenceFrequency) * 86400000;

    // Cap iterations defensively so a template with a bad frequency can't loop forever.
    for (let i = 0; i < 60 && cursor <= now; i++) {
      const dueIso = new Date(cursor).toISOString();
      const nextIso = new Date(cursor + frequencyDays(template.recurrenceFrequency) * 86400000).toISOString();

      const claimed = await expenses.findOneAndUpdate(
        { _id: template._id, businessId, nextOccurrenceDate: template.nextOccurrenceDate ?? { $exists: false } },
        { $set: { nextOccurrenceDate: nextIso, updatedAt: new Date().toISOString() } },
        { returnDocument: 'after' }
      );

      if (!claimed) break; // another request already advanced this template past `cursor`

      const now2 = new Date().toISOString();
      const occurrence: Expense = {
        ...template,
        _id: newId(),
        date: dueIso,
        recurring: false,
        recurrenceFrequency: undefined,
        nextOccurrenceDate: undefined,
        parentExpenseId: template._id,
        createdAt: now2,
        updatedAt: now2,
      };
      await expenses.insertOne(occurrence);

      template.nextOccurrenceDate = nextIso;
      cursor = new Date(nextIso).getTime();
    }
  }
}
