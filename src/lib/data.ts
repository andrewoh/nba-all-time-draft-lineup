import { DEFAULT_SEASON } from '@/lib/constants';
import { ALL_TIME_TEAM_SEED } from '@/lib/all-time-seed';
import { LINEUP_SLOTS } from '@/lib/types';
import type {
  AwardBreakdown,
  BoxTotals,
  FranchiseGreatnessBreakdown,
  LineupSlot,
  PlayerExplanationData,
  PlayerStats,
  RosterPlayer,
  StatsLookup,
  Team
} from '@/lib/types';
import teamsData from '../../data/teams.json';

type FranchiseRosterPlayer = RosterPlayer & {
  greatness: FranchiseGreatnessBreakdown;
};

type CategoryRaw = {
  playerAccolades: number;
  teamAccolades: number;
  stats: number;
  advanced: number;
};

type CategoryScores = CategoryRaw;

type SeedPlayerProfile = {
  teamAbbr: string;
  name: string;
  years: string;
  positions: LineupSlot[];
  yearsWithTeam: number;
  careerYears: number;
  championships: number;
  categoryRaw: CategoryRaw;
  accolades: AwardBreakdown | null;
  boxTotals: BoxTotals | null;
};

type GlobalCategoryDistributions = {
  personalRaw: number[];
  teamRaw: number[];
  statsRaw: number[];
  advancedRaw: number[];
  statsPerYear: number[];
  statsPeakProxy: number[];
  winningImpactProxy: number[];
  championships: number[];
  boxPts: number[];
  boxReb: number[];
  boxAst: number[];
  boxStl: number[];
  boxBlk: number[];
};

const typedTeams = teamsData as Team[];
const teamByAbbr = new Map(typedTeams.map((team) => [team.abbr, team]));
const rosterByTeam = new Map<string, FranchiseRosterPlayer[]>();
const rosterNamesByTeam = new Map<string, string[]>();
const statsByTeamPlayer = new Map<string, PlayerStats>();
const slotsByTeamPlayer = new Map<string, LineupSlot[]>();
const explanationByTeamPlayer = new Map<string, PlayerExplanationData>();
const globalMetricRanges: Record<keyof PlayerStats, { min: number; max: number }> = {
  bpm: { min: 0, max: 100 },
  ws48: { min: 0, max: 100 },
  vorp: { min: 0, max: 100 },
  epm: { min: 0, max: 100 }
};
const globalMetricDistributions: Record<keyof PlayerStats, number[]> = {
  bpm: [],
  ws48: [],
  vorp: [],
  epm: []
};

