export default function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-6 w-48 rounded bg-gray-200 dark:bg-gray-800" />
      <div className="h-24 w-full rounded bg-gray-200 dark:bg-gray-800" />
      <div className="h-24 w-full rounded bg-gray-200 dark:bg-gray-800" />
      <p className="sr-only">{label}</p>
    </div>
  );
}
