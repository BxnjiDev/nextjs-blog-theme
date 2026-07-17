import WidgetCard from './WidgetCard';
import type { MarketStatus } from '@/lib/domain/marketHours';

export default function MarketStatusWidget({ market }: { market: MarketStatus }) {
  return (
    <WidgetCard title="Market status">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${market.isOpen ? 'bg-risk-low' : 'bg-atlas-text-tertiary'}`} />
        <p className="text-2xl font-semibold text-atlas-text">{market.label}</p>
      </div>
      <p className="mt-1 text-xs text-atlas-text-tertiary">{market.detail}</p>
    </WidgetCard>
  );
}
