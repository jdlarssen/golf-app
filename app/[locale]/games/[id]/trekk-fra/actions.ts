'use server';

import { redirect } from 'next/navigation';
import { withdrawFromGame, undoWithdraw } from '../withdrawActions';

/**
 * Form-handler wrapper rundt `withdrawFromGame`. Eksisterer kun fordi `<form
 * action={...}>` krever en FormData-signatur og withdrawFromGame tar
 * en gameId-string direkte (lettere å unit-teste). Ved suksess sender vi
 * brukeren til startsiden — påmeldingen finnes ikke lenger så `/games/[id]`
 * ville notFound() rendere.
 *
 * Ved feil: redirect tilbake til `/games/[id]/trekk-fra?error=withdraw_failed`
 * så confirm-siden re-rendrer med en error-banner.
 */
export async function submitWithdraw(formData: FormData): Promise<void> {
  const gameId = String(formData.get('gameId') ?? '');
  if (!gameId) {
    redirect('/');
  }

  const result = await withdrawFromGame(gameId);
  if (!result.ok) {
    redirect(`/games/${gameId}/trekk-fra?error=withdraw_failed`);
  }

  // Active withdrawal keeps the row → land on game home to show «Du har
  // trukket deg» + angre. Pre-start deletes the row → game home would 404,
  // so go to the app home instead.
  redirect(result.kept ? `/games/${gameId}` : '/');
}

/**
 * Angre WD-knapp på game-home og hull-siden (#386 chunk 3).
 *
 * FormData-wrapper rundt `undoWithdraw`. Ved suksess redirecter vi til
 * `/games/[id]` slik at angre-banneret forsvinner og scorekort åpner på nytt.
 */
export async function submitUndoWithdraw(formData: FormData): Promise<void> {
  const gameId = String(formData.get('gameId') ?? '');
  if (!gameId) {
    redirect('/');
  }

  const result = await undoWithdraw(gameId);
  if (!result.ok) {
    // Best-effort: gå tilbake til game home; brukeren kan prøve igjen.
    redirect(`/games/${gameId}`);
  }

  redirect(`/games/${gameId}`);
}
