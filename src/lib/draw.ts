import { TOTAL_DRAWS } from '@/lib/constants';
import { getAllTeams } from '@/lib/data';
import { createSeededRng } from '@/lib/rng';
import type { Team } from '@/lib/types';

export function shuffleTeams(teams: Team[], rng: () => number): Team[] {
  const cloned = [...teams];

  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const swapIndex = Math.floor(rng() * (i + 1));
    [cloned[i], cloned[swapIndex]] = [cloned[swapIndex], cloned[i]];
  }

  return cloned;
}

export function drawTeamsWithoutReplacement(options?: {
  count?: number;
  seed?: string | null;
  teams?: Team[];
}): Team[] {
  const { count = TOTAL_DRAWS, seed, teams = getAllTeams() } = options ?? {};

  if (count <= 0) {
    return [];
  }

  if (count > teams.length) {
    throw new Error(`Cannot draw ${count} teams from ${teams.length}`);
  }

  const rng = seed ? createSeededRng(seed) : Math.random;
  return shuffleTeams(teams, rng).slice(0, count);
}

export function buildDrawSequence(seed?: string | null): string[] {
  return drawTeamsWithoutReplacement({ seed }).map((team) => team.abbr);
}
