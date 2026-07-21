/**
 * The one container shell every "card" in the app should render through.
 * An audit found three competing, independently-invented card treatments
 * (a blurred "glass" card, a flat bordered box, a border-only box with no
 * fill) plus a fourth "no shell at all" mode layered onto WidgetCard —
 * here as four explicit variants on one component instead of four
 * components nobody realized were the same idea:
 *
 * - `glass`  — the atlas-glass blur+border+shadow treatment; the default,
 *              for anything that's the visual focus of its area.
 * - `flat`   — a solid-surface bordered box (no blur); for dense
 *              information (stat tiles, freshness rows) where a heavier
 *              glass treatment would compete with the data.
 * - `subtle` — border only, no fill; for a container that should read as
 *              "grouped" without asserting itself as a separate surface
 *              (e.g. a quiet empty-state box inside an already-boxed area).
 * - `plain`  — no shell at all; for composing inside a parent that already
 *              provides the surface (an OrbitRow panel, a modal body).
 *
 * Radius follows the app-wide role convention (see tailwind.config.js):
 * `xl` is the standard content-container radius — all four variants use
 * it except `plain`, which has no border to round.
 *
 * `panelClassName()` is exported for the rare case that needs the class
 * string on a non-div element (a `<Link>` acting as a card, a
 * `motion.div` that also needs its own animation props).
 */
export type PanelVariant = 'glass' | 'flat' | 'subtle' | 'plain';

export function panelClassName(variant: PanelVariant = 'glass', hover = false): string {
  switch (variant) {
    case 'glass':
      return `atlas-glass rounded-xl ${hover ? 'atlas-hover-glow transition-[border-color,box-shadow,transform] duration-300' : ''}`;
    case 'flat':
      return 'rounded-xl border border-atlas-border bg-atlas-surface';
    case 'subtle':
      return 'rounded-xl border border-atlas-border-subtle';
    case 'plain':
      return '';
  }
}

export default function Panel({
  variant = 'glass',
  hover = false,
  className = '',
  children,
}: {
  variant?: PanelVariant;
  /** Adds the hover-glow lift — only meaningful on `glass` (an
   * interactive/clickable glass surface); ignored otherwise. */
  hover?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`${panelClassName(variant, hover)} ${className}`}>{children}</div>;
}
