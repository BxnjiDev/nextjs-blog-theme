/**
 * The one section/eyebrow heading style — an audit found three competing
 * conventions for "the small label above a section" (`text-[11px]`,
 * `text-xs`, `text-[10px]`; `tracking-wide` vs `tracking-wider`) applied
 * inconsistently by role rather than by a single shared component. Every
 * section title in the app (a page's "Holdings"/"Allocation"/"Performance"
 * header, a card's title slot) should render through this.
 */
export default function SectionHeading({
  children,
  action,
  as: As = 'h2',
  className = '',
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <As className="text-[11px] font-medium uppercase tracking-wide text-atlas-text-tertiary">{children}</As>
      {action}
    </div>
  );
}
