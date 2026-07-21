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
  Menu,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import LockAtlasButton from '@/components/init/LockAtlasButton';

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
// a de-emphasized, collapsible group instead of disappearing. Grouped by
// what the page is for (in plain language, not by data model) rather than
// left as one flat list of ten.
const MORE_GROUPS = [
  {
    label: 'Analysis',
    links: [
      { href: '/holdings', label: 'Holdings' },
      { href: '/risk', label: 'Risk' },
      { href: '/health', label: 'Health' },
      { href: '/opportunities', label: 'Opportunities' },
      { href: '/compare', label: 'Compare' },
      { href: '/simulator', label: 'Simulator' },
    ],
  },
  {
    label: 'Reports',
    links: [
      { href: '/scorecard', label: 'Scorecard' },
      { href: '/briefing', label: 'Daily Briefing' },
    ],
  },
  {
    label: 'Operations',
    links: [
      { href: '/executions', label: 'Executions' },
      { href: '/connections', label: 'Connections' },
    ],
  },
];
const MORE_LINKS = MORE_GROUPS.flatMap((g) => g.links);

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const hasActiveMoreChild = MORE_LINKS.some((l) => isActive(pathname, l.href));
  const [moreOpen, setMoreOpen] = useState(hasActiveMoreChild);

  useEffect(() => {
    if (hasActiveMoreChild) setMoreOpen(true);
    // Only forces the group open when navigation lands inside it — never
    // auto-closes, so a user who manually collapses it while still on one
    // of its routes isn't fought by this effect.
  }, [hasActiveMoreChild]);

  return (
    <nav className="atlas-scrollbar flex-1 space-y-0.5 overflow-y-auto px-3">
      {PRIMARY_LINKS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link key={href} href={href} onClick={onNavigate} className="relative block">
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
          aria-expanded={moreOpen}
          className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary transition-colors hover:text-atlas-text-secondary"
        >
          <span className="flex items-center gap-1.5">
            More
            {hasActiveMoreChild && !moreOpen && <span className="h-1.5 w-1.5 rounded-full bg-atlas-accent-bright" aria-hidden="true" />}
          </span>
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
              <div className="space-y-2.5 pb-2 pt-1">
                {MORE_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="px-2.5 pb-1 text-[10px] font-medium uppercase tracking-wide text-atlas-text-tertiary/70">
                      {group.label}
                    </p>
                    <div className="space-y-0.5">
                      {group.links.map(({ href, label }) => {
                        const active = isActive(pathname, href);
                        return (
                          <Link
                            key={href}
                            href={href}
                            onClick={onNavigate}
                            className={`block rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                              active ? 'bg-atlas-surface-raised text-atlas-text' : 'text-atlas-text-secondary hover:bg-atlas-surface-hover hover:text-atlas-text'
                            }`}
                          >
                            {label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}

function AccountFooter({ userEmail }: { userEmail: string }) {
  const initial = userEmail.trim().charAt(0).toUpperCase() || '?';
  return (
    <div className="border-t border-atlas-border p-3">
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-atlas-surface-hover">
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-atlas-accent to-atlas-steel text-xs font-semibold text-white">
          {initial}
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-atlas-surface bg-atlas-emerald" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-atlas-text" title={userEmail}>
            {userEmail}
          </p>
          <LockAtlasButton className="text-[11px] text-atlas-text-tertiary underline decoration-dotted hover:text-atlas-text-secondary" />
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  // A route change is the one unambiguous signal that navigation succeeded,
  // so the mobile drawer closes itself rather than requiring a second tap.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Focus trap + restoration: while the drawer is a role="dialog", focus
  // must stay inside it (Tab/Shift+Tab wrap at its edges) and Escape or a
  // successful close must hand focus back to the hamburger button that
  // opened it — otherwise a keyboard/screen-reader user is dropped back
  // at the top of the document with no sense of where they are.
  useEffect(() => {
    if (!mobileOpen) return;
    const openButton = openButtonRef.current;
    const drawer = drawerRef.current;
    const focusables = drawer?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'
    );
    focusables?.[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
        return;
      }
      if (e.key !== 'Tab' || !focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      openButton?.focus();
    };
  }, [mobileOpen]);

  return (
    <>
      {/* Mobile top bar: the desktop sidebar is hidden below md, so this is
          the only way to reach navigation on a phone-width viewport. */}
      <div className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-atlas-border bg-atlas-surface/80 px-4 backdrop-blur-xl md:hidden">
        <button
          ref={openButtonRef}
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-atlas-text-secondary transition-colors hover:bg-atlas-surface-hover hover:text-atlas-text"
        >
          <Menu size={18} strokeWidth={1.75} />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-atlas-accent text-[11px] font-bold text-white shadow-glow-accent">
            A
          </div>
          <span className="text-sm font-semibold tracking-tight text-atlas-text">Atlas</span>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 md:hidden"
              aria-hidden="true"
            />
            <motion.aside
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 42 }}
              className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[80vw] flex-col border-r border-atlas-border bg-atlas-surface md:hidden"
            >
              <div className="flex items-center justify-between px-5 py-5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-atlas-accent text-[11px] font-bold text-white shadow-glow-accent">
                    A
                  </div>
                  <span className="text-sm font-semibold tracking-tight text-atlas-text">Atlas</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close navigation"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-atlas-text-secondary transition-colors hover:bg-atlas-surface-hover hover:text-atlas-text"
                >
                  <X size={18} strokeWidth={1.75} />
                </button>
              </div>
              <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
              <AccountFooter userEmail={userEmail} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <aside className="hidden h-screen w-60 shrink-0 flex-col border-r border-atlas-border bg-atlas-surface/60 backdrop-blur-xl md:flex">
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
        <NavLinks pathname={pathname} />
        <AccountFooter userEmail={userEmail} />
      </aside>
    </>
  );
}
