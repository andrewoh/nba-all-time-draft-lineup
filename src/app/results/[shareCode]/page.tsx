import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { resetGameWithPrefillAction } from '@/app/actions';
import { ChemistryRadar } from '@/components/chemistry-radar';
import { CopyLinkButton } from '@/components/copy-link-button';
import { cn } from '@/lib/cn';
import { getPlayerExplanationData, getTeamLogoUrl } from '@/lib/data';
import { formatDateTime } from '@/lib/format';
import { getRunBenchmarks, getRunByShareCode } from '@/lib/run-service';
import { scoreLineup } from '@/lib/scoring';
import type { ChemistryBreakdown, LineupPick, PlayerExplanationData } from '@/lib/types';

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

type RunCategoryAverages = {
  personal: number;
  team: number;
  stats: number;
  advanced: number;
  contribution: number;
};

type PercentileBadgeStyle = {
  className: string;
  tier: string;
};

const CHEMISTRY_EXPLANATIONS: Array<{
  key: keyof Pick<ChemistryBreakdown, 'roleCoverage' | 'complementarity' | 'usageBalance' | 'twoWayBalance' | 'culture'>;
  label: string;
  explanation: string;
}> = [
  {
    key: 'roleCoverage',
    label: 'Role coverage',
    explanation:
      'Higher when your lineup has strong coverage across core roles like playmaking, spacing, defense, rim protection, and rebounding.'
  },
  {
    key: 'complementarity',
    label: 'Complementarity',
    explanation:
      'Higher when players bring different strengths that fit together, and lower when too many players overlap in ball-dominant styles.'
  },
  {
    key: 'usageBalance',
    label: 'Usage balance',
    explanation:
      'Rewards a healthy distribution of on-ball responsibility. It drops when the lineup is overloaded with high-usage creators.'
  },
  {
    key: 'twoWayBalance',
    label: 'Two-way balance',
    explanation:
      'Compares overall offense and defense profile. More balanced lineups score higher than one-sided lineups.'
  },
  {
    key: 'culture',
    label: 'Culture fit',
    explanation:
      'Uses winning-context strength across the five players and rewards lineups where that profile is both strong and consistent.'
  }
];

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildScoreDrivers(pick: ResultPick, explanation: PlayerExplanationData | null): string[] {
  if (pick.isPenalty) {
    return [
      'Shot clock violation auto-filled this slot with 0 contribution.',
      'No player metrics were applied for this slot.'
    ];
  }

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

  if (explanation?.personalAccoladeItems?.length) {
    drivers.push(`Personal accolades: ${explanation.personalAccoladeItems.join(', ')}.`);
  } else if (explanation?.accolades) {
    drivers.push('No major personal awards were recorded during this franchise stint.');
  } else {
    drivers.push('Detailed personal accolade counts were not available; aggregate signal was used.');
  }

  if (explanation?.teamAccoladeItems?.length) {
    drivers.push(`Team accolades/context: ${explanation.teamAccoladeItems.join(', ')}.`);
  }

  if (explanation?.statsDetailItems?.length) {
    drivers.push(`Stats detail: ${explanation.statsDetailItems.slice(0, 3).join(', ')}.`);
  }

  if (explanation?.advancedDetailItems?.length) {
    drivers.push(`Advanced detail: ${explanation.advancedDetailItems.slice(0, 3).join(', ')}.`);
  }

  if (explanation?.boxPercentiles) {
    const boxMetrics = [
      { label: 'PTS', value: explanation.boxPercentiles.pts },
      { label: 'REB', value: explanation.boxPercentiles.reb },
      { label: 'AST', value: explanation.boxPercentiles.ast },
      { label: 'STL', value: explanation.boxPercentiles.stl },
      { label: 'BLK', value: explanation.boxPercentiles.blk }
    ];
    const strong = boxMetrics
      .filter((metric) => metric.value >= 68)
      .map((metric) => `${metric.label} ${metric.value.toFixed(0)}p`);
    const weak = boxMetrics
      .filter((metric) => metric.value <= 42)
      .map((metric) => `${metric.label} ${metric.value.toFixed(0)}p`);
    if (strong.length > 0) {
      drivers.push(`Stat strengths vs all players in dataset: ${strong.slice(0, 3).join(', ')}.`);
    }
    if (weak.length > 0) {
      drivers.push(`Stat gaps vs peers: ${weak.slice(0, 3).join(', ')}.`);
    }
  } else if (pick.vorp <= 55) {
    drivers.push('Box-score weakness came from not reaching top-tier franchise production in key counting stats.');
  }

  if (pick.usedFallback) {
    drivers.push('Fallback baseline values were used for missing franchise stats.');
  }

  if (pick.contribution >= 80) {
    drivers.push('Overall profile graded as elite for this draft context.');
  } else if (pick.contribution < 55) {
    drivers.push('Overall profile graded as below average for this draft context.');
  }

  return drivers.length > 0
    ? drivers
    : ['This score came from a balanced, middle-tier profile across all 4 categories.'];
}

