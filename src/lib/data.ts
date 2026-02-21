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

function tierForRank(rankIndex: number): number {
  if (rankIndex <= 2) {
    return 1;
  }

  if (rankIndex <= 6) {
    return 2;
  }

  if (rankIndex <= 10) {
    return 3;
  }

  if (rankIndex <= 13) {
    return 4;
  }

  return 5;
}

function computeGreatness(input: {
  rankIndex: number;
  yearsWithTeam: number;
  careerYears: number;
  championships: number;
}): FranchiseGreatnessBreakdown {
  const { rankIndex, yearsWithTeam, careerYears, championships } = input;
  const tier = tierForRank(rankIndex);
  const tierBoostByTier: Record<number, number> = {
    1: 10,
    2: 5,
    3: 0,
    4: -4,
    5: -8
  };

  const rankBase = 100 - rankIndex * 4.2;
  const tierBoost = tierBoostByTier[tier] ?? 0;
  const tenureRatio = clamp(yearsWithTeam / Math.max(1, careerYears), 0.08, 1);
  const tenureAdjustment = (tenureRatio - 0.65) * 30;

  const personalAccolades = clamp(
    rankBase + tierBoost + yearsWithTeam * 0.55 + tenureAdjustment * 0.6,
    18,
    99
  );
  const teamAccolades = clamp(
    rankBase + tierBoost * 0.6 + championships * 6 + yearsWithTeam * 0.75 + tenureAdjustment * 0.7,
    15,
    99
  );
  const boxStats = clamp(
    rankBase + tierBoost * 0.35 + yearsWithTeam * 0.9 + tenureAdjustment * 0.45,
    18,
    99
  );
  const advancedStats = clamp(
    rankBase + tierBoost * 0.9 + yearsWithTeam * 0.65 + tenureAdjustment * 0.8,
    18,
    99
  );

  const rawScore =
    personalAccolades * 0.3 +
    teamAccolades * 0.25 +
    boxStats * 0.25 +
    advancedStats * 0.2;

  const tenureMultiplier = 0.58 + tenureRatio * 0.42;
  const franchiseScore = clamp(rawScore * tenureMultiplier, 12, 99);

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
    return { bpm: 55, ws48: 52, vorp: 54, epm: 53 };
  }

  if (slot === 'SG') {
    return { bpm: 54, ws48: 50, vorp: 53, epm: 52 };
  }

  if (slot === 'SF') {
    return { bpm: 55, ws48: 52, vorp: 55, epm: 54 };
  }

  if (slot === 'PF') {
    return { bpm: 56, ws48: 54, vorp: 56, epm: 55 };
  }

  return { bpm: 57, ws48: 55, vorp: 57, epm: 56 };
}

function initializeAllTimeData(): void {
  for (const team of typedTeams) {
    const seedPlayers = ALL_TIME_TEAM_SEED[team.abbr] ?? [];

    const normalizedPlayers = seedPlayers.map((seedPlayer, rankIndex) => {
      const yearsWithTeam = parseYearsWithTeam(seedPlayer.years);
      const careerYears = Math.max(seedPlayer.careerYears ?? yearsWithTeam, yearsWithTeam);
      const championships = Math.max(0, seedPlayer.championships ?? 0);

      const greatness = computeGreatness({
        rankIndex,
        yearsWithTeam,
        careerYears,
        championships
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
