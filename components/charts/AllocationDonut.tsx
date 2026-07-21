'use client';

import { MOTION } from '@/lib/motion/tokens';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

export interface AllocationSlice {
  label: string;
  value: number;
}

// Violet/magenta/steel family, alternating warm and cool so adjacent
// slices stay distinguishable — deliberately not a rainbow set, and
// deliberately not all-purple (a portfolio breakdown is data, not a brand
// moment), so it reads as "one product's chart" drawn from the Atlas
// identity rather than a generic charting-library default.
const PALETTE = ['#8b5cf6', '#87828f', '#d946ef', '#a6a1b3', '#4c1d95', '#5c5866', '#c4b5fd', '#3f3c48', '#701a75'];

export default function AllocationDonut({ data, height = 220 }: { data: AllocationSlice[]; height?: number }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-atlas-text-tertiary">
        No allocation data available.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius="60%"
          outerRadius="85%"
          paddingAngle={3}
          isAnimationActive
          animationDuration={MOTION.duration.chart * 1000}
          animationEasing="ease-out"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="transparent" />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, backgroundColor: '#08080b', border: '1px solid #2a2733', color: '#f7f5fa' }}
          itemStyle={{ color: '#f7f5fa' }}
          formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
