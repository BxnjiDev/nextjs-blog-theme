'use client';

import { MOTION } from '@/lib/motion/tokens';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface TrendPoint {
  label: string;
  value: number;
}

export default function TrendLineChart({
  data,
  color = '#8b5cf6',
  height = 160,
  domain,
}: {
  data: TrendPoint[];
  color?: string;
  height?: number;
  domain?: [number, number];
}) {
  if (data.length < 2) {
    return (
      <div className="flex h-[160px] items-center justify-center text-sm text-atlas-text-tertiary">
        Not enough history yet for a trend chart.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8a86a3' }} stroke="#2a2733" />
        <YAxis tick={{ fontSize: 11, fill: '#8a86a3' }} stroke="#2a2733" domain={domain ?? ['auto', 'auto']} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, backgroundColor: '#08080b', border: '1px solid #2a2733', color: '#f7f5fa' }}
          labelStyle={{ fontWeight: 600, color: '#f7f5fa' }}
          itemStyle={{ color: '#f7f5fa' }}
        />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive animationDuration={MOTION.duration.chart * 1000} />
      </LineChart>
    </ResponsiveContainer>
  );
}
