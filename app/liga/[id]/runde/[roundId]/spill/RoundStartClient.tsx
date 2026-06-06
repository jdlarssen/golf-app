'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { startLeagueRoundFlight } from '@/lib/league/actions';
import type { LeagueParticipant } from '@/lib/league/getLigaSnapshot';

const ERROR_MAP: Record<string, string> = {
  need_marker: 'Du må velge minst én medspiller.',
  outside_window: 'Runden er ikke åpen for spill nå.',
  already_played: 'Du har allerede spilt denne runden.',
  round_not_ready: 'Runden mangler bane eller tee — si fra til admin.',
  not_member: 'En eller flere av de valgte er ikke deltakere i ligaen.',
  members_failed: 'Klarte ikke å hente deltakerliste. Prøv igjen om litt.',
  league_not_active: 'Ligaen er ikke aktiv.',
  round_not_found: 'Fant ikke runden.',
  league_not_found: 'Fant ikke ligaen.',
  insert_failed: 'Noe gikk galt under oppretting av flight. Prøv igjen.',
};

function errorLabel(code: string): string {
  return ERROR_MAP[code] ?? 'Noe gikk galt, prøv igjen.';
}

function playerDisplayName(p: LeagueParticipant): string {
  return p.nickname ?? p.name ?? 'Ukjent spiller';
}

export function RoundStartClient({
  roundId,
  coPlayers,
}: {
  roundId: string;
  /** All other league participants (not the current user). */
  coPlayers: LeagueParticipant[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
    if (selected.size === 0) {
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
        <Banner tone="warning">
          Ingen andre deltakere i ligaen. Du trenger minst én medspiller (markørregelen).
        </Banner>
      ) : (
        <fieldset className="space-y-2">
          <legend className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-2 block">
            Velg medspillere
          </legend>
          <ul className="space-y-2">
            {coPlayers.map((p) => {
              const checked = selected.has(p.userId);
              return (
                <li key={p.userId}>
                  <label
                    className={[
                      'flex items-center gap-3 cursor-pointer rounded-xl border px-4 py-3 transition-colors min-h-[44px]',
                      checked
                        ? 'border-primary bg-primary-soft'
                        : 'border-border bg-surface hover:bg-primary-soft/50',
                    ].join(' ')}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() => togglePlayer(p.userId)}
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
                      {playerDisplayName(p)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      {error && (
        <Banner tone="error">{errorLabel(error)}</Banner>
      )}

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        disabled={selected.size === 0 || isPending || coPlayers.length === 0}
        pending={isPending}
        pendingLabel="Starter flight …"
      >
        Start flight
      </Button>
    </form>
  );
}
