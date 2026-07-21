'use client';

import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

/** Subtle fade+rise on route change — the whole "smooth transitions" ask
 * from the design brief, kept to one small, cheap animation rather than a
 * library of page-specific ones. Framer Motion only animates the wrapper;
 * it never touches data-fetching or business logic. Under
 * prefers-reduced-motion the vertical rise drops out and it's a plain
 * crossfade — this fires on every navigation, so it's the one transition
 * in the app a motion-sensitive user can't avoid seeing. */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduceMotion ? 0.08 : 0.16, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
