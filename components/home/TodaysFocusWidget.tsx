import WidgetCard from './WidgetCard';

export default function TodaysFocusWidget({ focus, avoid }: { focus: string[]; avoid: string[] }) {
  return (
    <WidgetCard title="Today's focus">
      {focus.length === 0 && avoid.length === 0 ? (
        <p className="text-sm text-atlas-text-tertiary">
          Nothing stands out yet — run the daily briefing job or open Atlas for a live read.
        </p>
      ) : (
        <div className="space-y-3">
          {focus.length > 0 && (
            <ul className="space-y-1.5 text-sm text-atlas-text-secondary">
              {focus.map((f, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-risk-low">·</span>
                  {f}
                </li>
              ))}
            </ul>
          )}
          {avoid.length > 0 && (
            <ul className="space-y-1.5 text-sm text-atlas-text-tertiary">
              {avoid.map((a, i) => (
                <li key={i} className="flex gap-2">
                  <span>·</span>
                  {a}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </WidgetCard>
  );
}
