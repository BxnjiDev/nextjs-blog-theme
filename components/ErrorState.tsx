'use client';

export default function ErrorState({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-risk-high/50 p-8 text-center">
      <h1 className="text-lg font-semibold text-risk-high">Something went wrong</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{error.message}</p>
      <button
        onClick={reset}
        className="mt-4 rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
      >
        Try again
      </button>
    </div>
  );
}
