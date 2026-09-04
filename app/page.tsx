import { redirect } from 'next/navigation';

/**
 * The root route never renders anything itself — it always redirects to /dashboard.
 * Middleware handles bouncing an unauthenticated visitor from /dashboard to /login.
 */
export default function RootPage() {
  redirect('/dashboard');
}
