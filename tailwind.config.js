/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  // Class-based (not 'media') so Atlas OS can force dark mode on by default
  // (app/layout.tsx sets <html class="dark">) regardless of OS preference —
  // "dark mode first" per the Atlas OS design brief — while every existing
  // page's dark: utility classes keep working unchanged.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        risk: {
          low: '#16a34a',
          medium: '#d97706',
          high: '#dc2626',
        },
        // Atlas OS "Obsidian/Violet/Magenta" identity (purple/black visual
        // redirection — replaces the earlier crimson/carbon identity).
        // Violet + magenta behave as controlled light within a black
        // environment, not as page-filling color. `accent` is the
        // background/border-fill shade (only ~2.9:1 as text on canvas —
        // never used for small text); `accent-bright` is the one tuned to
        // clear 4.5:1 as text/links; `magenta` is the secondary highlight
        // used more sparingly than violet (gradients, selective emphasis).
        // Steel is the neutral "technical" color (secondary chart series,
        // delayed/watch states) — no brand meaning. Emerald/amber stay
        // semantic (genuine positive performance / warning-stale-degraded)
        // and unchanged — semantic color must never be confused with
        // Atlas-brand color.
        atlas: {
          canvas: '#050507', // Canvas Black
          surface: '#08080b', // Obsidian
          'surface-hover': '#0d0d12', // Elevated Black
          'surface-raised': '#12121a', // Soft Surface
          border: '#2a2733', // low-opacity lavender/white, resolved to a hex for utility classes
          'border-subtle': '#1c1a22',
          accent: '#6d28d9', // Royal Violet — background/border fill only
          'accent-bright': '#8b5cf6', // Electric Purple — ~4.8:1 on canvas, safe for text/links
          'accent-muted': '#4c1d95', // Deep Purple — muted backgrounds
          magenta: '#d946ef', // Signal Magenta — ~5.9:1 on canvas, selective secondary highlight
          'magenta-bright': '#ec4899', // Hot Magenta — ~5.8:1, gradient endpoint
          lavender: '#c4b5fd', // Soft Lavender — ~11:1, orbital lines / soft emphasis text
          steel: '#87828f', // cool neutral, violet-tinted — technical/secondary state only
          emerald: '#34d399',
          warning: '#f0a020',
          text: '#f7f5fa', // cool near-white
          'text-secondary': '#b7b2c2', // restrained lavender-silver
          'text-tertiary': '#8a86a3', // accessible gray-violet — clears 4.5:1 on canvas (WCAG AA)
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-accent': '0 0 0 1px rgba(139,92,246,0.20), 0 8px 30px -8px rgba(139,92,246,0.35)',
        'glow-magenta': '0 0 0 1px rgba(217,70,239,0.18), 0 8px 30px -8px rgba(217,70,239,0.32)',
        'glow-steel': '0 0 0 1px rgba(135,130,143,0.12), 0 8px 30px -8px rgba(135,130,143,0.25)',
        glass: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.7)',
        elevated: '0 20px 60px -20px rgba(0,0,0,0.8)',
      },
      backgroundImage: {
        // Atmospheric violet/magenta light fields — soft radial blooms that
        // feel like they exist behind the interface, never a solid colored
        // panel. Kept deliberately restrained (per brief: "avoid overly
        // saturated full-screen backgrounds") — low opacity, large falloff.
        'atlas-radial': 'radial-gradient(circle at 50% 0%, rgba(139,92,246,0.14), transparent 60%)',
        'atlas-mesh':
          'radial-gradient(circle at 12% 15%, rgba(139,92,246,0.10), transparent 42%), radial-gradient(circle at 88% 8%, rgba(217,70,239,0.08), transparent 42%), radial-gradient(circle at 50% 100%, rgba(52,211,153,0.03), transparent 45%)',
        'atlas-aurora':
          'radial-gradient(ellipse 60% 50% at 20% 20%, rgba(139,92,246,0.22), transparent 60%), radial-gradient(ellipse 55% 45% at 85% 15%, rgba(217,70,239,0.16), transparent 55%), radial-gradient(ellipse 70% 60% at 50% 100%, rgba(76,29,149,0.18), transparent 60%)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: 0.55 },
          '50%': { opacity: 1 },
        },
        'fade-in-up': {
          '0%': { opacity: 0, transform: 'translateY(8px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        drift: {
          '0%': { transform: 'translate3d(0,0,0)', opacity: 0 },
          '10%': { opacity: 1 },
          '90%': { opacity: 1 },
          '100%': { transform: 'translate3d(var(--drift-x, 20px), var(--drift-y, -40px), 0)', opacity: 0 },
        },
      },
      animation: {
        shimmer: 'shimmer 1.8s linear infinite',
        float: 'float 6s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2.4s ease-in-out infinite',
        'fade-in-up': 'fade-in-up 0.5s ease-out both',
        drift: 'drift linear infinite',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
