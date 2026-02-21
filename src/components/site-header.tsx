import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-3 py-3 sm:px-4">
        <Link href="/" className="max-w-[60%] truncate text-sm font-bold text-slate-900 sm:text-base">
          NBA All-Time Draft
        </Link>
        <nav className="flex items-center gap-1 text-xs font-semibold text-slate-600 sm:gap-3 sm:text-sm">
          <Link href="/" className="rounded-full px-3 py-1.5 hover:bg-slate-100">
            Home
          </Link>
          <Link href="/leaderboard" className="rounded-full px-3 py-1.5 hover:bg-slate-100">
            Leaderboard
          </Link>
        </nav>
      </div>
    </header>
  );
}
