/**
 * Centralized motion tokens — the durations, easings, and springs every
 * animated surface in Atlas OS should reach for instead of inventing its
 * own number. Two easing curves cover the whole app: `standard` (an
 * ease-out-heavy cubic-bezier used for anything entering or resolving —
 * cards, panels, pages, the login/init sequence) and `linear` (continuous
 * motion — orbital rotation, shimmer). `easeInOut` covers breathing/pulse
 * loops. Framer Motion consumes these as plain numbers/arrays, so any
 * `transition={{ duration: MOTION.duration.panel, ease: MOTION.ease.standard }}`
 * call site can use them directly.
 *
 * Role → token map (so nothing reaches for a raw number again):
 *   page transition        → duration.page      (PageTransition)
 *   section reveal         → duration.panel     (FadeInView, Stagger)
 *   expand/collapse content → duration.modal    (AnimatePresence height panels)
 *   chart entrance          → duration.chart    (Recharts)
 *   loading shimmer         → CSS `.atlas-shimmer` (styles/globals.css) — not
 *                             framer-driven, deliberately outside this table
 *   hover / press feedback  → duration.hover / duration.micro
 *   navigation (active tab/pill indicator) → spring.nav
 *   navigation (drawer/sheet slide-in)     → spring.drawer
 *   AI response reveal (per-segment)       → duration.stream
 *   AI "thinking" breathing loop           → duration.pulse
 *   live update / data refresh             → duration.count (AnimatedNumber)
 *                             — a number counting from its old value to its
 *                             new one after AutoRefresh/router.refresh() IS
 *                             the refresh animation; nothing else is needed
 */
export const MOTION = {
  ease: {
    standard: [0.16, 1, 0.3, 1] as const,
    linear: 'linear' as const,
    inOut: 'easeInOut' as const,
    out: 'easeOut' as const,
  },
  duration: {
    /** Button/link hover, focus-ring, tap feedback */
    micro: 0.15,
    /** Hover-lift on interactive cards */
    hover: 0.2,
    /** Route/page transition */
    page: 0.16,
    /** Card/panel entrance (FadeInView, Stagger, WidgetCard) */
    panel: 0.45,
    /** Modal/sheet/expand-collapse open-close */
    modal: 0.25,
    /** Chart entrance (Recharts isAnimationActive) */
    chart: 0.9,
    /** Login composition entrance */
    login: 0.7,
    /** Boot/init stage crossfades */
    stage: 0.35,
    /** AI response reveal — per-segment/message entrance in Atlas Chat */
    stream: 0.3,
    /** Animated-counter tween (AnimatedNumber) — also the "live update /
     * data refresh" motion: a number counting from its old value to its
     * new one after AutoRefresh/router.refresh() IS the refresh animation,
     * not a separate token. */
    count: 1,
    /** AI "thinking" breathing loop (slow, repeats) */
    pulse: 2.2,
    /** Orbital ring rotation (looping, so "slow" not "duration" in the
     * usual sense — kept here so nothing hardcodes it a second time) */
    orbitSlow: 70,
    orbitMedium: 95,
    orbitFast: 130,
  },
  /** Spring physics for the two recurring "physically moving" surfaces —
   * everything else uses duration+ease, but an active-state indicator that
   * slides between nav items, or a drawer/sheet entering the viewport,
   * reads better as a spring than a fixed-duration tween. Named by role,
   * not by feel, so a third spring config never quietly appears. */
  spring: {
    /** Active-tab/pill indicator sliding to the current selection */
    nav: { stiffness: 500, damping: 36 },
    /** Drawer/sheet sliding into the viewport */
    drawer: { stiffness: 420, damping: 42 },
  },
} as const;
