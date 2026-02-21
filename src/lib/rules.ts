import { LINEUP_SLOTS } from '@/lib/types';
import type { LineupPick, LineupSlot, LineupState } from '@/lib/types';

export function getOpenSlots(lineup: LineupState): LineupSlot[] {
  return LINEUP_SLOTS.filter((slot) => !lineup[slot]);
}

export function isSlotOpen(lineup: LineupState, slot: LineupSlot): boolean {
  return !lineup[slot];
}

export function canDraftMore(lineup: LineupState): boolean {
  return getOpenSlots(lineup).length > 0;
}

export function validatePick(input: {
  lineup: LineupState;
  slot: LineupSlot;
  playerName: string;
  currentTeamRoster: string[];
  chosenPlayers: string[];
  playerEligibleSlots: LineupSlot[];
}): { valid: true } | { valid: false; message: string } {
  const { lineup, slot, playerName, currentTeamRoster, chosenPlayers, playerEligibleSlots } = input;

  if (!canDraftMore(lineup)) {
    return { valid: false, message: 'All lineup slots are already filled.' };
  }

  if (!isSlotOpen(lineup, slot)) {
    return { valid: false, message: `Slot ${slot} is already locked for this round.` };
  }

  if (!currentTeamRoster.includes(playerName)) {
    return { valid: false, message: `${playerName} is not on the current team roster.` };
  }

  if (!playerEligibleSlots.includes(slot)) {
    return {
      valid: false,
      message: `${playerName} cannot be assigned to ${slot}. Eligible positions: ${playerEligibleSlots.join(', ')}`
    };
  }

  if (chosenPlayers.includes(playerName)) {
    return { valid: false, message: `${playerName} has already been selected in this round.` };
  }

  return { valid: true };
}

export function applyPickToLineup(lineup: LineupState, pick: LineupPick): LineupState {
  if (lineup[pick.slot]) {
    throw new Error(`Slot ${pick.slot} is already filled.`);
  }

  return {
    ...lineup,
    [pick.slot]: pick
  };
}
