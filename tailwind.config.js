/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        risk: {
          low: '#16a34a',
          medium: '#d97706',
          high: '#dc2626',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
