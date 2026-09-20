'use client';

import { useLocale, useTranslations } from 'next-intl';
import { routing } from '@/i18n/routing';
import { useSharePng } from '@/lib/share/useSharePng';
import { kavalkadeCardImageUrl, type KavalkadeCardKind } from '@/lib/kavalkade/cardModel';
import { logKavalkadeShare } from '@/app/[locale]/kavalkade/shareActions';

/**
 * «Del kortet» på ett kavalkade-kort (#2130, epic #1040).
 *
 * Egen komponent, montert per kort av siden (K3, #2129). Den gjør tre ting og
 * ikke mer: peker på kortets bilde-rute, deler PNG-en gjennom den felles
 * `useSharePng`, og teller delingen.
 *
 * Selv-gating: ruta svarer 404 når kortet ikke har noe å vise (ingen lagret
 * kavalkade, eller et faktum som mangler for akkurat dette kortet), og da blir
 * knappen aldri synlig. Siden trenger derfor ingen egen sjekk før den monterer
 * knappen.
 *
 * Tellingen er best-effort: en server-action som feiler skal ikke ta fra
 * spilleren en deling som gikk fint, så vi venter ikke på den og viser ingen
 * feil.
 */
export function ShareKavalkadeCardButton({
  year,
  kind,
}: {
  year: number;
  kind: KavalkadeCardKind;
}) {
  const t = useTranslations('kavalkadeShare');
  const locale = useLocale();

  const { ready, busy, share } = useSharePng({
    imageUrl: kavalkadeCardImageUrl(locale, routing.defaultLocale, year, kind),
    fileName: `torny-kavalkade-${year}-${kind}.png`,
    shareText: t('shareText'),
    onShared: () => {
      void logKavalkadeShare(year, kind);
    },
  });

  if (!ready) return null;

  return (
    <button
      type="button"
      onClick={() => void share()}
      disabled={busy}
      data-testid={`share-kavalkade-card-${kind}`}
      className="inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-5 py-2.5 text-sm font-medium tracking-tight text-white transition-[background-color,transform,opacity] duration-100 hover:bg-primary-hover disabled:opacity-60 dark:text-bg"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
        <path d="M12 3v13" />
        <path d="m7 8 5-5 5 5" />
      </svg>
      {t('shareCard')}
    </button>
  );
}
