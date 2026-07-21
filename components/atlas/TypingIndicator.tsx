export default function TypingIndicator({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-atlas-text-tertiary">
      <span className="flex gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-atlas-accent-bright [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-atlas-cyan [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-atlas-accent-bright" />
      </span>
      {label && <span>{label}</span>}
    </div>
  );
}
