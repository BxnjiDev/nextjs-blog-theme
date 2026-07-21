'use client';

import { motion } from 'framer-motion';

/**
 * An "open" grouping of several small widgets — a hairline top border and
 * a heading, then children laid out in columns separated by hairline
 * dividers, no enclosing card/glass/border around the group. This is the
 * decluttering primitive for Home: several related plain-variant
 * WidgetCards live inside one OpenSection instead of standing as their
 * own separately-bordered boxes ("card soup").
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
}: {
  title: string;
  children: React.ReactNode;
  delay?: number;
  columns?: 2 | 3;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      className="border-t border-atlas-border-subtle pt-6"
    >
      <h2 className="mb-5 text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">{title}</h2>
      <div className={`grid gap-6 divide-y divide-atlas-border-subtle sm:gap-8 sm:divide-x sm:divide-y-0 ${COLUMN_CLASS[columns]}`}>
        {children}
      </div>
    </motion.div>
  );
}
