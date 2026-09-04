import { clearSessionCookie } from '@/lib/auth';
import { ok, withErrorHandling } from '@/lib/api-helpers';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async () => {
  clearSessionCookie();
  return ok({ ok: true });
});
