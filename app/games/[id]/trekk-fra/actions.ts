'use server';

import { redirect } from 'next/navigation';
import { withdrawFromGame } from '../withdrawActions';

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

  redirect('/');
}
