'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { suggestTeamAssignment, setPlayerTeam } from './flightActions';
import { MiniRibbon } from '@/components/ui/MiniRibbon';
import { SubmitButton } from '@/components/ui/SubmitButton';

type TeamPlayerDisplay = {
  user_id: string;
  displayName: string;
  team_number: number | null;
};

type Props = {
  gameId: string;
  players: TeamPlayerDisplay[];
  teamSize: number;
};

/**
 * Lag-seksjonen i Sekretariatet (#1669) — tvillingen til FlighterSeksjon.
 *
 * Vises kun for lag-formater (`modeRequiresTeamNumber`) i scheduled/active.
 * Gir admin/oppretter to verktøy:
 *   1. «Foreslå laginndeling» — fyller lag for dem som mangler, uten å røre
 *      par som allerede har meldt seg på sammen.
 *   2. Per-spiller lag-velger — lag 1..N+1 (N = maks nødvendig + ett tomt lag
 *      så man kan splitte 3+3 i stedet for 4+2).
 */
export function LagSeksjon({ gameId, players, teamSize }: Props) {
  const t = useTranslations('admin.game.teams');
  const [isPending, startTransition] = useTransition();

  const activePlayers = players; // allerede filtrert server-side
  const maxTeam = Math.max(
    Math.ceil(activePlayers.length / Math.max(teamSize, 1)),
    ...activePlayers.map((p) => p.team_number ?? 0),
    1,
  );
  const teamOptions = Array.from({ length: maxTeam + 1 }, (_, i) => i + 1);

  const byTeam = new Map<number, TeamPlayerDisplay[]>();
  const unassigned: TeamPlayerDisplay[] = [];
  for (const p of activePlayers) {
    if (p.team_number == null) {
      unassigned.push(p);
    } else {
      const bucket = byTeam.get(p.team_number) ?? [];
      bucket.push(p);
      byTeam.set(p.team_number, bucket);
    }
  }

  const suggestAction = suggestTeamAssignment.bind(null, gameId);

  return (
    <section className="mt-1.5" data-testid="team-section">
      <MiniRibbon>{t('sectionLabel')}</MiniRibbon>
      <div
        className="overflow-hidden rounded-xl border border-border bg-surface"
        style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
      >
        <div className="px-3.5 pt-3 pb-3.5 space-y-4">
          {/* Lag-oversikt */}
          {byTeam.size > 0 && (
            <div className="space-y-2">
              {Array.from(byTeam.entries())
                .sort(([a], [b]) => a - b)
                .map(([teamNum, members]) => (
                  <div
                    key={teamNum}
                    className="rounded-xl border border-border px-3 py-2.5"
                  >
                    <p className="mb-0.5 font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                      {t('teamOptionN', { n: teamNum })}{' '}
                      <span className="tabular-nums text-muted">
                        ({members.length}/{teamSize})
                      </span>
                    </p>
                    <p className="text-sm text-text">
                      {members.map((m) => m.displayName).join(', ')}
                    </p>
                  </div>
                ))}
            </div>
          )}

          {/* Uten lag */}
          {unassigned.length > 0 && (
            <div className="rounded-xl border border-warning/30 bg-warning/5 px-3 py-2.5">
              <p className="mb-0.5 font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-warning-text">
                {t('unassignedLabel', { n: unassigned.length })}
              </p>
              <p className="text-sm text-text">
                {unassigned.map((m) => m.displayName).join(', ')}
              </p>
            </div>
          )}

          {/* Foreslå laginndeling */}
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
              data-testid="team-suggest"
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
                const moveAction = setPlayerTeam.bind(null, gameId, player.user_id);
                return (
                  <form
                    key={player.user_id}
                    className="flex items-center gap-2.5 min-h-[44px]"
                    data-testid={`team-move-${player.user_id}`}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      const team = Number(fd.get('team'));
                      if (team) {
                        startTransition(() => moveAction(team));
                      }
                    }}
                  >
                    <span className="flex-1 text-sm text-text truncate">
                      {player.displayName}
                    </span>
                    <select
                      name="team"
                      defaultValue={player.team_number ?? ''}
                      className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text focus:ring-2 focus:ring-primary/30"
                      disabled={isPending}
                      aria-label={t('teamAriaLabel', { name: player.displayName })}
                    >
                      <option value="">—</option>
                      {teamOptions.map((n) => (
                        <option key={n} value={n}>
                          {t('teamOptionN', { n })}
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
