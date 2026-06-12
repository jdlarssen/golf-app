'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { suggestFlightAssignment, setPlayerFlight } from './flightActions';
import { MAX_FLIGHT_SIZE } from '@/lib/games/flightScope';
import { MiniRibbon } from '@/components/ui/MiniRibbon';
import { SubmitButton } from '@/components/ui/SubmitButton';

type FlightPlayerDisplay = {
  user_id: string;
  displayName: string;
  flight_number: number | null;
};

type Props = {
  gameId: string;
  players: FlightPlayerDisplay[];
};

/**
 * Flighter-seksjonen i Sekretariatet (#543).
 *
 * Vises kun når spillet er eligible for flight-inndeling (>4 aktive, ikke wolf,
 * scheduled eller active). Gir admin/oppretter to verktøy:
 *   1. «Foreslå inndeling»-knapp — kjører suggestFlightSplit og skriver til DB.
 *   2. Per-spiller flight-velger — select med flights 1..N+1 (N = maks nødvendig
 *      + én tom flight for å muliggjøre 3+3-fordeling istedenfor 4+2).
 */
export function FlighterSeksjon({ gameId, players }: Props) {
  const t = useTranslations('admin.game.flights');
  const [isPending, startTransition] = useTransition();

  const activePlayers = players; // allerede filtrert på server-side
  const maxFlight = Math.ceil(activePlayers.length / MAX_FLIGHT_SIZE);
  // +1 ekstra tom flight gir oppretter mulighet for 3+3 i stedet for 4+2
  const flightOptions = Array.from({ length: maxFlight + 1 }, (_, i) => i + 1);

  // Bucket-visning: grupper på flight_number
  const byFlight = new Map<number, FlightPlayerDisplay[]>();
  const unassigned: FlightPlayerDisplay[] = [];
  for (const p of activePlayers) {
    if (p.flight_number == null) {
      unassigned.push(p);
    } else {
      const bucket = byFlight.get(p.flight_number) ?? [];
      bucket.push(p);
      byFlight.set(p.flight_number, bucket);
    }
  }

  const suggestAction = suggestFlightAssignment.bind(null, gameId);

  return (
    <section className="mt-1.5">
      <MiniRibbon>{t('sectionLabel')}</MiniRibbon>
      <div
        className="overflow-hidden rounded-xl border border-border bg-surface"
        style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
      >
        <div className="px-3.5 pt-3 pb-3.5 space-y-4">
          {/* Bucket-oversikt */}
          {byFlight.size > 0 && (
            <div className="space-y-2">
              {Array.from(byFlight.entries())
                .sort(([a], [b]) => a - b)
                .map(([flightNum, members]) => (
                  <div
                    key={flightNum}
                    className="rounded-xl border border-border px-3 py-2.5"
                  >
                    <p className="mb-0.5 font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                      {t('flightOptionN', { n: flightNum })}{' '}
                      <span className="tabular-nums text-muted">
                        ({members.length}/{MAX_FLIGHT_SIZE})
                      </span>
                    </p>
                    <p className="text-sm text-text">
                      {members.map((m) => m.displayName).join(', ')}
                    </p>
                  </div>
                ))}
            </div>
          )}

          {/* Uten flight */}
          {unassigned.length > 0 && (
            <div className="rounded-xl border border-warning/30 bg-warning/5 px-3 py-2.5">
              <p className="mb-0.5 font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-warning">
                {t('unassignedLabel', { n: unassigned.length })}
              </p>
              <p className="text-sm text-text">
                {unassigned.map((m) => m.displayName).join(', ')}
              </p>
            </div>
          )}

          {/* Foreslå inndeling */}
          <form
            action={suggestAction}
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(() => suggestAction());
            }}
          >
            <SubmitButton
              className="w-full"
              pendingLabel={t('suggestingBusy')}
              disabled={isPending}
            >
              {t('suggestButton')}
            </SubmitButton>
          </form>

          {/* Per-spiller-justering */}
          <div>
            <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              {t('movePlayerLabel')}
            </p>
            <div className="space-y-2">
              {activePlayers.map((player) => {
                const moveAction = setPlayerFlight.bind(null, gameId, player.user_id);
                return (
                  <form
                    key={player.user_id}
                    className="flex items-center gap-2.5 min-h-[44px]"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      const fl = Number(fd.get('flight'));
                      if (fl) {
                        startTransition(() => moveAction(fl));
                      }
                    }}
                  >
                    <span className="flex-1 text-sm text-text truncate">
                      {player.displayName}
                    </span>
                    <select
                      name="flight"
                      defaultValue={player.flight_number ?? ''}
                      className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
                      disabled={isPending}
                      aria-label={t('flightAriaLabel', { name: player.displayName })}
                    >
                      <option value="">—</option>
                      {flightOptions.map((f) => (
                        <option key={f} value={f}>
                          {t('flightOptionN', { n: f })}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      disabled={isPending}
                      className="min-h-[44px] min-w-[44px] rounded-lg border border-border bg-surface px-2.5 py-1.5 font-sans text-xs font-medium text-primary hover:bg-surface-2 disabled:opacity-50"
                    >
                      {t('moveButton')}
                    </button>
                  </form>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
