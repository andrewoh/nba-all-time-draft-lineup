import { PrismaClient } from '@prisma/client';
import { scoreLineup } from '../src/lib/scoring';
import type { LineupPick } from '../src/lib/types';

const prisma = new PrismaClient();

async function createSampleRun(input: {
  shareCode: string;
  userName: string;
  groupCode: string;
  seed: string;
  picks: LineupPick[];
}) {
  const scoring = scoreLineup(input.picks);

  await prisma.run.create({
    data: {
      shareCode: input.shareCode,
      userName: input.userName,
      groupCode: input.groupCode,
      seed: input.seed,
      teamScore: scoring.teamScore,
      usedFallbackStats: scoring.usedFallbackStats,
      lineupJson: JSON.stringify(
        input.picks.reduce<Record<string, LineupPick>>((acc, pick) => {
          acc[pick.slot] = pick;
          return acc;
        }, {})
      ),
      contributionsJson: JSON.stringify(scoring.playerScores),
      picks: {
        create: scoring.playerScores.map((playerScore) => ({
          slot: playerScore.pick.slot,
          playerName: playerScore.pick.playerName,
          teamAbbr: playerScore.pick.teamAbbr,
          teamName: playerScore.pick.teamName,
          bpm: playerScore.stats.bpm,
          ws48: playerScore.stats.ws48,
          vorp: playerScore.stats.vorp,
          epm: playerScore.stats.epm,
          usedFallback: playerScore.usedFallback,
          isPenalty: Boolean(playerScore.pick.isPenalty),
          contribution: playerScore.contribution
        }))
      }
    }
  });
}

async function main() {
  await prisma.runPick.deleteMany();
  await prisma.draftSession.deleteMany();
  await prisma.run.deleteMany();

  await createSampleRun({
    shareCode: 'DEMO01',
    userName: 'Alex',
    groupCode: 'DEMO',
    seed: 'friends-night-1',
    picks: [
      { slot: 'PG', playerName: 'Luka Doncic', teamAbbr: 'DAL', teamName: 'Dallas Mavericks' },
      { slot: 'SG', playerName: 'Stephen Curry', teamAbbr: 'GSW', teamName: 'Golden State Warriors' },
      { slot: 'SF', playerName: 'Jayson Tatum', teamAbbr: 'BOS', teamName: 'Boston Celtics' },
      { slot: 'PF', playerName: 'Giannis Antetokounmpo', teamAbbr: 'MIL', teamName: 'Milwaukee Bucks' },
      { slot: 'C', playerName: 'Nikola Jokic', teamAbbr: 'DEN', teamName: 'Denver Nuggets' }
    ]
  });

  await createSampleRun({
    shareCode: 'DEMO02',
    userName: 'Jordan',
    groupCode: 'DEMO',
    seed: 'friends-night-2',
    picks: [
      { slot: 'PG', playerName: 'Reggie Miller', teamAbbr: 'IND', teamName: 'Indiana Pacers' },
      { slot: 'SG', playerName: 'Austin Carr', teamAbbr: 'CLE', teamName: 'Cleveland Cavaliers' },
      { slot: 'SF', playerName: 'LeBron James', teamAbbr: 'LAL', teamName: 'Los Angeles Lakers' },
      { slot: 'PF', playerName: 'Kevin Durant', teamAbbr: 'PHX', teamName: 'Phoenix Suns' },
      { slot: 'C', playerName: 'Joel Embiid', teamAbbr: 'PHI', teamName: 'Philadelphia 76ers' }
    ]
  });

  console.log('Seed complete. Added demo runs DEMO01 and DEMO02.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
