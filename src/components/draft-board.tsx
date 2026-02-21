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

type DraftBoardProps = {
  currentTeam: Team;
  roster: RosterPlayer[];
  lineup: LineupState;
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

  const openSlots = LINEUP_SLOTS.filter((slot) => !lineup[slot]);
  const lineupComplete = openSlots.length === 0;
  const progressPercent = ((currentDrawIndex + 1) / TOTAL_DRAWS) * 100;
  const canConfirm = Boolean(
    selectedPlayer &&
      selectedSlot &&
      openSlots.includes(selectedSlot) &&
      selectedPlayerEligibleSlots.includes(selectedSlot)
  );

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

  return (
    <>
      <section className="card p-5">
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

          <div className="shot-clock-shell">
            <p className="shot-clock-label">SHOT CLOCK</p>
            <div className="shot-clock-display">
              <p
                className={cn('shot-clock-value', secondsRemaining <= 5 && 'animate-pulse')}
                data-testid="shot-clock"
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
          </div>
        </div>

        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-court-700" style={{ width: `${progressPercent}%` }} />
        </div>
      </section>

      {errorMessage ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Roster</h2>
          </div>

          {roster.length === 0 ? (
            <p className="text-sm text-slate-500">No players available for this team.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {roster.map((player, index) => {
                const isSelected = selectedPlayer === player.name;
                return (
                  <li key={player.name}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPlayer(player.name);
                        setIsConfirmOpen(false);
                      }}
                      disabled={lineupComplete}
                      className={cn(
                        'w-full rounded-lg border px-3 py-2 text-left text-sm transition',
                        isSelected
                          ? 'border-court-700 bg-court-50 text-court-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                        lineupComplete && 'cursor-not-allowed opacity-50'
                      )}
                      data-testid={`player-option-${index}`}
                    >
                      <p className="font-semibold">{player.name}</p>
                      <p className="text-xs text-slate-500">
                        {player.yearsWithTeam} | {player.eligibleSlots.join(' / ')}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card p-5">
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

              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => !isDisabled && setSelectedSlot(slot)}
                  disabled={isDisabled}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left',
                    isOpen && isEligibleForSelectedPlayer
                      ? isSelected
                        ? 'border-court-700 bg-court-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                      : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-500'
                  )}
                  data-testid={`slot-${slot}`}
                  data-slot-open={isOpen ? 'true' : 'false'}
                  data-slot-eligible={isEligibleForSelectedPlayer ? 'true' : 'false'}
                >
                  <span className="font-semibold text-slate-900">{slot}</span>
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
            className="button-primary mt-4 w-full"
            data-testid="confirm-assignment"
          >
            Confirm assignment
          </button>
        </section>
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
