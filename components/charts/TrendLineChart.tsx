'use client';

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface TrendPoint {
  label: string;
  value: number;
}

export default function TrendLineChart({
  data,
  color = '#5b9fff',
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
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#65666f' }} stroke="#232429" />
        <YAxis tick={{ fontSize: 11, fill: '#65666f' }} stroke="#232429" domain={domain ?? ['auto', 'auto']} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, backgroundColor: '#111214', border: '1px solid #232429', color: '#f2f2f4' }}
          labelStyle={{ fontWeight: 600, color: '#f2f2f4' }}
          itemStyle={{ color: '#f2f2f4' }}
        />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive animationDuration={900} />
      </LineChart>
    </ResponsiveContainer>
  );
}
