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

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-atlas-border bg-atlas-surface/60">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-atlas-accent text-[11px] font-bold text-white">
          A
        </div>
        <span className="text-sm font-semibold tracking-tight text-atlas-text">Atlas</span>
      </div>

      <nav className="atlas-scrollbar flex-1 space-y-0.5 overflow-y-auto px-3">
        {PRIMARY_LINKS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                active
                  ? 'bg-atlas-surface-raised text-atlas-text'
                  : 'text-atlas-text-secondary hover:bg-atlas-surface-hover hover:text-atlas-text'
              }`}
            >
              <Icon size={16} strokeWidth={1.75} className={active ? 'text-atlas-accent' : 'text-atlas-text-tertiary group-hover:text-atlas-text-secondary'} />
              {label}
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
            <ChevronDown size={14} className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
          </button>
          {moreOpen && (
            <div className="space-y-0.5 pb-2">
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
          )}
        </div>
      </nav>

      <div className="border-t border-atlas-border px-3 py-3">
        <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5">
          <span className="truncate text-xs text-atlas-text-tertiary" title={userEmail}>
            {userEmail}
          </span>
          <form action={logout}>
            <button type="submit" className="shrink-0 text-xs text-atlas-text-tertiary underline decoration-dotted hover:text-atlas-text-secondary">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
