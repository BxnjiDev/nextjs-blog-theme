'use client';

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { MOTION } from '@/lib/motion/tokens';

export interface RadarPoint {
  label: string;
  score: number;
}

/**
 * The risk-factor "shape at a glance" — twelve (or nine, for Health)
 * independent 0-100 scores read very differently as a radar silhouette
 * than as a grid of bars: a lopsided shape immediately shows *which kind*
 * of risk dominates, which a scanned list of numbers doesn't communicate
 * nearly as fast. This is the signature visual for Risk/Health; the Meter
 * grid beneath it stays as the accessible, precise per-factor readout —
 * this chart is additive, not a replacement for it.
 */
export default function RiskRadar({ data, color = '#dc2626' }: { data: RadarPoint[]; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={340}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="#2a2733" />
        <PolarAngleAxis dataKey="label" tick={{ fontSize: 11, fill: '#8a86a3' }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, backgroundColor: '#08080b', border: '1px solid #2a2733', color: '#f7f5fa' }}
          labelStyle={{ fontWeight: 600, color: '#f7f5fa' }}
          itemStyle={{ color: '#f7f5fa' }}
        />
        <Radar
          dataKey="score"
          stroke={color}
          fill={color}
          fillOpacity={0.22}
          strokeWidth={2}
          isAnimationActive
          animationDuration={MOTION.duration.chart * 1000}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
