'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { addLeaguePlayers, type LeagueActionError } from '@/lib/league/actions';
import type { PlayerOption } from '@/app/[locale]/admin/games/new/GameForm';

type Props = {
  leagueId: string;
  players: PlayerOption[];
  participantIds: Set<string>;
  /** #483: klubb-liga → kilden er klubbmedlemmer (ellers vennene dine). */
  isClubLeague?: boolean;
};

const INITIAL: LeagueActionError = { error: '' };

function preferredName(p: PlayerOption): string {
  return p.nickname?.trim() || p.name?.trim() || 'Ukjent spiller';
}

export function LigaAddPlayers({ leagueId, players, participantIds, isClubLeague }: Props) {
  const [state, formAction] = useActionState(
    async (_prev: LeagueActionError, formData: FormData) =>
      addLeaguePlayers(formData) as Promise<LeagueActionError>,
    INITIAL,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const eligible = players.filter((p) => !participantIds.has(p.id));

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (eligible.length === 0) {
    // #483: klubb-liga sourcer fra klubbmedlemmer; ellers (#464) fra vennene dine.
    if (isClubLeague) {
      return (
        <p className="font-sans text-[12px] text-muted">
          {players.length === 0
            ? 'Ingen andre medlemmer i klubben ennå.'
            : 'Alle klubbmedlemmene er allerede deltakere.'}
        </p>
      );
    }
    // Skill «ingen venner ennå» (vis lenke til vennegrafen) fra «alle er med».
    return players.length === 0 ? (
      <p className="font-sans text-[12px] text-muted">
        Du har ingen venner på Tørny ennå.{' '}
        <Link href="/profile/venner" className="text-primary underline">
          Legg til venner
        </Link>{' '}
        så dukker de opp her.
      </p>
    ) : (
      <p className="font-sans text-[12px] text-muted">
        Alle vennene dine er allerede deltakere.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="league_id" value={leagueId} />
      <input
        type="hidden"
        name="player_ids"
        value={JSON.stringify(Array.from(selectedIds))}
      />

      <ul className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
        {eligible.map((p) => (
          <li key={p.id}>
            <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-transparent px-3 py-2 hover:border-border hover:bg-bg min-h-[44px]">
              <input
                type="checkbox"
                checked={selectedIds.has(p.id)}
                onChange={() => toggle(p.id)}
                className="accent-primary"
              />
              <span className="flex-1 min-w-0">
                <span className="block font-sans text-[14px] text-text truncate">
                  {preferredName(p)}
                  {p.pending && (
                    <span className="ml-1.5 font-sans text-[10px] text-muted">(venter)</span>
                  )}
                </span>
                <span className="block font-sans text-[11px] tabular-nums text-muted">
                  hcp {Number(p.hcp_index).toFixed(1)}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {state.error && state.error !== '' && (
        <p className="font-sans text-[12px] text-danger">{state.error}</p>
      )}

      <SubmitButton
        variant="secondary"
        className="w-full text-sm min-h-[44px]"
        disabled={selectedIds.size === 0}
        pendingLabel="Legger til …"
      >
        Legg til{selectedIds.size > 0 ? ` ${selectedIds.size} spiller${selectedIds.size === 1 ? '' : 'e'}` : ' spillere'}
      </SubmitButton>
    </form>
  );
}
