import { getSimulatorBaseline } from '@/lib/domain/simulator';
import SimulatorClient from '@/components/SimulatorClient';

export const dynamic = 'force-dynamic';

export default async function SimulatorPage() {
  const baseline = await getSimulatorBaseline();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Portfolio Allocation Simulator</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Drag hypothetical share counts and see concentration, sector exposure, risk, and health scores recompute
          instantly — nothing here touches the real portfolio, no trade is proposed or recorded.
        </p>
      </div>

      {!baseline || baseline.holdings.length === 0 ? (
        <p className="text-sm text-gray-500">No holdings on record yet — nothing to simulate against.</p>
      ) : (
        <SimulatorClient baseline={baseline} />
      )}
    </div>
  );
}
