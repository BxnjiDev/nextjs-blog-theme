import Link from 'next/link';
import { ShieldCheck, Target, Brain, GitBranch, Compass } from 'lucide-react';
import { EVALUATION_RULES_SUMMARY, EVALUATION_MAX_CAPITAL } from '@/lib/domain/evaluationConfig';
import FadeInView from '@/components/motion/FadeInView';

export const dynamic = 'force-dynamic';

const PRINCIPLES = [
  {
    icon: Target,
    title: 'Recommendation-only, always',
    body: 'Atlas reads your account, analyzes the portfolio, and proposes what it would do — it never submits, previews, cancels, or modifies a brokerage order. Every trade is placed by you, manually, in your own brokerage app.',
  },
  {
    icon: Brain,
    title: 'Evidence over opinion',
    body: 'Every score you see (risk, health, conviction, confidence calibration) is plain code over real fetched data, not an invented number. Claude is used for narrative reasoning and grounded retrospective reflection — never for the numbers themselves.',
  },
  {
    icon: GitBranch,
    title: 'Memory, not a fresh take every day',
    body: "Atlas tracks whether a thesis is strengthening or weakening over time, grades its own past calls with hindsight, and explains every change with evidence rather than regenerating an opinion from scratch each morning.",
  },
  {
    icon: ShieldCheck,
    title: "Honest about what it doesn't know",
    body: 'When market data, fundamentals, or account freshness are missing or stale, Atlas says so and downgrades confidence — or blocks the recommendation outright — rather than filling the gap with a guess.',
  },
];

export default function MissionPage() {
  return (
    <div className="space-y-16">
      <FadeInView>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-atlas-text-tertiary">Doctrine</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-atlas-text">Mission</h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-atlas-text-secondary">
          Atlas is a personal investment operating system — a way of keeping a real, evolving record of why every
          position exists, watching that reasoning for changes, and surfacing what deserves attention today. It is
          not a trading bot, not an autonomous agent, and not a general-purpose assistant. Every judgment it forms
          is grounded in real data and stays entirely in your hands to act on.
        </p>
      </FadeInView>

      {/* A numbered doctrine, not a grid of icon cards — each principle
          gets room to read like a governing rule rather than a feature
          bullet. */}
      <div className="space-y-10">
        {PRINCIPLES.map(({ icon: Icon, title, body }, i) => (
          <FadeInView key={title} delay={i * 0.05}>
            <div className="flex gap-5 border-t border-atlas-border-subtle pt-6">
              <div className="flex shrink-0 flex-col items-center">
                <span className="font-mono text-xs text-atlas-text-tertiary">{String(i + 1).padStart(2, '0')}</span>
                <Icon size={16} strokeWidth={1.75} className="mt-2 text-atlas-accent-bright" />
              </div>
              <div>
                <h2 className="text-base font-medium text-atlas-text">{title}</h2>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-atlas-text-secondary">{body}</p>
              </div>
            </div>
          </FadeInView>
        ))}
      </div>

      <FadeInView>
        <div className="border-t border-atlas-border-subtle pt-8">
          <h2 className="mb-3 text-sm font-medium text-atlas-text">Evaluation-account rules</h2>
          <p className="mb-3 max-w-2xl text-sm leading-relaxed text-atlas-text-secondary">
            While a real (small, ${EVALUATION_MAX_CAPITAL}-max) Robinhood account is connected for recommendation-only
            testing, Atlas enforces these rules structurally — not just by convention:
          </p>
          <ul className="space-y-1.5 text-sm text-atlas-text-secondary">
            {EVALUATION_RULES_SUMMARY.map((rule) => (
              <li key={rule} className="flex gap-2">
                <span className="text-atlas-accent-bright">·</span>
                {rule}
              </li>
            ))}
          </ul>
        </div>
      </FadeInView>

      {/* Honest placeholder — no fake checklist state, since there's no
          reminders/checklist/calendar data model yet. Signals direction
          without pretending to persist anything, and links to /briefing,
          which already generates the real content this page will
          eventually surface directly. */}
      <FadeInView>
        <div className="atlas-glass rounded-2xl p-6">
          <div className="flex items-center gap-2 text-atlas-text-secondary">
            <Compass size={16} strokeWidth={1.75} className="text-atlas-cyan" />
            <h2 className="text-sm font-medium text-atlas-text">Atlas Daily — coming soon</h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-atlas-text-tertiary">
            A trading checklist, personal reminders, and calendar integration will live here once that layer is
            built — not before, so nothing on this page pretends to track something it isn&rsquo;t actually
            tracking yet. The portfolio-side content this page will eventually lead with already exists on{' '}
            <Link href="/briefing" className="text-atlas-cyan underline">
              today&rsquo;s Daily Briefing
            </Link>
            .
          </p>
        </div>
      </FadeInView>
    </div>
  );
}
