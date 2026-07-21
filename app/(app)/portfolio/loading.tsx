/**
 * Portfolio-specific skeleton (the generic LoadingState — used as the
 * fallback for every route without its own loading.tsx — doesn't have an
 * orb hero, a chart, or a two-column allocation/holdings shape). Mirrors
 * the real Constellation-page layout: orb + value hero, six-stat strip,
 * flight-path chart with a floating period-toggle pill, then the
 * allocation+holdings composition.
 */
export default function Loading() {
  return (
    <div className="space-y-14">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="atlas-shimmer h-24 w-24 shrink-0 rounded-full" />
        <div className="space-y-3">
          <div className="atlas-shimmer h-3 w-20 rounded-full" />
          <div className="flex items-baseline gap-4">
            <div className="atlas-shimmer h-14 w-48 rounded-lg" />
            <div className="atlas-shimmer h-7 w-28 rounded-full" />
          </div>
          <div className="atlas-shimmer h-3 w-64 rounded-full" />
        </div>
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
        <div className="space-y-2">
          <div className="atlas-shimmer h-2.5 w-24 rounded-full" />
          <div className="atlas-shimmer h-8 w-40 rounded" />
        </div>
        <div className="relative mt-3">
          <div className="atlas-shimmer absolute right-1 top-1 h-7 w-28 rounded-lg sm:right-2 sm:top-2" />
          <div className="atlas-shimmer h-[280px] w-full rounded-2xl" />
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[280px_1fr]">
        <div className="atlas-shimmer h-72 rounded-2xl" />
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="atlas-shimmer h-4 w-24 rounded" />
            <div className="atlas-shimmer h-7 w-40 rounded-lg" />
          </div>
          <div className="atlas-shimmer h-[380px] w-full rounded-2xl" />
        </div>
      </div>

      <p className="sr-only">Loading portfolio…</p>
    </div>
  );
}
