import Link from 'next/link';
import { redirect } from 'next/navigation';
import { resetGameAction } from '@/app/actions';
import { DraftBoard } from '@/components/draft-board';
import { getRosterByTeam, getTeamByAbbr } from '@/lib/data';
import { getDraftViewByCookieToken } from '@/lib/draft-service';
import { getDraftSessionCookieToken } from '@/lib/session-cookie';

export default async function DraftPage({
  searchParams
}: {
  searchParams: {
    error?: string;
  };
}) {
  const cookieToken = getDraftSessionCookieToken();

  if (!cookieToken) {
    redirect('/?error=No active draft found. Start a new game.');
  }

  const draftView = await getDraftViewByCookieToken(cookieToken);

  if (!draftView) {
    redirect('/?error=Draft session not found. Start a new game.');
  }

  if (draftView.status === 'COMPLETED' && draftView.runShareCode) {
    redirect(`/results/${draftView.runShareCode}`);
  }

  if (!draftView.currentTeamAbbr) {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-semibold text-slate-900">Draft unavailable</h1>
        <p className="mt-2 text-sm text-slate-600">This draft does not have a valid current team.</p>
        <form action={resetGameAction} className="mt-4">
          <button type="submit" className="button-primary">
            Start new game
          </button>
        </form>
      </div>
    );
  }

  const currentTeam = getTeamByAbbr(draftView.currentTeamAbbr);
  const roster = getRosterByTeam(draftView.currentTeamAbbr);

  if (!currentTeam) {
    redirect('/?error=Current team is invalid. Start a new game.');
  }

  return (
    <div className="space-y-4 pb-24 md:pb-0">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Draft Round</h1>
        <Link href="/leaderboard" className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-court-700 hover:bg-blue-100">
          Leaderboard
        </Link>
      </div>

      <section className="card p-4">
        <p className="text-sm font-semibold text-slate-900">How this turn works</p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-700">
          <span className="chip-control" data-active="true">
            1) Pick a player
          </span>
          <span className="chip-control" data-active="true">
            2) Choose open slot
          </span>
          <span className="chip-control" data-active="true">
            3) Lock before 24s
          </span>
        </div>
      </section>

      <DraftBoard
        key={`${draftView.id}-${draftView.currentDrawIndex}-${draftView.shotClockDeadlineAt ?? 'done'}`}
        currentTeam={currentTeam}
        roster={roster}
        lineup={draftView.lineup}
        currentDrawIndex={draftView.currentDrawIndex}
        userName={draftView.userName}
        groupCode={draftView.groupCode}
        seed={draftView.seed}
        shotClockDeadlineAt={draftView.shotClockDeadlineAt}
        shotClockSeconds={draftView.shotClockSeconds}
        errorMessage={searchParams.error ?? null}
      />
    </div>
  );
}
