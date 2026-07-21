'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import BootSequence from './BootSequence';
import StatusBanner from '@/components/StatusBanner';
import AtlasCore from '@/components/atlas-identity/AtlasCore';
import OrbitalField from '@/components/atlas-identity/OrbitalField';

/**
 * Client wrapper so app/login/page.tsx (a server component, needed to read
 * searchParams and pass the `login` Server Action through) can stay a thin
 * shell while all the boot-sequence state lives here. `hasError` starts the
 * form already `booted` — a failed-login redirect lands back on this same
 * route and nobody wants to sit through the intro a second time.
 *
 * Asymmetric composition, not a centered admin card: a large editorial
 * identity statement on one side, a compact authorization form on the
 * other, both floating directly on the atmospheric canvas rather than
 * boxed into a single bordered panel.
 */
export default function LoginExperience({
  loginAction,
  hasError,
}: {
  loginAction: (formData: FormData) => void;
  hasError: boolean;
}) {
  const [booted, setBooted] = useState(hasError);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-atlas-canvas">
      <div className="pointer-events-none absolute inset-0 bg-atlas-aurora" />

      <AnimatePresence>{!booted && <BootSequence onComplete={() => setBooted(true)} />}</AnimatePresence>

      <motion.div
        initial={false}
        animate={booted ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: booted && !hasError ? 0.15 : 0 }}
        className="relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col justify-center gap-12 px-6 py-14 lg:flex-row lg:items-center lg:gap-20 lg:px-12"
      >
        {/* Identity + editorial statement */}
        <div className="relative flex flex-1 flex-col items-start">
          <div className="relative flex items-center justify-center">
            <OrbitalField size={220} variant="ambient" className="absolute -left-10 -top-10 opacity-90 lg:h-[300px] lg:w-[300px] lg:-left-20 lg:-top-20" />
            <AtlasCore state="idle" size="lg" />
          </div>
          <h1 className="relative mt-7 text-4xl font-semibold leading-[1.05] tracking-tight text-atlas-text lg:mt-9 lg:text-6xl">
            Atlas
          </h1>
          <p className="relative mt-4 max-w-sm text-lg leading-relaxed text-atlas-text-secondary lg:text-xl">
            Private intelligence, built around your portfolio.
          </p>
          <p className="relative mt-2 text-sm text-atlas-text-tertiary">Authorize your session to continue.</p>
        </div>

        {/* Compact authorization form — offset lower on desktop for
            deliberate asymmetry, immediately visible (no scroll) on mobile */}
        <div className="relative w-full max-w-sm lg:mt-16 lg:flex-1">
          <form action={loginAction} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-atlas-text-secondary">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full rounded-lg border border-atlas-border bg-atlas-surface-raised px-3 py-2.5 text-sm text-atlas-text placeholder:text-atlas-text-tertiary transition-colors focus:border-atlas-accent-bright/50 focus:outline-none focus:ring-1 focus:ring-atlas-accent-bright/40"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-atlas-text-secondary">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className="w-full rounded-lg border border-atlas-border bg-atlas-surface-raised px-3 py-2.5 pr-10 text-sm text-atlas-text placeholder:text-atlas-text-tertiary transition-colors focus:border-atlas-accent-bright/50 focus:outline-none focus:ring-1 focus:ring-atlas-accent-bright/40"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-atlas-text-tertiary transition-colors hover:text-atlas-text-secondary"
                >
                  {showPassword ? <EyeOff size={15} strokeWidth={1.75} /> : <Eye size={15} strokeWidth={1.75} />}
                </button>
              </div>
            </div>

            {hasError && <StatusBanner variant="error">Invalid email or password.</StatusBanner>}

            <button
              type="submit"
              className="w-full rounded-lg bg-atlas-accent px-3 py-2.5 text-sm font-medium text-white transition-all hover:bg-atlas-accent-bright hover:shadow-glow-accent active:scale-[0.98]"
            >
              Authorize session
            </button>
          </form>

          <p className="mt-6 text-xs text-atlas-text-tertiary">
            Secure local environment · Recommendation-only operating mode.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
