import { redirect } from 'next/navigation';

import { getSession } from '@/lib/auth';
import { Sidebar } from '@/components/shell/sidebar';
import { Topbar } from '@/components/shell/topbar';
import { AskCopilotButton } from '@/components/shell/ask-copilot-button';

/**
 * Authenticated app shell. A server component (not client) so the current session is read
 * directly via getSession() with no client-side loading flash. Middleware already redirects
 * an unauthenticated request away from here at the edge (by cookie presence only); this
 * redirect is the real, verified check, run against the actual signed session.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={{ name: session.name, email: session.email, role: session.role }} />
        <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
      <AskCopilotButton />
    </div>
  );
}
