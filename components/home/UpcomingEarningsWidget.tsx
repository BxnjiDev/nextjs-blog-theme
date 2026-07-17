import Link from 'next/link';
import WidgetCard from './WidgetCard';
import type { UpcomingEarnings } from '@/lib/domain/homeDashboard';

export default function UpcomingEarningsWidget({ earnings }: { earnings: UpcomingEarnings[] }) {
  return (
    <WidgetCard title="Upcoming earnings">
      {earnings.length === 0 ? (
        <p className="text-sm text-atlas-text-tertiary">Nothing on the calendar in the near term.</p>
      ) : (
        <ul className="space-y-2">
          {earnings.map((e) => (
            <li key={`${e.symbol}-${e.fiscalYear}-${e.fiscalPeriod}`} className="flex items-center justify-between text-sm">
              <Link href={`/intelligence/${e.symbol}`} className="font-medium text-atlas-text underline decoration-atlas-border underline-offset-2 hover:decoration-atlas-text-secondary">
                {e.symbol}
              </Link>
              <span className="text-xs text-atlas-text-tertiary">
                {e.fiscalPeriod} FY{e.fiscalYear} · {e.reportDate.toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
