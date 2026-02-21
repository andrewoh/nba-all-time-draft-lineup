import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-semibold text-slate-900">
          NBA All-Time Random Draft Lineup
        </Link>
        <nav className="flex items-center gap-3 text-sm font-medium text-slate-600">
          <Link href="/" className="rounded-md px-2 py-1 hover:bg-slate-100">
            Home
          </Link>
          <Link href="/leaderboard" className="rounded-md px-2 py-1 hover:bg-slate-100">
            Leaderboard
          </Link>
        </nav>
      </div>
    </header>
  );
}
