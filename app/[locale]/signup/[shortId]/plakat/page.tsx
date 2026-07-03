import QRCode from 'qrcode';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { formatDate, formatTime } from '@/lib/i18n/format';
import { getGameByShortId } from '@/lib/games/getGameByShortId';
import { isPubliclyViewable } from '@/lib/games/publicSignupVisibility';
import { localizeGameName } from '@/lib/games/autoGameName';
import { PrintButton } from './PrintButton';

type Params = Promise<{ shortId: string; locale: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { locale } = await params;
  const t = await getTranslations({
    locale: locale as AppLocale,
    namespace: 'signup.public',
  });
  return { title: t('posterMetaTitle') };
}

/**
 * Print-klar turneringsplakat (#1022) til oppslagstavla i klubbhuset: stor
 * QR-kode inn til påmeldingssiden (med `?src=plakat` for kilde-attribusjon),
 * spillnavn, bane og tee-tid. A4-tenkt via print-CSS — ingen PDF-generering.
 *
 * Offentlig route (arver /signup-segmentet i proxy.ts sitt
 * PUBLIC_PATH_PATTERN); samme synlighets-gate som landingssiden. Alt som ikke
 * er offentlig synlig sendes til selve påmeldingssiden, som eier auth-gaten
 * (#559) og status-meldingene.
 */
export default async function PlakatPage({ params }: { params: Params }) {
  const { shortId } = await params;
  const locale = await getLocale();
  const t = await getTranslations('signup.public');
  const tModes = await getTranslations('modes');

  const gameOrNull = await getGameByShortId(shortId);
  if (!gameOrNull || !isPubliclyViewable(gameOrNull)) {
    redirect({ href: `/signup/${shortId}`, locale: locale as AppLocale });
  }
  // redirect() kaster, men er ikke typet som `never` — same mønster som
  // `user!` i ../page.tsx.
  const game = gameOrNull!;

  // Absolutt prod-URL med vilje (presedens: RegistrationOverviewSection) —
  // plakaten skal virke uansett hvor den ble generert fra.
  const signupUrl = `https://tornygolf.no/signup/${shortId}?src=plakat`;
  const qrSvg = await QRCode.toString(signupUrl, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 0,
    color: { dark: '#1B4332', light: '#FFFFFF' },
  });

  const gameName = localizeGameName(
    game.name,
    game.courses?.name ?? null,
    locale as AppLocale,
  );

  let teeOff: string | null = null;
  if (game.scheduled_tee_off_at) {
    try {
      const datePart = formatDate(game.scheduled_tee_off_at, locale as AppLocale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      const timePart = formatTime(game.scheduled_tee_off_at, locale as AppLocale, {
        hour: '2-digit',
        minute: '2-digit',
      });
      teeOff = `${datePart} · ${timePart}`;
    } catch {
      teeOff = null;
    }
  }

  return (
    <div className="min-h-screen bg-bg px-4 py-8 print:bg-white print:p-0">
      <div
        className="mx-auto flex max-w-[520px] flex-col items-center rounded-2xl border border-border bg-surface px-8 py-10 text-center print:max-w-none print:rounded-none print:border-0"
        data-testid="poster"
      >
        <div className="flex items-start gap-1">
          <span className="font-serif text-3xl font-medium tracking-tight text-text">
            Tørny
          </span>
          <span
            aria-hidden="true"
            className="mt-2.5 h-[4px] w-[4px] shrink-0 rounded-full bg-accent"
          />
        </div>

        <p className="mt-8 font-sans text-xs uppercase tracking-[0.18em] text-muted">
          {tModes(game.game_mode as Parameters<typeof tModes>[0])}
        </p>
        <h1 className="mt-2 font-serif text-4xl font-medium leading-tight tracking-[-0.015em] text-text">
          {gameName}
        </h1>

        <div className="mt-3 space-y-1 font-sans text-base text-muted">
          {game.courses?.name && <p>{game.courses.name}</p>}
          {teeOff && <p>{teeOff}</p>}
        </div>

        <div
          className="mt-8 w-[220px] print:w-[240px]"
          // Server-generert SVG fra qrcode-biblioteket — statisk innhold fra
          // vår egen URL, ingen brukerdata.
          dangerouslySetInnerHTML={{ __html: qrSvg }}
          data-testid="poster-qr"
        />

        <p className="mt-4 font-sans text-sm font-medium text-text">
          {t('posterScanHint')}
        </p>
        <p className="mt-1 font-sans text-xs text-muted">
          tornygolf.no/signup/{shortId}
        </p>

        <p className="mt-8 font-sans text-xs text-muted">
          {t('posterFooter')}
        </p>
      </div>

      <div className="mx-auto mt-6 max-w-[520px]">
        <PrintButton />
      </div>
    </div>
  );
}
