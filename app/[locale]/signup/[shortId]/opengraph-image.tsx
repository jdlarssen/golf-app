import { ImageResponse } from 'next/og';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { routing, type AppLocale } from '@/i18n/routing';
import { getGameByShortId } from '@/lib/games/getGameByShortId';
import { isPubliclyViewable } from '@/lib/games/publicSignupVisibility';
import { localizeGameName } from '@/lib/games/autoGameName';
import { loadFonts } from '@/lib/og/fonts';
import { FOREST, CHAMP, LINEN, MUTED, CHAMP_TINT, HAIRLINE } from '@/lib/og/palette';

/**
 * OG-delebilde for den offentlige påmeldingssiden (#1022) — det WhatsApp/
 * Messenger/Facebook viser når noen deler `/signup/[shortId]`. Next 16-
 * filkonvensjonen genererer og:image-taggene automatisk.
 *
 * Synlighets-gaten er den samme som landingssiden (`isPubliclyViewable`);
 * ikke-synlige spill får et generisk brand-bilde uten spilldata (kontrakt-
 * beslutning 6) — OG-scrapere er uinnloggede og cacher, så bildet skal aldri
 * bære mer enn landingssiden selv viser.
 *
 * No `export const runtime` — cacheComponents forbyr route-segment runtime-
 * config; default Node-runtime er det ImageResponse trenger.
 */

export const alt = 'Tørny';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ locale: string; shortId: string }>;
}) {
  const { locale, shortId } = await params;
  const resolvedLocale: AppLocale = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;

  const [t, tBrand, tModes, game, { fonts, hasFraunces, hasInter }] =
    await Promise.all([
      getTranslations({ locale: resolvedLocale, namespace: 'signup.public' }),
      // Brand-taglinen bor kanonisk i shareCard-namespacet — gjenbrukt her
      // framfor en tredje katalog-kopi som kan drifte.
      getTranslations({ locale: resolvedLocale, namespace: 'leaderboard.shareCard' }),
      getTranslations({ locale: resolvedLocale, namespace: 'modes' }),
      getGameByShortId(shortId),
      loadFonts(),
    ]);

  const serif = hasFraunces ? 'Fraunces' : 'serif';
  const sans = hasInter ? 'Inter' : 'sans-serif';

  const isPublic = game != null && isPubliclyViewable(game);

  // Satori wraps on spaces but clips long unbroken tokens — cap the name so
  // it stays ≤2 lines at 68px (same discipline as the share card's 30@64px).
  const rawName = isPublic
    ? localizeGameName(game.name, game.courses?.name ?? null, resolvedLocale)
    : null;
  const gameName =
    rawName && rawName.length > 34 ? `${rawName.slice(0, 33).trimEnd()}…` : rawName;

  const dateLabel =
    isPublic && game.scheduled_tee_off_at
      ? new Intl.DateTimeFormat(resolvedLocale === 'en' ? 'en-GB' : 'nb-NO', {
          timeZone: 'Europe/Oslo',
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(game.scheduled_tee_off_at))
      : null;

  const metaParts = isPublic
    ? [game.courses?.name ?? null, dateLabel].filter(Boolean)
    : [];

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
            style={{ fontFamily: serif, fontSize: 44, fontWeight: 600, color: FOREST }}
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

        {isPublic ? (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 56 }}>
            <span
              style={{
                fontSize: 26,
                textTransform: 'uppercase',
                letterSpacing: 4,
                color: MUTED,
              }}
            >
              {tModes(game.game_mode as Parameters<typeof tModes>[0])}
            </span>
            <span
              style={{
                fontFamily: serif,
                fontSize: 68,
                fontWeight: 600,
                color: FOREST,
                lineHeight: 1.12,
                marginTop: 12,
              }}
            >
              {gameName}
            </span>
            {metaParts.length > 0 && (
              <span style={{ fontSize: 32, color: MUTED, marginTop: 18 }}>
                {metaParts.join(' · ')}
              </span>
            )}
            <div style={{ display: 'flex', marginTop: 40 }}>
              <span
                style={{
                  background: CHAMP_TINT,
                  border: `2px solid ${HAIRLINE}`,
                  borderRadius: 999,
                  paddingTop: 16,
                  paddingBottom: 16,
                  paddingLeft: 36,
                  paddingRight: 36,
                  fontSize: 32,
                  fontWeight: 500,
                  color: FOREST,
                }}
              >
                {t('ogCta')}
              </span>
            </div>
          </div>
        ) : (
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
                fontSize: 84,
                fontWeight: 600,
                color: FOREST,
              }}
            >
              Tørny
            </span>
            <span style={{ fontSize: 36, color: MUTED, marginTop: 18 }}>
              {tBrand('tagline')}
            </span>
          </div>
        )}

        {/* Footer pinned to bottom */}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
          <div style={{ height: 2, background: HAIRLINE, marginBottom: 22, display: 'flex' }} />
          <span style={{ fontFamily: serif, fontSize: 30, fontWeight: 500, color: FOREST }}>
            tornygolf.no
          </span>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
