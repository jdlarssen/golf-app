import { ImageResponse } from 'next/og';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { routing, type AppLocale } from '@/i18n/routing';
import { loadFonts } from '@/lib/og/fonts';
import { FOREST, CHAMP, LINEN } from '@/lib/og/palette';

/**
 * Root brand OG-image (#1264) — static Tørny brand card shown on link
 * previews for every page under `app/[locale]/` that doesn't declare its own.
 * `signup/[shortId]` keeps its own dynamic OG image (Next's file convention:
 * a child segment's `opengraph-image.tsx` overrides this one).
 *
 * No `export const runtime` — cacheComponents forbids route-segment runtime
 * config; default Node runtime is what `ImageResponse` needs.
 */

export const alt = 'Tørny';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const resolvedLocale: AppLocale = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;

  const [tBrand, { fonts, hasFraunces, hasInter }] = await Promise.all([
    // Brand-taglinen bor kanonisk i shareCard-namespacet — samme kilde som
    // signup/[shortId]/opengraph-image.tsx bruker, framfor en tredje
    // katalog-kopi som kan drifte.
    getTranslations({ locale: resolvedLocale, namespace: 'leaderboard.shareCard' }),
    loadFonts(),
  ]);

  const serif = hasFraunces ? 'Fraunces' : 'serif';
  const sans = hasInter ? 'Inter' : 'sans-serif';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          background: FOREST,
          paddingLeft: 96,
          paddingRight: 96,
          fontFamily: sans,
        }}
      >
        <span
          style={{
            fontFamily: serif,
            fontSize: 108,
            fontWeight: 600,
            color: LINEN,
          }}
        >
          Tørny
        </span>
        <div
          style={{
            width: 96,
            height: 4,
            borderRadius: 4,
            background: CHAMP,
            marginTop: 28,
            marginBottom: 28,
            display: 'flex',
          }}
        />
        <span style={{ fontSize: 34, color: LINEN, opacity: 0.85 }}>
          {tBrand('tagline')}
        </span>
      </div>
    ),
    // Tom fonts-array krasjer Satori («No fonts are loaded»); utelatt option
    // faller tilbake til next/og sin innebygde default-font.
    { ...size, ...(fonts.length > 0 ? { fonts } : {}) },
  );
}
