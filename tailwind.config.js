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
        // Atlas OS "Obsidian/Carbon/Crimson" identity (overnight
        // transformation pass — replaces the earlier blue/cyan palette).
        // Signal red is the ONE brand accent: identity, active nav,
        // primary actions, focus states, selected series, high-value
        // moments. It is deliberately never a page-filling color or a
        // decorative glow on every card — see the `glow-accent` shadow
        // below, which is restrained by design. Steel is the neutral
        // "technical" color (delayed/watch states, secondary chart
        // series) — it carries no brand meaning. Emerald=genuine positive
        // performance, amber=warning/stale/degraded — both semantic, not
        // brand, and unchanged from before this pass.
        atlas: {
          canvas: '#070708', // Obsidian
          surface: '#0b0b0d', // Deep black
          'surface-hover': '#141417',
          'surface-raised': '#17171b', // Carbon
          border: '#26262c',
          'border-subtle': '#1b1b1f',
          accent: '#d72638', // Signal Red
          'accent-bright': '#ef3340', // Active Red
          'accent-muted': '#8f1424', // Deep Crimson
          steel: '#7c8794', // cool neutral — technical/secondary state only
          emerald: '#34d399',
          warning: '#f0a020',
          text: '#f5f5f6', // cool near-white
          'text-secondary': '#a7a8b0', // restrained silver
          'text-tertiary': '#7d7e87', // accessible graphite-gray — tuned to clear 4.5:1 on canvas (WCAG AA)
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-accent': '0 0 0 1px rgba(215,38,56,0.18), 0 8px 30px -8px rgba(215,38,56,0.32)',
        'glow-steel': '0 0 0 1px rgba(124,135,148,0.12), 0 8px 30px -8px rgba(124,135,148,0.25)',
        glass: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.7)',
        elevated: '0 20px 60px -20px rgba(0,0,0,0.8)',
      },
      backgroundImage: {
        // Restrained — a single low-opacity crimson wash at the top of
        // the canvas, not a colored background. Precision-grid texture
        // (globals.css) supplies the "instrument" feel instead of a
        // second gradient layer competing for attention.
        'atlas-radial': 'radial-gradient(circle at 50% 0%, rgba(215,38,56,0.10), transparent 60%)',
        'atlas-mesh':
          'radial-gradient(circle at 15% 20%, rgba(215,38,56,0.07), transparent 40%), radial-gradient(circle at 85% 0%, rgba(124,135,148,0.05), transparent 40%), radial-gradient(circle at 50% 100%, rgba(52,211,153,0.04), transparent 45%)',
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
