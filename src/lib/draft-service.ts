import type { Prisma } from '@prisma/client';
import {
  SHOT_CLOCK_MS,
  SHOT_CLOCK_PENALTY_PLAYER_NAME,
  SHOT_CLOCK_SECONDS,
  TOTAL_DRAWS
} from '@/lib/constants';
import {
  getPlayerEligibleSlots,
  getRosterNamesByTeam,
  getTeamByAbbr
} from '@/lib/data';
import { db } from '@/lib/db';
import { buildDrawSequence } from '@/lib/draw';
import { createSeededRng } from '@/lib/rng';
import { getOpenSlots, validatePick, applyPickToLineup } from '@/lib/rules';
import { scoreLineup } from '@/lib/scoring';
import { safeParseJson, toJsonString } from '@/lib/serialization';
import {
  generateShareCode,
  normalizeGroupCode,
  normalizeSeed,
  normalizeUserName
} from '@/lib/share-code';
import { DRAFT_STATUSES, LINEUP_SLOTS } from '@/lib/types';
import type { DraftStatus, LineupPick, LineupSlot, LineupState } from '@/lib/types';

function makeCookieToken(): string {
  return crypto.randomUUID();
}

async function generateUniqueShareCode(tx: Prisma.TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = generateShareCode();
    const existing = await tx.run.findUnique({ where: { shareCode: code }, select: { id: true } });
    if (!existing) {
      return code;
    }
  }

  throw new Error('Could not generate a unique share code.');
}

function parseLineup(lineupJson: string): LineupState {
  return safeParseJson<LineupState>(lineupJson, {});
}

function parseChosenPlayers(chosenPlayersJson: string): string[] {
  return safeParseJson<string[]>(chosenPlayersJson, []);
}

function parseDrawSequence(drawSequenceJson: string): string[] {
  return safeParseJson<string[]>(drawSequenceJson, []);
}

function computeRemainingTeams(drawSequence: string[], currentDrawIndex: number): string[] {
  return drawSequence.slice(currentDrawIndex);
}

function parseDraftStatus(status: string): DraftStatus {
  if (DRAFT_STATUSES.includes(status as DraftStatus)) {
    return status as DraftStatus;
  }

  return 'DRAFTING';
}

function getShotClockDeadline(drawStartedAt: Date): Date {
  return new Date(drawStartedAt.getTime() + SHOT_CLOCK_MS);
}

function isClockExpired(drawStartedAt: Date, now = new Date()): boolean {
  return now.getTime() >= getShotClockDeadline(drawStartedAt).getTime();
}

type SessionWithRun = {
  id: string;
  cookieToken: string;
  userName: string | null;
  groupCode: string | null;
  seed: string | null;
  drawSequenceJson: string;
  remainingTeamsJson: string;
  currentDrawIndex: number;
  lineupJson: string;
  chosenPlayersJson: string;
  drawStartedAt: Date;
  status: string;
  runId: string | null;
  run: {
    shareCode: string;
  } | null;
};

async function fetchDraftSessionByCookieToken(
  tx: Prisma.TransactionClient,
  cookieToken: string
): Promise<SessionWithRun | null> {
  return tx.draftSession.findUnique({
    where: { cookieToken },
    include: {
      run: {
        select: {
          shareCode: true
        }
      }
    }
  });
}

async function fetchDraftSessionById(
  tx: Prisma.TransactionClient,
  id: string
): Promise<SessionWithRun> {
  const session = await tx.draftSession.findUnique({
    where: { id },
    include: {
      run: {
        select: {
          shareCode: true
        }
      }
    }
  });

  if (!session) {
    throw new Error('Draft session missing after update.');
  }

  return session;
}

