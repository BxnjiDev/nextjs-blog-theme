export default function RiskGauge({
  label,
  score,
  invert = false,
}: {
  label: string;
  score: number;
  /** Set true when higher = better (e.g. a health score) instead of higher = riskier. */
  invert?: boolean;
}) {
  const tone = invert
    ? score >= 66
      ? 'bg-risk-low'
      : score >= 33
        ? 'bg-risk-medium'
        : 'bg-risk-high'
    : score >= 66
      ? 'bg-risk-high'
      : score >= 33
        ? 'bg-risk-medium'
        : 'bg-risk-low';

  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-gray-700 dark:text-gray-300">{label}</span>
        <span className="font-medium text-gray-900 dark:text-gray-100">{score}/100</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
        <div className={`h-full ${tone}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}
