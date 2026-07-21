'use client';

import { motion, type Variants } from 'framer-motion';

const variants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0 },
};

/**
 * The one "cards gently float into view" primitive every page reaches for
 * instead of hand-rolling motion.div boilerplate per widget. Triggers via
 * viewport (not just mount) so scrolling a long page — Portfolio's holdings
 * table, Intelligence's timeline — keeps producing new entrances, which is
 * what "scrolling should feel alive" means in practice.
 */
export default function FadeInView({
  children,
  delay = 0,
  className,
  once = true,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  once?: boolean;
}) {
  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin: '-40px' }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
