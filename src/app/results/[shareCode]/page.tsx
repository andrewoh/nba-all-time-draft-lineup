import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { resetGameAction } from '@/app/actions';
import { CopyLinkButton } from '@/components/copy-link-button';
import { getTeamLogoUrl } from '@/lib/data';
import { formatDateTime } from '@/lib/format';
import { getRunByShareCode } from '@/lib/run-service';

type ResultPick = {
  id: string;
  slot: string;
  playerName: string;
  teamAbbr: string;
  teamName: string;
  bpm: number;
  ws48: number;
  vorp: number;
  epm: number;
  usedFallback: boolean;
  isPenalty: boolean;
  contribution: number;
};

function buildScoreDrivers(pick: ResultPick): string[] {
  if (pick.isPenalty) {
    return [
      'Shot clock violation auto-filled this slot with 0 contribution.',
      'No player metrics were applied for this slot.'
    ];
  }

  const metrics = [
    { label: 'Player accolades', value: pick.bpm },
    { label: 'Team accolades', value: pick.ws48 },
    { label: 'Box stats', value: pick.vorp },
    { label: 'Advanced impact', value: pick.epm }
  ];

  const strongest = [...metrics].sort((a, b) => b.value - a.value).slice(0, 2);
  const weakest = [...metrics].sort((a, b) => a.value - b.value).slice(0, 2);
  const drivers: string[] = [];

  if ((strongest[0]?.value ?? 0) >= 75) {
    drivers.push(`${strongest[0]?.label} (${strongest[0]?.value.toFixed(1)}) strongly boosted this score.`);
  } else if ((strongest[0]?.value ?? 0) >= 60) {
    drivers.push(`${strongest[0]?.label} (${strongest[0]?.value.toFixed(1)}) was a positive contributor.`);
  }

  if ((strongest[1]?.value ?? 0) >= 65) {
    drivers.push(`${strongest[1]?.label} (${strongest[1]?.value.toFixed(1)}) added meaningful support.`);
  }

  if ((weakest[0]?.value ?? 100) <= 45) {
    drivers.push(`${weakest[0]?.label} (${weakest[0]?.value.toFixed(1)}) pulled the score down.`);
  }

  if ((weakest[1]?.value ?? 100) <= 50) {
    drivers.push(`${weakest[1]?.label} (${weakest[1]?.value.toFixed(1)}) limited the ceiling.`);
  }

  if (pick.usedFallback) {
    drivers.push('Fallback baseline values were used for missing franchise stats.');
  }

  if (pick.contribution >= 80) {
    drivers.push('Overall profile graded as elite for this draft context.');
  } else if (pick.contribution < 55) {
    drivers.push('Overall profile graded as below average for this draft context.');
  }

  return drivers.length > 0 ? drivers : ['This score came from a balanced, middle-tier profile across all 4 categories.'];
}

