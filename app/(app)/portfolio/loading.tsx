/**
 * Portfolio-specific skeleton (the generic LoadingState — used as the
 * fallback for every route without its own loading.tsx — doesn't have a
 * chart or a two-column allocation/holdings shape). Mirrors the real
 * layout: hero, six-stat strip, chart with period-toggle pills, then the
 * allocation+holdings composition.
 */
export default function Loading() {
  return (
    <div className="space-y-14">
      <div className="space-y-3">
        <div className="atlas-shimmer h-3 w-20 rounded-full" />
        <div className="flex items-baseline gap-4">
          <div className="atlas-shimmer h-14 w-48 rounded-lg" />
          <div className="atlas-shimmer h-7 w-28 rounded-full" />
        </div>
        <div className="atlas-shimmer h-3 w-64 rounded-full" />
      </div>

      <div className="flex flex-wrap gap-x-10 gap-y-4 border-y border-atlas-border-subtle py-5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="space-y-2">
            <div className="atlas-shimmer h-2.5 w-20 rounded-full" />
            <div className="atlas-shimmer h-5 w-16 rounded" />
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="atlas-shimmer h-2.5 w-24 rounded-full" />
            <div className="atlas-shimmer h-6 w-32 rounded" />
          </div>
          <div className="atlas-shimmer h-7 w-28 rounded-lg" />
        </div>
        <div className="atlas-shimmer mt-4 h-52 w-full rounded-2xl" />
      </div>

      <div className="grid gap-10 lg:grid-cols-[280px_1fr]">
        <div className="atlas-shimmer h-72 rounded-2xl" />
        <div className="space-y-3">
          <div className="atlas-shimmer h-4 w-24 rounded" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="atlas-shimmer h-10 w-full rounded-lg" />
          ))}
        </div>
      </div>

      <p className="sr-only">Loading portfolio…</p>
    </div>
  );
}