async function persistDraftState(input: {
  tx: Prisma.TransactionClient;
  session: SessionWithRun;
  drawSequence: string[];
  lineup: LineupState;
  chosenPlayers: string[];
  currentDrawIndex: number;
  drawStartedAt: Date;
}): Promise<SessionWithRun> {
  const { tx, session, drawSequence, lineup, chosenPlayers, currentDrawIndex, drawStartedAt } = input;

  const roundIsComplete =
    currentDrawIndex >= TOTAL_DRAWS ||
    currentDrawIndex >= drawSequence.length ||
    getOpenSlots(lineup).length === 0;

  if (!roundIsComplete) {
    await tx.draftSession.update({
      where: { id: session.id },
      data: {
        currentDrawIndex,
        remainingTeamsJson: toJsonString(computeRemainingTeams(drawSequence, currentDrawIndex)),
        lineupJson: toJsonString(lineup),
        chosenPlayersJson: toJsonString(chosenPlayers),
        drawStartedAt,
        status: 'DRAFTING'
      }
    });

    return fetchDraftSessionById(tx, session.id);
  }

  const orderedPicks = LINEUP_SLOTS.map((lineupSlot) => lineup[lineupSlot]).filter(
    (pick): pick is LineupPick => Boolean(pick)
  );

  if (orderedPicks.length !== LINEUP_SLOTS.length) {
    throw new Error('Round cannot finish until all slots are filled.');
  }

  const scoring = scoreLineup(orderedPicks);
  const shareCode = await generateUniqueShareCode(tx);

  const run = await tx.run.create({
    data: {
      shareCode,
      userName: session.userName,
      groupCode: session.groupCode,
      seed: session.seed,
      teamScore: scoring.teamScore,
      usedFallbackStats: scoring.usedFallbackStats,
      lineupJson: toJsonString(lineup),
      contributionsJson: toJsonString(scoring.playerScores),
      picks: {
        create: scoring.playerScores.map((playerScore) => ({
          slot: playerScore.pick.slot,
          playerName: playerScore.pick.playerName,
          teamAbbr: playerScore.pick.teamAbbr,
          teamName: playerScore.pick.teamName,
          // Persist globally-normalized metrics so results table matches contribution math.
          bpm: playerScore.normalizedMetrics.bpm,
          ws48: playerScore.normalizedMetrics.ws48,
          vorp: playerScore.normalizedMetrics.vorp,
          epm: playerScore.normalizedMetrics.epm,
          usedFallback: playerScore.usedFallback,
          isPenalty: Boolean(playerScore.pick.isPenalty),
          contribution: playerScore.contribution
        }))
      }
    }
  });

  await tx.draftSession.update({
    where: { id: session.id },
    data: {
      currentDrawIndex,
      remainingTeamsJson: toJsonString([]),
      lineupJson: toJsonString(lineup),
      chosenPlayersJson: toJsonString(chosenPlayers),
      drawStartedAt,
      status: 'COMPLETED',
      runId: run.id
    }
  });

  return fetchDraftSessionById(tx, session.id);
}

function chooseTimeoutSlot(input: {
  openSlots: LineupSlot[];
  seed: string | null;
  sessionId: string;
  drawIndex: number;
}): LineupSlot {
  const { openSlots, seed, sessionId, drawIndex } = input;

  if (openSlots.length === 1) {
    return openSlots[0];
  }

  const rng = seed
    ? createSeededRng(`${seed}:shotclock:${sessionId}:${drawIndex}`)
    : Math.random;

  const index = Math.floor(rng() * openSlots.length);
  return openSlots[index] ?? openSlots[0];
}

async function applyShotClockTimeouts(
  tx: Prisma.TransactionClient,
  session: SessionWithRun
): Promise<SessionWithRun> {
  if (session.status !== 'DRAFTING') {
    return session;
  }

  const drawSequence = parseDrawSequence(session.drawSequenceJson);
  let lineup = parseLineup(session.lineupJson);
  const chosenPlayers = parseChosenPlayers(session.chosenPlayersJson);
  let currentDrawIndex = session.currentDrawIndex;
  let drawStartedAt = new Date(session.drawStartedAt);
  const now = new Date();

  let timedOutAtLeastOnce = false;

  while (
    currentDrawIndex < TOTAL_DRAWS &&
    currentDrawIndex < drawSequence.length &&
    getOpenSlots(lineup).length > 0 &&
    isClockExpired(drawStartedAt, now)
  ) {
    const currentTeamAbbr = drawSequence[currentDrawIndex] ?? 'N/A';
    const currentTeam = getTeamByAbbr(currentTeamAbbr);
    const openSlots = getOpenSlots(lineup);
    const randomSlot = chooseTimeoutSlot({
      openSlots,
      seed: session.seed,
      sessionId: session.id,
      drawIndex: currentDrawIndex
    });

    lineup = applyPickToLineup(lineup, {
      slot: randomSlot,
      playerName: SHOT_CLOCK_PENALTY_PLAYER_NAME,
      teamAbbr: currentTeamAbbr,
      teamName: currentTeam?.name ?? currentTeamAbbr,
      isPenalty: true
    });

    currentDrawIndex += 1;
    drawStartedAt = new Date(drawStartedAt.getTime() + SHOT_CLOCK_MS);
    timedOutAtLeastOnce = true;
  }

  if (!timedOutAtLeastOnce) {
    return session;
  }

  return persistDraftState({
    tx,
    session,
    drawSequence,
    lineup,
    chosenPlayers,
    currentDrawIndex,
    drawStartedAt
  });
}

function buildDraftView(session: SessionWithRun): DraftView {
  const drawSequence = parseDrawSequence(session.drawSequenceJson);
  const remainingTeams = safeParseJson<string[]>(
    session.remainingTeamsJson,
    computeRemainingTeams(drawSequence, session.currentDrawIndex)
  );

  const isDrafting = session.status === 'DRAFTING';
  const currentTeamAbbr = drawSequence[session.currentDrawIndex] ?? null;
  const shotClockDeadlineAt =
    isDrafting && currentTeamAbbr
      ? getShotClockDeadline(session.drawStartedAt).toISOString()
      : null;

  return {
    id: session.id,
    cookieToken: session.cookieToken,
    status: parseDraftStatus(session.status),
    userName: session.userName,
    groupCode: session.groupCode,
    seed: session.seed,
    drawSequence,
    currentDrawIndex: session.currentDrawIndex,
    currentTeamAbbr,
    remainingTeams,
    lineup: parseLineup(session.lineupJson),
    chosenPlayers: parseChosenPlayers(session.chosenPlayersJson),
    runShareCode: session.run?.shareCode ?? null,
    shotClockDeadlineAt,
    shotClockSeconds: SHOT_CLOCK_SECONDS
  };
}

