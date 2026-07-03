import { ImageResponse } from 'next/og';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getGameWithPlayers } from '@/lib/games/getGameWithPlayers';
import { buildModeResultForGame } from '@/lib/scoring/buildModeResultForGame';
import {
  buildShareCardData,
  type ShareCardModel,
  type ShareCardScore,
  type ShareCardMatchHeadline,
} from '@/lib/games/buildShareCardData';
import { formatRevealName } from '@/lib/names/formatRevealName';
import { localizeGameName } from '@/lib/games/autoGameName';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { computeSharerSideAwards } from '@/lib/games/computeSharerSideAwards';
import { routing, type AppLocale } from '@/i18n/routing';
import { loadFonts } from '@/lib/og/fonts';
import {
  FOREST,
  CHAMP,
  CHAMP_DARK,
  LINEN,
  MUTED,
  TAUPE,
  CHAMP_TINT,
  CHAMP_PILL,
  DISC,
  WHITE,
  HAIRLINE,
  ROW_HAIRLINE,
} from '@/lib/og/palette';

/** The `leaderboard.shareCard` translator, resolved on the request locale (#971). */
type ShareT = Awaited<ReturnType<typeof getTranslations>>;

/** Renders a structured competitor score for the card, locale-aware (#971). */
function renderScore(score: ShareCardScore, t: ShareT): string {
  switch (score.kind) {
    case 'points':
      return t('points', { n: score.value });
    case 'skins':
      return t('skins', { n: score.value });
    case 'vsPar':
      return score.label; // locale-neutral golf notation (−2 / E / +3)
  }
}

/** Renders the neutral matchplay headline, locale-aware (#971). */
function renderMatchHeadline(
  headline: ShareCardMatchHeadline,
  t: ShareT,
): string {
  switch (headline.kind) {
    case 'winner':
      return t('winnerWon', {
        name: headline.winnerName,
        margin: headline.margin,
      });
    case 'tied':
      return t('tied');
    case 'undecided':
      return t('matchplay');
  }
}

/**
 * Shareable result-card PNG for a finished game (#942). Rendered server-side
 * with next/og's `ImageResponse` (Satori → PNG, flexbox-only CSS), mirroring
 * the existing `app/icon.tsx` font-fetch pattern. The card is the artifact a
 * player fires into a group chat via the Web Share API — self-contained so
 * recipients never hit the auth wall a shared *link* would.
 *
 * `?p=<userId>` personalizes the card: a participant outside the top 3 gets a
 * «Din runde»-strip; a participant in the top 3 is highlighted in the podium;
 * a non-participant (or missing/invalid `p`) gets the neutral card.
 *
 * Only `status='finished'` games render — never leak in-progress scores via an
 * image. Uses the admin client (RLS-bypass, like `getGameWithPlayers`); `p`
 * only selects which row to highlight on an already world-readable finished
 * leaderboard, so it exposes no new data.
 *
 * No `export const runtime` — the project's `cacheComponents` config forbids
 * route-segment runtime config; the handler runs on the default Node runtime,
 * which `ImageResponse` and the admin client both need.
 */

const WIDTH = 1080;

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

function notFound(): Response {
  return new Response('Not found', { status: 404 });
}

/**
 * Content-fit card height: a thin result (matchplay, 2-player) becomes a snug
 * card instead of a tall photo with a blank lower half once shared into a chat.
 * Estimates are deliberately generous so the card never clips; the footer's
 * marginTop:auto absorbs any small slack at the bottom.
 */
