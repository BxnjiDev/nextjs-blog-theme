/**
 * The shared skeleton behind every route's loading.tsx (~15 routes) — one
 * generic shape (eyebrow + hero line + hairline stat strip + card block)
 * reads plausibly as "about to become" almost any page in Atlas, so every
 * route gets a premium loading state without a bespoke skeleton per page.
 * Uses .atlas-shimmer (styles/globals.css) rather than a flat pulse, so
 * the wait itself feels like part of the product, not a placeholder.
 */
export default function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <div className="atlas-shimmer h-3 w-24 rounded-full" />
        <div className="atlas-shimmer h-9 w-72 rounded-lg" />
      </div>
      <div className="flex flex-wrap gap-x-10 gap-y-4 border-y border-atlas-border-subtle py-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <div className="atlas-shimmer h-2.5 w-20 rounded-full" />
            <div className="atlas-shimmer h-5 w-16 rounded" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <div className="atlas-shimmer h-32 w-full rounded-2xl" />
        <div className="atlas-shimmer h-32 w-full rounded-2xl" />
      </div>
      <p className="sr-only">{label}</p>
    </div>
  );
}
