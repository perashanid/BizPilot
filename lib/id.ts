import { ObjectId } from 'mongodb';

/**
 * Every document in this app uses a string _id (a hex ObjectId string), not a native
 * BSON ObjectId. This keeps ids uniform across the DB layer, API responses, and the
 * frontend with zero ObjectId<->string conversion bugs. Sortable by creation time,
 * same as a native ObjectId, because it IS one underneath.
 */
export function newId(): string {
  return new ObjectId().toHexString();
}

export function isValidId(id: unknown): id is string {
  return typeof id === 'string' && ObjectId.isValid(id) && id.length === 24;
}
