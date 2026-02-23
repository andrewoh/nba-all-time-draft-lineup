import { db } from '@/lib/db';
import { normalizeGroupCode } from '@/lib/share-code';
import { LINEUP_SLOTS } from '@/lib/types';
import type { Prisma } from '@prisma/client';

const slotOrder = new Map(LINEUP_SLOTS.map((slot, index) => [slot, index]));

type RunAverages = {
  teamScore: number;
  baseTeamScore: number;
  chemistryScore: number;
  contribution: number;
  personal: number;
  team: number;
  stats: number;
  advanced: number;
};

export type RunBenchmarks = {
  scope: 'global' | 'group';
  sampleSize: number;
  averages: RunAverages;
};

function toNumber(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return value;
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function sortBySlot<T extends { slot: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aOrder = slotOrder.get(a.slot as (typeof LINEUP_SLOTS)[number]) ?? 99;
    const bOrder = slotOrder.get(b.slot as (typeof LINEUP_SLOTS)[number]) ?? 99;
    return aOrder - bOrder;
  });
}

export async function getRunByShareCode(shareCode: string) {
  const normalizedCode = shareCode.trim().toUpperCase();
  const run = await db.run.findUnique({
    where: { shareCode: normalizedCode },
    include: {
      picks: true
    }
  });

  if (!run) {
    return null;
  }

  return {
    ...run,
    picks: sortBySlot(run.picks)
  };
}

export type LeaderboardTimeframe = 'all' | 'daily';

function startOfCurrentUtcDay(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function getLeaderboardRuns(
  groupCode?: string | null,
  timeframe: LeaderboardTimeframe = 'all'
) {
  const normalizedGroup = normalizeGroupCode(groupCode);
  const where: Prisma.RunWhereInput = {};

  if (normalizedGroup) {
    where.groupCode = normalizedGroup;
  }

  if (timeframe === 'daily') {
    where.createdAt = {
      gte: startOfCurrentUtcDay()
    };
  }

  const runs = await db.run.findMany({
    where,
    include: {
      picks: true
    },
    orderBy: [
      {
        teamScore: 'desc'
      },
      {
        createdAt: 'desc'
      }
    ],
    take: 100
  });

  return runs.map((run) => ({
    ...run,
    picks: sortBySlot(run.picks)
  }));
}

export async function getRunBenchmarks(groupCode?: string | null): Promise<RunBenchmarks> {
  const normalizedGroup = normalizeGroupCode(groupCode);
  const runWhere: Prisma.RunWhereInput = normalizedGroup ? { groupCode: normalizedGroup } : {};
  const pickWhere: Prisma.RunPickWhereInput = normalizedGroup
    ? {
        run: {
          groupCode: normalizedGroup
        }
      }
    : {};

  const [runAggregate, pickAggregate] = await Promise.all([
    db.run.aggregate({
      where: runWhere,
      _count: { _all: true },
      _avg: {
        teamScore: true,
        baseTeamScore: true,
        chemistryScore: true
      }
    }),
    db.runPick.aggregate({
      where: pickWhere,
      _avg: {
        contribution: true,
        bpm: true,
        ws48: true,
        vorp: true,
        epm: true
      }
    })
  ]);

  return {
    scope: normalizedGroup ? 'group' : 'global',
    sampleSize: runAggregate._count._all,
    averages: {
      teamScore: roundToOneDecimal(toNumber(runAggregate._avg.teamScore)),
      baseTeamScore: roundToOneDecimal(toNumber(runAggregate._avg.baseTeamScore)),
      chemistryScore: roundToOneDecimal(toNumber(runAggregate._avg.chemistryScore)),
      contribution: roundToOneDecimal(toNumber(pickAggregate._avg.contribution)),
      personal: roundToOneDecimal(toNumber(pickAggregate._avg.bpm)),
      team: roundToOneDecimal(toNumber(pickAggregate._avg.ws48)),
      stats: roundToOneDecimal(toNumber(pickAggregate._avg.vorp)),
      advanced: roundToOneDecimal(toNumber(pickAggregate._avg.epm))
    }
  };
}
