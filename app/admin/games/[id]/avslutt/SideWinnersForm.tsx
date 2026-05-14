'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export type PlayerOption = {
  user_id: string;
  display_name: string;
};

type Props = {
  gameId: string;
  ldCount: number;
  ctpCount: number;
  players: PlayerOption[];
  action: (formData: FormData) => void | Promise<void>;
  error?: string;
};

export function SideWinnersForm({
  gameId,
  ldCount,
  ctpCount,
  players,
  action,
  error,
}: Props) {
  return (
    <form action={action} className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          Mangler valg. Vennligst fyll inn alle vinner-feltene.
        </div>
      )}

      {ldCount > 0 && (
        <fieldset className="space-y-3">
          <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            Longest drive
          </legend>
          {Array.from({ length: ldCount }, (_, i) => i + 1).map((pos) => (
            <label key={`ld-${pos}`} className="block">
              <span className="font-serif text-base text-text">
                Longest drive #{pos}
              </span>
              <select
                name={`ld_winner_${pos}`}
                required
                defaultValue=""
                className="mt-1 block w-full rounded-md border-line bg-surface px-3 py-2"
              >
                <option value="" disabled>
                  — Velg vinner —
                </option>
                {players.map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {p.display_name}
                  </option>
                ))}
                <option value="none">Ingen kvalifiserte</option>
              </select>
            </label>
          ))}
        </fieldset>
      )}

      {ctpCount > 0 && (
        <fieldset className="space-y-3">
          <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            Closest to pin
          </legend>
          {Array.from({ length: ctpCount }, (_, i) => i + 1).map((pos) => (
            <label key={`ctp-${pos}`} className="block">
              <span className="font-serif text-base text-text">
                Closest to pin #{pos}
              </span>
              <select
                name={`ctp_winner_${pos}`}
                required
                defaultValue=""
                className="mt-1 block w-full rounded-md border-line bg-surface px-3 py-2"
              >
                <option value="" disabled>
                  — Velg vinner —
                </option>
                {players.map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {p.display_name}
                  </option>
                ))}
                <option value="none">Ingen kvalifiserte</option>
              </select>
            </label>
          ))}
        </fieldset>
      )}

      <div className="flex gap-3">
        <Button type="submit" variant="primary">
          Avslutt spillet og publiser sideturneringen
        </Button>
        <Link
          href={`/admin/games/${gameId}`}
          className="self-center text-sm text-muted underline"
        >
          Avbryt
        </Link>
      </div>
    </form>
  );
}
