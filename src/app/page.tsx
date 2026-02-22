import Link from 'next/link';
import { startGameAction } from '@/app/actions';

export default function HomePage({
  searchParams
}: {
  searchParams: {
    error?: string;
  };
}) {
  const errorMessage = searchParams.error;

  return (
    <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
      <section className="card p-6">
        <p className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-court-700">
          Mobile Friendly Draft
        </p>
        <h1 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">NBA All-Time Random Draft Lineup</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          One round. Five random teams. Pick from each franchise&apos;s all-time top 15 and lock one
          legend into PG, SG, SF, PF, and C before the 24-second clock expires.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="chip-control" data-active="true">
            5 draws
          </span>
          <span className="chip-control" data-active="true">
            24s shot clock
          </span>
          <span className="chip-control" data-active="true">
            Share with friends
          </span>
        </div>

        {errorMessage ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
        ) : null}

        <form action={startGameAction} className="mt-5 space-y-4">
          <div>
            <label htmlFor="userName" className="mb-1 block text-sm font-medium text-slate-700">
              Your Name (optional)
            </label>
            <input
              id="userName"
              name="userName"
              className="input"
              placeholder="e.g. Andrew"
              autoComplete="off"
              maxLength={32}
            />
          </div>

          <div>
            <label htmlFor="groupCode" className="mb-1 block text-sm font-medium text-slate-700">
              Group Code (optional)
            </label>
            <input
              id="groupCode"
              name="groupCode"
              className="input"
              placeholder="e.g. FRIENDS"
              autoComplete="off"
              maxLength={16}
            />
          </div>

          <div>
            <label htmlFor="seed" className="mb-1 block text-sm font-medium text-slate-700">
              Seed (optional)
            </label>
            <input
              id="seed"
              name="seed"
              className="input"
              placeholder="Use same seed to replay exact team draws"
              autoComplete="off"
              maxLength={64}
            />
          </div>

          <button type="submit" className="button-primary w-full md:w-auto" data-testid="start-game-button">
            Start Game
          </button>
        </form>

        <div className="mt-4 text-sm text-slate-600">
          <Link href="/leaderboard" className="font-medium text-court-700 hover:underline">
            View leaderboard
          </Link>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold text-slate-900">Rules</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600">
          <li>Enter your name and a shared Group Code so friends can compare scores.</li>
          <li>Each draw gives one random NBA team with no repeats in the round.</li>
          <li>Pick exactly one player from that franchise&apos;s all-time top 15 list.</li>
          <li>Each player card shows their years with that franchise.</li>
          <li>Players can only be assigned to real eligible positions (no PG at C).</li>
          <li>You have 24 seconds per draw to lock in a player.</li>
          <li>If time expires, one random open slot gets a 0-point shot-clock penalty.</li>
          <li>Assign your pick to one open lineup slot.</li>
          <li>Filled slots are locked for the rest of the round.</li>
          <li>
            Team Score is a franchise greatness blend of personal accolades, team accolades,
            stats, and advanced impact normalized to 0-100.
          </li>
        </ol>
      </section>
    </div>
  );
}
