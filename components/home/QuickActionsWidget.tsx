import Link from 'next/link';
import { MessageSquareText, ClipboardCheck, PlusCircle, Newspaper } from 'lucide-react';
import WidgetCard from './WidgetCard';

const ACTIONS = [
  { href: '/atlas', label: 'Ask Atlas', icon: MessageSquareText },
  { href: '/recommendations', label: 'Review recommendations', icon: ClipboardCheck },
  { href: '/executions', label: 'Record a trade', icon: PlusCircle },
  { href: '/briefing', label: 'Full daily briefing', icon: Newspaper },
];

export default function QuickActionsWidget() {
  return (
    <WidgetCard title="Quick actions">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ACTIONS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2 rounded-lg border border-atlas-border px-3 py-2.5 text-sm text-atlas-text-secondary transition-colors hover:border-atlas-accent/40 hover:bg-atlas-surface-hover hover:text-atlas-text"
          >
            <Icon size={15} strokeWidth={1.75} />
            {label}
          </Link>
        ))}
      </div>
    </WidgetCard>
  );
}
