import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '../styles/globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'Atlas — Portfolio Intelligence',
  description:
    'Recommendation-only portfolio monitoring and analysis. No autonomous trade execution.',
};

/**
 * Root layout — deliberately thin. It only sets up fonts/theme; the actual
 * application shell (sidebar, evaluation banner, status indicator) lives in
 * app/(app)/layout.tsx so that /login can render without any of it. Dark
 * mode is forced on (Atlas OS is "dark mode first" per the design brief);
 * tailwind.config.js's darkMode:'class' means this is the only place that
 * decides that, not each page.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
