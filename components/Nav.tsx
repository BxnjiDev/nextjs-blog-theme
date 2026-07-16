import Link from 'next/link';

const links = [
  { href: '/', label: 'Overview' },
  { href: '/holdings', label: 'Holdings' },
  { href: '/opportunities', label: 'Opportunities' },
  { href: '/risk', label: 'Risk' },
  { href: '/briefing', label: 'Daily Briefing' },
  { href: '/connections', label: 'Connections' },
];

export default function Nav() {
  return (
    <header className="border-b border-gray-200 dark:border-gray-800">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Atlas
        </Link>
        <nav className="flex gap-6 text-sm">
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
