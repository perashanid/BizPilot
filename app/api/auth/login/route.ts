import { NextRequest } from 'next/server';
import {
  findUsersByEmailAnyBusiness,
  verifyPassword,
  createSessionCookie,
  toPublicUser,
  AuthError,
} from '@/lib/auth';
import { parseJson, ok, withErrorHandling } from '@/lib/api-helpers';
import { col, COLLECTIONS } from '@/lib/db';
import { zLoginInput, type User } from '@/lib/types';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async (req: NextRequest) => {
  const input = await parseJson(req, zLoginInput);
  const candidates = await findUsersByEmailAnyBusiness(input.email);

  let matched: User | null = null;
  for (const candidate of candidates) {
    if (await verifyPassword(input.password, candidate.passwordHash)) {
      matched = candidate;
      break;
    }
  }

  if (!matched || matched.status === 'disabled') {
    throw new AuthError('Invalid email or password.', 401, 'UNAUTHORIZED');
  }

  await createSessionCookie({
    userId: matched._id,
    businessId: matched.businessId,
    role: matched.role,
    name: matched.name,
    email: matched.email,
  });

  const now = new Date().toISOString();
  const users = await col<User>(COLLECTIONS.users);
  await users.updateOne({ _id: matched._id }, { $set: { lastLoginAt: now, updatedAt: now } });

  return ok({ user: toPublicUser({ ...matched, lastLoginAt: now }) });
});
