import { NextRequest } from 'next/server';
import { hashPassword, createSessionCookie, toPublicUser } from '@/lib/auth';
import { createBusiness } from '@/lib/business';
import { recordAudit } from '@/lib/audit';
import { parseJson, ok, withErrorHandling } from '@/lib/api-helpers';
import { col, COLLECTIONS } from '@/lib/db';
import { newId } from '@/lib/id';
import { zRegisterInput, type User } from '@/lib/types';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async (req: NextRequest) => {
  const input = await parseJson(req, zRegisterInput);

  const passwordHash = await hashPassword(input.password);
  const business = await createBusiness({
    name: input.businessName,
    currency: 'USD',
    timezone: 'UTC',
    fiscalYearStartMonth: 1,
  });

  const now = new Date().toISOString();
  const user: User = {
    _id: newId(),
    businessId: business._id,
    name: input.name,
    email: input.email,
    passwordHash,
    role: 'owner',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  const users = await col<User>(COLLECTIONS.users);
  await users.insertOne(user);

  await createSessionCookie({
    userId: user._id,
    businessId: business._id,
    role: 'owner',
    name: user.name,
    email: user.email,
  });

  await recordAudit({
    businessId: business._id,
    userId: user._id,
    action: 'register',
    entityType: COLLECTIONS.users,
    entityId: user._id,
    after: toPublicUser(user),
  });

  return ok({ user: toPublicUser(user), business }, 201);
});
