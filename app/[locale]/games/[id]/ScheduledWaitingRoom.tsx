'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { countdownParts } from '@/lib/i18n/format';
import { joinFlight } from './flightJoinActions';
import { MAX_FLIGHT_SIZE } from '@/lib/games/flightScope';
import type { StartBlockReason } from '@/lib/games/startBlockReasons';

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
  /**
   * #2204: why the start is held, when the page knows. The card then says so
   * instead of «Starter snart» and the promise to notify.
   */
  blockedReason?: StartBlockReason | null;
};

/**
 * #2204: blocks the player may be the one to clear (picking a flight in the
 * picker below, finishing their own profile). The card does not say it waits
 * on the organiser for these.
 */
const NOT_READY_REASONS: ReadonlySet<StartBlockReason> = new Set([
  'unassigned_flights',
  'pending_players',
]);


/**
 * Client-side countdown ticker for the "scheduled" state (Scorekort venter).
 * Updates the countdown label every 30s. The start itself is caught by
 * `GameStartListener`, which the page mounts for every scheduled game, with or
 * without a tee-off (#2219).
 *
 * #543: hvis spillet er eligible for flight-inndeling, vises en selvbetjenings-
 * velger der spillerne kan plassere seg selv i en flight.
 *
 * #2204: `blockedReason` swaps the countdown for the block. The flight picker
 * stays: placing yourself in a flight can be the very thing missing. The page
 * learns the block when it renders (E1), so a card left open over tee-off asks
 * the page again on each tick until the round starts or is blocked.
 */
export function ScheduledWaitingRoom({
  gameId,
  teeOffAt,
  flightOptions = null,
  currentFlightNumber = null,
  blockedReason = null,
}: WaitingRoomProps) {
  const blocked = blockedReason != null;
  const router = useRouter();
  const t = useTranslations('game.waitingRoom');
  const [now, setNow] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();
  const [joinError, setJoinError] = useState<string | null>(null);
  const [selectedFlight, setSelectedFlight] = useState<number | null>(
    currentFlightNumber,
  );

  // Tick every 30s to update countdown text. 30s is precise enough for
  // a ballpark "starter om X min/t" label; `GameStartListener` flips the
  // route to active well before sub-30s precision matters.
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

  const msUntil = new Date(teeOffAt).getTime() - now;
  const teeOffPassed = msUntil <= 0;

  // #2204: past tee-off and not blocked, the round is either starting or the
  // page has not looked yet. Ask the page again on each tick; a refresh runs
  // E1, which starts the round or hands this card the block. The ref holds the
  // tick already asked for, so the mount's own render, a re-render after the
  // refresh, and Next 16's Activity re-running effects on «Tilbake» never ask
  // twice for the same tick.
  const askedForTick = useRef(now);
  useEffect(() => {
    if (blocked || !teeOffPassed || askedForTick.current === now) return;
    askedForTick.current = now;
    router.refresh();
  }, [now, blocked, teeOffPassed, router]);

  const parts = countdownParts(msUntil);
  const text =
    parts.kind === 'soon'
      ? t('countdown.soon')
      : parts.kind === 'seconds'
        ? t('countdown.seconds', { n: parts.n })
        : parts.kind === 'minutes'
          ? t('countdown.minutes', { n: parts.n })
          : parts.kind === 'hoursMinutes'
            ? t('countdown.hoursMinutes', { h: parts.h, m: parts.m })
            : t('countdown.days', { n: parts.n });

  function handleJoinFlight(flightNumber: number) {
    setJoinError(null);
    startTransition(async () => {
      const result = await joinFlight(gameId, flightNumber);
      if (result.ok) {
        setSelectedFlight(flightNumber);
        router.refresh();
      } else {
        setJoinError(t(`errors.${result.error}` as Parameters<typeof t>[0]));
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Nedtelling */}
      <div className="bg-primary text-white dark:text-bg rounded-2xl px-4 py-3.5 flex items-center gap-3">
        {blocked ? (
          <div className="flex-1" data-testid="waiting-room-blocked">
            <p className="font-serif text-[15px] font-medium">
              {blockedReason && NOT_READY_REASONS.has(blockedReason)
                ? t('blocked.titleNotReady')
                : t('blocked.title')}
            </p>
            <p className="text-[11.5px] opacity-75 mt-0.5">{t('blocked.body')}</p>
          </div>
        ) : (
          <>
            <span
              className="inline-block w-2 h-2 rounded-full bg-accent animate-soft-pulse"
              aria-hidden
            />
            <div className="flex-1">
              <p className="font-serif text-[15px] font-medium">{text}</p>
              <p
                className="text-[11.5px] opacity-75 mt-0.5"
                data-testid="waiting-room-countdown-body"
              >
                {t('countdownBody')}
              </p>
            </div>
          </>
        )}
      </div>

      {/* #543: flight-velger — kun når spillet trenger inndeling */}
      {flightOptions && flightOptions.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface px-4 py-3.5">
          <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-muted mb-3">
            {t('joinFlightLabel')}
          </p>
          {joinError && (
            <p className="mb-2 rounded-lg bg-warning/10 px-3 py-2 text-[12.5px] text-warning-text">
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
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                          {t('flightLabel', { number: opt.flightNumber })}
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
                          <p className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.18em] text-accent-text">
                            {t('flightYours')}
                          </p>
                        )}
                        {isFull && !isMine && (
                          <p className="font-sans text-[9.5px] uppercase tracking-[0.14em] text-muted">
                            {t('flightFull')}
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
              {t('notInFlight')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
