'use client';

import { motion, useReducedMotion } from 'framer-motion';

/**
 * The one reusable Atlas identity mark — a precision ring around the "A"
 * emblem, state-driven rather than a static logo. Every place Atlas needs
 * to represent itself visually (login, the post-login initialization
 * sequence, Atlas Chat, a future persistent assistant) should render this
 * instead of inventing its own badge/spinner, so the identity reads as one
 * coherent presence across the product.
 *
 * SVG + CSS + Framer Motion only — no 3D/WebGL, per the design brief.
 * Respects prefers-reduced-motion: every animated state (spinning ring,
 * pulsing opacity, streaming scale) collapses to a static frame.
 */
export type AtlasCoreState =
  | 'idle'
  | 'verifying'
  | 'initializing'
  | 'ready'
  | 'attention'
  | 'thinking'
  | 'streaming'
  | 'success'
  | 'warning'
  | 'error'
  | 'offline';

const STATE_LABEL: Record<AtlasCoreState, string> = {
  idle: 'idle',
  verifying: 'verifying identity',
  initializing: 'initializing',
  ready: 'ready',
  attention: 'needs attention',
  thinking: 'thinking',
  streaming: 'responding',
  success: 'success',
  warning: 'warning',
  error: 'error',
  offline: 'offline',
};

// Ring color per state — deliberately NOT the same red for every "active"
// state and the destructive-action red (risk.high). Error uses a dimmed
// steel ring plus a small distinct badge rather than brand red, so a
// system error never reads as "Atlas identity" and is never confused with
// risk.high (used for destructive actions/losses elsewhere in the app).
const STATE_RING_COLOR: Record<AtlasCoreState, string> = {
  idle: '#7c8794',
  verifying: '#7c8794',
  initializing: '#ef3340',
  ready: '#34d399',
  attention: '#f0a020',
  thinking: '#ef3340',
  streaming: '#ef3340',
  success: '#34d399',
  warning: '#f0a020',
  error: '#5c6470',
  offline: '#3a3d44',
};

const SPINNING_STATES = new Set<AtlasCoreState>(['verifying', 'initializing', 'thinking', 'streaming']);
const PULSING_STATES = new Set<AtlasCoreState>(['idle', 'attention', 'warning']);

const SIZE_PX: Record<'sm' | 'md' | 'lg' | 'xl', number> = { sm: 32, md: 40, lg: 64, xl: 96 };

export default function AtlasCore({
  state = 'idle',
  size = 'md',
  className = '',
}: {
  state?: AtlasCoreState;
  size?: keyof typeof SIZE_PX;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const px = SIZE_PX[size];
  const ringColor = STATE_RING_COLOR[state];
  const spinning = !reduceMotion && SPINNING_STATES.has(state);
  const pulsing = !reduceMotion && PULSING_STATES.has(state);
  const streamingPulse = !reduceMotion && state === 'streaming';
  const dim = state === 'offline';

  return (
    <div
      role="img"
      aria-label={`Atlas — ${STATE_LABEL[state]}`}
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: px, height: px }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" style={{ opacity: dim ? 0.35 : 1 }} aria-hidden="true">
        <circle cx="50" cy="50" r="46" fill="none" stroke={ringColor} strokeOpacity="0.22" strokeWidth="2" />
        <motion.circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke={ringColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="68 221"
          style={{ transformOrigin: '50% 50%' }}
          animate={spinning ? { rotate: 360 } : pulsing ? { opacity: [0.35, 1, 0.35] } : { opacity: 1, rotate: 0 }}
          transition={
            spinning
              ? { duration: 2.4, repeat: Infinity, ease: 'linear' }
              : pulsing
                ? { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }
                : { duration: 0.4 }
          }
        />
      </svg>

      <motion.div
        className="relative flex items-center justify-center rounded-xl bg-atlas-accent font-bold text-white shadow-glow-accent"
        style={{ width: px * 0.6, height: px * 0.6, fontSize: Math.max(10, px * 0.3) }}
        animate={streamingPulse ? { scale: [1, 1.06, 1] } : { scale: 1 }}
        transition={streamingPulse ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
      >
        A
      </motion.div>

      {state === 'error' && (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-risk-high font-bold text-white"
          style={{ width: px * 0.34, height: px * 0.34, fontSize: Math.max(8, px * 0.2) }}
        >
          !
        </span>
      )}
    </div>
  );
}
