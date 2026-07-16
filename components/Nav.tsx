import Link from 'next/link';

const links = [
  { href: '/', label: 'Overview' },
  { href: '/holdings', label: 'Holdings' },
  { href: '/intelligence', label: 'Intelligence' },
  { href: '/opportunities', label: 'Opportunities' },
  { href: '/risk', label: 'Risk' },
  { href: '/health', label: 'Health' },
  { href: '/performance', label: 'Performance' },
  { href: '/briefing', label: 'Daily Briefing' },
  { href: '/connections', label: 'Connections' },
];

export default function Nav() {
  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur dark:border-gray-800 dark:bg-gray-950/80">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Atlas
        </Link>
        <nav className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-gray-600 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
