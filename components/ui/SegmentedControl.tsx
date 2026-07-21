'use client';

import type { LucideIcon } from 'lucide-react';

/**
 * The one "pick one of a few views" toggle — an audit found this
 * reimplemented twice with different markup (the Constellation/Table view
 * toggle, the Compact/Comfortable density toggle) and the period toggle on
 * PerformanceChart as a third variant. One generic component, driven by a
 * value/onChange pair like any other controlled input, replaces all three.
 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  /** Hide this option below the `sm` breakpoint (e.g. a view that doesn't
   * translate to mobile, like the holdings constellation). */
  hideOnMobile?: boolean;
}

export default function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className = '',
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  className?: string;
}) {
  return (
    <div className={`flex rounded-lg border border-atlas-border p-0.5 ${className}`}>
      {options.map((opt) => {
        const active = value === opt.value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`atlas-press flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              opt.hideOnMobile ? 'hidden sm:flex' : ''
            } ${active ? 'bg-atlas-surface-raised text-atlas-text' : 'text-atlas-text-tertiary hover:text-atlas-text-secondary'}`}
          >
            {Icon && <Icon size={13} strokeWidth={1.75} aria-hidden />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
