'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { submitPickAction } from '@/app/actions';
import { TOTAL_DRAWS } from '@/lib/constants';
import { getTeamLogoUrl } from '@/lib/data';
import { cn } from '@/lib/cn';
import { LINEUP_SLOTS } from '@/lib/types';
import type { LineupSlot, LineupState, RosterPlayer, Team } from '@/lib/types';

type MobilePanel = 'players' | 'lineup';

type DraftBoardProps = {
  currentTeam: Team;
  roster: RosterPlayer[];
  lineup: LineupState;
  chosenPlayers: string[];
  currentDrawIndex: number;
  userName: string | null;
  groupCode: string | null;
  seed: string | null;
  shotClockDeadlineAt: string | null;
  shotClockSeconds: number;
  errorMessage: string | null;
};

function getSecondsRemaining(deadline: string | null): number {
  if (!deadline) {
    return 0;
  }

  const remainingMs = new Date(deadline).getTime() - Date.now();
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

export function DraftBoard({
  currentTeam,
  roster,
  lineup,
  chosenPlayers,
  currentDrawIndex,
  userName,
  groupCode,
  seed,
  shotClockDeadlineAt,
  shotClockSeconds,
  errorMessage
}: DraftBoardProps) {
  const router = useRouter();
  const teamLogoUrl = getTeamLogoUrl(currentTeam.abbr);

  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<LineupSlot | null>(null);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('players');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSubmittingPick, setIsSubmittingPick] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(() =>
    getSecondsRemaining(shotClockDeadlineAt)
  );
  const timeoutHandledRef = useRef(false);

  const selectedPlayerProfile = useMemo(
    () => roster.find((player) => player.name === selectedPlayer) ?? null,
    [roster, selectedPlayer]
  );

  const selectedPlayerEligibleSlots = useMemo(
    () => selectedPlayerProfile?.eligibleSlots ?? [],
    [selectedPlayerProfile]
  );
  const chosenPlayersSet = useMemo(() => new Set(chosenPlayers), [chosenPlayers]);
  const openSlots = LINEUP_SLOTS.filter((slot) => !lineup[slot]);
  const rankedRoster = useMemo(() => {
    return [...roster]
      .map((player) => ({
        player,
        alreadySelected: chosenPlayersSet.has(player.name),
        hasOpenEligibleSlot: player.eligibleSlots.some((slot) => openSlots.includes(slot)),
        isPlayable:
          !chosenPlayersSet.has(player.name) &&
          player.eligibleSlots.some((slot) => openSlots.includes(slot))
      }))
      .sort((a, b) => {
        if (a.isPlayable !== b.isPlayable) {
          return a.isPlayable ? -1 : 1;
        }

        if (a.alreadySelected !== b.alreadySelected) {
          return a.alreadySelected ? 1 : -1;
        }

        return a.player.name.localeCompare(b.player.name);
      });
  }, [chosenPlayersSet, openSlots, roster]);
  const playableCount = rankedRoster.reduce((count, item) => count + (item.isPlayable ? 1 : 0), 0);
  const selectedPlayerIsPlayable = selectedPlayer
    ? !chosenPlayersSet.has(selectedPlayer) &&
      selectedPlayerEligibleSlots.some((slot) => openSlots.includes(slot))
    : false;
  const lineupComplete = openSlots.length === 0;
  const progressPercent = ((currentDrawIndex + 1) / TOTAL_DRAWS) * 100;
  const canConfirm = Boolean(
    selectedPlayer &&
      selectedSlot &&
      openSlots.includes(selectedSlot) &&
      selectedPlayerEligibleSlots.includes(selectedSlot)
  );
  const selectedSummary = selectedPlayer
    ? selectedSlot
      ? `${selectedPlayer} -> ${selectedSlot}`
      : `${selectedPlayer} selected`
    : 'Choose player + slot';

  useEffect(() => {
    setSecondsRemaining(getSecondsRemaining(shotClockDeadlineAt));
    timeoutHandledRef.current = false;
  }, [shotClockDeadlineAt, currentDrawIndex]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const remaining = getSecondsRemaining(shotClockDeadlineAt);
      setSecondsRemaining(remaining);

      if (remaining <= 0 && !timeoutHandledRef.current) {
        timeoutHandledRef.current = true;
        router.refresh();
      }
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [router, shotClockDeadlineAt]);

  useEffect(() => {
    if (selectedSlot && !selectedPlayerEligibleSlots.includes(selectedSlot)) {
      setSelectedSlot(null);
    }
  }, [selectedSlot, selectedPlayerEligibleSlots]);

  useEffect(() => {
    if (!isConfirmOpen) {
      setIsSubmittingPick(false);
    }
  }, [isConfirmOpen]);

  useEffect(() => {
    if (selectedPlayer && !selectedPlayerIsPlayable) {
      setSelectedPlayer(null);
      setSelectedSlot(null);
      setIsConfirmOpen(false);
    }
  }, [selectedPlayer, selectedPlayerIsPlayable]);

  return (
    <>
      <section className="card fade-up p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {teamLogoUrl ? (
              <Image
                src={teamLogoUrl}
                alt={`${currentTeam.name} logo`}
                width={96}
                height={96}
                className="h-24 w-24 rounded-md border border-slate-200 bg-white p-2"
              />
            ) : null}

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-court-700">Current Team</p>
              <p className="text-xl font-bold text-slate-900">{currentTeam.name}</p>
              <p className="text-sm text-slate-600" data-testid="draw-progress">
                Draw {currentDrawIndex + 1}/{TOTAL_DRAWS}
              </p>
            </div>
          </div>

          <div className="shot-clock-shell hidden md:block">
            <p className="shot-clock-label">SHOT CLOCK</p>
            <div className="shot-clock-display">
              <p
                className={cn('shot-clock-value', secondsRemaining <= 5 && 'animate-pulse')}
                data-testid="shot-clock-desktop"
              >
                {String(secondsRemaining).padStart(2, '0')}
              </p>
            </div>
            <p className="shot-clock-caption">{shotClockSeconds}s per draw</p>
          </div>

          <div className="text-sm text-slate-600">
            {userName ? <p>You: {userName}</p> : null}
            {groupCode ? <p>Group: {groupCode}</p> : null}
            {seed ? <p>Seed: {seed}</p> : <p>Seed: random</p>}
            <p>Open Slots: {openSlots.join(', ') || 'None'}</p>
          </div>
        </div>

        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-court-700" style={{ width: `${progressPercent}%` }} />
        </div>
      </section>

      {errorMessage ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      ) : null}

      <section className="sticky-draft-banner card sticky top-[60px] z-10 p-3 md:hidden">
        <div className="flex items-center gap-2">
          {teamLogoUrl ? (
            <Image
              src={teamLogoUrl}
              alt={`${currentTeam.name} logo`}
              width={36}
              height={36}
              className="h-9 w-9 rounded-md border border-slate-200 bg-white p-1"
            />
          ) : null}
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-court-700">Now Drafting</p>
            <p className="truncate text-sm font-semibold text-slate-900">{currentTeam.name}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <p className="text-xs font-semibold text-slate-600">
              Draw {currentDrawIndex + 1}/{TOTAL_DRAWS}
            </p>
            <p
              className={cn('mini-shot-clock', secondsRemaining <= 5 && 'urgent')}
              data-testid="shot-clock"
              aria-label={`Shot clock ${secondsRemaining} seconds remaining`}
            >
              {String(secondsRemaining).padStart(2, '0')}
            </p>
          </div>
        </div>
      </section>

      <div className="fade-up-delay md:hidden">
        <div className="mobile-segment">
          <button
            type="button"
            data-active={mobilePanel === 'players'}
            onClick={() => setMobilePanel('players')}
          >
            Players ({playableCount}/{roster.length})
          </button>
          <button
            type="button"
            data-active={mobilePanel === 'lineup'}
            onClick={() => setMobilePanel('lineup')}
          >
            Lineup ({openSlots.length} open)
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
        <section className={cn('card p-5', mobilePanel !== 'players' && 'hidden md:block')}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Roster</h2>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Available first, unavailable last
            </p>
          </div>

          {rankedRoster.length === 0 ? (
            <p className="text-sm text-slate-500">No players available for this team.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {rankedRoster.map(({ player, isPlayable, alreadySelected, hasOpenEligibleSlot }, index) => {
                const isSelected = selectedPlayer === player.name;
                const disabledReason = alreadySelected
                  ? 'Already selected earlier in this round'
                  : hasOpenEligibleSlot
                    ? null
                    : 'No open eligible slots';
                return (
                  <li key={player.name} className="player-item-enter" style={{ animationDelay: `${Math.min(index, 12) * 18}ms` }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isPlayable) {
                          return;
                        }
                        setSelectedPlayer(player.name);
                        setMobilePanel('lineup');
                        setIsConfirmOpen(false);
                      }}
                      disabled={lineupComplete || !isPlayable}
                      className={cn(
                        'w-full min-h-[3.5rem] rounded-xl border px-3 py-2.5 text-left text-sm transition active:scale-[0.995]',
                        isSelected && isPlayable
                          ? 'selected-emphasis border-court-700 bg-court-50 text-court-900'
                          : !isPlayable
                            ? alreadySelected
                              ? 'cursor-not-allowed border-rose-200 bg-rose-50 text-rose-700'
                              : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                        (lineupComplete || !isPlayable) && 'opacity-70'
                      )}
                      data-testid={`player-option-${index}`}
                    >
                      <p className={cn('font-semibold', !isPlayable && 'line-through')}>
                        {!isPlayable ? 'X ' : null}
                        {player.name}
                      </p>
                      <p className={cn('mt-0.5 text-xs', !isPlayable ? 'text-slate-400' : 'text-slate-600')}>
                        {player.yearsWithTeam}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {player.eligibleSlots.map((slot) => {
                          const isOpenSlot = openSlots.includes(slot);
                          return (
                            <span
                              key={`${player.name}-${slot}`}
                              className={cn(
                                'rounded-full border px-2 py-0.5 text-[10px] font-bold',
                                isPlayable && isOpenSlot
                                  ? 'border-blue-300 bg-blue-100 text-blue-800'
                                  : 'border-slate-300 bg-slate-100 text-slate-500'
                              )}
                            >
                              {slot}
                            </span>
                          );
                        })}
                      </div>
                      {disabledReason ? (
                        <p
                          className={cn(
                            'mt-1 text-[11px] font-semibold uppercase tracking-wide',
                            alreadySelected ? 'text-rose-600' : 'text-red-500'
                          )}
                        >
                          {disabledReason}
                        </p>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={cn('card p-5', mobilePanel !== 'lineup' && 'hidden md:block')}>
          <h2 className="text-lg font-semibold text-slate-900">Lineup Slots</h2>
          <p className="mt-1 text-sm text-slate-600">Select an open slot allowed by the player position.</p>

          <div className="mt-4 space-y-2">
            {LINEUP_SLOTS.map((slot) => {
              const pick = lineup[slot];
              const isSelected = selectedSlot === slot;
              const isOpen = !pick;
              const isEligibleForSelectedPlayer =
                !selectedPlayer || selectedPlayerEligibleSlots.includes(slot);
              const isDisabled = !isOpen || !isEligibleForSelectedPlayer;
              const statusText = pick
                ? pick.isPenalty
                  ? 'LOCKED (0 pts)'
                  : 'LOCKED'
                : isEligibleForSelectedPlayer
                  ? 'OPEN'
                  : 'INELIGIBLE';

              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => !isDisabled && setSelectedSlot(slot)}
                  disabled={isDisabled}
                  className={cn(
                    'flex min-h-[3.25rem] w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left active:scale-[0.995]',
                    isOpen && isEligibleForSelectedPlayer
                      ? isSelected
                        ? 'border-court-700 bg-court-100 ring-2 ring-court-300'
                        : 'border-emerald-400 bg-emerald-50 text-emerald-900 hover:border-emerald-500'
                      : isOpen
                        ? 'cursor-not-allowed border-rose-200 bg-rose-50 text-rose-700'
                        : 'cursor-not-allowed border-slate-300 bg-slate-100 text-slate-600'
                  )}
                  data-testid={`slot-${slot}`}
                  data-slot-open={isOpen ? 'true' : 'false'}
                  data-slot-eligible={isEligibleForSelectedPlayer ? 'true' : 'false'}
                >
                  <span className="font-semibold text-slate-900">{slot}</span>
                  <span className="mr-2 rounded-full border border-current px-2 py-0.5 text-[10px] font-bold tracking-wide">
                    {statusText}
                  </span>
                  <span className="truncate text-xs sm:text-sm">
                    {pick
                      ? pick.isPenalty
                        ? 'Shot Clock Violation (0 pts)'
                        : `${pick.playerName} (${pick.teamAbbr})`
                      : isEligibleForSelectedPlayer
                        ? 'Open'
                        : 'Not eligible'}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            <p>Selected player: {selectedPlayer ?? 'None'}</p>
            <p>Franchise years: {selectedPlayerProfile?.yearsWithTeam ?? 'None'}</p>
            <p>Eligible slots: {selectedPlayerEligibleSlots.join(', ') || 'None'}</p>
            <p>Selected slot: {selectedSlot ?? 'None'}</p>
          </div>

          <button
            type="button"
            onClick={() => setIsConfirmOpen(true)}
            disabled={!canConfirm}
            className="button-primary mt-4 hidden w-full md:inline-flex"
            data-testid="confirm-assignment"
          >
            Confirm assignment
          </button>
        </section>
      </div>

      <div className="mobile-dock md:hidden">
        <p className="mobile-dock-meta">
          {lineupComplete ? 'All slots are filled. Finishing round...' : selectedSummary}
        </p>
        <button
          type="button"
          onClick={() => setIsConfirmOpen(true)}
          disabled={lineupComplete || !canConfirm}
          className="button-primary w-full"
          data-testid="confirm-assignment"
        >
          {lineupComplete ? 'Round complete' : 'Confirm assignment'}
        </button>
      </div>

      {isConfirmOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="card w-full max-w-sm p-5">
            <h3 className="text-lg font-semibold text-slate-900">Confirm Pick</h3>
            <p className="mt-2 text-sm text-slate-600">
              Assign <span className="font-semibold">{selectedPlayer}</span> to{' '}
              <span className="font-semibold">{selectedSlot}</span>?
            </p>

            <form
              action={submitPickAction}
              className="mt-4 space-y-2"
              onSubmit={() => setIsSubmittingPick(true)}
            >
              <input type="hidden" name="playerName" value={selectedPlayer ?? ''} />
              <input type="hidden" name="slot" value={selectedSlot ?? ''} />
              <button
                type="submit"
                className="button-primary w-full"
                disabled={isSubmittingPick}
                data-testid="confirm-submit"
              >
                {isSubmittingPick ? 'Locking...' : 'Yes, lock it in'}
              </button>
            </form>

            <button
              type="button"
              onClick={() => setIsConfirmOpen(false)}
              className="button-secondary mt-2 w-full"
              disabled={isSubmittingPick}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
