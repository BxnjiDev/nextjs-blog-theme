import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { getGlobalStatus } from '@/lib/domain/globalStatus';
import Sidebar from '@/components/shell/Sidebar';
import PageTransition from '@/components/shell/PageTransition';
import EvaluationBanner from '@/components/EvaluationBanner';
import StatusIndicator from '@/components/StatusIndicator';
import InitializationGate from '@/components/init/InitializationGate';

/**
 * Shell for every authenticated Atlas OS page (everything except /login,
 * which has no sidebar). middleware.ts already redirects unauthenticated
 * requests before they get here — this is a defense-in-depth second check,
 * and the one place that actually loads the user record (needed to show
 * the signed-in email in the sidebar).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [evaluationAccount, status] = await Promise.all([
    prisma.account.findFirst({ where: { isEvaluationAccount: true } }).catch(() => null),
    getGlobalStatus(),
  ]);

  return (
    <InitializationGate>
      <div className="atlas-shell flex min-h-screen flex-col md:flex-row">
        <Sidebar userEmail={user.email} />
        <div className="flex min-h-screen flex-1 flex-col overflow-y-auto">
          {evaluationAccount && <EvaluationBanner />}
          <StatusIndicator status={status} />
          <main className="mx-auto w-full max-w-6xl flex-1 px-8 py-8">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
      </div>
    </InitializationGate>
  );
}
