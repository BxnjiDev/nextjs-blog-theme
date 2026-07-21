'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import TrendLineChart from '@/components/charts/TrendLineChart';
import { MOTION } from '@/lib/motion/tokens';

export interface ConvictionAssessmentPoint {
  id: string;
  generatedAt: Date;
  overallScore: number;
}

export interface ThesisChangePoint {
  id: string;
  createdAt: Date;
  changeType: string;
  whatChanged: string | null;
  whyChanged: string | null;
  confidenceBefore: number | null;
  confidenceAfter: number | null;
}

const NEARBY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_WAYPOINTS = 16;

function nearestChange(events: ThesisChangePoint[], at: Date): ThesisChangePoint | null {
  let best: ThesisChangePoint | null = null;
  let bestDiff = Infinity;
  for (const e of events) {
    const diff = Math.abs(e.createdAt.getTime() - at.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      best = e;
    }
  }
  return bestDiff <= NEARBY_WINDOW_MS ? best : null;
}

/**
 * The signature thesis-exploration interaction: conviction history and
 * thesis-change history used to be two disconnected sections (a trend
 * chart, then a separate flat list of change events with no link back to
 * the number). Here they're one instrument — a row of waypoints under the
 * trend line, one per conviction reading, brighter where a thesis change
 * actually happened nearby. Click a waypoint to reveal what changed and
 * why, right at that point in the curve — exploring *why* conviction moved
 * instead of just reading that it did. Reuses the same dots-on-a-line,
 * click-to-expand grammar as Home's OrbitRow and the Timeline river, so
 * this reads as the same instrument, not a bespoke one-off widget.
 */
export default function ConvictionScrubber({
  assessments,
  changes,
}: {
  assessments: ConvictionAssessmentPoint[];
  changes: ThesisChangePoint[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const chartData = assessments.map((a) => ({ label: a.generatedAt.toLocaleDateString(), value: a.overallScore }));
  const waypoints = assessments.slice(-MAX_WAYPOINTS);
  const selected = waypoints.find((w) => w.id === selectedId) ?? null;
  const selectedChange = selected ? nearestChange(changes, selected.generatedAt) : null;

  return (
    <div>
      <TrendLineChart data={chartData} domain={[0, 100]} />

      {waypoints.length > 0 && (
        <div className="mt-4 border-t border-atlas-border-subtle pt-4">
          <div className="relative">
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-[2%] top-[5px] h-px bg-atlas-border" />
            <div className="relative flex justify-between gap-0.5">
              {waypoints.map((w) => {
                const change = nearestChange(changes, w.generatedAt);
                const isSelected = w.id === selectedId;
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setSelectedId((prev) => (prev === w.id ? null : w.id))}
                    aria-expanded={isSelected}
                    aria-label={`Conviction ${w.overallScore}/100 on ${w.generatedAt.toLocaleDateString()}${change ? ' — thesis changed nearby' : ''}`}
                    className="atlas-press flex min-h-11 flex-1 flex-col items-center justify-start gap-2 py-1"
                  >
                    <span
                      aria-hidden="true"
                      className={`block rounded-full transition-colors ${
                        isSelected
                          ? 'h-[11px] w-[11px] bg-atlas-accent-bright shadow-glow-accent'
                          : change
                            ? 'h-[9px] w-[9px] bg-atlas-lavender'
                            : 'h-[7px] w-[7px] bg-atlas-border'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <AnimatePresence initial={false} mode="wait">
            {selected && (
              <motion.div
                key={selected.id}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: MOTION.duration.modal, ease: MOTION.ease.standard }}
                className="overflow-hidden"
              >
                <div className="pt-4 text-sm">
                  <p className="font-mono text-xs text-atlas-text-tertiary">
                    {selected.generatedAt.toLocaleDateString()} · conviction {selected.overallScore}/100
                  </p>
                  {selectedChange ? (
                    <div className="mt-2">
                      <p className="text-xs uppercase tracking-wide text-atlas-text-tertiary">
                        {selectedChange.changeType.replace(/_/g, ' ').toLowerCase()}
                      </p>
                      {selectedChange.whatChanged && <p className="mt-1 font-medium text-atlas-text">{selectedChange.whatChanged}</p>}
                      {selectedChange.whyChanged && <p className="mt-1 text-atlas-text-secondary">{selectedChange.whyChanged}</p>}
                      {(selectedChange.confidenceBefore !== null || selectedChange.confidenceAfter !== null) && (
                        <p className="mt-1 text-xs text-atlas-text-tertiary">
                          Confidence: {selectedChange.confidenceBefore ?? 'n/a'} → {selectedChange.confidenceAfter ?? 'n/a'}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-atlas-text-tertiary">No thesis change recorded near this reading — a routine re-score.</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
