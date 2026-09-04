import { Document, Filter, OptionalUnlessRequiredId, Sort } from 'mongodb';
import { col } from './db';
import { NotFoundError } from './api-helpers';
import { isValidId, newId } from './id';
import type { Paginated } from './types';

export interface ListOptions {
  businessId: string;
  page: number;
  limit: number;
  sort?: string;
  order: 'asc' | 'desc';
  search?: string;
  searchFields?: string[];
  extraFilter?: Filter<Document>;
  defaultSort?: string;
}

/** Generic paginated, searched, sorted, businessId-scoped list query. Filtering happens in Mongo, never in JS. */
export async function listDocs<T extends Document>(
  collectionName: string,
  opts: ListOptions
): Promise<Paginated<T>> {
  const c = await col<T>(collectionName);
  const filter: Filter<Document> = { businessId: opts.businessId, ...(opts.extraFilter || {}) };

  if (opts.search && opts.searchFields?.length) {
    const escaped = opts.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = opts.searchFields.map((f) => ({ [f]: { $regex: escaped, $options: 'i' } }));
  }

  const sortField = opts.sort || opts.defaultSort || 'createdAt';
  const sort: Sort = { [sortField]: opts.order === 'asc' ? 1 : -1 };

  const skip = (opts.page - 1) * opts.limit;
  const [data, total] = await Promise.all([
    c.find(filter).sort(sort).skip(skip).limit(opts.limit).toArray(),
    c.countDocuments(filter),
  ]);

  return {
    data: data as unknown as T[],
    pagination: { page: opts.page, limit: opts.limit, total, totalPages: Math.max(1, Math.ceil(total / opts.limit)) },
  };
}

export async function getDocOr404<T extends Document>(
  collectionName: string,
  businessId: string,
  id: string,
  entityName = 'Record'
): Promise<T> {
  if (!isValidId(id)) throw new NotFoundError(`${entityName} not found.`);
  const c = await col<T>(collectionName);
  const doc = await c.findOne({ _id: id, businessId } as unknown as Filter<T>);
  if (!doc) throw new NotFoundError(`${entityName} not found.`);
  return doc as T;
}

export async function findOneScoped<T extends Document>(
  collectionName: string,
  businessId: string,
  filter: Filter<Document>
): Promise<T | null> {
  const c = await col<T>(collectionName);
  return c.findOne({ businessId, ...filter } as unknown as Filter<T>) as Promise<T | null>;
}

export async function insertDoc<T extends { _id: string; businessId: string; createdAt: string; updatedAt: string }>(
  collectionName: string,
  businessId: string,
  data: Omit<T, '_id' | 'businessId' | 'createdAt' | 'updatedAt'>
): Promise<T> {
  const now = new Date().toISOString();
  const doc = { ...data, _id: newId(), businessId, createdAt: now, updatedAt: now } as unknown as T;
  const c = await col<T>(collectionName);
  await c.insertOne(doc as unknown as OptionalUnlessRequiredId<T>);
  return doc;
}

export async function updateDocById<T extends Document>(
  collectionName: string,
  businessId: string,
  id: string,
  patch: Partial<T>,
  entityName = 'Record'
): Promise<T> {
  if (!isValidId(id)) throw new NotFoundError(`${entityName} not found.`);
  const c = await col<T>(collectionName);
  const result = await c.findOneAndUpdate(
    { _id: id, businessId } as unknown as Filter<T>,
    { $set: { ...patch, updatedAt: new Date().toISOString() } as unknown as Partial<T> },
    { returnDocument: 'after' }
  );
  if (!result) throw new NotFoundError(`${entityName} not found.`);
  return result as unknown as T;
}

export async function deleteDocById(
  collectionName: string,
  businessId: string,
  id: string,
  entityName = 'Record'
): Promise<void> {
  if (!isValidId(id)) throw new NotFoundError(`${entityName} not found.`);
  const c = await col(collectionName);
  const result = await c.deleteOne({ _id: id, businessId } as unknown as Filter<Document>);
  if (result.deletedCount === 0) throw new NotFoundError(`${entityName} not found.`);
}
