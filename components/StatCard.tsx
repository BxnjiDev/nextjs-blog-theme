export default function StatCard({
  label,
  value,
  sublabel,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sublabel?: string;
  tone?: 'neutral' | 'positive' | 'negative';
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-risk-low'
      : tone === 'negative'
        ? 'text-risk-high'
        : 'text-gray-900 dark:text-gray-100';

  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
      {sublabel && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sublabel}</p>}
    </div>
  );
}
