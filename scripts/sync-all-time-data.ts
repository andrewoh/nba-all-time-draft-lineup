import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import teamsData from '../data/teams.json';
import { ALL_TIME_TEAM_SEED, type AllTimeSeedPlayer } from '../src/lib/all-time-seed';

type Team = {
  abbr: string;
  name: string;
};

const LINEUP_SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
type LineupSlot = (typeof LINEUP_SLOTS)[number];

type PlayerSeason = {
  teamId: string;
  seasonId: string;
  gp: number;
  wins: number;
  losses: number;
};

type PlayerAward = {
  description: string;
  season: string;
};

type PlayerMeta = {
  positionSlots: LineupSlot[];
  careerYears: number;
  seasons: PlayerSeason[];
  awards: PlayerAward[];
};

type AwardBreakdown = {
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

type FranchisePlayerRow = {
  playerId: number;
  playerName: string;
  gp: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
};

type EnrichedCandidate = {
  playerId: number;
  playerName: string;
  years: string;
  yearsWithTeam: number;
  careerYears: number;
  positions: LineupSlot[];
  championships: number;
  personalAccoladesRaw: number;
  teamAccoladesRaw: number;
  statsRaw: number;
  advancedRaw: number;
  tenureRatio: number;
  franchiseScore: number;
};

const TEAM_ID_BY_ABBR: Record<string, string> = {
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

const NBA_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  Referer: 'https://www.nba.com/',
  Origin: 'https://www.nba.com',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9'
};
const FETCH_TIMEOUT_MS = Number(process.env.ALL_TIME_FETCH_TIMEOUT_MS ?? '15000');
const DEBUG_SYNC = process.env.ALL_TIME_SYNC_DEBUG === '1';

const typedTeams = teamsData as Team[];
const metaByPlayerId = new Map<number, Promise<PlayerMeta>>();
const fallbackSeedByTeam = ALL_TIME_TEAM_SEED as Record<string, AllTimeSeedPlayer[]>;
const slotOrder = new Map(LINEUP_SLOTS.map((slot, index) => [slot, index]));

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function escapeTsString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function rounded(value: number, digits = 3): number {
  const pow = 10 ** digits;
  return Math.round(value * pow) / pow;
}

function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function findHeaderIndex(headers: string[], variants: string[]): number {
  const target = variants.map((value) => value.toUpperCase());
  return headers.findIndex((header) => target.includes(header.toUpperCase()));
}

function parseResultSet(
  payload: unknown,
  preferredName?: string
): { headers: string[]; rows: unknown[][] } {
  const record = payload as
    | {
        resultSets?: Array<{ name?: string; headers?: string[]; rowSet?: unknown[][] }>;
        resultSet?: { name?: string; headers?: string[]; rowSet?: unknown[][] };
      }
    | undefined;

  const sets = record?.resultSets;
  if (Array.isArray(sets)) {
    const selected =
      sets.find((set) =>
        preferredName ? String(set.name ?? '').toLowerCase() === preferredName.toLowerCase() : false
      ) ?? sets[0];
    if (selected && Array.isArray(selected.headers) && Array.isArray(selected.rowSet)) {
      return { headers: selected.headers, rows: selected.rowSet };
    }
  }

  const set = record?.resultSet;
  if (set && Array.isArray(set.headers) && Array.isArray(set.rowSet)) {
    return { headers: set.headers, rows: set.rowSet };
  }

  throw new Error('Unexpected NBA stats payload format.');
}

async function fetchJson(url: string, retries = 3): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { headers: NBA_HEADERS, signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      return response.json();
    } catch (error) {
      lastError = error;
      if (DEBUG_SYNC) {
        console.warn(`fetch attempt ${attempt}/${retries} failed: ${url}`, error);
      }
      await sleep(attempt * 300);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

function parseSeasonBounds(seasonId: string): { start: number; end: number } | null {
  const compact = seasonId.trim();
  const fullRange = compact.match(/^(\d{4})\D+(\d{4})$/);
  if (fullRange) {
    const start = Number(fullRange[1]);
    const end = Number(fullRange[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      return { start, end };
    }
  }

  const shortRange = compact.match(/^(\d{4})\D+(\d{2})$/);
  if (shortRange) {
    const start = Number(shortRange[1]);
    const end2 = Number(shortRange[2]);
    if (Number.isFinite(start) && Number.isFinite(end2)) {
      const century = Math.floor(start / 100) * 100;
      let end = century + end2;
      if (end < start) {
        end += 100;
      }
      return { start, end };
    }
  }

  const yearOnly = compact.match(/(\d{4})/);
  if (yearOnly) {
    const start = Number(yearOnly[1]);
    if (Number.isFinite(start)) {
      return { start, end: start + 1 };
    }
  }

  return null;
}

function mapNbaPositionToSlots(position: string): LineupSlot[] {
  const normalized = position.trim().toUpperCase();
  if (!normalized) {
    return [...LINEUP_SLOTS];
  }

  const exact: Record<string, LineupSlot[]> = {
    PG: ['PG'],
    SG: ['SG'],
    SF: ['SF'],
    PF: ['PF'],
    C: ['C'],
    G: ['PG', 'SG'],
    F: ['SF', 'PF']
  };

  if (exact[normalized]) {
    return exact[normalized];
  }

  const slots = new Set<LineupSlot>();

  if (normalized.includes('GUARD')) {
    slots.add('PG');
    slots.add('SG');
  }
  if (normalized.includes('FORWARD')) {
    slots.add('SF');
    slots.add('PF');
  }
  if (normalized.includes('CENTER')) {
    slots.add('C');
  }

  for (const token of normalized.split(/[-/,]/)) {
    const value = token.trim();
    if (value === 'PG') slots.add('PG');
    if (value === 'SG') slots.add('SG');
    if (value === 'SF') slots.add('SF');
    if (value === 'PF') slots.add('PF');
    if (value === 'C') slots.add('C');
    if (value === 'G') {
      slots.add('PG');
      slots.add('SG');
    }
    if (value === 'F') {
      slots.add('SF');
      slots.add('PF');
    }
  }

  const ordered = [...slots].sort((a, b) => (slotOrder.get(a) ?? 99) - (slotOrder.get(b) ?? 99));
  return ordered.length > 0 ? ordered : [...LINEUP_SLOTS];
}

async function fetchFranchisePlayers(teamId: string): Promise<FranchisePlayerRow[]> {
  const url = `https://stats.nba.com/stats/franchiseplayers?LeagueID=00&PerMode=Totals&TeamID=${teamId}`;
  const payload = await fetchJson(url);
  const { headers, rows } = parseResultSet(payload);

  const playerIdIndex = findHeaderIndex(headers, ['PLAYER_ID', 'PERSON_ID']);
  const playerNameIndex = findHeaderIndex(headers, ['PLAYER', 'PLAYER_NAME']);
  const gpIndex = findHeaderIndex(headers, ['GP']);
  const ptsIndex = findHeaderIndex(headers, ['PTS']);
  const rebIndex = findHeaderIndex(headers, ['REB']);
  const astIndex = findHeaderIndex(headers, ['AST']);
  const stlIndex = findHeaderIndex(headers, ['STL']);
  const blkIndex = findHeaderIndex(headers, ['BLK']);
  const tovIndex = findHeaderIndex(headers, ['TOV']);

  if (playerIdIndex === -1 || playerNameIndex === -1) {
    throw new Error('Could not parse franchise players table.');
  }

  return rows
    .map((row) => {
      const data = row as unknown[];
      const playerId = Number(data[playerIdIndex]);
      const playerName = String(data[playerNameIndex] ?? '').trim();
      if (!Number.isFinite(playerId) || !playerName) {
        return null;
      }

      return {
        playerId,
        playerName,
        gp: toNumber(data[gpIndex]),
        pts: toNumber(data[ptsIndex]),
        reb: toNumber(data[rebIndex]),
        ast: toNumber(data[astIndex]),
        stl: toNumber(data[stlIndex]),
        blk: toNumber(data[blkIndex]),
        tov: toNumber(data[tovIndex])
      } satisfies FranchisePlayerRow;
    })
    .filter((row): row is FranchisePlayerRow => Boolean(row));
}

async function fetchFranchiseLeaderCounts(teamId: string): Promise<Map<number, number>> {
  const url = `https://stats.nba.com/stats/franchiseleaders?LeagueID=00&TeamID=${teamId}`;
  const payload = await fetchJson(url);
  const { headers, rows } = parseResultSet(payload);
  const row = rows[0] as unknown[] | undefined;

  const counts = new Map<number, number>();
  if (!row) {
    return counts;
  }

  headers.forEach((header, index) => {
    if (!header.toUpperCase().endsWith('_PLAYER_ID')) {
      return;
    }
    const playerId = Number(row[index]);
    if (!Number.isFinite(playerId)) {
      return;
    }
    counts.set(playerId, (counts.get(playerId) ?? 0) + 1);
  });

  return counts;
}

async function fetchCommonPlayerInfo(playerId: number): Promise<{ slots: LineupSlot[]; careerYears: number }> {
  const url = `https://stats.nba.com/stats/commonplayerinfo?LeagueID=00&PlayerID=${playerId}`;
  const payload = await fetchJson(url);
  const { headers, rows } = parseResultSet(payload, 'CommonPlayerInfo');
  const row = (rows[0] as unknown[] | undefined) ?? [];

  const positionIndex = findHeaderIndex(headers, ['POSITION']);
  const fromYearIndex = findHeaderIndex(headers, ['FROM_YEAR']);
  const toYearIndex = findHeaderIndex(headers, ['TO_YEAR']);

  const positionRaw = String(row[positionIndex] ?? '').trim();
  const slots = mapNbaPositionToSlots(positionRaw);
  const fromYear = toNumber(row[fromYearIndex]);
  const toYear = toNumber(row[toYearIndex]);

  let careerYears = 0;
  if (fromYear > 0 && toYear > 0 && toYear >= fromYear) {
    careerYears = toYear - fromYear + 1;
  }

  return { slots, careerYears };
}

async function fetchPlayerCareerSeasons(playerId: number): Promise<PlayerSeason[]> {
  const url = `https://stats.nba.com/stats/playercareerstats?LeagueID=00&PerMode=Totals&PlayerID=${playerId}`;
  const payload = await fetchJson(url);
  const { headers, rows } = parseResultSet(payload, 'SeasonTotalsRegularSeason');

  const teamIdIndex = findHeaderIndex(headers, ['TEAM_ID']);
  const seasonIndex = findHeaderIndex(headers, ['SEASON_ID']);
  const gpIndex = findHeaderIndex(headers, ['GP']);
  const winsIndex = findHeaderIndex(headers, ['W']);
  const lossesIndex = findHeaderIndex(headers, ['L']);

  if (teamIdIndex === -1 || seasonIndex === -1 || gpIndex === -1) {
    return [];
  }

  const seasons: PlayerSeason[] = [];

  for (const row of rows) {
    const data = row as unknown[];
    const teamId = String(data[teamIdIndex] ?? '').trim();
    const seasonId = String(data[seasonIndex] ?? '').trim();
    const gp = toNumber(data[gpIndex]);

    if (!teamId || !seasonId || gp <= 0) {
      continue;
    }

    seasons.push({
      teamId,
      seasonId,
      gp,
      wins: toNumber(data[winsIndex]),
      losses: toNumber(data[lossesIndex])
    });
  }

  return seasons;
}

async function fetchPlayerAwards(playerId: number): Promise<PlayerAward[]> {
  const url = `https://stats.nba.com/stats/playerawards?PlayerID=${playerId}`;
  const payload = await fetchJson(url);
  const { headers, rows } = parseResultSet(payload);

  const descriptionIndex = findHeaderIndex(headers, ['DESCRIPTION']);
  const seasonIndex = findHeaderIndex(headers, ['SEASON']);

  if (descriptionIndex === -1) {
    return [];
  }

  return rows
    .map((row) => {
      const data = row as unknown[];
      const description = String(data[descriptionIndex] ?? '').trim();
      const season = seasonIndex === -1 ? '' : String(data[seasonIndex] ?? '').trim();
      if (!description) {
        return null;
      }
      return { description, season } satisfies PlayerAward;
    })
    .filter((row): row is PlayerAward => Boolean(row));
}

async function getPlayerMeta(playerId: number): Promise<PlayerMeta> {
  const cached = metaByPlayerId.get(playerId);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const [common, seasons, awards] = await Promise.all([
      fetchCommonPlayerInfo(playerId),
      fetchPlayerCareerSeasons(playerId),
      fetchPlayerAwards(playerId)
    ]);

    let careerYears = common.careerYears;
    if (careerYears <= 0 && seasons.length > 0) {
      const uniqueStarts = new Set<number>();
      for (const season of seasons) {
        const parsed = parseSeasonBounds(season.seasonId);
        if (parsed) {
          uniqueStarts.add(parsed.start);
        }
      }
      careerYears = uniqueStarts.size;
    }

    return {
      positionSlots: common.slots,
      careerYears: Math.max(1, careerYears),
      seasons,
      awards
    };
  })();

  metaByPlayerId.set(playerId, promise);
  return promise;
}

function getFallbackSeed(teamAbbr: string, playerName: string): AllTimeSeedPlayer | null {
  const normalized = normalizeName(playerName);
  const seed = fallbackSeedByTeam[teamAbbr] ?? [];
  return seed.find((entry) => normalizeName(entry.name) === normalized) ?? null;
}

function buildAwardBreakdown(awards: PlayerAward[]): AwardBreakdown {
  const breakdown: AwardBreakdown = {
    mvp: 0,
    finalsMvp: 0,
    dpoy: 0,
    roy: 0,
    sixthMan: 0,
    mip: 0,
    allNbaFirst: 0,
    allNbaSecond: 0,
    allNbaThird: 0,
    allDefFirst: 0,
    allDefSecond: 0,
    allStar: 0,
    scoringTitles: 0,
    reboundingTitles: 0,
    assistsTitles: 0,
    stealsTitles: 0,
    blocksTitles: 0
  };

  for (const award of awards) {
    const description = award.description.toUpperCase();

    if (description.includes('NBA MOST VALUABLE PLAYER')) breakdown.mvp += 1;
    if (description.includes('NBA FINALS MOST VALUABLE PLAYER')) breakdown.finalsMvp += 1;
    if (description.includes('NBA DEFENSIVE PLAYER OF THE YEAR')) breakdown.dpoy += 1;
    if (description.includes('NBA ROOKIE OF THE YEAR')) breakdown.roy += 1;
    if (description.includes('NBA SIXTH MAN')) breakdown.sixthMan += 1;
    if (description.includes('NBA MOST IMPROVED PLAYER')) breakdown.mip += 1;
    if (description.includes('ALL-NBA FIRST TEAM')) breakdown.allNbaFirst += 1;
    if (description.includes('ALL-NBA SECOND TEAM')) breakdown.allNbaSecond += 1;
    if (description.includes('ALL-NBA THIRD TEAM')) breakdown.allNbaThird += 1;
    if (description.includes('ALL-DEFENSIVE FIRST TEAM')) breakdown.allDefFirst += 1;
    if (description.includes('ALL-DEFENSIVE SECOND TEAM')) breakdown.allDefSecond += 1;
    if (description.includes('NBA ALL-STAR')) breakdown.allStar += 1;
    if (description.includes('NBA SCORING CHAMPION')) breakdown.scoringTitles += 1;
    if (description.includes('NBA REBOUNDING CHAMPION')) breakdown.reboundingTitles += 1;
    if (description.includes('NBA ASSISTS LEADER')) breakdown.assistsTitles += 1;
    if (description.includes('NBA STEALS LEADER')) breakdown.stealsTitles += 1;
    if (description.includes('NBA BLOCKS LEADER')) breakdown.blocksTitles += 1;
  }

  return breakdown;
}

function computePlayerAccoladesRaw(awards: PlayerAward[]): number {
  const breakdown = buildAwardBreakdown(awards);

  const points =
    breakdown.mvp * 24 +
    breakdown.finalsMvp * 16 +
    breakdown.dpoy * 10 +
    breakdown.roy * 6 +
    breakdown.sixthMan * 4 +
    breakdown.mip * 4 +
    breakdown.allNbaFirst * 9 +
    breakdown.allNbaSecond * 6 +
    breakdown.allNbaThird * 4 +
    breakdown.allDefFirst * 4 +
    breakdown.allDefSecond * 3 +
    breakdown.allStar * 2 +
    breakdown.scoringTitles * 2 +
    breakdown.reboundingTitles * 1.5 +
    breakdown.assistsTitles * 1.5 +
    breakdown.stealsTitles * 1.5 +
    breakdown.blocksTitles * 1.5;

  return rounded(points, 2);
}

function championshipsForTeam(awards: PlayerAward[], teamSeasonStarts: Set<number>): number {
  const championshipSeasons = new Set<number>();

  for (const award of awards) {
    if (!award.description.toUpperCase().includes('NBA CHAMPION')) {
      continue;
    }

    const seasonBounds = parseSeasonBounds(award.season);
    if (seasonBounds && teamSeasonStarts.has(seasonBounds.start)) {
      championshipSeasons.add(seasonBounds.start);
    }
  }

  return championshipSeasons.size;
}

function teamWinningPercentage(seasons: PlayerSeason[]): number {
  const totalWins = seasons.reduce((sum, season) => sum + season.wins, 0);
  const totalLosses = seasons.reduce((sum, season) => sum + season.losses, 0);
  const totalGames = totalWins + totalLosses;

  if (totalGames <= 0) {
    return 0.5;
  }

  return totalWins / totalGames;
}

function deriveYearRange(seasons: PlayerSeason[]): { years: string; yearsWithTeam: number; teamSeasonStarts: Set<number> } {
  const starts = new Set<number>();
  let minStart = Number.MAX_SAFE_INTEGER;
  let maxEnd = Number.MIN_SAFE_INTEGER;

  for (const season of seasons) {
    const parsed = parseSeasonBounds(season.seasonId);
    if (!parsed) {
      continue;
    }
    starts.add(parsed.start);
    minStart = Math.min(minStart, parsed.start);
    maxEnd = Math.max(maxEnd, parsed.end);
  }

  if (starts.size === 0 || !Number.isFinite(minStart) || !Number.isFinite(maxEnd)) {
    return { years: 'Unknown', yearsWithTeam: 1, teamSeasonStarts: new Set<number>() };
  }

  return {
    years: `${minStart}-${maxEnd}`,
    yearsWithTeam: Math.max(1, maxEnd - minStart + 1),
    teamSeasonStarts: starts
  };
}

function initialFranchiseImpact(row: FranchisePlayerRow): number {
  return (
    row.pts * 1 +
    row.reb * 1.2 +
    row.ast * 1.5 +
    row.stl * 2.5 +
    row.blk * 2.5 +
    row.gp * 0.18 -
    row.tov * 0.7
  );
}

function normalizeMetric(value: number, values: number[]): number {
  if (values.length === 0) {
    return 50;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) {
    return 50;
  }
  return ((value - min) / (max - min)) * 100;
}

function slotList(seed: AllTimeSeedPlayer | null, fromApi: LineupSlot[]): LineupSlot[] {
  const apiLooksGeneric = fromApi.length === LINEUP_SLOTS.length;
  const slots =
    fromApi.length > 0 && !apiLooksGeneric ? fromApi : seed?.positions ?? fromApi ?? [...LINEUP_SLOTS];
  const unique = [...new Set(slots)].filter((slot): slot is LineupSlot =>
    LINEUP_SLOTS.includes(slot as LineupSlot)
  );
  return unique.sort((a, b) => (slotOrder.get(a) ?? 99) - (slotOrder.get(b) ?? 99));
}

async function mapWithConcurrency<TItem, TResult>(
  items: TItem[],
  limit: number,
  mapper: (item: TItem, index: number) => Promise<TResult>
): Promise<TResult[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<TResult>(items.length);
  let cursor = 0;

  const worker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await mapper(items[index], index);
    }
  };

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function formatSeedFile(seedByTeam: Record<string, AllTimeSeedPlayer[]>): string {
  const lines: string[] = [];
  lines.push("import type { LineupSlot } from '@/lib/types';");
  lines.push('');
  lines.push('export type AllTimeSeedPlayer = {');
  lines.push('  name: string;');
  lines.push('  years: string;');
  lines.push('  positions: LineupSlot[];');
  lines.push('  careerYears?: number;');
  lines.push('  championships?: number;');
  lines.push('  categoryRaw?: {');
  lines.push('    playerAccolades: number;');
  lines.push('    teamAccolades: number;');
  lines.push('    stats: number;');
  lines.push('    advanced: number;');
  lines.push('  };');
  lines.push('};');
  lines.push('');
  lines.push('// Auto-generated by scripts/sync-all-time-data.ts');
  lines.push('export const ALL_TIME_TEAM_SEED: Record<string, AllTimeSeedPlayer[]> = {');

  for (const team of typedTeams) {
    const players = seedByTeam[team.abbr] ?? [];
    lines.push(`  ${team.abbr}: [`);
    for (const player of players) {
      const slots = player.positions.map((slot) => `'${slot}'`).join(', ');
      const fields = [
        `name: '${escapeTsString(player.name)}'`,
        `years: '${escapeTsString(player.years)}'`,
        `positions: [${slots}]`
      ];
      if (typeof player.careerYears === 'number' && player.careerYears > 0) {
        fields.push(`careerYears: ${Math.round(player.careerYears)}`);
      }
      if (typeof player.championships === 'number' && player.championships > 0) {
        fields.push(`championships: ${Math.round(player.championships)}`);
      }
      if (player.categoryRaw) {
        fields.push(
          `categoryRaw: { playerAccolades: ${rounded(player.categoryRaw.playerAccolades, 3)}, teamAccolades: ${rounded(player.categoryRaw.teamAccolades, 3)}, stats: ${rounded(player.categoryRaw.stats, 3)}, advanced: ${rounded(player.categoryRaw.advanced, 3)} }`
        );
      }
      lines.push(`    { ${fields.join(', ')} },`);
    }
    lines.push('  ],');
  }

  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

async function buildTeamSeed(team: Team, teamId: string, candidateLimit: number): Promise<AllTimeSeedPlayer[]> {
  const fallback = (fallbackSeedByTeam[team.abbr] ?? []).slice(0, 15);
  let franchiseRows: FranchisePlayerRow[] = [];
  let leaderCounts = new Map<number, number>();

  try {
    franchiseRows = await fetchFranchisePlayers(teamId);
  } catch (error) {
    console.warn(`Could not fetch franchise players for ${team.abbr}; using existing seed.`, error);
    return fallback;
  }

  if (franchiseRows.length === 0) {
    console.warn(`No franchise player rows returned for ${team.abbr}; using existing seed.`);
    return fallback;
  }

  try {
    leaderCounts = await fetchFranchiseLeaderCounts(teamId);
  } catch (error) {
    console.warn(`Could not fetch franchise leader rows for ${team.abbr}; continuing without leader bonus.`, error);
  }

  const candidates = [...franchiseRows]
    .sort((a, b) => initialFranchiseImpact(b) - initialFranchiseImpact(a))
    .slice(0, candidateLimit);
  console.log(`${team.abbr}: evaluating ${candidates.length} candidates`);

  const enriched = await mapWithConcurrency(candidates, 5, async (candidate) => {
    const fallbackPlayer = getFallbackSeed(team.abbr, candidate.playerName);

    try {
      const meta = await getPlayerMeta(candidate.playerId);
      const teamSeasons = meta.seasons.filter((season) => season.teamId === teamId);
      const yearRange = deriveYearRange(teamSeasons);
      const fallbackBounds = parseSeasonBounds(fallbackPlayer?.years ?? '');
      const fallbackYearsWithTeam = fallbackBounds
        ? Math.max(1, fallbackBounds.end - fallbackBounds.start + 1)
        : 1;

      const years = yearRange.years === 'Unknown' ? fallbackPlayer?.years ?? 'Unknown' : yearRange.years;
      const yearsWithTeam =
        yearRange.years === 'Unknown'
          ? fallbackYearsWithTeam
          : yearRange.yearsWithTeam;
      const careerYears = Math.max(meta.careerYears, fallbackPlayer?.careerYears ?? 0, yearsWithTeam);
      const tenureRatio = clamp(yearsWithTeam / Math.max(1, careerYears), 0.08, 1);
      const championshipCount = Math.max(
        championshipsForTeam(meta.awards, yearRange.teamSeasonStarts),
        fallbackPlayer?.championships ?? 0
      );
      const teamWinPct = teamWinningPercentage(teamSeasons);

      const personalAccoladesRaw = computePlayerAccoladesRaw(meta.awards);
      const teamAccoladesRaw =
        championshipCount * 18 +
        (leaderCounts.get(candidate.playerId) ?? 0) * 4 +
        yearsWithTeam * 0.9 +
        teamWinPct * 40;
      const statsRaw =
        candidate.pts * 1 +
        candidate.reb * 1.2 +
        candidate.ast * 1.5 +
        candidate.stl * 2.2 +
        candidate.blk * 2.2 -
        candidate.tov * 1.1;
      const perGameImpact =
        candidate.gp > 0
          ? (candidate.pts +
              candidate.reb * 1.25 +
              candidate.ast * 1.6 +
              candidate.stl * 2.3 +
              candidate.blk * 2.3 -
              candidate.tov * 1.25) /
            candidate.gp
          : 0;
      const advancedRaw = perGameImpact * 12 + Math.log10(Math.max(10, candidate.gp + 1)) * 20;

      return {
        playerId: candidate.playerId,
        playerName: candidate.playerName,
        years,
        yearsWithTeam,
        careerYears,
        positions: slotList(fallbackPlayer, meta.positionSlots),
        championships: championshipCount,
        personalAccoladesRaw,
        teamAccoladesRaw,
        statsRaw,
        advancedRaw,
        tenureRatio,
        franchiseScore: 0
      } satisfies EnrichedCandidate;
    } catch (error) {
      console.warn(
        `Could not fully enrich ${candidate.playerName} (${team.abbr}); using fallback information.`,
        error
      );

      const fallbackYears = fallbackPlayer?.years ?? 'Unknown';
      const bounds = parseSeasonBounds(fallbackYears);
      const yearsWithTeam = bounds ? Math.max(1, bounds.end - bounds.start + 1) : 1;
      const careerYears = Math.max(fallbackPlayer?.careerYears ?? yearsWithTeam, yearsWithTeam);
      const tenureRatio = clamp(yearsWithTeam / Math.max(1, careerYears), 0.08, 1);

      return {
        playerId: candidate.playerId,
        playerName: candidate.playerName,
        years: fallbackYears,
        yearsWithTeam,
        careerYears,
        positions: slotList(fallbackPlayer, []),
        championships: fallbackPlayer?.championships ?? 0,
        personalAccoladesRaw: fallbackPlayer?.categoryRaw?.playerAccolades ?? 0,
        teamAccoladesRaw:
          fallbackPlayer?.categoryRaw?.teamAccolades ?? yearsWithTeam * 1.1,
        statsRaw: fallbackPlayer?.categoryRaw?.stats ?? initialFranchiseImpact(candidate),
        advancedRaw: fallbackPlayer?.categoryRaw?.advanced ?? 0,
        tenureRatio,
        franchiseScore: 0
      } satisfies EnrichedCandidate;
    }
  });

  const personalValues = enriched.map((entry) => entry.personalAccoladesRaw);
  const teamValues = enriched.map((entry) => entry.teamAccoladesRaw);
  const statsValues = enriched.map((entry) => entry.statsRaw);
  const advancedValues = enriched.map((entry) => entry.advancedRaw);

  const ranked = enriched
    .map((entry) => {
      const personal = normalizeMetric(entry.personalAccoladesRaw, personalValues);
      const teamAccolades = normalizeMetric(entry.teamAccoladesRaw, teamValues);
      const stats = normalizeMetric(entry.statsRaw, statsValues);
      const advanced = normalizeMetric(entry.advancedRaw, advancedValues);
      const base =
        personal * 0.3 +
        teamAccolades * 0.25 +
        stats * 0.25 +
        advanced * 0.2;
      const tenureMultiplier = 0.52 + entry.tenureRatio * 0.48;
      return {
        ...entry,
        franchiseScore: base * tenureMultiplier
      };
    })
    .sort((a, b) => b.franchiseScore - a.franchiseScore)
    .slice(0, 15);

  const seedPlayers: AllTimeSeedPlayer[] = ranked.map((entry) => ({
    name: entry.playerName,
    years: entry.years,
    positions: entry.positions,
    careerYears: Math.max(1, Math.round(entry.careerYears)),
    championships: Math.max(0, Math.round(entry.championships)),
    categoryRaw: {
      playerAccolades: rounded(entry.personalAccoladesRaw, 3),
      teamAccolades: rounded(entry.teamAccoladesRaw, 3),
      stats: rounded(entry.statsRaw, 3),
      advanced: rounded(entry.advancedRaw, 3)
    }
  }));

  if (seedPlayers.length < 15) {
    const existingNames = new Set(seedPlayers.map((player) => normalizeName(player.name)));
    for (const fallbackPlayer of fallback) {
      if (seedPlayers.length >= 15) {
        break;
      }
      const normalized = normalizeName(fallbackPlayer.name);
      if (existingNames.has(normalized)) {
        continue;
      }
      seedPlayers.push(fallbackPlayer);
      existingNames.add(normalized);
    }
  }

  return seedPlayers.slice(0, 15);
}

async function main() {
  const candidateLimit = Number(process.env.ALL_TIME_CANDIDATE_LIMIT ?? '22');
  const perTeamDelayMs = Number(process.env.ALL_TIME_TEAM_DELAY_MS ?? '80');
  if (!Number.isFinite(candidateLimit) || candidateLimit < 15) {
    throw new Error('ALL_TIME_CANDIDATE_LIMIT must be a number >= 15');
  }
  if (!Number.isFinite(perTeamDelayMs) || perTeamDelayMs < 0) {
    throw new Error('ALL_TIME_TEAM_DELAY_MS must be a number >= 0');
  }

  const seedByTeam: Record<string, AllTimeSeedPlayer[]> = {};

  for (const team of typedTeams) {
    const teamId = TEAM_ID_BY_ABBR[team.abbr];
    if (!teamId) {
      console.warn(`Missing NBA team id mapping for ${team.abbr}; using existing seed.`);
      seedByTeam[team.abbr] = (fallbackSeedByTeam[team.abbr] ?? []).slice(0, 15);
      continue;
    }

    console.log(`Syncing all-time roster for ${team.abbr}...`);
    seedByTeam[team.abbr] = await buildTeamSeed(team, teamId, candidateLimit);
    const topNames = seedByTeam[team.abbr].slice(0, 5).map((player) => player.name).join(', ');
    console.log(`Top ${team.abbr}: ${topNames}`);
    await sleep(perTeamDelayMs);
  }

  const fileContents = formatSeedFile(seedByTeam);
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = path.join(rootDir, 'src/lib/all-time-seed.ts');
  await writeFile(outputPath, fileContents, 'utf8');
  console.log(`Updated ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
