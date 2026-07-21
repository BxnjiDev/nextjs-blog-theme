'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

export interface AllocationSlice {
  label: string;
  value: number;
}

// A cool blue/cyan/violet/teal family — deliberately not a rainbow set, so
// a many-holding portfolio still reads as "one product's chart" rather
// than a generic charting-library default.
const PALETTE = ['#3b82f6', '#22d3ee', '#818cf8', '#34d399', '#38bdf8', '#a78bfa', '#2dd4bf', '#60a5fa', '#94a3b8'];

export default function AllocationDonut({ data, height = 220 }: { data: AllocationSlice[]; height?: number }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
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
          contentStyle={{ fontSize: 12, borderRadius: 8, backgroundColor: '#111214', border: '1px solid #232429', color: '#f2f2f4' }}
          itemStyle={{ color: '#f2f2f4' }}
          formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
