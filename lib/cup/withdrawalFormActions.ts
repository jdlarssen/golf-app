'use server';

import { redirect } from 'next/navigation';
import {
  undoCupWithdrawal,
  withdrawCupPlayer,
  withdrawSelfFromCup,
} from './withdrawalActions';

/**
 * Form-handler-wrappere rundt trekk-handlingene (#1814).
 *
 * Eksisterer kun fordi `<form action={…}>` krever en `Promise<void>`-signatur,
 * mens handlingene returnerer `{ error: kode }` så et klient-panel
 * (`FourballPlayOnPanel`) kan vise feilen uten å unmontere seg selv. Samme
 * presedens som `app/[locale]/games/[id]/trekk-fra/actions.ts`.
 *
 * Suksess kaster NEXT_REDIRECT inne i handlingen selv; kommer vi tilbake med en
 * feilkode, sender vi brukeren til den samme bekreftelsessiden med `?error=`
 * så banneret rendres der hen står — aldri en stille no-op.
 */

/** `?error=`-målet når en handling avslår. Bekreftelsessiden leser koden. */
function backTo(path: string, code: string): never {
  redirect(`${path}?error=${encodeURIComponent(code)}`);
}

export async function submitCupWithdrawal(formData: FormData): Promise<void> {
  const result = await withdrawCupPlayer(formData);
  const tournamentId = String(formData.get('tournament_id') ?? '');
  const userId = String(formData.get('user_id') ?? '');
  const groupId = String(formData.get('group_id') ?? '');
  const base = groupId
    ? `/klubber/${groupId}/cup/${tournamentId}/trekk/${userId}`
    : `/admin/cup/${tournamentId}/trekk/${userId}`;
  backTo(base, result.error || 'withdraw_failed');
}

export async function submitUndoCupWithdrawal(formData: FormData): Promise<void> {
  const result = await undoCupWithdrawal(formData);
  const tournamentId = String(formData.get('tournament_id') ?? '');
  const userId = String(formData.get('user_id') ?? '');
  const groupId = String(formData.get('group_id') ?? '');
  const base = groupId
    ? `/klubber/${groupId}/cup/${tournamentId}/trekk/${userId}`
    : `/admin/cup/${tournamentId}/trekk/${userId}`;
  backTo(base, result.error || 'withdraw_failed');
}

export async function submitSelfCupWithdrawal(formData: FormData): Promise<void> {
  const result = await withdrawSelfFromCup(formData);
  const tournamentId = String(formData.get('tournament_id') ?? '');
  backTo(`/cup/${tournamentId}/trekk`, result.error || 'withdraw_failed');
}
