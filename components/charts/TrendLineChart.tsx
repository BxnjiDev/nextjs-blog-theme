'use client';

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface TrendPoint {
  label: string;
  value: number;
}

export default function TrendLineChart({
  data,
  color = '#ef3340',
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
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#75767f' }} stroke="#26262c" />
        <YAxis tick={{ fontSize: 11, fill: '#75767f' }} stroke="#26262c" domain={domain ?? ['auto', 'auto']} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, backgroundColor: '#0b0b0d', border: '1px solid #26262c', color: '#f5f5f6' }}
          labelStyle={{ fontWeight: 600, color: '#f5f5f6' }}
          itemStyle={{ color: '#f5f5f6' }}
        />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive animationDuration={900} />
      </LineChart>
    </ResponsiveContainer>
  );
}
