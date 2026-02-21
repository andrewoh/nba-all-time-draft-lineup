import { describe, expect, it } from 'vitest';
import { drawTeamsWithoutReplacement } from '@/lib/draw';
import type { Team } from '@/lib/types';

const teams: Team[] = [
  { abbr: 'A', name: 'A Team' },
  { abbr: 'B', name: 'B Team' },
  { abbr: 'C', name: 'C Team' },
  { abbr: 'D', name: 'D Team' },
  { abbr: 'E', name: 'E Team' },
  { abbr: 'F', name: 'F Team' },
  { abbr: 'G', name: 'G Team' }
];

describe('drawTeamsWithoutReplacement', () => {
  it('draws unique teams with no repeats', () => {
    const draw = drawTeamsWithoutReplacement({ teams, count: 5, seed: 'unit-seed' });

    expect(draw).toHaveLength(5);
    expect(new Set(draw.map((team) => team.abbr)).size).toBe(5);
  });

  it('is deterministic for a fixed seed', () => {
    const drawOne = drawTeamsWithoutReplacement({ teams, count: 5, seed: 'friends-seed' });
    const drawTwo = drawTeamsWithoutReplacement({ teams, count: 5, seed: 'friends-seed' });

    expect(drawOne.map((team) => team.abbr)).toEqual(drawTwo.map((team) => team.abbr));
  });

  it('throws when drawing more teams than available', () => {
    expect(() => drawTeamsWithoutReplacement({ teams, count: 20, seed: 'x' })).toThrow(
      'Cannot draw 20 teams from 7'
    );
  });
});
