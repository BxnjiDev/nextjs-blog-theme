import WidgetCard from './WidgetCard';
import type { MarketStatus } from '@/lib/domain/marketHours';

export default function MarketStatusWidget({ market }: { market: MarketStatus }) {
  return (
    <WidgetCard title="Market status">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          {market.isOpen && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-risk-low opacity-60" />}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${market.isOpen ? 'bg-risk-low' : 'bg-atlas-text-tertiary'}`} />
        </span>
        <p className="text-2xl font-semibold text-atlas-text">{market.label}</p>
      </div>
      <p className="mt-1 text-xs text-atlas-text-tertiary">{market.detail}</p>
    </WidgetCard>
  );
}