const teamLogoIdByAbbr: Record<string, string> = {
  ATL: '1610612737',
  BOS: '1610612738',
  BKN: '1610612751',
  CHA: '1610612766',
  CHI: '1610612741',
  CLE: '1610612739',
  DAL: '1610612742',
  DEN: '1610612743',
  DET: '1610612765',
  GSW: '1610612744',
  HOU: '1610612745',
  IND: '1610612754',
  LAC: '1610612746',
  LAL: '1610612747',
  MEM: '1610612763',
  MIA: '1610612748',
  MIL: '1610612749',
  MIN: '1610612750',
  NOP: '1610612740',
  NYK: '1610612752',
  OKC: '1610612760',
  ORL: '1610612753',
  PHI: '1610612755',
  PHX: '1610612756',
  POR: '1610612757',
  SAC: '1610612758',
  SAS: '1610612759',
  TOR: '1610612761',
  UTA: '1610612762',
  WAS: '1610612764'
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function sortNumeric(values: number[]): number[] {
  return [...values].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
}

function makeTeamPlayerKey(teamAbbr: string, playerName: string): string {
  return `${teamAbbr}|${playerName}`;
}

function parseYearsWithTeam(yearRange: string): number {
  const match = yearRange.match(/^(\d{4})-(\d{4})$/);
  if (!match) {
    return 1;
  }

  const startYear = Number(match[1]);
  const endYear = Number(match[2]);

  if (!Number.isFinite(startYear) || !Number.isFinite(endYear) || endYear < startYear) {
    return 1;
  }

  return Math.max(1, endYear - startYear + 1);
}

function legacyCategoryRawFromRank(input: {
  rankIndex: number;
  yearsWithTeam: number;
  careerYears: number;
  championships: number;
}): CategoryRaw {
  const { rankIndex, yearsWithTeam, careerYears, championships } = input;
  const rankPercent = clamp(1 - rankIndex / 14, 0, 1);
  const yearsNorm = clamp(yearsWithTeam / 16, 0, 1);
  const tenureRatio = clamp(yearsWithTeam / Math.max(1, careerYears), 0.08, 1);

  return {
    playerAccolades: rankPercent * 72 + championships * 6 + yearsNorm * 10 + tenureRatio * 8,
    teamAccolades: championships * 20 + yearsNorm * 28 + rankPercent * 24 + tenureRatio * 12,
    stats: rankPercent * 56 + yearsNorm * 36 + tenureRatio * 14 + championships * 2,
    advanced: rankPercent * 62 + tenureRatio * 22 + yearsNorm * 12 + championships * 3
  };
}

function normalizeByDistribution(value: number, sortedValues: number[]): number {
  if (sortedValues.length === 0) {
    return 50;
  }

  if (sortedValues.length === 1) {
    return 50;
  }

  const lower = lowerBound(sortedValues, value);
  const upper = upperBound(sortedValues, value);
  const clampedLower = clamp(lower, 0, sortedValues.length - 1);
  const clampedUpper = clamp(upper - 1, 0, sortedValues.length - 1);
  const averageRank = (clampedLower + clampedUpper) / 2;

  return (averageRank / (sortedValues.length - 1)) * 100;
}

function statsPerYearRaw(raw: CategoryRaw, yearsWithTeam: number): number {
  return raw.stats / Math.max(1, yearsWithTeam);
}

function statsPeakProxyRaw(raw: CategoryRaw, yearsWithTeam: number): number {
  // Keep a "peak" signal without abandoning total production.
  return raw.stats / Math.sqrt(Math.max(1, yearsWithTeam));
}

function winningImpactProxyRaw(input: {
  raw: CategoryRaw;
  championships: number;
}): number {
  const { raw, championships } = input;
  return raw.advanced * 0.52 + raw.teamAccolades * 0.31 + raw.playerAccolades * 0.17 + championships * 26;
}

function toCategoryScores(input: {
  raw: CategoryRaw;
  yearsWithTeam: number;
  careerYears: number;
  championships: number;
  global: GlobalCategoryDistributions;
}): CategoryScores {
  const { raw, yearsWithTeam, careerYears, championships, global } = input;
  const tenureRatio = clamp(yearsWithTeam / Math.max(1, careerYears), 0.08, 1);

  const personalPercentile = normalizeByDistribution(raw.playerAccolades, global.personalRaw);
  const teamPercentile = normalizeByDistribution(raw.teamAccolades, global.teamRaw);
  const statsVolumePercentile = normalizeByDistribution(raw.stats, global.statsRaw);
  const statsPerYearPercentile = normalizeByDistribution(
    statsPerYearRaw(raw, yearsWithTeam),
    global.statsPerYear
  );
  const statsPeakPercentile = normalizeByDistribution(
    statsPeakProxyRaw(raw, yearsWithTeam),
    global.statsPeakProxy
  );
  const advancedPercentile = normalizeByDistribution(raw.advanced, global.advancedRaw);
  const championshipPercentile = normalizeByDistribution(championships, global.championships);
  const winningImpactPercentile = normalizeByDistribution(
    winningImpactProxyRaw({ raw, championships }),
    global.winningImpactProxy
  );

  const playerAccoladesBase =
    personalPercentile * 0.8 + teamPercentile * 0.1 + championshipPercentile * 0.1;
  const teamAccoladesBase =
    teamPercentile * 0.56 + winningImpactPercentile * 0.26 + championshipPercentile * 0.18;
  // Box stats emphasize both total footprint and peak-quality seasons.
  const statsBase =
    statsVolumePercentile * 0.37 + statsPerYearPercentile * 0.29 + statsPeakPercentile * 0.34;
  // Advanced category is anchored to winning impact to avoid pure box-stat duplication.
  const advancedBase =
    advancedPercentile * 0.52 + winningImpactPercentile * 0.36 + teamPercentile * 0.12;
  const advancedDecoupled = clamp(
    advancedBase - Math.max(0, statsBase - advancedBase) * 0.35,
    0,
    100
  );

  const contributionTenure = 0.92 + tenureRatio * 0.08;

  return {
    playerAccolades: clamp(playerAccoladesBase * contributionTenure, 4, 97),
    teamAccolades: clamp(teamAccoladesBase * (0.86 + tenureRatio * 0.14), 4, 97),
    stats: clamp(statsBase * (0.93 + tenureRatio * 0.07), 4, 97),
    advanced: clamp(advancedDecoupled * (0.94 + tenureRatio * 0.06), 4, 97)
  };
}

function computeGreatness(input: {
  categories: CategoryScores;
  yearsWithTeam: number;
  careerYears: number;
}): FranchiseGreatnessBreakdown {
  const { categories, yearsWithTeam, careerYears } = input;
  const tenureRatio = clamp(yearsWithTeam / Math.max(1, careerYears), 0.08, 1);

  // Contribution categories:
  // 1) player accolades, 2) team accolades, 3) box stats, 4) advanced impact.
  const personalAccolades = clamp(categories.playerAccolades, 4, 97);
  const teamAccolades = clamp(categories.teamAccolades, 4, 97);
  const boxStats = clamp(categories.stats, 4, 97);
  const advancedStats = clamp(categories.advanced, 4, 97);

  const rawScore =
    personalAccolades * 0.3 +
    teamAccolades * 0.25 +
    boxStats * 0.25 +
    advancedStats * 0.2;

  const tenureMultiplier = 0.56 + tenureRatio * 0.44;
  const franchiseScore = clamp(rawScore * tenureMultiplier, 8, 97);

  return {
    personalAccolades: roundToOneDecimal(personalAccolades),
    teamAccolades: roundToOneDecimal(teamAccolades),
    boxStats: roundToOneDecimal(boxStats),
    advancedStats: roundToOneDecimal(advancedStats),
    franchiseScore: roundToOneDecimal(franchiseScore),
    yearsWithTeam,
    careerYears,
    tenureRatio: roundToOneDecimal(tenureRatio)
  };
}

function fallbackByPrimarySlot(slot: LineupSlot): PlayerStats {
  if (slot === 'PG') {
    return { bpm: 30, ws48: 28, vorp: 33, epm: 29 };
  }

  if (slot === 'SG') {
    return { bpm: 29, ws48: 27, vorp: 32, epm: 28 };
  }

  if (slot === 'SF') {
    return { bpm: 30, ws48: 28, vorp: 33, epm: 29 };
  }

  if (slot === 'PF') {
    return { bpm: 31, ws48: 29, vorp: 34, epm: 30 };
  }

  return { bpm: 32, ws48: 30, vorp: 35, epm: 31 };
}

function initializeAllTimeData(): void {
  const profilesByTeam = new Map<string, SeedPlayerProfile[]>();
  const allProfiles: SeedPlayerProfile[] = [];

  for (const team of typedTeams) {
    const seedPlayers = ALL_TIME_TEAM_SEED[team.abbr] ?? [];
    const profiles = seedPlayers.map((seedPlayer, rankIndex) => {
      const yearsWithTeam = parseYearsWithTeam(seedPlayer.years);
      const careerYears = Math.max(seedPlayer.careerYears ?? yearsWithTeam, yearsWithTeam);
      const championships = Math.max(0, seedPlayer.championships ?? 0);
      const categoryRaw = seedPlayer.categoryRaw ?? legacyCategoryRawFromRank({
        rankIndex,
        yearsWithTeam,
        careerYears,
        championships
      });
      const positions = seedPlayer.positions.length > 0 ? seedPlayer.positions : [...LINEUP_SLOTS];

      return {
        teamAbbr: team.abbr,
        name: seedPlayer.name,
        years: seedPlayer.years,
        positions,
        yearsWithTeam,
        careerYears,
        championships,
        categoryRaw,
        accolades: seedPlayer.accolades ?? null,
        boxTotals: seedPlayer.boxTotals ?? null
      } satisfies SeedPlayerProfile;
    });

    profilesByTeam.set(team.abbr, profiles);
    allProfiles.push(...profiles);
  }

  const global: GlobalCategoryDistributions = {
    personalRaw: sortNumeric(allProfiles.map((profile) => profile.categoryRaw.playerAccolades)),
    teamRaw: sortNumeric(allProfiles.map((profile) => profile.categoryRaw.teamAccolades)),
    statsRaw: sortNumeric(allProfiles.map((profile) => profile.categoryRaw.stats)),
    advancedRaw: sortNumeric(allProfiles.map((profile) => profile.categoryRaw.advanced)),
    statsPerYear: sortNumeric(
      allProfiles.map((profile) => statsPerYearRaw(profile.categoryRaw, profile.yearsWithTeam))
    ),
    statsPeakProxy: sortNumeric(
      allProfiles.map((profile) => statsPeakProxyRaw(profile.categoryRaw, profile.yearsWithTeam))
    ),
    winningImpactProxy: sortNumeric(
      allProfiles.map((profile) =>
        winningImpactProxyRaw({
          raw: profile.categoryRaw,
          championships: profile.championships
        })
      )
    ),
    championships: sortNumeric(allProfiles.map((profile) => profile.championships)),
    boxPts: sortNumeric(
      allProfiles
        .map((profile) => profile.boxTotals?.pts)
        .filter((value): value is number => typeof value === 'number')
    ),
    boxReb: sortNumeric(
      allProfiles
        .map((profile) => profile.boxTotals?.reb)
        .filter((value): value is number => typeof value === 'number')
    ),
    boxAst: sortNumeric(
      allProfiles
        .map((profile) => profile.boxTotals?.ast)
        .filter((value): value is number => typeof value === 'number')
    ),
    boxStl: sortNumeric(
      allProfiles
        .map((profile) => profile.boxTotals?.stl)
        .filter((value): value is number => typeof value === 'number')
    ),
    boxBlk: sortNumeric(
      allProfiles
        .map((profile) => profile.boxTotals?.blk)
        .filter((value): value is number => typeof value === 'number')
    )
  };

  for (const team of typedTeams) {
    const profiles = profilesByTeam.get(team.abbr) ?? [];
    const normalizedPlayers = profiles.map((profile) => {
      const categoryScores = toCategoryScores({
        raw: profile.categoryRaw,
        yearsWithTeam: profile.yearsWithTeam,
        careerYears: profile.careerYears,
        championships: profile.championships,
        global
      });

      const greatness = computeGreatness({
        categories: categoryScores,
        yearsWithTeam: profile.yearsWithTeam,
        careerYears: profile.careerYears
      });

      const player: FranchiseRosterPlayer = {
        name: profile.name,
        yearsWithTeam: profile.years,
        eligibleSlots: profile.positions,
        greatness
      };

      return {
        profile,
        player
      };
    });

    const sortedTopEntries = [...normalizedPlayers]
      .sort((a, b) => b.player.greatness.franchiseScore - a.player.greatness.franchiseScore)
      .slice(0, 15);

    const sortedTopPlayers = sortedTopEntries.map((entry) => entry.player);

    rosterByTeam.set(team.abbr, sortedTopPlayers);
    rosterNamesByTeam.set(
      team.abbr,
      sortedTopPlayers.map((player) => player.name)
    );

    for (const entry of sortedTopEntries) {
      const key = makeTeamPlayerKey(team.abbr, entry.player.name);
      slotsByTeamPlayer.set(key, entry.player.eligibleSlots);
      statsByTeamPlayer.set(key, {
        bpm: entry.player.greatness.personalAccolades,
        ws48: entry.player.greatness.teamAccolades,
        vorp: entry.player.greatness.boxStats,
        epm: entry.player.greatness.advancedStats
      });

      const boxPercentiles = entry.profile.boxTotals
        ? {
            pts: roundToOneDecimal(normalizeByDistribution(entry.profile.boxTotals.pts, global.boxPts)),
            reb: roundToOneDecimal(normalizeByDistribution(entry.profile.boxTotals.reb, global.boxReb)),
            ast: roundToOneDecimal(normalizeByDistribution(entry.profile.boxTotals.ast, global.boxAst)),
            stl: roundToOneDecimal(normalizeByDistribution(entry.profile.boxTotals.stl, global.boxStl)),
            blk: roundToOneDecimal(normalizeByDistribution(entry.profile.boxTotals.blk, global.boxBlk))
          }
        : null;

      explanationByTeamPlayer.set(key, {
        yearsWithTeam: entry.profile.yearsWithTeam,
        careerYears: entry.profile.careerYears,
        tenureRatio: roundToOneDecimal(
          clamp(entry.profile.yearsWithTeam / Math.max(1, entry.profile.careerYears), 0.08, 1)
        ),
        championships: entry.profile.championships,
        categoryPercentiles: {
          personalAccolades: entry.player.greatness.personalAccolades,
          teamAccolades: entry.player.greatness.teamAccolades,
          boxStats: entry.player.greatness.boxStats,
          advancedImpact: entry.player.greatness.advancedStats
        },
        accolades: entry.profile.accolades,
        boxTotals: entry.profile.boxTotals,
        boxPercentiles
      });
    }
  }
}

initializeAllTimeData();

function projectedBaselineStats(teamAbbr: string, playerName: string): PlayerStats {
  const slots = getPlayerEligibleSlots(teamAbbr, playerName);
  const primarySlot = slots[0] ?? 'SF';
  return fallbackByPrimarySlot(primarySlot);
}

function initializeGlobalMetricCalibration(): void {
  const bpm: number[] = [];
  const ws48: number[] = [];
  const vorp: number[] = [];
  const epm: number[] = [];

  for (const stats of statsByTeamPlayer.values()) {
    bpm.push(stats.bpm);
    ws48.push(stats.ws48);
    vorp.push(stats.vorp);
    epm.push(stats.epm);
  }

  const updateMetric = (metric: keyof PlayerStats, values: number[]) => {
    if (values.length === 0) {
      globalMetricRanges[metric] = { min: 0, max: 100 };
      globalMetricDistributions[metric] = [];
      return;
    }

    const sorted = [...values].sort((a, b) => a - b);
    globalMetricDistributions[metric] = sorted;
    globalMetricRanges[metric] = {
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 100
    };
  };

  updateMetric('bpm', bpm);
  updateMetric('ws48', ws48);
  updateMetric('vorp', vorp);
  updateMetric('epm', epm);
}

export function getAllTeams(): Team[] {
  return typedTeams;
}

export function getTeamByAbbr(teamAbbr: string): Team | null {
  return teamByAbbr.get(teamAbbr) ?? null;
}

export function getRosterNamesByTeam(teamAbbr: string): string[] {
  return rosterNamesByTeam.get(teamAbbr) ?? [];
}

export function getPlayerEligibleSlots(teamAbbr: string, playerName: string): LineupSlot[] {
  const key = makeTeamPlayerKey(teamAbbr, playerName);
  return slotsByTeamPlayer.get(key) ?? [...LINEUP_SLOTS];
}

export function getPlayerExplanationData(
  teamAbbr: string,
  playerName: string
): PlayerExplanationData | null {
  const key = makeTeamPlayerKey(teamAbbr, playerName);
  return explanationByTeamPlayer.get(key) ?? null;
}

export function getRosterByTeam(teamAbbr: string): RosterPlayer[] {
  return (rosterByTeam.get(teamAbbr) ?? []).map((player) => ({
    name: player.name,
    yearsWithTeam: player.yearsWithTeam,
    eligibleSlots: player.eligibleSlots
  }));
}

export function isPlayerOnTeam(teamAbbr: string, playerName: string): boolean {
  return getRosterNamesByTeam(teamAbbr).includes(playerName);
}

export function getTeamLogoUrl(teamAbbr: string): string | null {
  const teamId = teamLogoIdByAbbr[teamAbbr];
  if (!teamId) {
    return null;
  }

  return `https://cdn.nba.com/logos/nba/${teamId}/global/L/logo.svg`;
}

function upperBound(sortedValues: number[], value: number): number {
  let low = 0;
  let high = sortedValues.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if ((sortedValues[mid] ?? Number.NEGATIVE_INFINITY) <= value) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

function lowerBound(sortedValues: number[], value: number): number {
  let low = 0;
  let high = sortedValues.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if ((sortedValues[mid] ?? Number.POSITIVE_INFINITY) < value) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

export function getGlobalMetricRanges(): Record<keyof PlayerStats, { min: number; max: number }> {
  return {
    bpm: { ...globalMetricRanges.bpm },
    ws48: { ...globalMetricRanges.ws48 },
    vorp: { ...globalMetricRanges.vorp },
    epm: { ...globalMetricRanges.epm }
  };
}

export function normalizePlayerMetricGlobally(metric: keyof PlayerStats, value: number): number {
  const distribution = globalMetricDistributions[metric];
  if (distribution.length === 0) {
    return 50;
  }

  if (distribution.length === 1) {
    return 50;
  }

  const lower = lowerBound(distribution, value);
  const upper = upperBound(distribution, value);

  if (upper <= 0) {
    return 0;
  }

  const clampedLower = clamp(lower, 0, distribution.length - 1);
  const clampedUpper = clamp(upper - 1, 0, distribution.length - 1);
  const averageRank = (clampedLower + clampedUpper) / 2;

  return (averageRank / (distribution.length - 1)) * 100;
}

export function lookupPlayerStats(
  teamAbbr: string,
  playerName: string,
  season = DEFAULT_SEASON
): StatsLookup {
  const key = `${teamAbbr}|${playerName}|${season}`;
  const teamPlayerKey = makeTeamPlayerKey(teamAbbr, playerName);
  const stats = statsByTeamPlayer.get(teamPlayerKey);

  if (!stats) {
    return {
      key,
      season,
      stats: projectedBaselineStats(teamAbbr, playerName),
      usedFallback: true,
      seasonsUsed: ['FRANCHISE_BASELINE'],
      projectedFromSeasons: 0
    };
  }

  return {
    key,
    season,
    stats,
    usedFallback: false,
    seasonsUsed: ['ALL_TIME_FRANCHISE'],
    projectedFromSeasons: 1
  };
}

initializeGlobalMetricCalibration();
