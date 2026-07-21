'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * The one reusable Atlas identity mark — a soft violet/magenta core with
 * thin orbital rings, state-driven rather than a static logo. Every place
 * Atlas needs to represent itself visually (login, the post-login
 * initialization sequence, Atlas Chat, a future persistent assistant)
 * should render this instead of inventing its own badge/spinner, so the
 * identity reads as one coherent presence across the product.
 *
 * Deliberately NOT a square-with-letter app icon — no shield/badge
 * silhouette anywhere. The "core" is a glowing point of light (radial
 * gradient + blur), the identity comes from the color/motion language, not
 * from a mark. SVG + CSS + Framer Motion only — no 3D/WebGL, per the
 * design brief. Respects prefers-reduced-motion: every animated state
 * (spinning ring, pulsing glow, streaming scale) collapses to a static
 * frame.
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

// Ring + core color per state. Identity states (idle/verifying/
// initializing/thinking/streaming) live in the violet→magenta family.
// Semantic states (ready/success = emerald, attention/warning = amber)
// stay semantic, never brand color — and `error` deliberately uses a dim
// steel core plus a small distinct dot, never red, so a fault is never
// confused with Atlas identity or with destructive-action red used
// elsewhere in the app.
const STATE_RING_COLOR: Record<AtlasCoreState, string> = {
  idle: '#8b5cf6',
  verifying: '#8b5cf6',
  initializing: '#a457f7',
  ready: '#34d399',
  attention: '#f0a020',
  thinking: '#8b5cf6',
  streaming: '#d946ef',
  success: '#34d399',
  warning: '#f0a020',
  error: '#87828f',
  offline: '#3a3742',
};

const STATE_CORE_GRADIENT: Record<AtlasCoreState, string> = {
  idle: 'radial-gradient(circle, #c4b5fd 0%, #8b5cf6 45%, rgba(139,92,246,0) 78%)',
  verifying: 'radial-gradient(circle, #c4b5fd 0%, #8b5cf6 45%, rgba(139,92,246,0) 78%)',
  initializing: 'radial-gradient(circle, #e9d5ff 0%, #8b5cf6 40%, #d946ef 78%)',
  ready: 'radial-gradient(circle, #d1fae5 0%, #34d399 50%, rgba(52,211,153,0) 78%)',
  attention: 'radial-gradient(circle, #fde68a 0%, #f0a020 50%, rgba(240,160,32,0) 78%)',
  thinking: 'radial-gradient(circle, #c4b5fd 0%, #8b5cf6 45%, #d946ef 82%)',
  streaming: 'radial-gradient(circle, #f5d0fe 0%, #d946ef 45%, rgba(217,70,239,0) 78%)',
  success: 'radial-gradient(circle, #d1fae5 0%, #34d399 50%, rgba(52,211,153,0) 78%)',
  warning: 'radial-gradient(circle, #fde68a 0%, #f0a020 50%, rgba(240,160,32,0) 78%)',
  error: 'radial-gradient(circle, #b6b2bd 0%, #87828f 55%, rgba(135,130,143,0) 78%)',
  offline: 'radial-gradient(circle, #4a4650 0%, #322f3a 60%, rgba(50,47,58,0) 78%)',
};

const SPINNING_STATES = new Set<AtlasCoreState>(['verifying', 'initializing', 'thinking', 'streaming']);
const PULSING_STATES = new Set<AtlasCoreState>(['idle', 'attention', 'warning']);

const SIZE_PX: Record<'sm' | 'md' | 'lg' | 'xl' | 'xxl', number> = { sm: 32, md: 40, lg: 64, xl: 96, xxl: 148 };

export default function AtlasCore({
  state = 'idle',
  size = 'md',
  className = '',
}: {
  state?: AtlasCoreState;
  size?: keyof typeof SIZE_PX;
  className?: string;
}) {
  // Framer Motion's useReducedMotion reflects the real OS preference from
  // the client's very first render, while SSR always assumes "not reduced"
  // — comparing them straight away causes a hydration mismatch wherever
  // this state feeds a render-time animate() value (as it now does across
  // Home and Portfolio's hero orbs, not just login/init). Gating behind
  // `mounted` keeps the first client render identical to the server's,
  // then reconciles to the true preference in a normal post-mount update.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduceMotionRaw = useReducedMotion();
  const reduceMotion = mounted ? reduceMotionRaw : false;
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
        <circle cx="50" cy="50" r="46" fill="none" stroke={ringColor} strokeOpacity="0.14" strokeWidth="1" />
        <motion.circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke={ringColor}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeDasharray="58 231"
          style={{ transformOrigin: '50% 50%' }}
          animate={spinning ? { rotate: 360 } : pulsing ? { opacity: [0.3, 0.85, 0.3] } : { opacity: 0.7, rotate: 0 }}
          transition={
            spinning
              ? { duration: 3.2, repeat: Infinity, ease: 'linear' }
              : pulsing
                ? { duration: 2.8, repeat: Infinity, ease: 'easeInOut' }
                : { duration: 0.4 }
          }
        />
      </svg>

      <motion.div
        className="relative rounded-full"
        style={{
          width: px * 0.52,
          height: px * 0.52,
          background: STATE_CORE_GRADIENT[state],
          boxShadow: dim ? 'none' : `0 0 ${px * 0.45}px ${ringColor}66`,
          opacity: dim ? 0.4 : 1,
        }}
        animate={streamingPulse ? { scale: [1, 1.1, 1] } : pulsing ? { scale: [1, 1.05, 1] } : { scale: 1 }}
        transition={
          streamingPulse
            ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' }
            : pulsing
              ? { duration: 2.8, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 0.3 }
        }
      />

      {state === 'error' && (
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full bg-risk-high"
          style={{ width: Math.max(6, px * 0.16), height: Math.max(6, px * 0.16) }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
