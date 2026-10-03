import { ImageResponse } from 'next/og';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { readStoredKavalkade } from '@/lib/kavalkade/getOrCreateKavalkade';
import {
  buildKavalkadeCardModel,
  isKavalkadeCardKind,
} from '@/lib/kavalkade/cardModel';
import {
  KAVALKADE_CARD_IMAGE_WIDTH,
  computeCardHeight,
  heroFontSize,
} from '@/lib/kavalkade/cardImageLayout';
import { routing, type AppLocale } from '@/i18n/routing';
import { loadFonts } from '@/lib/og/fonts';
import { OgWordmark } from '@/lib/og/wordmark';
import {
  FOREST,
  CHAMP_DARK,
  LINEN,
  MUTED,
  TAUPE,
  CHAMP_TINT,
  CHAMP_PILL,
  HAIRLINE,
  ROW_HAIRLINE,
} from '@/lib/og/palette';

/**
 * Ett delbart kavalkade-kort som PNG (#2130, epic #1040).
 *
 * Søsteren til `leaderboard/share-image` (#942), og bygget likt: Satori via
 * `next/og`, merkepaletten fra `lib/og/palette`, fontene fra `lib/og/fonts`.
 * Filen er selvstendig, så mottakeren aldri møter en innloggingsvegg slik en
 * delt LENKE ville gitt.
 *
 * Tre ting ruta holder fast ved:
 *
 *  1. **Leser, aldri bygger.** `readStoredKavalkade` henter den frosne raden fra
 *     `kavalkades`. Finnes den ikke, er svaret 404 — et bilde-kall skal verken
 *     koste et modellkall eller skrive en rad. Før 24. desember finnes ingen
 *     rad, så kortene er utilgjengelige da uten en egen datosjekk her.
 *  2. **Bare ditt eget kort.** Spilleren leses fra sesjonen
 *     (`getProxyVerifiedUserId`), aldri fra URL-en — som på resultatkortet
 *     (#2312): ingen av kortene har noen `?p=`. En ferdig kavalkade er ikke
 *     world-read (#1542), og `facts` inneholder medspillernes tall.
 *  3. **Ingen `export const runtime`.** `cacheComponents` forbyr
 *     rute-segment-konfigurasjon; standard Node-runtime er det `ImageResponse`
 *     og admin-klienten trenger uansett.
 *
 * Alle tallene kommer fra `buildKavalkadeCardModel`. Denne fila er oppsett og
 * piksler, og regner ingenting. Bredden og høyden står i
 * `lib/kavalkade/cardImageLayout.ts`, som appens deleversjon også leser (#2265).
 */

function notFound(): Response {
  return new Response('Not found', { status: 404 });
}

/** «14. juni» i Oslo-tid, som resultatkortet. `null` når datoen mangler. */
function osloDate(iso: string | null, locale: AppLocale): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'nb-NO', {
      timeZone: 'Europe/Oslo',
      day: 'numeric',
      month: 'long',
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; year: string; kind: string }> },
): Promise<Response> {
  const { locale, year: yearParam, kind } = await params;
  if (!isKavalkadeCardKind(kind)) return notFound();

  const year = Number.parseInt(yearParam, 10);
  if (!Number.isInteger(year)) return notFound();

  const viewerUserId = await getProxyVerifiedUserId();
  if (!viewerUserId) return notFound();

  const stored = await readStoredKavalkade(viewerUserId, year);
  if (!stored) return notFound();

  const resolvedLocale: AppLocale = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;
  const t = await getTranslations({
    locale: resolvedLocale,
    namespace: 'kavalkadeShare',
  });

  const model = buildKavalkadeCardModel(stored.facts, kind, {
    t: (key, values) =>
      (t as unknown as (k: string, v?: Record<string, unknown>) => string)(key, values),
    formatDate: (iso) => osloDate(iso, resolvedLocale),
    playerFallback: t('playerFallback'),
  });
  if (!model) return notFound();

  const { fonts, hasFraunces, hasInter } = await loadFonts();
  const serif = hasFraunces ? 'Fraunces' : 'serif';
  const sans = hasInter ? 'Inter' : 'sans-serif';
  const heroSize = heroFontSize(model.hero.value);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: LINEN,
          padding: 72,
          fontFamily: sans,
        }}
      >
        {/* Header: merket til venstre, hvilket år kortet forteller om til høyre */}
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <OgWordmark fontFamily={serif} fontSize={56} fontWeight={500} />
          <div
            style={{
              display: 'flex',
              background: CHAMP_PILL,
              borderRadius: 999,
              paddingTop: 12,
              paddingBottom: 12,
              paddingLeft: 28,
              paddingRight: 28,
            }}
          >
            <span style={{ fontSize: 28, color: CHAMP_DARK }}>{model.eyebrow}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 36 }}>
          <span
            style={{
              fontFamily: serif,
              fontSize: 64,
              fontWeight: 600,
              color: FOREST,
              lineHeight: 1.12,
            }}
          >
            {model.title}
          </span>
        </div>

        <div style={{ height: 2, background: HAIRLINE, marginTop: 32, marginBottom: 8 }} />

        {/* Det ene tallet kortet handler om */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: CHAMP_TINT,
            border: `2px solid ${HAIRLINE}`,
            borderRadius: 32,
            paddingTop: 56,
            paddingBottom: 56,
            paddingLeft: 48,
            paddingRight: 48,
          }}
        >
          <span
            style={{
              fontFamily: serif,
              fontSize: heroSize,
              fontWeight: 600,
              color: FOREST,
              lineHeight: 1.06,
            }}
          >
            {model.hero.value}
          </span>
          {model.hero.caption && (
            <span style={{ fontSize: 34, color: CHAMP_DARK, marginTop: 16 }}>
              {model.hero.caption}
            </span>
          )}
        </div>

        {/* Støttelinjene */}
        {model.lines.map((line, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              paddingTop: 26,
              paddingBottom: 26,
              borderBottom: `2px solid ${ROW_HAIRLINE}`,
            }}
          >
            <span style={{ fontSize: 34, color: MUTED, flex: 1 }}>{line.label}</span>
            <span style={{ fontSize: 36, color: TAUPE, fontWeight: 500 }}>{line.value}</span>
          </div>
        ))}

        {/* Døråpneren: den som ikke har appen skal se hvor kortet kom fra */}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
          <div style={{ height: 2, background: HAIRLINE, marginBottom: 24 }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontFamily: serif, fontSize: 34, fontWeight: 500, color: FOREST }}>
              tornygolf.no
            </span>
            <span style={{ fontSize: 26, color: '#8C8475', marginTop: 8 }}>{t('tagline')}</span>
          </div>
        </div>
      </div>
    ),
    {
      width: KAVALKADE_CARD_IMAGE_WIDTH,
      height: computeCardHeight(model),
      fonts: fonts.length > 0 ? fonts : undefined,
      headers: {
        // Raden er frosset og endres aldri, men den er din alene — privat cache,
        // aldri delt CDN. Mottakeren får FILEN, ikke denne adressen.
        'Cache-Control': 'private, max-age=3600',
      },
    },
  );
}
