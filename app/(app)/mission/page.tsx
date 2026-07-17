import { ShieldCheck, Target, Brain, GitBranch } from 'lucide-react';
import { EVALUATION_RULES_SUMMARY, EVALUATION_MAX_CAPITAL } from '@/lib/domain/evaluationConfig';

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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-atlas-text">Mission</h1>
        <p className="mt-1 text-sm text-atlas-text-secondary">
          What Atlas is, what it isn&rsquo;t, and the rules it operates under.
        </p>
      </div>

      <div className="rounded-xl border border-atlas-border bg-atlas-surface p-5">
        <p className="text-atlas-text">
          Atlas is a personal investment operating system — a way of keeping a real, evolving record of why every
          position exists, watching that reasoning for changes, and surfacing what deserves attention today. It is
          not a trading bot, not an autonomous agent, and not a general-purpose assistant. Every judgment it forms
          is grounded in real data and stays entirely in your hands to act on.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {PRINCIPLES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border border-atlas-border bg-atlas-surface p-5">
            <Icon size={18} strokeWidth={1.75} className="mb-3 text-atlas-accent" />
            <h2 className="mb-1.5 font-medium text-atlas-text">{title}</h2>
            <p className="text-sm text-atlas-text-secondary">{body}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-atlas-border bg-atlas-surface p-5">
        <h2 className="mb-3 font-medium text-atlas-text">Evaluation-account rules</h2>
        <p className="mb-3 text-sm text-atlas-text-secondary">
          While a real (small, ${EVALUATION_MAX_CAPITAL}-max) Robinhood account is connected for recommendation-only
          testing, Atlas enforces these rules structurally — not just by convention:
        </p>
        <ul className="space-y-1.5 text-sm text-atlas-text-secondary">
          {EVALUATION_RULES_SUMMARY.map((rule) => (
            <li key={rule} className="flex gap-2">
              <span className="text-atlas-accent">·</span>
              {rule}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
