import type { LucideIcon } from 'lucide-react';
import { ICON_SIZE, ICON_STROKE } from '@/lib/ui/iconSize';

/**
 * The one "nothing to show" treatment — an audit found seven independently
 * hand-written empty-state stylings across the app (different wrapper
 * markup, different phrasing conventions, some boxed, some bare). Two
 * modes cover every real case: `compact` is a bare inline line for
 * embedding inside a card/list/table cell that already has its own
 * container; the default is a centered block (icon + message + optional
 * action) for a section or page that has nothing at all to show.
 */
export default function EmptyState({
  children,
  icon: Icon,
  action,
  compact = false,
  className = '',
}: {
  children: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  if (compact) {
    return <p className={`text-sm text-atlas-text-tertiary ${className}`}>{children}</p>;
  }
  return (
    <div className={`flex flex-col items-center gap-2 py-10 text-center ${className}`}>
      {Icon && <Icon size={ICON_SIZE.lg} strokeWidth={ICON_STROKE} className="text-atlas-text-tertiary" aria-hidden />}
      <p className="max-w-sm text-sm text-atlas-text-tertiary">{children}</p>
      {action}
    </div>
  );
}
