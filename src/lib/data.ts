import { DEFAULT_SEASON } from '@/lib/constants';
import { ALL_TIME_TEAM_SEED } from '@/lib/all-time-seed';
import { LINEUP_SLOTS } from '@/lib/types';
import type {
  FranchiseGreatnessBreakdown,
  LineupSlot,
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

const typedTeams = teamsData as Team[];
const teamByAbbr = new Map(typedTeams.map((team) => [team.abbr, team]));
const rosterByTeam = new Map<string, FranchiseRosterPlayer[]>();
const rosterNamesByTeam = new Map<string, string[]>();
const statsByTeamPlayer = new Map<string, PlayerStats>();
const slotsByTeamPlayer = new Map<string, LineupSlot[]>();
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

function toCategoryScores(raw: CategoryRaw): CategoryScores {
  const scale = (metric: keyof CategoryRaw, value: number): number => {
    const safe = Math.max(0, value);
    const factorByMetric: Record<keyof CategoryRaw, number> = {
      playerAccolades: 27,
      teamAccolades: 26,
      stats: 19,
      advanced: 25
    };

    return clamp(Math.log10(safe + 1) * factorByMetric[metric], 6, 97);
  };

  return {
    playerAccolades: scale('playerAccolades', raw.playerAccolades),
    teamAccolades: scale('teamAccolades', raw.teamAccolades),
    stats: scale('stats', raw.stats),
    advanced: scale('advanced', raw.advanced)
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
  const personalAccolades = clamp(categories.playerAccolades * (0.9 + tenureRatio * 0.1), 4, 97);
  const teamAccolades = clamp(categories.teamAccolades * (0.84 + tenureRatio * 0.16), 4, 97);
  const boxStats = clamp(categories.stats * (0.88 + tenureRatio * 0.12), 4, 97);
  const advancedStats = clamp(categories.advanced * (0.87 + tenureRatio * 0.13), 4, 97);

  const rawScore =
    personalAccolades * 0.3 +
    teamAccolades * 0.25 +
    boxStats * 0.25 +
    advancedStats * 0.2;

  const tenureMultiplier = 0.66 + tenureRatio * 0.34;
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
  for (const team of typedTeams) {
    const seedPlayers = ALL_TIME_TEAM_SEED[team.abbr] ?? [];

    const normalizedPlayers = seedPlayers.map((seedPlayer, rankIndex) => {
      const yearsWithTeam = parseYearsWithTeam(seedPlayer.years);
      const careerYears = Math.max(seedPlayer.careerYears ?? yearsWithTeam, yearsWithTeam);
      const championships = Math.max(0, seedPlayer.championships ?? 0);
      const categoryRaw = seedPlayer.categoryRaw ?? legacyCategoryRawFromRank({
        rankIndex,
        yearsWithTeam,
        careerYears,
        championships
      });
      const categoryScores = toCategoryScores(categoryRaw);

      const greatness = computeGreatness({
        categories: categoryScores,
        yearsWithTeam,
        careerYears
      });

      const player: FranchiseRosterPlayer = {
        name: seedPlayer.name,
        yearsWithTeam: seedPlayer.years,
        eligibleSlots: seedPlayer.positions.length > 0 ? seedPlayer.positions : [...LINEUP_SLOTS],
        greatness
      };

      return player;
    });

    const sortedTopPlayers = [...normalizedPlayers]
      .sort((a, b) => b.greatness.franchiseScore - a.greatness.franchiseScore)
      .slice(0, 15);

    rosterByTeam.set(team.abbr, sortedTopPlayers);
    rosterNamesByTeam.set(
      team.abbr,
      sortedTopPlayers.map((player) => player.name)
    );

    for (const player of sortedTopPlayers) {
      const key = makeTeamPlayerKey(team.abbr, player.name);
      slotsByTeamPlayer.set(key, player.eligibleSlots);
      statsByTeamPlayer.set(key, {
        bpm: player.greatness.personalAccolades,
        ws48: player.greatness.teamAccolades,
        vorp: player.greatness.boxStats,
        epm: player.greatness.advancedStats
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
