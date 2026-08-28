import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Đại Thiên Tài AI Visual Studio',
  description: 'AI visual production studio — script to delivered shots, with continuity you can audit.',
};

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/projects', label: 'Projects' },
  { href: '/providers', label: 'Providers' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="dark">
      <body className="min-h-screen font-sans antialiased">
        <div className="flex min-h-screen">
          <aside className="hidden w-56 shrink-0 border-r border-line bg-surface-1 md:block">
            <div className="px-4 py-4">
              <Link href="/" className="block text-sm font-semibold leading-tight text-ink-hi">
                Đại Thiên Tài
                <span className="block text-xs font-normal text-ink-lo">AI Visual Studio</span>
              </Link>
            </div>
            <nav className="px-2 pb-4">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-md px-2 py-1.5 text-sm text-ink-mid hover:bg-surface-2 hover:text-ink-hi"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="mx-2 rounded-md border border-line bg-surface-2 p-2 text-[11px] leading-snug text-ink-lo">
              Single-operator studio. Data lives in SQLite; assets live on disk. Mock provider is free and offline.
            </div>
          </aside>
          <main className="min-w-0 flex-1">
            <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
