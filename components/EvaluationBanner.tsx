import { EVALUATION_BANNER_TEXT, EVALUATION_MAX_CAPITAL } from '@/lib/domain/evaluationConfig';

export default function EvaluationBanner() {
  return (
    <div className="border-b border-atlas-warning/30 bg-atlas-warning/15 px-6 py-2 text-center text-sm font-medium text-atlas-warning">
      {EVALUATION_BANNER_TEXT} (${EVALUATION_MAX_CAPITAL} experimental balance.)
    </div>
  );
}
