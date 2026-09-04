import { col, COLLECTIONS } from './db';
import { newId } from './id';
import type { AuditLogEntry } from './types';

export async function recordAudit(input: {
  businessId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  const now = new Date().toISOString();
  const entry: AuditLogEntry = {
    _id: newId(),
    businessId: input.businessId,
    userId: input.userId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: input.before,
    after: input.after,
    timestamp: now,
    createdAt: now,
    updatedAt: now,
  };
  const c = await col<AuditLogEntry>(COLLECTIONS.auditLog);
  await c.insertOne(entry);
}
