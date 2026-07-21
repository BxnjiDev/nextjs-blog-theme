/**
 * The one icon-size scale every lucide-react icon in Atlas OS should pick
 * from — an audit of the app found icons picking arbitrary numbers between
 * 13 and 20 with no role-based logic. Three sizes cover every real role:
 * `sm` for icons inline with body/label text or packed tightly (badges,
 * table cells), `md` for standard UI icons (nav items, buttons, inline
 * affordances — the default for almost everything), `lg` for a lone
 * emphasis icon (empty-state illustration, banner/alert icon, a page's one
 * header icon). Pair with `strokeWidth={1.75}` (the app-wide stroke weight)
 * unless a component has a specific reason not to.
 */
export const ICON_SIZE = {
  sm: 14,
  md: 16,
  lg: 20,
} as const;

export const ICON_STROKE = 1.75;
