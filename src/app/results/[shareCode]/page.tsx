import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { resetGameWithPrefillAction } from '@/app/actions';
import { CopyLinkButton } from '@/components/copy-link-button';
import { getPlayerExplanationData, getTeamLogoUrl } from '@/lib/data';
import { formatDateTime } from '@/lib/format';
import { getRunByShareCode } from '@/lib/run-service';
import { scoreLineup } from '@/lib/scoring';
import type { AwardBreakdown, LineupPick } from '@/lib/types';

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

const ACCOLADE_LABELS: Array<{ key: keyof AwardBreakdown; label: string }> = [
  { key: 'mvp', label: 'MVP' },
  { key: 'finalsMvp', label: 'Finals MVP' },
  { key: 'dpoy', label: 'DPOY' },
  { key: 'allNbaFirst', label: 'All-NBA 1st Team' },
  { key: 'allNbaSecond', label: 'All-NBA 2nd Team' },
  { key: 'allNbaThird', label: 'All-NBA 3rd Team' },
  { key: 'allDefFirst', label: 'All-Def 1st Team' },
  { key: 'allDefSecond', label: 'All-Def 2nd Team' },
  { key: 'allStar', label: 'All-Star' },
  { key: 'scoringTitles', label: 'Scoring Title' },
  { key: 'reboundingTitles', label: 'Rebounding Title' },
  { key: 'assistsTitles', label: 'Assists Title' },
  { key: 'stealsTitles', label: 'Steals Title' },
  { key: 'blocksTitles', label: 'Blocks Title' }
];

function formatAccoladeHighlights(accolades: AwardBreakdown): string[] {
  return ACCOLADE_LABELS
    .map(({ key, label }) => {
      const count = accolades[key];
      return count > 0 ? `${label} x${count}` : null;
    })
    .filter((value): value is string => Boolean(value))
    .slice(0, 4);
}

