'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Wallet,
  Brain,
  Target,
  History,
  TrendingUp,
  Compass,
  Sparkles,
  Settings,
  ChevronDown,
} from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { logout } from '@/app/login/actions';

const PRIMARY_LINKS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/portfolio', label: 'Portfolio', icon: Wallet },
  { href: '/intelligence', label: 'Intelligence', icon: Brain },
  { href: '/recommendations', label: 'Recommendations', icon: Target },
  { href: '/timeline', label: 'Timeline', icon: History },
  { href: '/performance', label: 'Performance', icon: TrendingUp },
  { href: '/mission', label: 'Mission', icon: Compass },
  { href: '/atlas', label: 'Atlas', icon: Sparkles },
  { href: '/settings', label: 'Settings', icon: Settings },
];

// Every pre-Atlas-OS page still exists and still works — these just aren't
// part of the primary 9-item nav the design brief asks for, so they live in
// a de-emphasized, collapsible group instead of disappearing.
const MORE_LINKS = [
  { href: '/holdings', label: 'Holdings' },
  { href: '/risk', label: 'Risk' },
  { href: '/health', label: 'Health' },
  { href: '/opportunities', label: 'Opportunities' },
  { href: '/compare', label: 'Compare' },
  { href: '/simulator', label: 'Simulator' },
  { href: '/scorecard', label: 'Scorecard' },
  { href: '/briefing', label: 'Daily Briefing' },
  { href: '/executions', label: 'Executions' },
  { href: '/connections', label: 'Connections' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const initial = userEmail.trim().charAt(0).toUpperCase() || '?';

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-atlas-border bg-atlas-surface/60 backdrop-blur-xl">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="flex h-6 w-6 items-center justify-center rounded-md bg-atlas-accent text-[11px] font-bold text-white shadow-glow-accent"
        >
          A
        </motion.div>
        <span className="text-sm font-semibold tracking-tight text-atlas-text">Atlas</span>
      </div>

      <nav className="atlas-scrollbar flex-1 space-y-0.5 overflow-y-auto px-3">
        {PRIMARY_LINKS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link key={href} href={href} className="relative block">
              <motion.div
                whileHover={{ x: active ? 0 : 2 }}
                transition={{ duration: 0.15 }}
                className={`relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                  active ? 'text-atlas-text' : 'text-atlas-text-secondary hover:text-atlas-text'
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="sidebar-active-pill"
                    className="absolute inset-0 rounded-lg border border-atlas-border bg-atlas-surface-raised"
                    transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                  />
                )}
                <Icon
                  size={16}
                  strokeWidth={1.75}
                  className={`relative z-10 shrink-0 transition-colors ${
                    active ? 'text-atlas-accent-bright' : 'text-atlas-text-tertiary group-hover:text-atlas-text-secondary'
                  }`}
                />
                <span className="relative z-10">{label}</span>
              </motion.div>
            </Link>
          );
        })}

        <div className="pt-2">
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary transition-colors hover:text-atlas-text-secondary"
          >
            More
            <motion.span animate={{ rotate: moreOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown size={14} />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {moreOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="space-y-0.5 pb-2 pt-0.5">
                  {MORE_LINKS.map(({ href, label }) => {
                    const active = isActive(pathname, href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={`block rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                          active ? 'bg-atlas-surface-raised text-atlas-text' : 'text-atlas-text-secondary hover:bg-atlas-surface-hover hover:text-atlas-text'
                        }`}
                      >
                        {label}
                      </Link>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </nav>

      <div className="border-t border-atlas-border p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-atlas-surface-hover">
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-atlas-accent to-atlas-cyan text-xs font-semibold text-white">
            {initial}
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-atlas-surface bg-atlas-emerald" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-atlas-text" title={userEmail}>
              {userEmail}
            </p>
            <form action={logout}>
              <button type="submit" className="text-[11px] text-atlas-text-tertiary underline decoration-dotted hover:text-atlas-text-secondary">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}
