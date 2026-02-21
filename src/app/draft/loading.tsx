export default function DraftLoading() {
  return (
    <div className="space-y-3">
      <div className="card h-24 animate-pulse bg-slate-100" />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="card h-80 animate-pulse bg-slate-100" />
        <div className="card h-80 animate-pulse bg-slate-100" />
      </div>
    </div>
  );
}
