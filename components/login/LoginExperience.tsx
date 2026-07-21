'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import BootSequence from './BootSequence';
import StatusBanner from '@/components/StatusBanner';

/**
 * Client wrapper so app/login/page.tsx (a server component, needed to read
 * searchParams and pass the `login` Server Action through) can stay a thin
 * shell while all the boot-sequence state lives here. `hasError` starts the
 * form already `booted` — a failed-login redirect lands back on this same
 * route and nobody wants to sit through the intro a second time.
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-atlas-canvas px-6">
      <div className="pointer-events-none absolute inset-0 bg-atlas-radial" />

      <AnimatePresence>{!booted && <BootSequence onComplete={() => setBooted(true)} />}</AnimatePresence>

      <motion.div
        initial={false}
        animate={booted ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: booted && !hasError ? 0.15 : 0 }}
        className="relative w-full max-w-sm"
      >
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-atlas-accent text-sm font-bold text-white shadow-glow-accent">
            A
          </div>
          <p className="text-xl font-semibold tracking-tight text-atlas-text">Atlas</p>
          <p className="mt-1 text-sm text-atlas-text-tertiary">Personal investment operating system</p>
        </div>

        <form
          action={loginAction}
          className="atlas-glass space-y-4 rounded-2xl p-6"
        >
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
              className="w-full rounded-lg border border-atlas-border bg-atlas-surface-raised px-3 py-2 text-sm text-atlas-text placeholder:text-atlas-text-tertiary transition-colors focus:border-atlas-accent/50 focus:outline-none focus:ring-1 focus:ring-atlas-accent/40"
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
                className="w-full rounded-lg border border-atlas-border bg-atlas-surface-raised px-3 py-2 pr-10 text-sm text-atlas-text placeholder:text-atlas-text-tertiary transition-colors focus:border-atlas-accent/50 focus:outline-none focus:ring-1 focus:ring-atlas-accent/40"
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
            className="w-full rounded-lg bg-atlas-accent px-3 py-2 text-sm font-medium text-white transition-all hover:bg-atlas-accent-bright hover:shadow-glow-accent active:scale-[0.98]"
          >
            Sign in
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-atlas-text-tertiary">
          Private application. Access is restricted to the configured Atlas OS account.
        </p>
      </motion.div>
    </div>
  );
}
