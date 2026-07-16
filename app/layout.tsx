import type { Metadata } from 'next';
import '../styles/globals.css';
import Nav from '@/components/Nav';

export const metadata: Metadata = {
  title: 'Atlas — Portfolio Intelligence',
  description:
    'Recommendation-only portfolio monitoring and analysis. No autonomous trade execution.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
