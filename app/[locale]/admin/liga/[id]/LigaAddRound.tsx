'use client';

import { useActionState } from 'react';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { addLeagueRound, type LeagueActionError } from '@/lib/league/actions';

const INITIAL: LeagueActionError = { error: '' };

const ERRORS: Record<string, string> = {
  missing: 'Fyll inn både start og frist.',
  window: 'Fristen må være etter starten.',
  not_found: 'Fant ikke ligaen.',
  insert_failed: 'Klarte ikke å legge til runden. Prøv igjen.',
};

/**
 * Manual "add round" control — complements the frequency-generated rounds and
 * is the way to populate a 'custom' frequency league. Course/tee inherit from
 * the league per scope; refine the tee on the round afterwards.
 */
export function LigaAddRound({ leagueId }: { leagueId: string }) {
  const [state, action] = useActionState(
    async (_prev: LeagueActionError, formData: FormData) =>
      addLeagueRound(formData) as Promise<LeagueActionError>,
    INITIAL,
  );
  const error = state.error ? (ERRORS[state.error] ?? 'Noe gikk galt.') : null;

  return (
    <details className="rounded-xl border border-dashed border-border bg-surface/50 p-4">
      <summary className="cursor-pointer font-sans text-[13px] font-medium text-primary list-none">
        + Legg til runde
      </summary>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="league_id" value={leagueId} />
        <div>
          <label className="block font-sans text-[12px] font-medium text-text mb-1">
            Navn (valgfritt)
          </label>
          <input
            type="text"
            name="label"
            maxLength={80}
            placeholder="Runde"
            className="w-full rounded-xl border border-border bg-bg px-3 py-2 font-sans text-[14px] text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[44px]"
          />
        </div>
        {/* iOS: native datetime-local ignorerer width:100% og strekker seg
            utenfor kortet. appearance-none + min-w-0 (på input + grid-cell)
            krymper kontrollen til containeren (samme fiks som #453). */}
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className="block font-sans text-[12px] font-medium text-text mb-1">
              Åpner
            </label>
            <input
              type="datetime-local"
              name="opens_at"
              required
              className="w-full min-w-0 appearance-none rounded-xl border border-border bg-bg px-3 py-2 font-sans text-[14px] text-text focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[44px]"
            />
          </div>
          <div className="min-w-0">
            <label className="block font-sans text-[12px] font-medium text-text mb-1">
              Stenger
            </label>
            <input
              type="datetime-local"
              name="closes_at"
              required
              className="w-full min-w-0 appearance-none rounded-xl border border-border bg-bg px-3 py-2 font-sans text-[14px] text-text focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[44px]"
            />
          </div>
        </div>
        {error && <p className="font-sans text-[12px] text-danger">{error}</p>}
        <SubmitButton variant="secondary" className="text-sm px-4 py-2 min-h-[44px]" pendingLabel="Legger til …">
          Legg til runde
        </SubmitButton>
      </form>
    </details>
  );
}