export default async function ResultsPage({
  params
}: {
  params: {
    shareCode: string;
  };
}) {
  const run = await getRunByShareCode(params.shareCode);

  if (!run) {
    notFound();
  }

  const headerStore = headers();
  const host = headerStore.get('host');
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const shareUrl = host ? `${protocol}://${host}/results/${run.shareCode}` : `/results/${run.shareCode}`;
  const baseTeamScore = run.baseTeamScore > 0 ? run.baseTeamScore : run.teamScore;
  const chemistryMultiplier = run.chemistryMultiplier > 0 ? run.chemistryMultiplier : 1;
  const chemistryScore =
    run.chemistryScore > 0 ? run.chemistryScore : Math.max(0, (chemistryMultiplier - 1) * 100);

  return (
    <div className="space-y-4">
      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-court-700">Final Team Score</p>
            <h1 className="text-4xl font-bold text-slate-900" data-testid="team-score">
              {run.teamScore.toFixed(1)}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Base {baseTeamScore.toFixed(1)} x Chemistry {chemistryMultiplier.toFixed(2)}x
            </p>
            <p className="text-sm text-slate-600">Created {formatDateTime(run.createdAt)}</p>
          </div>

          <div className="space-y-2 text-sm text-slate-700">
            <p>
              Share Code: <span className="font-semibold">{run.shareCode}</span>
            </p>
            {run.userName ? (
              <p>
                Name: <span className="font-semibold">{run.userName}</span>
              </p>
            ) : null}
            {run.groupCode ? (
              <p>
                Group: <span className="font-semibold">{run.groupCode}</span>
              </p>
            ) : null}
            {run.seed ? (
              <p>
                Seed: <span className="font-semibold">{run.seed}</span>
              </p>
            ) : null}
            <CopyLinkButton url={shareUrl} />
          </div>
        </div>

        {run.usedFallbackStats ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Some players were missing franchise records and used baseline all-time franchise scores
            instead.
          </p>
        ) : null}

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Base Score</p>
            <p className="text-lg font-bold text-slate-900">{baseTeamScore.toFixed(1)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Chemistry Score</p>
            <p className="text-lg font-bold text-slate-900">{chemistryScore.toFixed(1)}</p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-court-700">Multiplier</p>
            <p className="text-lg font-bold text-court-900">{chemistryMultiplier.toFixed(2)}x</p>
          </div>
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {run.picks.map((pick) => {
            const teamLogoUrl = getTeamLogoUrl(pick.teamAbbr);
            const drivers = buildScoreDrivers(pick as ResultPick);

            return (
              <div key={pick.slot} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-court-700">{pick.slot}</p>
                <p className="text-sm font-semibold text-slate-900">
                  {pick.isPenalty ? 'Shot Clock Violation' : pick.playerName}
                </p>
                <div className="mt-1 flex items-center gap-1 text-xs text-slate-600">
                  {teamLogoUrl ? (
                    <Image
                      src={teamLogoUrl}
                      alt={`${pick.teamAbbr} logo`}
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-sm border border-slate-200 bg-white p-[2px]"
                    />
                  ) : null}
                  <span>{pick.teamAbbr}</span>
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-700">
                  Contribution {pick.contribution.toFixed(1)}
                </p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-court-700 hover:underline">
                    Why this score?
                  </summary>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] text-slate-600">
                    {drivers.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </details>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">Per-player contributions</h2>
          <p className="mt-1 text-xs text-slate-500">
            Personal/Team/Stats/Advanced are global percentile-style metrics used for contribution scoring.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Slot</th>
                <th className="px-4 py-3">Player</th>
                <th className="px-4 py-3">Personal</th>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Stats</th>
                <th className="px-4 py-3">Advanced</th>
                <th className="px-4 py-3">Contribution</th>
              </tr>
            </thead>
            <tbody>
              {run.picks.map((pick) => (
                <tr key={pick.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-900">{pick.slot}</td>
                  <td className="px-4 py-3 text-slate-800">
                    {pick.isPenalty ? 'Shot Clock Violation' : pick.playerName}
                    <span className="ml-1 text-xs text-slate-500">({pick.teamAbbr})</span>
                    {pick.usedFallback ? (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase text-amber-700">
                        fallback
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{pick.bpm.toFixed(1)}</td>
                  <td className="px-4 py-3 text-slate-700">{pick.ws48.toFixed(1)}</td>
                  <td className="px-4 py-3 text-slate-700">{pick.vorp.toFixed(1)}</td>
                  <td className="px-4 py-3 text-slate-700">{pick.epm.toFixed(1)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{pick.contribution.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <form action={resetGameAction}>
          <button type="submit" className="button-primary">
            Play again
          </button>
        </form>

        {run.groupCode ? (
          <Link href={`/leaderboard?groupCode=${encodeURIComponent(run.groupCode)}`} className="button-secondary">
            View group leaderboard
          </Link>
        ) : (
          <Link href="/leaderboard" className="button-secondary">
            View leaderboard
          </Link>
        )}
      </div>
    </div>
  );
}
