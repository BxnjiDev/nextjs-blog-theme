'use client';

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface TrendPoint {
  label: string;
  value: number;
}

export default function TrendLineChart({
  data,
  color = '#2563eb',
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
      <div className="flex h-[160px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        Not enough history yet for a trend chart.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
        <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} domain={domain ?? ['auto', 'auto']} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          labelStyle={{ fontWeight: 600 }}
          wrapperClassName="!bg-white dark:!bg-gray-900"
        />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
