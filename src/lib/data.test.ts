import { describe, expect, it } from 'vitest';
import { getRosterByTeam, lookupPlayerStats } from '@/lib/data';

describe('all-time franchise stat lookup', () => {
  it('returns team-specific all-time greatness stats', () => {
    const lookup = lookupPlayerStats('GSW', 'Stephen Curry', 'ALL_TIME');

    expect(lookup.usedFallback).toBe(false);
    expect(lookup.seasonsUsed).toEqual(['ALL_TIME_FRANCHISE']);
    expect(lookup.projectedFromSeasons).toBe(1);
    expect(lookup.stats.bpm).toBeGreaterThan(45);
  });

  it('falls back to baseline for missing franchise entries', () => {
    const lookup = lookupPlayerStats('ATL', 'Definitely Unknown Player', 'ALL_TIME');

    expect(lookup.usedFallback).toBe(true);
    expect(lookup.seasonsUsed).toEqual(['FRANCHISE_BASELINE']);
    expect(lookup.stats.bpm).toBeGreaterThan(0);
  });

  it('keeps short late-career franchise stints lower in that team ranking', () => {
    const wasRoster = getRosterByTeam('WAS');
    const jordanIndex = wasRoster.findIndex((player) => player.name === 'Michael Jordan');

    expect(jordanIndex).toBeGreaterThan(8);
  });
});
