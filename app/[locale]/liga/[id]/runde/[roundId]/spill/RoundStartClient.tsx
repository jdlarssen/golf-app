'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { startLeagueRoundFlight } from '@/lib/league/actions';
import { MAX_CO_PLAYERS, MAX_FLIGHT_PLAYERS, minFlightPlayers } from '@/lib/league/flightRules';
import type { LeagueParticipant } from '@/lib/league/getLigaSnapshot';

/**
 * #2214: a co-player who has delivered the round or is playing it in another
 * flight cannot be put in a new flight (roundPlayerLocks; the server refuses
 * with `co_player_locked`). Null = free to pick.
 */
export type RoundCoPlayer = LeagueParticipant & { lock: 'delivered' | 'in_progress' | null };

function playerDisplayName(p: LeagueParticipant, unknownLabel: string): string {
  return p.nickname ?? p.name ?? unknownLabel;
}

export function RoundStartClient({
  roundId,
  coPlayers,
  isSimulator,
}: {
  roundId: string;
  /** All other league participants (not the current user). */
  coPlayers: RoundCoPlayer[];
  /** #2638: a simulator league lets the player start alone. */
  isSimulator: boolean;
}) {
  const t = useTranslations('liga.player.runde');
  // The marker rule's one home (flightRules): co-players needed besides you.
  const minCoPlayers = minFlightPlayers(isSimulator) - 1;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // A flight holds MAX_FLIGHT_PLAYERS (flightRules): with MAX_CO_PLAYERS
  // ticked, the free rows left are disabled; the server refuses more anyway.
  const full = selected.size >= MAX_CO_PLAYERS;
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function togglePlayer(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.size < minCoPlayers) {
      setError('need_marker');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await startLeagueRoundFlight(roundId, Array.from(selected));
      // On success the action redirects to /games/[id] — we only land here on error.
      if (result.error) {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Co-player picker */}
      {coPlayers.length === 0 ? (
        minCoPlayers > 0 && (
          <Banner tone="warning">
            {t('noCoPlayers')}
          </Banner>
        )
      ) : (
        <fieldset className="space-y-2">
          <legend className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-2 block">
            {t('coPlayersLegend')}
          </legend>
          <ul className="space-y-2">
            {coPlayers.map((p) => {
              const locked = p.lock !== null;
              const checked = !locked && selected.has(p.userId);
              const blocked = !locked && !checked && full;
              const disabled = locked || blocked;
              return (
                <li key={p.userId}>
                  <label
                    data-testid={`liga-round-start-player-${p.userId}`}
                    data-locked={p.lock ?? undefined}
                    data-full={blocked ? 'true' : undefined}
                    aria-disabled={disabled ? 'true' : undefined}
                    className={[
                      'flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors min-h-[44px]',
                      disabled
                        ? 'cursor-not-allowed border-border bg-surface opacity-60'
                        : checked
                          ? 'cursor-pointer border-primary bg-primary-soft'
                          : 'cursor-pointer border-border bg-surface hover:bg-primary-soft/50',
                    ].join(' ')}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => {
                        if (!disabled) togglePlayer(p.userId);
                      }}
                    />
                    {/* Visual checkbox */}
                    <span
                      className={[
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                        checked ? 'border-primary bg-primary' : 'border-border bg-bg',
                      ].join(' ')}
                      aria-hidden
                    >
                      {checked && (
                        <svg
                          viewBox="0 0 10 8"
                          className="h-2.5 w-2.5 text-white dark:text-bg"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M1 4l3 3 5-6" />
                        </svg>
                      )}
                    </span>
                    <span className="font-sans text-sm text-text">
                      {playerDisplayName(p, t('unknownPlayer'))}
                    </span>
                    {locked && (
                      <span className="ml-auto font-sans text-xs text-muted">
                        {p.lock === 'delivered' ? t('lockDelivered') : t('lockInProgress')}
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="font-sans text-[12px] leading-[18px] text-muted" data-testid="liga-round-start-flight-max">
            {t('flightMax', { max: MAX_FLIGHT_PLAYERS })}
          </p>
        </fieldset>
      )}

      {error && (
        <Banner tone="error">
          {t.has(`errorMap.${error}` as Parameters<typeof t>[0])
            ? t(`errorMap.${error}` as Parameters<typeof t>[0], { max: MAX_FLIGHT_PLAYERS })
            : t('errorMap.fallback')}
        </Banner>
      )}

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        data-testid="liga-round-start-submit"
        disabled={selected.size < minCoPlayers || isPending}
        pending={isPending}
        pendingLabel={t('startPending')}
      >
        {t('startButton')}
      </Button>
    </form>
  );
}
