import { col, COLLECTIONS } from './db';
import { newId } from './id';
import { NotFoundError } from './api-helpers';
import type { Business, BusinessCreateInput, ModuleKey } from './types';
import { MODULES } from './types';

const businessCache = new Map<string, { value: Business; expiresAt: number }>();
const CACHE_TTL_MS = 5000;

export async function getBusiness(businessId: string): Promise<Business | null> {
  const cached = businessCache.get(businessId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const c = await col<Business>(COLLECTIONS.businesses);
  const biz = await c.findOne({ _id: businessId });
  if (biz) businessCache.set(businessId, { value: biz, expiresAt: Date.now() + CACHE_TTL_MS });
  return biz;
}

export async function getBusinessOr404(businessId: string): Promise<Business> {
  const biz = await getBusiness(businessId);
  if (!biz) throw new NotFoundError('Business not found.');
  return biz;
}

export function invalidateBusinessCache(businessId: string): void {
  businessCache.delete(businessId);
}

export async function createBusiness(input: BusinessCreateInput, opts?: { isDemo?: boolean }): Promise<Business> {
  const now = new Date().toISOString();
  const business: Business = {
    _id: newId(),
    businessId: '', // set to own id right after
    name: input.name,
    legalName: input.legalName,
    industry: input.industry,
    currency: input.currency.toUpperCase(),
    timezone: input.timezone,
    fiscalYearStartMonth: input.fiscalYearStartMonth,
    taxSettings: { rates: [], pricesIncludeTax: false },
    invoiceSettings: { prefix: 'INV-', nextNumber: 1001 },
    poSettings: { prefix: 'PO-', nextNumber: 1001 },
    orderSettings: { prefix: 'SO-', nextNumber: 1001 },
    address: input.address,
    enabledModules: [...MODULES] as ModuleKey[],
    allowBackorders: false,
    onboardingComplete: false,
    isDemo: opts?.isDemo,
    createdAt: now,
    updatedAt: now,
  };
  business.businessId = business._id;

  const c = await col<Business>(COLLECTIONS.businesses);
  await c.insertOne(business);
  return business;
}

export async function updateBusinessSettings(businessId: string, patch: Partial<Business>): Promise<Business> {
  const c = await col<Business>(COLLECTIONS.businesses);
  const forbidden = ['_id', 'businessId', 'createdAt'];
  const safePatch = Object.fromEntries(Object.entries(patch).filter(([k]) => !forbidden.includes(k)));
  const result = await c.findOneAndUpdate(
    { _id: businessId },
    { $set: { ...safePatch, updatedAt: new Date().toISOString() } },
    { returnDocument: 'after' }
  );
  if (!result) throw new NotFoundError('Business not found.');
  invalidateBusinessCache(businessId);
  return result;
}
