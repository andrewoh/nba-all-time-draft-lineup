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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Draft Round</h1>
        <Link href="/leaderboard" className="text-sm font-medium text-court-700 hover:underline">
          Leaderboard
        </Link>
      </div>

      <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">
        Quick start: pick one all-time franchise legend from the drawn team, check their years with
        that franchise, assign to an eligible position, and beat the 24-second shot clock.
      </p>

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