function computeCardHeight(
  model: ShareCardModel | null,
  nameLines: number,
  hasMeta: boolean,
): number {
  let h = 72 /* top pad */ + 76 /* header */;
  h += 36 + nameLines * 80 + (hasMeta ? 16 + 42 : 0); // name + meta
  h += 42; // divider
  if (model === null) {
    h += 160;
  } else if (model.band === 'matchplay') {
    h += 8 + 200; // result band
  } else {
    h += 8 + 196; // winner block
    h += Math.max(0, model.podium.length - 1) * 116; // runner rows
    if (model.sharerStrip) {
      h += 16 + 116; // sharer row
      if (model.sharerStrip.rank > model.podium.length + 1) h += 52; // gap marker
    }
  }
  if (model && model.sideTournaments.length > 0) h += 28 + 96; // chips
  h += 24 + 2 + 104; // footer (divider + two lines)
  h += 72; // bottom pad
  return h;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; id: string }> },
): Promise<Response> {
  const { locale, id } = await params;
  const resolvedLocale: AppLocale = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;
  const t = await getTranslations({
    locale: resolvedLocale,
    namespace: 'leaderboard.shareCard',
  });
  const playerFallback = t('playerFallback');
  // The sharer is whoever requests the card — read from the session cookie so
  // the button needs no viewer-id prop. `?p=` is an optional override (testing /
  // explicit links). A non-participant (or no session) yields the neutral card.
  const sharerId =
    new URL(request.url).searchParams.get('p') ?? (await getProxyVerifiedUserId());

  const gwp = await getGameWithPlayers(id);
  if (!gwp || gwp.game.status !== 'finished') return notFound();

  const { game, players } = gwp;
  const admin = getAdminClient();

  const [result, holesRes, courseRes, gameMetaRes, sideWinners] =
    await Promise.all([
      buildModeResultForGame(admin, {
        id: game.id,
        game_mode: game.game_mode,
        mode_config: game.mode_config,
        course_id: game.course_id,
      }),
      admin.from('course_holes').select('par_mens').eq('course_id', game.course_id),
      admin.from('courses').select('name').eq('id', game.course_id).single<{ name: string }>(),
      admin.from('games').select('ended_at').eq('id', game.id).single<{ ended_at: string | null }>(),
      // The sharer's actual notable side-tournament wins this round (Turkey,
      // flest birdier, Konge av par 3, Snowman, LD/CTP …) — varies per round.
      computeSharerSideAwards(admin, game, sharerId, 3),
    ]);

  const courseName = courseRes.data?.name ?? null;
  const holeRows = holesRes.data ?? [];
  const coursePar = holeRows.reduce((sum, h) => sum + h.par_mens, 0);
  const holeCount = holeRows.length;
  const dateLabel = osloDate(gameMetaRes.data?.ended_at ?? null, resolvedLocale);
  // Satori wraps on spaces but clips a single long unbroken token; cap the
  // name so pathological/very-long titles stay ≤2 lines and never overflow.
  const rawName = localizeGameName(game.name, courseName, resolvedLocale);
  const gameName = rawName.length > 30 ? `${rawName.slice(0, 29).trimEnd()}…` : rawName;

  const nameByUserId = new Map<string, string>();
  for (const p of players) {
    if (p.users) {
      nameByUserId.set(
        p.user_id,
        formatRevealName(p.users.name ?? playerFallback, p.users.nickname),
      );
    }
  }

  const { fonts, hasFraunces, hasInter } = await loadFonts();
  const serif = hasFraunces ? 'Fraunces' : 'serif';
  const sans = hasInter ? 'Inter' : 'sans-serif';

  // Finished but no computable result (no scores yet) → minimal brand card.
  const model: ShareCardModel | null =
    result === null
      ? null
      : buildShareCardData({
          result,
          nameByUserId,
          sharerId,
          coursePar,
          sideWinners,
          playerFallback,
        });

  const metaParts = [
    dateLabel,
    courseName,
    holeCount ? t('holes', { n: holeCount }) : null,
  ].filter(Boolean);

  const cardHeight = computeCardHeight(model, gameName.length > 16 ? 2 : 1, metaParts.length > 0);

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
        {/* Header row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            <span
              style={{ fontFamily: serif, fontSize: 56, fontWeight: 500, color: FOREST }}
            >
              Tørny
            </span>
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: CHAMP,
                marginLeft: 6,
                marginTop: 12,
              }}
            />
          </div>
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
            <span style={{ fontSize: 28, color: CHAMP_DARK }}>{t('finalResult')}</span>
          </div>
        </div>

        {/* Game name + meta — grouped so Satori reserves the (possibly
            multi-line) title height before the meta line. */}
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
            {gameName}
          </span>
          {metaParts.length > 0 && (
            <span style={{ fontSize: 32, color: MUTED, marginTop: 16 }}>
              {metaParts.join(' · ')}
            </span>
          )}
        </div>

        <div style={{ height: 2, background: HAIRLINE, marginTop: 32, marginBottom: 8 }} />

        {/* Body */}
        {model === null ? (
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: serif, fontSize: 48, color: TAUPE }}>{t('gameFinished')}</span>
          </div>
        ) : model.band === 'matchplay' ? (
          <MatchplayBody model={model} serif={serif} t={t} />
        ) : (
          <PlacementBody model={model} serif={serif} t={t} />
        )}

        {/* Side tournaments */}
        {model && model.sideTournaments.length > 0 && (
          <div style={{ display: 'flex', marginTop: 28, gap: 20 }}>
            {model.sideTournaments.slice(0, 3).map((s, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  flex: 1,
                  // Champagne tint marks the sharer's own achievement; others
                  // stay neutral white and name whoever took them.
                  background: s.isSharer ? CHAMP_TINT : WHITE,
                  border: `2px solid ${HAIRLINE}`,
                  borderRadius: 24,
                  paddingTop: 22,
                  paddingBottom: 22,
                  paddingLeft: 28,
                  paddingRight: 28,
                }}
              >
                <span
                  style={{
                    fontSize: 32,
                    fontWeight: 500,
                    color: s.isSharer ? CHAMP_DARK : FOREST,
                  }}
                >
                  {s.label}
                </span>
                {!s.isSharer && s.winnerName ? (
                  <span style={{ fontSize: 26, color: MUTED, marginTop: 6 }}>{s.winnerName}</span>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {/* Footer pinned to bottom */}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
          <div style={{ height: 2, background: HAIRLINE, marginBottom: 24 }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontFamily: serif, fontSize: 34, fontWeight: 500, color: FOREST }}>
              tornygolf.no
            </span>
            <span style={{ fontSize: 26, color: '#8C8475', marginTop: 8 }}>
              {t('tagline')}
            </span>
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: cardHeight,
      fonts: fonts.length > 0 ? fonts : undefined,
      headers: {
        // Personalized per viewer (session cookie), so cache privately only.
        // The button prefetches once per leaderboard view; the recipient gets
        // the shared *file*, never this URL — so no CDN sharing is needed.
        'Cache-Control': 'private, max-age=300',
      },
    },
  );
}

function PlacementBody({
  model,
  serif,
  t,
}: {
  model: ShareCardModel;
  serif: string;
  t: ShareT;
}) {
  const winner = model.winner;
  const rest = model.podium.slice(1); // ranks 2..3
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
      {/* Winner block */}
      {winner && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: CHAMP_TINT,
            border: `2px solid ${HAIRLINE}`,
            borderRadius: 32,
            padding: 36,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 110,
              height: 110,
              borderRadius: '50%',
              background: CHAMP,
            }}
          >
            <span style={{ fontFamily: serif, fontSize: 60, fontWeight: 600, color: FOREST }}>1</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 32, flex: 1 }}>
            <span style={{ fontSize: 28, color: CHAMP_DARK, letterSpacing: '2px' }}>{t('winner')}</span>
            <span style={{ fontFamily: serif, fontSize: 56, fontWeight: 500, color: FOREST, marginTop: 4 }}>
              {winner.name}
            </span>
            <span style={{ fontSize: 36, color: TAUPE, marginTop: 8 }}>
              {renderScore(winner.score, t)}
            </span>
          </div>
        </div>
      )}

      {/* Runner-up rows */}
      {rest.map((row) => (
        <div
          key={row.rank}
          style={{
            display: 'flex',
            alignItems: 'center',
            paddingTop: 26,
            paddingBottom: 26,
            borderBottom: `2px solid ${ROW_HAIRLINE}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: row.isSharer ? CHAMP_PILL : DISC,
            }}
          >
            <span style={{ fontSize: 32, fontWeight: 500, color: row.isSharer ? CHAMP_DARK : TAUPE }}>
              {row.rank}
            </span>
          </div>
          <span
            style={{
              fontSize: 40,
              color: row.isSharer ? CHAMP_DARK : FOREST,
              fontWeight: row.isSharer ? 500 : 400,
              marginLeft: 28,
              flex: 1,
            }}
          >
            {row.name}
          </span>
          <span style={{ fontSize: 36, color: MUTED }}>{renderScore(row.score, t)}</span>
        </div>
      ))}

      {/* Sharer's own row — shown when the sharer finished outside the top 3.
          Named + champagne-highlighted so recipients see exactly who it is. A
          "···" marker signals a jump down the field when ranks are skipped. */}
      {model.sharerStrip && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {model.sharerStrip.rank > model.podium.length + 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 6 }}>
              <span style={{ fontSize: 36, color: MUTED, letterSpacing: '6px' }}>···</span>
            </div>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: CHAMP_TINT,
              border: `2px solid ${HAIRLINE}`,
              borderRadius: 24,
              paddingTop: 22,
              paddingBottom: 22,
              paddingLeft: 24,
              paddingRight: 32,
              marginTop: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: CHAMP_PILL,
              }}
            >
              <span style={{ fontSize: 32, fontWeight: 500, color: CHAMP_DARK }}>
                {model.sharerStrip.rank}
              </span>
            </div>
            <span
              style={{ fontSize: 40, fontWeight: 500, color: CHAMP_DARK, marginLeft: 28, flex: 1 }}
            >
              {model.sharerStrip.name}
            </span>
            <span style={{ fontSize: 36, color: TAUPE }}>
              {renderScore(model.sharerStrip.score, t)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function MatchplayBody({
  model,
  serif,
  t,
}: {
  model: ShareCardModel;
  serif: string;
  t: ShareT;
}) {
  const headline = model.match
    ? renderMatchHeadline(model.match.headline, t)
    : t('matchplay');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: CHAMP_TINT,
          border: `2px solid ${HAIRLINE}`,
          borderRadius: 32,
          padding: 48,
        }}
      >
        <span style={{ fontSize: 28, color: CHAMP_DARK, letterSpacing: '2px' }}>{t('matchplay')}</span>
        <span style={{ fontFamily: serif, fontSize: 64, fontWeight: 500, color: FOREST, marginTop: 12 }}>
          {headline}
        </span>
      </div>
    </div>
  );
}
