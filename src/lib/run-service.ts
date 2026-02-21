import { db } from '@/lib/db';
import { normalizeGroupCode } from '@/lib/share-code';
import { LINEUP_SLOTS } from '@/lib/types';

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

export async function getLeaderboardRuns(groupCode?: string | null) {
  const normalizedGroup = normalizeGroupCode(groupCode);

  const runs = await db.run.findMany({
    where: normalizedGroup
      ? {
          groupCode: normalizedGroup
        }
      : undefined,
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
