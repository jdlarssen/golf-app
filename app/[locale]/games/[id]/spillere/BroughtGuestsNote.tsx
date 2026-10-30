import { getLocale, getTranslations } from 'next-intl/server';
import { formatListLocale } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';

/**
 * #2607 (eierens svar 2): den dempede linja under en spiller som meldte på
 * gjester, på arrangørens «Styr spillere». Fjerner arrangøren spilleren, går
 * gjestene også (`removePlayerFromGame`), og linja sier det før trykket.
 * «Fjern» er som før. Samme stil som tilstandslinja på raden.
 *
 * `guestNames` er tom eller mangler for alle andre enn verten, og da vises
 * ingenting.
 */
export async function BroughtGuestsNote({
  guestNames,
  playerName,
}: {
  guestNames: string[] | undefined;
  playerName: string;
}) {
  if (!guestNames || guestNames.length === 0) return null;
  const t = await getTranslations('game.players');
  const locale = (await getLocale()) as AppLocale;
  return (
    <p className="mt-0.5 text-xs text-muted" data-testid="brought-guests-note">
      {t('broughtGuestsNote', {
        count: guestNames.length,
        names: formatListLocale(guestNames, locale),
        player: playerName,
      })}
    </p>
  );
}
