export const LINEUP_SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
export const DRAFT_STATUSES = ['DRAFTING', 'COMPLETED'] as const;

export type LineupSlot = (typeof LINEUP_SLOTS)[number];
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export type Team = {
  abbr: string;
  name: string;
};

export type AwardBreakdown = {
  mvp: number;
  finalsMvp: number;
  dpoy: number;
  roy: number;
  sixthMan: number;
  mip: number;
  allNbaFirst: number;
  allNbaSecond: number;
  allNbaThird: number;
  allDefFirst: number;
  allDefSecond: number;
  allStar: number;
  scoringTitles: number;
  reboundingTitles: number;
  assistsTitles: number;
  stealsTitles: number;
  blocksTitles: number;
};

export type BoxTotals = {
  gp: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
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

export type PlayerExplanationData = {
  yearsWithTeam: number;
  careerYears: number;
  tenureRatio: number;
  championships: number;
  categoryPercentiles: {
    personalAccolades: number;
    teamAccolades: number;
    boxStats: number;
    advancedImpact: number;
  };
  accolades: AwardBreakdown | null;
  personalAccoladeItems: string[];
  teamAccoladeItems: string[];
  statsDetailItems: string[];
  advancedDetailItems: string[];
  boxTotals: BoxTotals | null;
  boxPercentiles: {
    pts: number;
    reb: number;
    ast: number;
    stl: number;
    blk: number;
  } | null;
};
