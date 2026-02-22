import { DEFAULT_SEASON } from '@/lib/constants';
import { getGlobalMetricRanges, lookupPlayerStats, normalizePlayerMetricGlobally } from '@/lib/data';
import type { ChemistryBreakdown, LineupPick, LineupSlot, PlayerScoreBreakdown, PlayerStats } from '@/lib/types';

const METRIC_WEIGHTS = {
  // Player-level awards and honors tied to franchise years.
  bpm: 0.3,
  // Team success while with the franchise (title and deep-run value).
  ws48: 0.25,
  // Franchise box-score production value.
  vorp: 0.25,
  // Franchise advanced impact value.
  epm: 0.2
} as const;

const CONTRIBUTION_NORMALIZATION = {
  // Soft cap keeps elite players near ~85-95 instead of bunching at 99/100.
  ceiling: 95,
  gamma: 1.15
} as const;
const CHEMISTRY_WEIGHTS = {
  roleCoverage: 0.3,
  complementarity: 0.25,
  usageBalance: 0.2,
  twoWayBalance: 0.15,
  culture: 0.1
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeMetric(metric: keyof PlayerStats, value: number): number {
  const percentile = clamp(normalizePlayerMetricGlobally(metric, value), 0, 100);
  const scaled = Math.pow(percentile / 100, CONTRIBUTION_NORMALIZATION.gamma);
  return clamp(scaled * CONTRIBUTION_NORMALIZATION.ceiling, 0, CONTRIBUTION_NORMALIZATION.ceiling);
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const mean = average(values);
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

type RoleProfile = {
  playmaking: number;
  spacing: number;
  rimPressure: number;
  perimeterDefense: number;
  rimProtection: number;
  rebounding: number;
  ballDominance: number;
};

function slotBonus(slot: LineupSlot, bonuses: Partial<Record<LineupSlot, number>>): number {
  return bonuses[slot] ?? 0;
}

const ZERO_STATS: PlayerStats = {
  bpm: 0,
  ws48: 0,
  vorp: 0,
  epm: 0
};

export function scorePlayer(stats: PlayerStats): {
  normalizedMetrics: PlayerStats;
  contribution: number;
} {
  const normalizedMetrics: PlayerStats = {
    bpm: normalizeMetric('bpm', stats.bpm),
    ws48: normalizeMetric('ws48', stats.ws48),
    vorp: normalizeMetric('vorp', stats.vorp),
    epm: normalizeMetric('epm', stats.epm)
  };

  const contribution =
    normalizedMetrics.bpm * METRIC_WEIGHTS.bpm +
    normalizedMetrics.ws48 * METRIC_WEIGHTS.ws48 +
    normalizedMetrics.vorp * METRIC_WEIGHTS.vorp +
    normalizedMetrics.epm * METRIC_WEIGHTS.epm;

  return {
    normalizedMetrics,
    contribution: roundToOneDecimal(contribution)
  };
}

function buildRoleProfile(input: {
  slot: LineupSlot;
  metrics: PlayerStats;
  isPenalty?: boolean;
}): RoleProfile {
  const { slot, metrics, isPenalty } = input;

  if (isPenalty) {
    return {
      playmaking: 0,
      spacing: 0,
      rimPressure: 0,
      perimeterDefense: 0,
      rimProtection: 0,
      rebounding: 0,
      ballDominance: 0
    };
  }

  return {
    playmaking: clamp(
      metrics.vorp * 0.5 + metrics.bpm * 0.35 + slotBonus(slot, { PG: 15, SG: 8, SF: 3 }),
      0,
      100
    ),
    spacing: clamp(
      metrics.epm * 0.45 + metrics.bpm * 0.3 + slotBonus(slot, { SG: 10, SF: 8, PG: 5 }),
      0,
      100
    ),
    rimPressure: clamp(
      metrics.vorp * 0.45 + metrics.bpm * 0.2 + slotBonus(slot, { C: 14, PF: 10, SF: 5 }),
      0,
      100
    ),
    perimeterDefense: clamp(
      metrics.ws48 * 0.45 +
        metrics.epm * 0.25 +
        slotBonus(slot, { SF: 12, SG: 8, PG: 5, PF: 4 }),
      0,
      100
    ),
    rimProtection: clamp(
      metrics.ws48 * 0.5 + metrics.epm * 0.2 + slotBonus(slot, { C: 16, PF: 9, SF: 2 }),
      0,
      100
    ),
    rebounding: clamp(
      metrics.ws48 * 0.45 + metrics.vorp * 0.3 + slotBonus(slot, { C: 13, PF: 9, SF: 4 }),
      0,
      100
    ),
    ballDominance: clamp(
      metrics.bpm * 0.5 + metrics.vorp * 0.35 + slotBonus(slot, { PG: 12, SG: 8, SF: 4 }),
      0,
      100
    )
  };
}

function computeChemistry(playerScores: PlayerScoreBreakdown[]): ChemistryBreakdown {
  if (playerScores.length === 0) {
    return {
      roleCoverage: 0,
      complementarity: 0,
      usageBalance: 0,
      twoWayBalance: 0,
      culture: 0,
      chemistryScore: 0,
      multiplier: 1
    };
  }

  const profiles = playerScores.map((player) =>
    buildRoleProfile({
      slot: player.pick.slot,
      metrics: player.normalizedMetrics,
      isPenalty: player.pick.isPenalty
    })
  );

  const roleCoverage = clamp(
    average([
      Math.max(...profiles.map((profile) => profile.playmaking)),
      Math.max(...profiles.map((profile) => profile.spacing)),
      Math.max(...profiles.map((profile) => profile.perimeterDefense)),
      Math.max(...profiles.map((profile) => profile.rimProtection)),
      Math.max(...profiles.map((profile) => profile.rebounding))
    ]),
    0,
    100
  );

  const pairScores: number[] = [];
  for (let i = 0; i < profiles.length; i += 1) {
    for (let j = i + 1; j < profiles.length; j += 1) {
      const a = profiles[i]!;
      const b = profiles[j]!;
      const distance = average([
        Math.abs(a.playmaking - b.playmaking),
        Math.abs(a.spacing - b.spacing),
        Math.abs(a.rimPressure - b.rimPressure),
        Math.abs(a.perimeterDefense - b.perimeterDefense),
        Math.abs(a.rimProtection - b.rimProtection),
        Math.abs(a.rebounding - b.rebounding)
      ]);
      const dominancePenalty = Math.max(0, ((a.ballDominance + b.ballDominance) / 2 - 72) * 1.1);
      const pairScore = clamp(52 + distance * 0.55 - dominancePenalty, 0, 100);
      pairScores.push(pairScore);
    }
  }
  const complementarity = clamp(average(pairScores), 0, 100);

  const ballDominanceValues = profiles.map((profile) => profile.ballDominance);
  const ballDominanceAvg = average(ballDominanceValues);
  const ballDominanceStd = standardDeviation(ballDominanceValues);
  const highUsageCount = ballDominanceValues.filter((value) => value > 80).length;
  const usageBalance = clamp(
    100 - Math.abs(ballDominanceAvg - 66) * 1.2 - ballDominanceStd * 1.35 - highUsageCount * 3.5,
    0,
    100
  );

  const offenseValues = profiles.map(
    (profile) => average([profile.playmaking, profile.spacing, profile.rimPressure])
  );
  const defenseValues = profiles.map(
    (profile) => average([profile.perimeterDefense, profile.rimProtection, profile.rebounding])
  );
  const offense = average(offenseValues);
  const defense = average(defenseValues);
  const twoWayBalance = clamp(100 - Math.abs(offense - defense) * 1.25, 0, 100);

  const teamAccoladeValues = playerScores.map((player) => player.normalizedMetrics.ws48);
  const teamAccoladeAvg = average(teamAccoladeValues);
  const teamAccoladeStd = standardDeviation(teamAccoladeValues);
  const highCultureCount = teamAccoladeValues.filter((value) => value > 75).length;
  const culture = clamp(teamAccoladeAvg - teamAccoladeStd * 0.5 + highCultureCount * 2.5, 0, 100);

  const chemistryScore = clamp(
    roleCoverage * CHEMISTRY_WEIGHTS.roleCoverage +
      complementarity * CHEMISTRY_WEIGHTS.complementarity +
      usageBalance * CHEMISTRY_WEIGHTS.usageBalance +
      twoWayBalance * CHEMISTRY_WEIGHTS.twoWayBalance +
      culture * CHEMISTRY_WEIGHTS.culture,
    0,
    100
  );

  // Requested bounds: chemistry multiplier in [1.0, 2.0].
  const multiplier = clamp(1 + chemistryScore / 100, 1, 2);

  return {
    roleCoverage: roundToOneDecimal(roleCoverage),
    complementarity: roundToOneDecimal(complementarity),
    usageBalance: roundToOneDecimal(usageBalance),
    twoWayBalance: roundToOneDecimal(twoWayBalance),
    culture: roundToOneDecimal(culture),
    chemistryScore: roundToOneDecimal(chemistryScore),
    multiplier: roundToOneDecimal(multiplier)
  };
}

export function scoreLineup(picks: LineupPick[], season = DEFAULT_SEASON): {
  baseTeamScore: number;
  teamScore: number;
  chemistry: ChemistryBreakdown;
  playerScores: PlayerScoreBreakdown[];
  usedFallbackStats: boolean;
} {
  if (picks.length === 0) {
    return {
      baseTeamScore: 0,
      teamScore: 0,
      chemistry: {
        roleCoverage: 0,
        complementarity: 0,
        usageBalance: 0,
        twoWayBalance: 0,
        culture: 0,
        chemistryScore: 0,
        multiplier: 1
      },
      playerScores: [],
      usedFallbackStats: false
    };
  }

  const playerScores = picks.map((pick) => {
    if (pick.isPenalty) {
      return {
        pick,
        stats: ZERO_STATS,
        usedFallback: false,
        normalizedMetrics: ZERO_STATS,
        contribution: 0
      };
    }

    const statsLookup = lookupPlayerStats(pick.teamAbbr, pick.playerName, season);
    const scoredPlayer = scorePlayer(statsLookup.stats);

    return {
      pick,
      stats: statsLookup.stats,
      usedFallback: statsLookup.usedFallback,
      normalizedMetrics: scoredPlayer.normalizedMetrics,
      contribution: scoredPlayer.contribution
    };
  });

  const totalContribution = playerScores.reduce((sum, player) => sum + player.contribution, 0);
  const baseTeamScore = roundToOneDecimal(totalContribution / playerScores.length);
  const chemistry = computeChemistry(playerScores);
  const teamScore = roundToOneDecimal(baseTeamScore * chemistry.multiplier);

  return {
    baseTeamScore,
    teamScore,
    chemistry,
    playerScores,
    usedFallbackStats: playerScores.some((player) => player.usedFallback)
  };
}

export const SCORING_CONFIG = {
  metricWeights: METRIC_WEIGHTS,
  metricRanges: getGlobalMetricRanges(),
  normalization: CONTRIBUTION_NORMALIZATION,
  chemistryWeights: CHEMISTRY_WEIGHTS
};
