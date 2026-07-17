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
        // Atlas OS v1 shell/product-surface palette (new components only —
        // existing pages keep their gray-* dark: classes, unified later).
        atlas: {
          canvas: '#0a0a0c',
          surface: '#111214',
          'surface-hover': '#18191c',
          'surface-raised': '#1c1d21',
          border: '#232429',
          'border-subtle': '#1a1b1f',
          accent: '#6673ff',
          'accent-muted': '#4a52a8',
          text: '#f2f2f4',
          'text-secondary': '#9a9ba5',
          'text-tertiary': '#65666f',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
