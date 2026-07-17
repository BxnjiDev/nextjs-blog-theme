import type { Metadata } from 'next';
import '../styles/globals.css';
import Nav from '@/components/Nav';
import EvaluationBanner from '@/components/EvaluationBanner';
import { prisma } from '@/lib/prisma';

export const metadata: Metadata = {
  title: 'Atlas — Portfolio Intelligence',
  description:
    'Recommendation-only portfolio monitoring and analysis. No autonomous trade execution.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Whether to show the evaluation-mode banner is a live DB check, not a
  // build-time flag — it's true whenever a synced account has been marked
  // isEvaluationAccount (lib/domain/accountSync.ts), so it never goes out
  // of sync with what's actually connected.
  const evaluationAccount = await prisma.account.findFirst({ where: { isEvaluationAccount: true } }).catch(() => null);

  return (
    <html lang="en">
      <body>
        {evaluationAccount && <EvaluationBanner />}
        <Nav />
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
