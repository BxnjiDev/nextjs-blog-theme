'use client';

import { motion, type Variants } from 'framer-motion';
import { MOTION } from '@/lib/motion/tokens';

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: MOTION.duration.panel, ease: MOTION.ease.standard } },
};

/** Wrap a grid/list of cards in <StaggerGroup>; wrap each card in
 * <StaggerItem> — the children cascade in one after another instead of
 * popping in as a block. Used for the Home stat row, Portfolio holdings,
 * Recommendation cards, etc. */
export function StaggerGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={container} initial="hidden" animate="visible">
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={item}>
      {children}
    </motion.div>
  );
}
