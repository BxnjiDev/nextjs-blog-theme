'use client';

import { motion } from 'framer-motion';

/**
 * Every Home (and most other) widget renders through this one card shell —
 * upgrading it here is what gives ~10 different widgets the glass surface,
 * hover glow, and fade-in-on-scroll treatment for free, instead of each
 * widget re-implementing its own motion wrapper.
 *
 * `variant="plain"` drops the glass/border/glow shell entirely — just the
 * title + content — for widgets composed inside an OpenSection instead of
 * standing as their own boxed card. Reducing "card soup" is about
 * container count, not about deleting the widgets themselves.
 */
export default function WidgetCard({
  title,
  action,
  children,
  className = '',
  delay = 0,
  variant = 'card',
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  delay?: number;
  variant?: 'card' | 'plain';
}) {
  if (variant === 'plain') {
    return (
      <div className={className}>
        {title && (
          <div className="mb-2.5 flex items-center justify-between">
            <h3 className="text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">{title}</h3>
            {action}
          </div>
        )}
        {children}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`atlas-glass atlas-hover-glow rounded-xl p-4 transition-[border-color,box-shadow,transform] duration-300 ${className}`}
    >
      {title && (
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </motion.div>
  );
}
