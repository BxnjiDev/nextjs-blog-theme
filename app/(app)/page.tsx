import { getHomeDashboardData } from '@/lib/domain/homeDashboard';
import { getPerformanceSummary } from '@/lib/domain/performance';
import { prisma } from '@/lib/prisma';
import StatWidget from '@/components/home/StatWidget';
import MarketStatusWidget from '@/components/home/MarketStatusWidget';
import ProviderStatusWidget from '@/components/home/ProviderStatusWidget';
import LatestSyncWidget from '@/components/home/LatestSyncWidget';
import UpcomingEarningsWidget from '@/components/home/UpcomingEarningsWidget';
import ThesisChangeWidget from '@/components/home/ThesisChangeWidget';
import TodaysFocusWidget from '@/components/home/TodaysFocusWidget';
import QuickActionsWidget from '@/components/home/QuickActionsWidget';
import RecentDecisionsWidget from '@/components/home/RecentDecisionsWidget';
import PerformanceSnapshotWidget from '@/components/home/PerformanceSnapshotWidget';
import RecommendationCard from '@/components/RecommendationCard';
import WidgetCard from '@/components/home/WidgetCard';

export const dynamic = 'force-dynamic';

function formatCurrency(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export default async function HomePage() {
  const [data, performance] = await Promise.all([getHomeDashboardData(), getPerformanceSummary()]);

  const highestConvictionThesis = data.highestConviction
    ? await prisma.recommendation.findUnique({
        where: { id: data.highestConviction.id },
        select: {
          id: true,
          symbol: true,
          action: true,
          confidenceScore: true,
          thesis: true,
          proposedDollarAmount: true,
          percentageOfPortfolio: true,
          dataQualityStatus: true,
          holding: { select: { thesis: { select: { convictionAssessments: { orderBy: { generatedAt: 'desc' }, take: 1, select: { overallScore: true } } } } } },
        },
      })
    : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-atlas-text">
          {data.greeting}
        </h1>
        <p className="mt-1 text-sm text-atlas-text-secondary">
          Here&rsquo;s what deserves your attention right now.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatWidget
          title="Portfolio health"
          value={data.portfolioHealth ? `${data.portfolioHealth.overallScore}/100` : 'No data'}
          sublabel={data.portfolioHealth?.previousScore != null ? `Previously ${data.portfolioHealth.previousScore}/100` : undefined}
          tone={data.portfolioHealth && data.portfolioHealth.overallScore >= 60 ? 'positive' : data.portfolioHealth ? 'negative' : 'neutral'}
        />
        <StatWidget
          title="Cash available"
          value={data.portfolio ? formatCurrency(data.portfolio.cashBalance) : 'No data'}
          sublabel={data.portfolio ? `of ${formatCurrency(data.portfolio.totalValue)} total` : undefined}
        />
        <MarketStatusWidget market={data.market} />
        <LatestSyncWidget sync={data.status.robinhoodSync} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <WidgetCard title="Highest-conviction recommendation">
            {highestConvictionThesis ? (
              <RecommendationCard
                data={{
                  id: highestConvictionThesis.id,
                  symbol: highestConvictionThesis.symbol,
                  action: highestConvictionThesis.action,
                  confidenceScore: highestConvictionThesis.confidenceScore,
                  thesis: highestConvictionThesis.thesis,
                  proposedDollarAmount: highestConvictionThesis.proposedDollarAmount != null ? Number(highestConvictionThesis.proposedDollarAmount) : null,
                  percentageOfPortfolio: highestConvictionThesis.percentageOfPortfolio,
                  dataQualityStatus: highestConvictionThesis.dataQualityStatus,
                  convictionScore: highestConvictionThesis.holding.thesis?.convictionAssessments[0]?.overallScore ?? null,
                }}
              />
            ) : (
              <p className="text-sm text-atlas-text-tertiary">No recommendations generated yet — run the recommendation job or ask Atlas.</p>
            )}
          </WidgetCard>
        </div>
        <ThesisChangeWidget change={data.recentThesisChange} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <TodaysFocusWidget focus={data.todaysFocus} avoid={data.todaysAvoid} />
        <UpcomingEarningsWidget earnings={data.upcomingEarnings} />
        <QuickActionsWidget />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ProviderStatusWidget status={data.status} />
        <PerformanceSnapshotWidget performance={performance} />
        <RecentDecisionsWidget decisions={data.recentDecisions} />
      </div>
    </div>
  );
}
