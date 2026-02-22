import { db } from '@/lib/db';
import { normalizeGroupCode } from '@/lib/share-code';
import { LINEUP_SLOTS } from '@/lib/types';
import type { Prisma } from '@prisma/client';

const slotOrder = new Map(LINEUP_SLOTS.map((slot, index) => [slot, index]));

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
