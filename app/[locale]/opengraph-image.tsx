import { ImageResponse } from 'next/og';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { routing, type AppLocale } from '@/i18n/routing';
import { loadFonts } from '@/lib/og/fonts';
import { FOREST, CHAMP, LINEN, MUTED, HAIRLINE } from '@/lib/og/palette';

/**
 * Root OG share image (#1264) — the brand card WhatsApp/Messenger/Facebook
 * show when any public page is shared (front page, format guide, courses, …).
 * Next 16's `opengraph-image` file convention generates the og:image tags
 * automatically and applies this to the whole `[locale]` subtree; the signup
 * page keeps its own dynamic image (the child convention wins).
 *
 * Generic brand-only — no game/user data (unlike the signup image), because
 * this stands in for many different pages. Reuses `lib/og/*` for palette +
 * font loading (same pattern as the signup image's no-data branch).
 *
 * No `export const runtime` — cacheComponents forbids route-segment runtime
 * config; the default Node runtime is what ImageResponse needs.
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
    // The brand tagline lives canonically in the share-card namespace —
    // reused here rather than a third catalog copy that could drift.
    getTranslations({
      locale: resolvedLocale,
      namespace: 'leaderboard.shareCard',
    }),
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
          background: LINEN,
          paddingTop: 64,
          paddingBottom: 56,
          paddingLeft: 80,
          paddingRight: 80,
          fontFamily: sans,
        }}
      >
        {/* Brand lockup */}
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <span
            style={{
              fontFamily: serif,
              fontSize: 44,
              fontWeight: 600,
              color: FOREST,
            }}
          >
            Tørny
          </span>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 8,
              background: CHAMP,
              marginTop: 14,
              marginLeft: 6,
              display: 'flex',
            }}
          />
        </div>

        {/* Centered brand statement */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontFamily: serif,
              fontSize: 96,
              fontWeight: 600,
              color: FOREST,
              lineHeight: 1.05,
            }}
          >
            Tørny
          </span>
          <span style={{ fontSize: 38, color: MUTED, marginTop: 20 }}>
            {tBrand('tagline')}
          </span>
        </div>

        {/* Footer pinned to bottom */}
        <div
          style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}
        >
          <div
            style={{
              height: 2,
              background: HAIRLINE,
              marginBottom: 22,
              display: 'flex',
            }}
          />
          <span
            style={{
              fontFamily: serif,
              fontSize: 30,
              fontWeight: 500,
              color: FOREST,
            }}
          >
            tornygolf.no
          </span>
        </div>
      </div>
    ),
    // Empty fonts array crashes Satori («No fonts are loaded»); omitting the
    // option falls back to next/og's built-in default. Font fetch is
    // best-effort (Google Fonts may be unreachable).
    { ...size, ...(fonts.length > 0 ? { fonts } : {}) },
  );
}