function computeRunCategoryAverages(picks: ResultPick[]): RunCategoryAverages {
  return {
    personal: roundToOneDecimal(average(picks.map((pick) => pick.bpm))),
    team: roundToOneDecimal(average(picks.map((pick) => pick.ws48))),
    stats: roundToOneDecimal(average(picks.map((pick) => pick.vorp))),
    advanced: roundToOneDecimal(average(picks.map((pick) => pick.epm))),
    contribution: roundToOneDecimal(average(picks.map((pick) => pick.contribution)))
  };
}

function formatSignedDelta(value: number): string {
  const rounded = roundToOneDecimal(value);
  const prefix = rounded > 0 ? '+' : '';
  return `${prefix}${rounded.toFixed(1)}`;
}

function deltaClassName(value: number): string {
  if (value >= 2) {
    return 'text-emerald-700';
  }

  if (value <= -2) {
    return 'text-rose-700';
  }

  return 'text-slate-600';
}

function getPercentileBadgeStyle(value: number): PercentileBadgeStyle {
  if (value >= 90) {
    return {
      tier: 'Elite',
      className: 'border-emerald-300 bg-emerald-50 text-emerald-800'
    };
  }

  if (value >= 75) {
    return {
      tier: 'Strong',
      className: 'border-blue-300 bg-blue-50 text-blue-800'
    };
  }

  if (value >= 60) {
    return {
      tier: 'Solid',
      className: 'border-amber-300 bg-amber-50 text-amber-800'
    };
  }

  return {
    tier: 'Low',
    className: 'border-slate-300 bg-slate-100 text-slate-700'
  };
}

function buildImprovementTips(input: {
  picks: ResultPick[];
  categoryAverages: RunCategoryAverages;
  chemistry: ChemistryBreakdown;
  deltas: {
    personal: number;
    team: number;
    stats: number;
    advanced: number;
    chemistry: number;
    teamScore: number;
  };
}): string[] {
  const { picks, categoryAverages, chemistry, deltas } = input;

  const weakestPick = [...picks]
    .filter((pick) => !pick.isPenalty)
    .sort((a, b) => a.contribution - b.contribution)[0];

  const weakestCategory = [
    {
      key: 'personal',
      label: 'player accolades',
      value: categoryAverages.personal,
      action: 'target players with MVP/All-NBA level award profiles during their franchise stint.'
    },
    {
      key: 'team',
      label: 'team accolades',
      value: categoryAverages.team,
      action: 'prioritize players tied to title runs and higher team-level winning context.'
    },
    {
      key: 'stats',
      label: 'stats',
      value: categoryAverages.stats,
      action: 'look for players with stronger PTS/REB/AST/STL/BLK profile and peak years.'
    },
    {
      key: 'advanced',
      label: 'advanced impact',
      value: categoryAverages.advanced,
      action: 'pick players with stronger winning-impact indicators, not just box score totals.'
    }
  ].sort((a, b) => a.value - b.value)[0];

  const weakestChemistry = CHEMISTRY_EXPLANATIONS.map((item) => ({
    label: item.label,
    value: chemistry[item.key]
  })).sort((a, b) => a.value - b.value)[0];

  const tips: string[] = [];

  if (weakestPick) {
    tips.push(
      `Biggest immediate lift: upgrade ${weakestPick.slot}. ${weakestPick.playerName} was your lowest contribution (${weakestPick.contribution.toFixed(
        1
      )}).`
    );
  }

  if (weakestCategory) {
    tips.push(
      `Weakest category was ${weakestCategory.label} (${weakestCategory.value.toFixed(
        1
      )}) so next run should ${weakestCategory.action}`
    );
  }

  if (weakestChemistry) {
    tips.push(
      `Chemistry bottleneck was ${weakestChemistry.label.toLowerCase()} (${weakestChemistry.value.toFixed(
        1
      )}), so focus on lineup fit instead of stacking similar archetypes.`
    );
  }

  if (deltas.teamScore < 0) {
    tips.push(
      `This run finished ${formatSignedDelta(
        deltas.teamScore
      )} below your benchmark. Fixing the weakest category + chemistry area should create the fastest gains.`
    );
  } else {
    tips.push(
      `You finished ${formatSignedDelta(
        deltas.teamScore
      )} above your benchmark. Doubling down on your strongest category can push an even higher ceiling.`
    );
  }

  return tips.slice(0, 4);
}

function firstHeaderValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return value.split(',')[0]?.trim() ?? null;
}

