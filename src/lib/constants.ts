import type { PlayerStats } from '@/lib/types';

export const DEFAULT_SEASON = 'ALL_TIME';
export const STATS_LOOKBACK_SEASONS = 1;
export const TOTAL_DRAWS = 5;
const parsedShotClockSeconds = Number(process.env.SHOT_CLOCK_SECONDS ?? 24);
export const SHOT_CLOCK_SECONDS =
  Number.isFinite(parsedShotClockSeconds) && parsedShotClockSeconds > 0
    ? parsedShotClockSeconds
    : 24;
export const SHOT_CLOCK_MS = SHOT_CLOCK_SECONDS * 1000;
export const GROUP_CODE_MAX_LENGTH = 16;
export const SEED_MAX_LENGTH = 64;
export const USER_NAME_MAX_LENGTH = 32;
export const SHARE_CODE_LENGTH = 6;
export const SHOT_CLOCK_PENALTY_PLAYER_NAME = 'Shot Clock Violation';

export const FALLBACK_PLAYER_STATS: PlayerStats = {
  bpm: 0,
  ws48: 0.1,
  vorp: 0.5,
  epm: 0
};

export const DRAFT_SESSION_COOKIE = 'nba_draft_session';
