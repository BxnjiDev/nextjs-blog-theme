import WidgetCard from './WidgetCard';

export default function StatWidget({
  title,
  value,
  sublabel,
  tone = 'neutral',
}: {
  title: string;
  value: string;
  sublabel?: string;
  tone?: 'neutral' | 'positive' | 'negative';
}) {
  const toneClass = tone === 'positive' ? 'text-risk-low' : tone === 'negative' ? 'text-risk-high' : 'text-atlas-text';

  return (
    <WidgetCard title={title}>
      <p className={`text-2xl font-semibold ${toneClass}`}>{value}</p>
      {sublabel && <p className="mt-1 text-xs text-atlas-text-tertiary">{sublabel}</p>}
    </WidgetCard>
  );
}
