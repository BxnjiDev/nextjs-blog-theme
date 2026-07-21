import WidgetCard from './WidgetCard';
import AnimatedNumber, { type NumberFormat } from '../motion/AnimatedNumber';

export default function StatWidget({
  title,
  value,
  sublabel,
  tone = 'neutral',
  numericValue,
  format,
}: {
  title: string;
  value: string;
  sublabel?: string;
  tone?: 'neutral' | 'positive' | 'negative';
  /** When provided (with `format`), the value counts up on mount instead
   * of appearing statically — `value` is still required as the accessible
   * fallback text and to cover cases with no clean underlying number
   * (e.g. "No data"). */
  numericValue?: number;
  format?: NumberFormat;
}) {
  const toneClass = tone === 'positive' ? 'text-risk-low' : tone === 'negative' ? 'text-risk-high' : 'text-atlas-text';

  return (
    <WidgetCard title={title}>
      {numericValue != null && format ? (
        <AnimatedNumber value={numericValue} format={format} className={`text-2xl font-semibold ${toneClass}`} />
      ) : (
        <p className={`text-2xl font-semibold ${toneClass}`}>{value}</p>
      )}
      {sublabel && <p className="mt-1 text-xs text-atlas-text-tertiary">{sublabel}</p>}
    </WidgetCard>
  );
}
