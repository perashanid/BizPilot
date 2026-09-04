import { createSessionCookie, toPublicUser } from '@/lib/auth';
import { ok, withErrorHandling, NotFoundError } from '@/lib/api-helpers';
import { col, COLLECTIONS } from '@/lib/db';
import type { Business, User } from '@/lib/types';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async () => {
  const businesses = await col<Business>(COLLECTIONS.businesses);
  const demoBusiness = await businesses.findOne({ isDemo: true });
  if (!demoBusiness) {
    throw new NotFoundError('No demo business is seeded yet. Run the seed script.');
  }

  const users = await col<User>(COLLECTIONS.users);
  const owner = await users.findOne({ businessId: demoBusiness._id, role: 'owner' });
  if (!owner) {
    throw new NotFoundError('No demo business is seeded yet. Run the seed script.');
  }

  await createSessionCookie({
    userId: owner._id,
    businessId: demoBusiness._id,
    role: owner.role,
    name: owner.name,
    email: owner.email,
  });

  return ok({ user: toPublicUser(owner), business: demoBusiness });
});
