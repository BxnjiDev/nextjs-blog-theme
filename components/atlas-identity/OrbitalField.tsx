'use client';

import { motion, useReducedMotion } from 'framer-motion';

/**
 * Thin, restrained orbital rings — the one recurring Atlas motif for
 * "intelligence / systems / connected information" moments (login,
 * initialization, the Atlas core itself). Purely decorative (aria-hidden);
 * never carries state on its own. SVG + Framer Motion transform/opacity
 * only, so it's cheap regardless of how many are on screen at once.
 *
 * `variant="resolving"` staggers each ring in (used for the "Atlas
 * awakening" initialization stage); `variant="ambient"` is already-settled
 * background geometry (used behind the login composition). Both rotate
 * slowly and continuously unless prefers-reduced-motion is set, in which
 * case they render as a static frame — an orbital ring is exactly the kind
 * of "perpetual motion" the brief says to avoid under reduced motion.
 */
export default function OrbitalField({
  className = '',
  size = 360,
  variant = 'ambient',
}: {
  className?: string;
  size?: number;
  variant?: 'ambient' | 'resolving';
}) {
  const reduceMotion = useReducedMotion();
  const vb = 400;
  const c = vb / 2;
  const rings = [
    { r: 120, opacity: 0.26, width: 1, dash: '1 7', duration: 70 },
    { r: 152, opacity: 0.16, width: 1, dash: '0.5 11', duration: 95 },
    { r: 182, opacity: 0.1, width: 1, dash: '2 4', duration: 130 },
  ];

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${vb} ${vb}`}
      width={size}
      height={size}
      className={`pointer-events-none ${className}`}
    >
      <defs>
        <linearGradient id="atlas-orbital-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="100%" stopColor="#d946ef" />
        </linearGradient>
      </defs>
      {rings.map((ring, i) => (
        <motion.circle
          key={i}
          cx={c}
          cy={c}
          r={ring.r}
          fill="none"
          stroke="url(#atlas-orbital-gradient)"
          strokeWidth={ring.width}
          strokeDasharray={ring.dash}
          strokeOpacity={ring.opacity}
          style={{ transformOrigin: '50% 50%' }}
          initial={variant === 'resolving' ? { opacity: 0, scale: 0.86 } : false}
          animate={
            reduceMotion
              ? { opacity: ring.opacity, scale: 1, rotate: 0 }
              : variant === 'resolving'
                ? { opacity: ring.opacity, scale: 1, rotate: 360 }
                : { rotate: 360 }
          }
          transition={
            reduceMotion
              ? { duration: 0.4 }
              : variant === 'resolving'
                ? {
                    opacity: { duration: 0.7, delay: i * 0.16 },
                    scale: { duration: 0.7, delay: i * 0.16, ease: [0.16, 1, 0.3, 1] },
                    rotate: { duration: ring.duration, repeat: Infinity, ease: 'linear' },
                  }
                : { duration: ring.duration, repeat: Infinity, ease: 'linear' }
          }
        />
      ))}
    </svg>
  );
}