function resolveBaseUrl(headerStore: Headers): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim() || null;
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

  const benchmarks = await getRunBenchmarks(run.groupCode);
  const runCategoryAverages = computeRunCategoryAverages(run.picks as ResultPick[]);
  const deltas = {
    teamScore: roundToOneDecimal(run.teamScore - benchmarks.averages.teamScore),
    chemistry: roundToOneDecimal(chemistryScore - benchmarks.averages.chemistryScore),
    personal: roundToOneDecimal(runCategoryAverages.personal - benchmarks.averages.personal),
    team: roundToOneDecimal(runCategoryAverages.team - benchmarks.averages.team),
    stats: roundToOneDecimal(runCategoryAverages.stats - benchmarks.averages.stats),
    advanced: roundToOneDecimal(runCategoryAverages.advanced - benchmarks.averages.advanced)
  };
  const improvementTips = buildImprovementTips({
    picks: run.picks as ResultPick[],
    categoryAverages: runCategoryAverages,
    chemistry: chemistryBreakdown,
    deltas
  });
  const benchmarkLabel =
    benchmarks.scope === 'group' && run.groupCode
      ? `${run.groupCode} group average`
      : 'global average';

  const prefillUserName = run.userName ?? '';
  const prefillGroupCode = run.groupCode ?? '';
  const prefillSeed = run.seed ?? '';

  const scorecardMetrics = [
    { label: 'Team Score', value: run.teamScore, delta: deltas.teamScore },
    { label: 'Chemistry', value: chemistryScore, delta: deltas.chemistry },
    { label: 'Personal', value: runCategoryAverages.personal, delta: deltas.personal },
    { label: 'Team', value: runCategoryAverages.team, delta: deltas.team },
    { label: 'Stats', value: runCategoryAverages.stats, delta: deltas.stats },
    { label: 'Advanced', value: runCategoryAverages.advanced, delta: deltas.advanced }
  ];

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

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">Scorecard vs average run</p>
            <p className="text-xs text-slate-600">
              {benchmarkLabel} ({benchmarks.sampleSize} runs)
            </p>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {scorecardMetrics.map((metric) => (
              <div key={metric.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{metric.label}</p>
                <p className="text-lg font-bold text-slate-900">{metric.value.toFixed(1)}</p>
                <p className={cn('text-xs font-semibold', deltaClassName(metric.delta))}>
                  {formatSignedDelta(metric.delta)} vs avg
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <p className="font-semibold text-slate-900">Chemistry breakdown</p>
          <p className="mt-1 text-slate-600">Tap each item for a simple explanation.</p>
          <div className="mt-3 grid gap-3 lg:grid-cols-[auto_1fr] lg:items-start">
            <ChemistryRadar
              breakdown={{
                roleCoverage: chemistryBreakdown.roleCoverage,
                complementarity: chemistryBreakdown.complementarity,
                usageBalance: chemistryBreakdown.usageBalance,
                twoWayBalance: chemistryBreakdown.twoWayBalance,
                culture: chemistryBreakdown.culture
              }}
            />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {CHEMISTRY_EXPLANATIONS.map((item) => (
                <details key={item.key} className="rounded-lg border border-slate-200 bg-white p-2">
                  <summary className="cursor-pointer font-semibold text-slate-900">
                    {item.label}: {chemistryBreakdown[item.key].toFixed(1)}
                  </summary>
                  <p className="mt-1 text-[11px] text-slate-600">{item.explanation}</p>
                </details>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
          <p className="text-sm font-semibold text-indigo-900">What would improve this lineup most?</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-indigo-900/90">
            {improvementTips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {run.picks.map((pick) => {
            const teamLogoUrl = getTeamLogoUrl(pick.teamAbbr);
            const explanation = getPlayerExplanationData(pick.teamAbbr, pick.playerName);
            const drivers = buildScoreDrivers(pick as ResultPick, explanation);
            const badges = [
              { label: 'Personal', value: pick.bpm },
              { label: 'Team', value: pick.ws48 },
              { label: 'Stats', value: pick.vorp },
              { label: 'Advanced', value: pick.epm }
            ];

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
                <div className="mt-2 flex flex-wrap gap-1">
                  {badges.map((badge) => {
                    const style = getPercentileBadgeStyle(badge.value);
                    return (
                      <span
                        key={`${pick.id}-${badge.label}`}
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                          style.className
                        )}
                      >
                        {badge.label} P{Math.round(badge.value)} {style.tier}
                      </span>
                    );
                  })}
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-court-700 hover:underline">
                    Why this score?
                  </summary>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] text-slate-600">
                    {drivers.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  {!pick.isPenalty && explanation ? (
                    <div className="mt-2 space-y-2 text-[11px] text-slate-700">
                      <div>
                        <p className="font-semibold text-slate-900">Personal accolades</p>
                        {explanation.personalAccoladeItems.length > 0 ? (
                          <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-600">
                            {explanation.personalAccoladeItems.map((item) => (
                              <li key={`${pick.id}-personal-${item}`}>{item}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1 text-slate-600">No major personal awards were recorded in this dataset.</p>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">Team accolades/context</p>
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-600">
                          {explanation.teamAccoladeItems.map((item) => (
                            <li key={`${pick.id}-team-${item}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">Stats profile</p>
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-600">
                          {explanation.statsDetailItems.map((item) => (
                            <li key={`${pick.id}-stats-${item}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">Advanced impact profile</p>
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-600">
                          {explanation.advancedDetailItems.map((item) => (
                            <li key={`${pick.id}-advanced-${item}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}
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