function buildScoreDrivers(pick: ResultPick): string[] {
  if (pick.isPenalty) {
    return [
      'Shot clock violation auto-filled this slot with 0 contribution.',
      'No player metrics were applied for this slot.'
    ];
  }

  const explanation = getPlayerExplanationData(pick.teamAbbr, pick.playerName);
  const drivers: string[] = [];

  if (pick.bpm >= 72) {
    drivers.push(`Player accolades (${pick.bpm.toFixed(1)}) were a strong positive.`);
  } else if (pick.bpm <= 48) {
    drivers.push(`Player accolades (${pick.bpm.toFixed(1)}) were below top-tier thresholds.`);
  }

  if (pick.ws48 >= 70) {
    drivers.push(`Team accolades/winning context (${pick.ws48.toFixed(1)}) materially boosted value.`);
  } else if (pick.ws48 <= 46) {
    drivers.push(`Team accolades/winning context (${pick.ws48.toFixed(1)}) limited this profile.`);
  }

  if (pick.vorp >= 70) {
    drivers.push(`PTS/REB/AST/STL/BLK production profile (${pick.vorp.toFixed(1)}) graded as elite.`);
  } else if (pick.vorp <= 48) {
    drivers.push(
      `PTS/REB/AST/STL/BLK production profile (${pick.vorp.toFixed(1)}) was below elite all-time levels.`
    );
  }

  if (pick.epm >= 70) {
    drivers.push(`Advanced winning-impact profile (${pick.epm.toFixed(1)}) strongly lifted this score.`);
  } else if (pick.epm <= 48) {
    drivers.push(`Advanced winning-impact profile (${pick.epm.toFixed(1)}) sat below contender-tier impact.`);
  }

  if (explanation?.accolades) {
    const accoladeHighlights = formatAccoladeHighlights(explanation.accolades);
    if (accoladeHighlights.length > 0) {
      drivers.push(`Accolade detail: ${accoladeHighlights.join(', ')}.`);
    } else {
      drivers.push('No major award counts were recorded during this franchise stint.');
    }
  } else {
    drivers.push('Detailed award counts were not available; aggregate accolade signal was used.');
  }

  if (explanation?.championships && explanation.championships > 0) {
    drivers.push(`Franchise championships in this stint: ${explanation.championships}.`);
  }

  if (explanation?.boxPercentiles) {
    const boxMetrics = [
      { label: 'PTS', value: explanation.boxPercentiles.pts },
      { label: 'REB', value: explanation.boxPercentiles.reb },
      { label: 'AST', value: explanation.boxPercentiles.ast },
      { label: 'STL', value: explanation.boxPercentiles.stl },
      { label: 'BLK', value: explanation.boxPercentiles.blk }
    ];
    const strong = boxMetrics.filter((metric) => metric.value >= 68).map((metric) => `${metric.label} ${metric.value.toFixed(0)}p`);
    const weak = boxMetrics.filter((metric) => metric.value <= 42).map((metric) => `${metric.label} ${metric.value.toFixed(0)}p`);
    if (strong.length > 0) {
      drivers.push(`Stat strengths vs all players in dataset: ${strong.slice(0, 3).join(', ')}.`);
    }
    if (weak.length > 0) {
      drivers.push(`Stat gaps vs peers: ${weak.slice(0, 3).join(', ')}.`);
    }
  } else if (pick.vorp <= 55) {
    drivers.push('Box-score weakness came from not reaching top-tier franchise production in key counting stats.');
  }

  if (explanation) {
    const tenurePct = Math.round(explanation.tenureRatio * 100);
    drivers.push(`Franchise tenure context: ${explanation.yearsWithTeam} seasons (${tenurePct}% of career).`);
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

function firstHeaderValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return value.split(',')[0]?.trim() ?? null;
}

function resolveBaseUrl(headerStore: Headers): string | null {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    null;
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  const forwardedHost = firstHeaderValue(headerStore.get('x-forwarded-host'));
  const host = forwardedHost || firstHeaderValue(headerStore.get('host'));
  if (!host) {
    return null;
  }

  const forwardedProto = firstHeaderValue(headerStore.get('x-forwarded-proto'));
  const protocol = forwardedProto || (process.env.NODE_ENV === 'production' ? 'https' : 'http');

  return `${protocol}://${host}`;
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
  const sharePath = `/results/${run.shareCode}`;
  const baseUrl = resolveBaseUrl(headerStore);
  const shareUrl = baseUrl ? `${baseUrl}${sharePath}` : sharePath;
  const baseTeamScore = run.baseTeamScore > 0 ? run.baseTeamScore : run.teamScore;
  const chemistryMultiplier = run.chemistryMultiplier > 0 ? run.chemistryMultiplier : 1;
  const chemistryScore =
    run.chemistryScore > 0 ? run.chemistryScore : Math.max(0, (chemistryMultiplier - 1) * 100);
  const chemistryBreakdown = scoreLineup(
    run.picks.map((pick) => ({
      slot: pick.slot as LineupPick['slot'],
      playerName: pick.playerName,
      teamAbbr: pick.teamAbbr,
      teamName: pick.teamName,
      isPenalty: pick.isPenalty
    }))
  ).chemistry;
  const prefillUserName = run.userName ?? '';
  const prefillGroupCode = run.groupCode ?? '';
  const prefillSeed = run.seed ?? '';

  return (
    <div className="space-y-4 pb-28 md:pb-24">
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

        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <p className="font-semibold text-slate-900">Chemistry breakdown</p>
          <p className="mt-1 text-slate-600">Tap each item for a simple explanation.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <details className="rounded-lg border border-slate-200 bg-white p-2">
              <summary className="cursor-pointer font-semibold text-slate-900">
                Role coverage: {chemistryBreakdown.roleCoverage.toFixed(1)}
              </summary>
              <p className="mt-1 text-[11px] text-slate-600">
                Higher when your lineup has strong coverage across core roles like playmaking,
                spacing, defense, rim protection, and rebounding.
              </p>
            </details>
            <details className="rounded-lg border border-slate-200 bg-white p-2">
              <summary className="cursor-pointer font-semibold text-slate-900">
                Complementarity: {chemistryBreakdown.complementarity.toFixed(1)}
              </summary>
              <p className="mt-1 text-[11px] text-slate-600">
                Higher when players bring different strengths that fit together, and lower when
                too many players overlap in ball-dominant styles.
              </p>
            </details>
            <details className="rounded-lg border border-slate-200 bg-white p-2">
              <summary className="cursor-pointer font-semibold text-slate-900">
                Usage balance: {chemistryBreakdown.usageBalance.toFixed(1)}
              </summary>
              <p className="mt-1 text-[11px] text-slate-600">
                Rewards a healthy distribution of on-ball responsibility. It drops when the lineup
                is overloaded with high-usage creators.
              </p>
            </details>
            <details className="rounded-lg border border-slate-200 bg-white p-2">
              <summary className="cursor-pointer font-semibold text-slate-900">
                Two-way balance: {chemistryBreakdown.twoWayBalance.toFixed(1)}
              </summary>
              <p className="mt-1 text-[11px] text-slate-600">
                Compares overall offense and defense profile. More balanced lineups score higher
                than one-sided lineups.
              </p>
            </details>
            <details className="rounded-lg border border-slate-200 bg-white p-2">
              <summary className="cursor-pointer font-semibold text-slate-900">
                Culture fit: {chemistryBreakdown.culture.toFixed(1)}
              </summary>
              <p className="mt-1 text-[11px] text-slate-600">
                Uses winning-context strength across the five players and rewards lineups where
                that profile is both strong and consistent.
              </p>
            </details>
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

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 py-2 backdrop-blur md:px-6">
        <div className="mx-auto w-full max-w-5xl">
          <form action={resetGameWithPrefillAction}>
            <input type="hidden" name="userName" value={prefillUserName} />
            <input type="hidden" name="groupCode" value={prefillGroupCode} />
            <input type="hidden" name="seed" value={prefillSeed} />
            <button type="submit" className="button-primary w-full">
              Play again
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
