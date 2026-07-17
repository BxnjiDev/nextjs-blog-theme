export default function WidgetCard({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-atlas-border bg-atlas-surface p-4 ${className}`}>
      {title && (
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
