import { describe, expect, it } from 'vitest';
import { lookupPlayerStats } from '@/lib/data';

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

  it('keeps a shorter late-career stint lower than prime-franchise value for the same star', () => {
    const cle = lookupPlayerStats('CLE', 'LeBron James', 'ALL_TIME');
    const lal = lookupPlayerStats('LAL', 'LeBron James', 'ALL_TIME');

    expect(cle.usedFallback).toBe(false);
    expect(lal.usedFallback).toBe(false);
    expect(cle.stats.ws48 + cle.stats.vorp).toBeGreaterThan(lal.stats.ws48 + lal.stats.vorp);
  });
});
