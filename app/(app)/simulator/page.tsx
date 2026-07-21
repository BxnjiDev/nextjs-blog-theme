import { getSimulatorBaseline } from '@/lib/domain/simulator';
import SimulatorClient from '@/components/SimulatorClient';
import FadeInView from '@/components/motion/FadeInView';

export const dynamic = 'force-dynamic';

export default async function SimulatorPage() {
  const baseline = await getSimulatorBaseline();

  return (
    <div className="space-y-8">
      <FadeInView>
        <h1 className="text-xl font-semibold tracking-tight text-atlas-text">Allocation simulator</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-atlas-text-secondary">
          Edit hypothetical share counts and see concentration, sector exposure, risk, and health scores recompute
          instantly — nothing here touches the real portfolio, no trade is proposed or recorded.
        </p>
      </FadeInView>

      {!baseline || baseline.holdings.length === 0 ? (
        <p className="text-sm text-atlas-text-tertiary">No holdings on record yet — nothing to simulate against.</p>
      ) : (
        <SimulatorClient baseline={baseline} />
      )}
    </div>
  );
}
