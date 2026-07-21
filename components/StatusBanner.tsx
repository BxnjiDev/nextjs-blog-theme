'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';

const VARIANTS = {
  success: { icon: CheckCircle2, className: 'border-risk-low/20 bg-risk-low/10 text-risk-low' },
  error: { icon: XCircle, className: 'border-red-500/20 bg-red-500/10 text-red-300' },
  warning: { icon: AlertTriangle, className: 'border-amber-500/20 bg-amber-500/10 text-amber-300' },
  info: { icon: Info, className: 'border-atlas-border bg-atlas-surface-raised text-atlas-text-secondary' },
} as const;

/** A single handcrafted banner for success/error/warning/info feedback —
 * replaces the plain-text divs scattered across Settings/forms so every
 * confirmation or failure gets the same icon + entrance treatment. */
export default function StatusBanner({
  variant,
  children,
  className = '',
}: {
  variant: keyof typeof VARIANTS;
  children: React.ReactNode;
  className?: string;
}) {
  const { icon: Icon, className: variantClassName } = VARIANTS[variant];
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${variantClassName} ${className}`}
    >
      <Icon size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
      <div className="space-y-0.5">{children}</div>
    </motion.div>
  );
}
