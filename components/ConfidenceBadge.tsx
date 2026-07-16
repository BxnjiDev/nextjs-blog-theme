export default function ConfidenceBadge({ score }: { score: number }) {
  const tone = score >= 7 ? 'bg-risk-low/10 text-risk-low' : score >= 4 ? 'bg-risk-medium/10 text-risk-medium' : 'bg-risk-high/10 text-risk-high';

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      Confidence {score}/10
    </span>
  );
}
