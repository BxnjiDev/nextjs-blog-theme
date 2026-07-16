'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

export interface AllocationSlice {
  label: string;
  value: number;
}

const PALETTE = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#65a30d', '#c026d3', '#64748b'];

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
        <Pie data={data} dataKey="value" nameKey="label" innerRadius="55%" outerRadius="85%" paddingAngle={2} isAnimationActive={false}>
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
