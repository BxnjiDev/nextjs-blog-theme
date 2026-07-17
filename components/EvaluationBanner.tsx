import { EVALUATION_BANNER_TEXT, EVALUATION_MAX_CAPITAL } from '@/lib/domain/evaluationConfig';

export default function EvaluationBanner() {
  return (
    <div className="border-b border-amber-300 bg-amber-50 px-6 py-2 text-center text-sm font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      {EVALUATION_BANNER_TEXT} (${EVALUATION_MAX_CAPITAL} experimental balance.)
    </div>
  );
}
