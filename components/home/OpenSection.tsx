'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { MOTION } from '@/lib/motion/tokens';

/**
 * An "open" grouping of several small widgets — a hairline top border and
 * a heading, then children laid out in columns separated by hairline
 * dividers, no enclosing card/glass/border around the group. This is the
 * decluttering primitive for Home: several related plain-variant
 * WidgetCards live inside one OpenSection instead of standing as their
 * own separately-bordered boxes ("card soup").
 *
 * Collapsible (defaults open) — the progressive-disclosure control the
 * design brief asks for: secondary information stays reachable without
 * permanently occupying scroll space for a user who wants a shorter page.
 */
const COLUMN_CLASS: Record<2 | 3, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
};

export default function OpenSection({
  title,
  children,
  delay = 0,
  columns = 3,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  delay?: number;
  columns?: 2 | 3;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: MOTION.duration.panel, delay, ease: MOTION.ease.standard }}
      className="border-t border-atlas-border-subtle pt-6"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mb-5 flex w-full items-center justify-between text-left"
      >
        <h2 className="text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">{title}</h2>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: MOTION.duration.micro }}>
          <ChevronDown size={14} className="text-atlas-text-tertiary" aria-hidden="true" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: MOTION.duration.modal, ease: MOTION.ease.standard }}
            className="overflow-hidden"
          >
            <div className={`grid gap-6 divide-y divide-atlas-border-subtle sm:gap-8 sm:divide-x sm:divide-y-0 ${COLUMN_CLASS[columns]}`}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
