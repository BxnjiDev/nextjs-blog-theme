/**
 * Centralized motion tokens — the durations and easings every animated
 * surface in Atlas OS should reach for instead of inventing its own
 * number. Two easing curves cover the whole app: `standard` (an
 * ease-out-heavy cubic-bezier used for anything entering or resolving —
 * cards, panels, pages, the login/init sequence) and `linear` (continuous
 * motion — orbital rotation, shimmer). `easeInOut` covers breathing/pulse
 * loops. Framer Motion consumes these as plain numbers/arrays, so any
 * `transition={{ duration: MOTION.duration.panel, ease: MOTION.ease.standard }}`
 * call site can use them directly.
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
    /** Modal/sheet open-close */
    modal: 0.25,
    /** Chart entrance (Recharts isAnimationActive) */
    chart: 0.9,
    /** Login composition entrance */
    login: 0.7,
    /** Boot/init stage crossfades */
    stage: 0.35,
    /** Orbital ring rotation (looping, so "slow" not "duration" in the
     * usual sense — kept here so nothing hardcodes it a second time) */
    orbitSlow: 70,
    orbitMedium: 95,
    orbitFast: 130,
  },
} as const;
