'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

export interface AllocationSlice {
  label: string;
  value: number;
}

// Crimson/steel/graphite family, alternating warm and cool so adjacent
// slices stay distinguishable — deliberately not a rainbow set, and
// deliberately not all-red (a portfolio breakdown is data, not a brand
// moment), so it reads as "one product's chart" drawn from the Atlas
// identity rather than a generic charting-library default.
const PALETTE = ['#d72638', '#7c8794', '#8f1424', '#9aa1ab', '#ef3340', '#4a4e58', '#b23a4a', '#5c6470', '#33363d'];

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
          animationDuration={900}
          animationEasing="ease-out"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="transparent" />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, backgroundColor: '#0b0b0d', border: '1px solid #26262c', color: '#f5f5f6' }}
          itemStyle={{ color: '#f5f5f6' }}
          formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
