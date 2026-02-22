export const LINEUP_SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
export const DRAFT_STATUSES = ['DRAFTING', 'COMPLETED'] as const;

export type LineupSlot = (typeof LINEUP_SLOTS)[number];
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export type Team = {
  abbr: string;
  name: string;
};

export type RosterPlayer = {
  name: string;
  yearsWithTeam: string;
  eligibleSlots: LineupSlot[];
};

export type PlayerStats = {
  bpm: number;
  ws48: number;
  vorp: number;
  epm: number;
};

export type StatsLookup = {
  key: string;
  season: string;
  stats: PlayerStats;
  usedFallback: boolean;
  seasonsUsed: string[];
  projectedFromSeasons: number;
};

export type FranchiseGreatnessBreakdown = {
  personalAccolades: number;
  teamAccolades: number;
  boxStats: number;
  advancedStats: number;
  franchiseScore: number;
  yearsWithTeam: number;
  careerYears: number;
  tenureRatio: number;
};

export type LineupPick = {
  slot: LineupSlot;
  playerName: string;
  teamAbbr: string;
  teamName: string;
  isPenalty?: boolean;
};

export type LineupState = Partial<Record<LineupSlot, LineupPick>>;

export type PlayerScoreBreakdown = {
  pick: LineupPick;
  stats: PlayerStats;
  usedFallback: boolean;
  normalizedMetrics: PlayerStats;
  contribution: number;
};

export type ChemistryBreakdown = {
  roleCoverage: number;
  complementarity: number;
  usageBalance: number;
  twoWayBalance: number;
  culture: number;
  chemistryScore: number;
  multiplier: number;
};