export async function createDraftSession(input: {
  userName?: string | null;
  groupCode?: string | null;
  seed?: string | null;
}) {
  const userName = normalizeUserName(input.userName);
  const groupCode = normalizeGroupCode(input.groupCode);
  const seed = normalizeSeed(input.seed);
  const drawSequence = buildDrawSequence(seed);
  const cookieToken = makeCookieToken();

  return db.draftSession.create({
    data: {
      cookieToken,
      userName,
      groupCode,
      seed,
      drawSequenceJson: toJsonString(drawSequence),
      remainingTeamsJson: toJsonString(drawSequence),
      currentDrawIndex: 0,
      lineupJson: toJsonString({}),
      chosenPlayersJson: toJsonString([]),
      drawStartedAt: new Date(),
      status: 'DRAFTING'
    }
  });
}

export type DraftView = {
  id: string;
  cookieToken: string;
  status: DraftStatus;
  userName: string | null;
  groupCode: string | null;
  seed: string | null;
  drawSequence: string[];
  currentDrawIndex: number;
  currentTeamAbbr: string | null;
  remainingTeams: string[];
  lineup: LineupState;
  chosenPlayers: string[];
  runShareCode: string | null;
  shotClockDeadlineAt: string | null;
  shotClockSeconds: number;
};

export async function getDraftViewByCookieToken(cookieToken: string): Promise<DraftView | null> {
  return db.$transaction(async (tx) => {
    const session = await fetchDraftSessionByCookieToken(tx, cookieToken);

    if (!session) {
      return null;
    }

    const syncedSession = await applyShotClockTimeouts(tx, session);
    return buildDraftView(syncedSession);
  });
}

export async function submitDraftPick(input: {
  cookieToken: string;
  playerName: string;
  slot: LineupSlot;
}): Promise<{ completed: boolean; shareCode?: string }> {
  const { cookieToken, playerName, slot } = input;

  return db.$transaction(async (tx) => {
    const existingSession = await fetchDraftSessionByCookieToken(tx, cookieToken);

    if (!existingSession) {
      throw new Error('Draft session not found. Start a new game.');
    }

    let session = await applyShotClockTimeouts(tx, existingSession);

    if (session.status === 'COMPLETED') {
      return {
        completed: true,
        shareCode: session.run?.shareCode
      };
    }

    if (isClockExpired(session.drawStartedAt)) {
      session = await applyShotClockTimeouts(tx, session);
      if (session.status === 'COMPLETED') {
        return {
          completed: true,
          shareCode: session.run?.shareCode
        };
      }

      throw new Error('Shot clock expired. A random open slot was assigned 0 points.');
    }

    const drawSequence = parseDrawSequence(session.drawSequenceJson);
    const lineup = parseLineup(session.lineupJson);
    const chosenPlayers = parseChosenPlayers(session.chosenPlayersJson);

    if (session.currentDrawIndex >= TOTAL_DRAWS || session.currentDrawIndex >= drawSequence.length) {
      throw new Error('The round is already complete.');
    }

    const currentTeamAbbr = drawSequence[session.currentDrawIndex];
    const currentTeam = getTeamByAbbr(currentTeamAbbr);

    if (!currentTeam) {
      throw new Error('Current team is invalid. Start a new game.');
    }

    const validation = validatePick({
      lineup,
      slot,
      playerName,
      currentTeamRoster: getRosterNamesByTeam(currentTeamAbbr),
      chosenPlayers,
      playerEligibleSlots: getPlayerEligibleSlots(currentTeamAbbr, playerName)
    });

    if (!validation.valid) {
      throw new Error(validation.message);
    }

    const updatedLineup = applyPickToLineup(lineup, {
      slot,
      playerName,
      teamAbbr: currentTeamAbbr,
      teamName: currentTeam.name
    });

    const updatedChosenPlayers = [...chosenPlayers, playerName];
    const nextDrawIndex = session.currentDrawIndex + 1;

    const savedSession = await persistDraftState({
      tx,
      session,
      drawSequence,
      lineup: updatedLineup,
      chosenPlayers: updatedChosenPlayers,
      currentDrawIndex: nextDrawIndex,
      drawStartedAt: new Date()
    });

    if (savedSession.status === 'COMPLETED') {
      return {
        completed: true,
        shareCode: savedSession.run?.shareCode
      };
    }

    return {
      completed: false
    };
  });
}
