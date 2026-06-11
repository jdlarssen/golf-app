'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatCountdown } from '@/lib/format/countdown';
import { subscribeRealtimeChannel } from '@/lib/sync/realtimeChannel';
import { joinFlight, type FlightJoinError } from './flightJoinActions';
import { MAX_FLIGHT_SIZE } from '@/lib/games/flightScope';

/** En flight som velgeren viser. */
export type FlightOption = {
  flightNumber: number;
  memberCount: number;
  memberNames: string[];
};

type WaitingRoomProps = {
  gameId: string;
  teeOffAt: string;
  /** Satt når spillet er eligible for flight-inndeling (>4 aktive, ikke wolf, scheduled). */
  flightOptions?: FlightOption[] | null;
  /** Nåværende flight for denne spilleren (null = ikke tildelt). */
  currentFlightNumber?: number | null;
};

const FLIGHT_JOIN_ERRORS: Record<FlightJoinError, string> = {
  not_authed: 'Du må logge inn for å velge flight.',
  not_member: 'Du er ikke deltaker i dette spillet.',
  game_not_scheduled: 'Spillet er ikke lenger i planleggingsfasen.',
  flight_full: 'Den flighten ble nettopp full. Velg en annen.',
  db_error: 'Noe gikk galt. Prøv igjen.',
};

/**
 * Client-side countdown ticker + realtime listener for the "scheduled" state
 * (Scorekort venter). Updates the countdown label every 30s and refreshes the
 * route as soon as `games.status` flips to `active` so the player sees the
 * normal home view without manually reloading.
 *
 * #543: hvis spillet er eligible for flight-inndeling, vises en selvbetjenings-
 * velger der spillerne kan plassere seg selv i en flight.
 */
export function ScheduledWaitingRoom({
  gameId,
  teeOffAt,
  flightOptions = null,
  currentFlightNumber = null,
}: WaitingRoomProps) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();
  const [joinError, setJoinError] = useState<string | null>(null);
  const [selectedFlight, setSelectedFlight] = useState<number | null>(
    currentFlightNumber,
  );

  // Tick every 30s to update countdown text. 30s is precise enough for
  // a ballpark "starter om X min/t" label; the realtime subscription
  // flips the route to active well before sub-30s precision matters.
  // Also force a fresh tick whenever the tab returns to foreground —
  // browsers throttle background intervals, so the user reopens to a
  // possibly-stale countdown without this.
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const id = window.setInterval(refresh, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Realtime: listen for game.status flipping to 'active'.
  useEffect(() => {
    return subscribeRealtimeChannel(`game-status:${gameId}`, (channel) =>
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          const next = payload.new as { status?: string };
          if (next?.status === 'active') {
            router.refresh();
          }
        },
      ),
    );
  }, [gameId, router]);

  const msUntil = new Date(teeOffAt).getTime() - now;
  const text = formatCountdown(msUntil);

  function handleJoinFlight(flightNumber: number) {
    setJoinError(null);
    startTransition(async () => {
      const result = await joinFlight(gameId, flightNumber);
      if (result.ok) {
        setSelectedFlight(flightNumber);
        router.refresh();
      } else {
        setJoinError(FLIGHT_JOIN_ERRORS[result.error]);
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Nedtelling */}
      <div className="bg-primary text-white dark:text-bg rounded-2xl px-4 py-3.5 flex items-center gap-3">
        <span
          className="inline-block w-2 h-2 rounded-full bg-accent animate-soft-pulse"
          aria-hidden
        />
        <div className="flex-1">
          <p className="font-serif text-[15px] font-medium">{text}</p>
          <p className="text-[11.5px] opacity-75 mt-0.5">
            Vi gir deg beskjed når kortet åpner.
          </p>
        </div>
      </div>

      {/* #543: flight-velger — kun når spillet trenger inndeling */}
      {flightOptions && flightOptions.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface px-4 py-3.5">
          <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-muted mb-3">
            Velg din flight
          </p>
          {joinError && (
            <p className="mb-2 rounded-lg bg-warning/10 px-3 py-2 text-[12.5px] text-warning">
              {joinError}
            </p>
          )}
          <ul className="space-y-2">
            {flightOptions.map((opt) => {
              const isFull = opt.memberCount >= MAX_FLIGHT_SIZE;
              const isMine = selectedFlight === opt.flightNumber;
              return (
                <li key={opt.flightNumber}>
                  <button
                    type="button"
                    disabled={isPending || isFull || isMine}
                    onClick={() => handleJoinFlight(opt.flightNumber)}
                    className={[
                      'w-full min-h-[44px] rounded-xl border px-3 py-2.5 text-left transition-colors',
                      isMine
                        ? 'border-primary/40 bg-primary/5'
                        : isFull
                          ? 'border-border bg-surface-2 opacity-50 cursor-not-allowed'
                          : 'border-border bg-surface hover:border-primary/30 hover:bg-primary/5',
                      isPending && !isMine ? 'opacity-60 cursor-wait' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-label={`Bli med i flight ${opt.flightNumber}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                          Flight {opt.flightNumber}
                        </span>
                        {opt.memberNames.length > 0 && (
                          <p className="mt-0.5 text-[12.5px] text-text">
                            {opt.memberNames.join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="font-sans text-xs tabular-nums text-muted">
                          {opt.memberCount}/{MAX_FLIGHT_SIZE}
                        </span>
                        {isMine && (
                          <p className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.18em] text-accent">
                            Din
                          </p>
                        )}
                        {isFull && !isMine && (
                          <p className="font-sans text-[9.5px] uppercase tracking-[0.14em] text-muted">
                            Full
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          {selectedFlight == null && (
            <p className="mt-2 text-[11.5px] text-muted">
              Du er ikke plassert i en flight ennå. Trykk «Bli med» for å velge.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
