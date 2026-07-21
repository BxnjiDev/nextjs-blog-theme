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
        // Atlas OS v1 shell/product-surface palette. Electric blue is the
        // primary accent; cyan and emerald are secondary/tertiary accents
        // used sparingly (status dots, gradients, small highlights) —
        // never as large fills. Orange exists only for warning states.
        atlas: {
          canvas: '#08090b',
          surface: '#111214',
          'surface-hover': '#18191c',
          'surface-raised': '#1c1d21',
          border: '#232429',
          'border-subtle': '#1a1b1f',
          accent: '#3b82f6',
          'accent-bright': '#5b9fff',
          'accent-muted': '#2a4a8f',
          cyan: '#22d3ee',
          emerald: '#34d399',
          warning: '#f0a020',
          text: '#f2f2f4',
          'text-secondary': '#9a9ba5',
          'text-tertiary': '#65666f',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-accent': '0 0 0 1px rgba(59,130,246,0.15), 0 8px 30px -8px rgba(59,130,246,0.35)',
        'glow-cyan': '0 0 0 1px rgba(34,211,238,0.12), 0 8px 30px -8px rgba(34,211,238,0.3)',
        glass: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
        elevated: '0 20px 60px -20px rgba(0,0,0,0.7)',
      },
      backgroundImage: {
        'atlas-radial': 'radial-gradient(circle at 50% 0%, rgba(59,130,246,0.12), transparent 60%)',
        'atlas-mesh':
          'radial-gradient(circle at 15% 20%, rgba(59,130,246,0.10), transparent 40%), radial-gradient(circle at 85% 0%, rgba(34,211,238,0.08), transparent 40%), radial-gradient(circle at 50% 100%, rgba(52,211,153,0.05), transparent 45%)',
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
