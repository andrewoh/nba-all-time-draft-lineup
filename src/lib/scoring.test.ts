import { describe, expect, it } from 'vitest';
import { scoreLineup, scorePlayer } from '@/lib/scoring';
import type { LineupPick } from '@/lib/types';

describe('score normalization', () => {
  it('keeps lineup score in 0-100 range', () => {
    const picks: LineupPick[] = [
      { slot: 'PG', playerName: 'Luka Doncic', teamAbbr: 'DAL', teamName: 'Dallas Mavericks' },
      { slot: 'SG', playerName: 'Stephen Curry', teamAbbr: 'GSW', teamName: 'Golden State Warriors' },
      { slot: 'SF', playerName: 'Jayson Tatum', teamAbbr: 'BOS', teamName: 'Boston Celtics' },
      { slot: 'PF', playerName: 'Giannis Antetokounmpo', teamAbbr: 'MIL', teamName: 'Milwaukee Bucks' },
      { slot: 'C', playerName: 'Nikola Jokic', teamAbbr: 'DEN', teamName: 'Denver Nuggets' }
    ];

    const result = scoreLineup(picks);

    expect(result.teamScore).toBeGreaterThanOrEqual(0);
    expect(result.teamScore).toBeLessThanOrEqual(100);
    expect(result.playerScores).toHaveLength(5);
  });

  it('projects baseline stats when player metrics are missing', () => {
    const picks: LineupPick[] = [
      { slot: 'PG', playerName: 'Not In Stats Dataset', teamAbbr: 'ATL', teamName: 'Atlanta Hawks' }
    ];

    const result = scoreLineup(picks);

    expect(result.usedFallbackStats).toBe(true);
    expect(result.playerScores[0]?.usedFallback).toBe(true);
    expect(result.playerScores[0]?.stats.bpm).toBeGreaterThan(0);
  });

  it('clamps extreme player values into 0-100 contribution scale', () => {
    const elite = scorePlayer({ bpm: 99, ws48: 2, vorp: 20, epm: 20 });
    const poor = scorePlayer({ bpm: -99, ws48: -2, vorp: -10, epm: -20 });

    expect(elite.contribution).toBeLessThanOrEqual(95);
    expect(elite.contribution).toBeGreaterThanOrEqual(0);
    expect(poor.contribution).toBeGreaterThanOrEqual(0);
    expect(poor.contribution).toBeLessThanOrEqual(100);
  });

  it('assigns zero contribution to shot clock penalty picks', () => {
    const picks: LineupPick[] = [
      {
        slot: 'PG',
        playerName: 'Shot Clock Violation',
        teamAbbr: 'ATL',
        teamName: 'Atlanta Hawks',
        isPenalty: true
      }
    ];

    const result = scoreLineup(picks);

    expect(result.teamScore).toBe(0);
    expect(result.playerScores[0]?.contribution).toBe(0);
    expect(result.playerScores[0]?.usedFallback).toBe(false);
  });

  it('normalizes player contribution against the full all-time player pool', () => {
    const elite = scoreLineup([
      { slot: 'PG', playerName: 'Stephen Curry', teamAbbr: 'GSW', teamName: 'Golden State Warriors' }
    ]);
    const fallback = scoreLineup([
      { slot: 'PG', playerName: 'Unknown Player', teamAbbr: 'ATL', teamName: 'Atlanta Hawks' }
    ]);

    expect(elite.playerScores[0]?.contribution).toBeGreaterThan(fallback.playerScores[0]?.contribution ?? 0);
    expect(elite.playerScores[0]?.contribution).toBeLessThan(100);
  });

});
