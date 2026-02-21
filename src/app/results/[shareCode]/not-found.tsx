import Link from 'next/link';

export default function ResultNotFoundPage() {
  return (
    <div className="card p-6">
      <h1 className="text-xl font-semibold text-slate-900">Run not found</h1>
      <p className="mt-2 text-sm text-slate-600">This share code does not match any saved run.</p>
      <Link href="/" className="button-primary mt-4">
        Start new game
      </Link>
    </div>
  );
}
