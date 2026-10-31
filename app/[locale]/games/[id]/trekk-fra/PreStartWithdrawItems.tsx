import { getLocale, getTranslations } from 'next-intl/server';
import { formatListLocale } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';

/**
 * «Dette skjer» før start: det kjernen (`lib/games/withdrawSelf.ts`) gjør når
 * spilleren trykker «Trekk meg».
 *
 * `captain` er `captainWithdrawalState` for en kaptein, ellers `null`.
 * #2358: en kapteins påmelding merkes trukket, ikke slettet, og kapteinen
 * melder seg ikke på igjen selv (eierens svar 2). #2607: gjestene spilleren
 * meldte på trekkes med og navngis, både kapteinens og gjesten en spiller tok
 * med alene (`guestNames`); linja om ubesvarte invitasjoner gjelder bare
 * lagkamerater med konto.
 */
export async function PreStartWithdrawItems({
  captain,
  guestNames,
}: {
  captain: { marksRequest: boolean; unanswered: number } | null;
  guestNames: string[];
}) {
  const t = await getTranslations('game.withdraw');
  const locale = (await getLocale()) as AppLocale;
  return (
    <ul className="space-y-1 font-sans text-[13px] text-text" data-testid="withdraw-pre-start-items">
      <li>{t('preStartItems.registrationDeleted')}</li>
      {!captain ? (
        <li>{t('preStartItems.requestDeleted')}</li>
      ) : captain.marksRequest ? (
        <li>{t('preStartItems.captainRequestWithdrawn')}</li>
      ) : null}
      <li>{t('preStartItems.teamNotified')}</li>
      {captain && captain.unanswered > 0 && (
        <li>{t('preStartItems.unansweredInvitesWithdrawn')}</li>
      )}
      {guestNames.length > 0 && (
        <li data-testid="withdraw-guests-item">
          {t('preStartItems.guestsWithdrawn', {
            count: guestNames.length,
            names: formatListLocale(guestNames, locale),
          })}
        </li>
      )}
    </ul>
  );
}
