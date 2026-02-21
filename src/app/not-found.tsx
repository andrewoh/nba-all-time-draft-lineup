import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <div className="card p-6">
      <h1 className="text-xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-600">The page you requested does not exist.</p>
      <Link href="/" className="button-primary mt-4">
        Back to home
      </Link>
    </div>
  );
}
