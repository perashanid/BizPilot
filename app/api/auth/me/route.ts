import { getSession, findUserById, toPublicUser } from '@/lib/auth';
import { getBusiness } from '@/lib/business';
import { ok, withErrorHandling } from '@/lib/api-helpers';

export const runtime = 'nodejs';

export const GET = withErrorHandling(async () => {
  const session = await getSession();
  if (!session) return ok({ user: null, business: null });

  const user = await findUserById(session.userId);
  if (!user) return ok({ user: null, business: null });

  const business = await getBusiness(session.businessId);
  return ok({ user: toPublicUser(user), business });
});
