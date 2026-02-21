'use client';

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="bg-slate-50">
        <main className="mx-auto max-w-2xl px-4 py-10">
          <div className="card p-6">
            <h1 className="text-xl font-semibold text-slate-900">Unexpected error</h1>
            <p className="mt-2 text-sm text-slate-600">{error.message || 'Something went wrong.'}</p>
            <button type="button" onClick={reset} className="button-primary mt-4">
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
