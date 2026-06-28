import { ImageResponse } from 'next/og';
import { getAdminClient } from '@/lib/supabase/admin';
import { getGameWithPlayers } from '@/lib/games/getGameWithPlayers';
import { buildModeResultForGame } from '@/lib/scoring/buildModeResultForGame';
import {
  buildShareCardData,
  type ShareCardModel,
} from '@/lib/games/buildShareCardData';
import { formatRevealName } from '@/lib/names/formatRevealName';
import { localizeGameName } from '@/lib/games/autoGameName';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import type { AppLocale } from '@/i18n/routing';

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
 */

export const runtime = 'nodejs';

const WIDTH = 1080;
const HEIGHT = 1500;

// Brand palette — hardcoded hex on purpose: this is a fixed-look image that must
// NOT invert in dark mode (unlike the app's CSS-variable surfaces).
const FOREST = '#1B4332';
const CHAMP = '#C9A961';
const CHAMP_DARK = '#8A6F2E';
const LINEN = '#F8F6F0';
const MUTED = '#6B6354';
const TAUPE = '#4A3F30';
const CHAMP_TINT = '#F6EDD6';
const CHAMP_PILL = '#F1E6C9';
const GREEN_TINT = '#EBF0EA';
const DISC = '#ECE7DB';
const WHITE = '#FFFFFF';
const HAIRLINE = 'rgba(201,169,97,0.40)';
const GREEN_BORDER = 'rgba(27,67,50,0.18)';
const ROW_HAIRLINE = 'rgba(27,67,50,0.08)';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

/**
 * Fetch one Google-font weight as a ttf ArrayBuffer (or null on any failure),
 * mirroring `app/icon.tsx`. Spoofs a desktop UA so the css2 endpoint returns a
 * ttf URL we can parse. Graceful: a null just means Satori uses its default.
 */
async function fetchGoogleFont(
  family: string,
  weight: number,
): Promise<ArrayBuffer | null> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
    family,
  )}:wght@${weight}&display=swap`;
  try {
    const css = await fetch(cssUrl, { headers: { 'User-Agent': UA } }).then(
      (r) => (r.ok ? r.text() : ''),
    );
    const m = css.match(/url\((https:\/\/[^)]+\.ttf)\)/);
    if (!m) return null;
    return await fetch(m[1]).then((r) => (r.ok ? r.arrayBuffer() : null));
  } catch {
    return null;
  }
}

type LoadedFonts = {
  fonts: { name: string; data: ArrayBuffer; weight: 400 | 500 | 600; style: 'normal' }[];
  hasFraunces: boolean;
  hasInter: boolean;
};

async function loadFonts(): Promise<LoadedFonts> {
  const [fr500, fr600, in400, in500] = await Promise.all([
    fetchGoogleFont('Fraunces', 500),
    fetchGoogleFont('Fraunces', 600),
    fetchGoogleFont('Inter', 400),
    fetchGoogleFont('Inter', 500),
  ]);
  const fonts: LoadedFonts['fonts'] = [];
  if (fr500) fonts.push({ name: 'Fraunces', data: fr500, weight: 500, style: 'normal' });
  if (fr600) fonts.push({ name: 'Fraunces', data: fr600, weight: 600, style: 'normal' });
  if (in400) fonts.push({ name: 'Inter', data: in400, weight: 400, style: 'normal' });
  if (in500) fonts.push({ name: 'Inter', data: in500, weight: 500, style: 'normal' });
  return {
    fonts,
    hasFraunces: Boolean(fr500 || fr600),
    hasInter: Boolean(in400 || in500),
  };
}

function osloDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat('nb-NO', {
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; id: string }> },
): Promise<Response> {
  const { locale, id } = await params;
  // The sharer is whoever requests the card — read from the session cookie so
  // the button needs no viewer-id prop. `?p=` is an optional override (testing /
  // explicit links). A non-participant (or no session) yields the neutral card.
  const sharerId =
    new URL(request.url).searchParams.get('p') ?? (await getProxyVerifiedUserId());

  const gwp = await getGameWithPlayers(id);
  if (!gwp || gwp.game.status !== 'finished') return notFound();

  const { game, players } = gwp;
  const admin = getAdminClient();

  const [result, holesRes, courseRes, gameMetaRes, sideWinnersRes] =
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
      admin
        .from('game_side_winners')
        .select('category, position, winner_user_id')
        .eq('game_id', game.id)
        .order('category')
        .order('position')
        .returns<
          { category: 'longest_drive' | 'closest_to_pin'; position: number; winner_user_id: string | null }[]
        >(),
    ]);

  const courseName = courseRes.data?.name ?? null;
  const holeRows = holesRes.data ?? [];
  const coursePar = holeRows.reduce((sum, h) => sum + h.par_mens, 0);
  const holeCount = holeRows.length;
  const dateLabel = osloDate(gameMetaRes.data?.ended_at ?? null);
  const gameName = localizeGameName(game.name, courseName, locale as AppLocale);

  const nameByUserId = new Map<string, string>();
  for (const p of players) {
    if (p.users) {
      nameByUserId.set(
        p.user_id,
        formatRevealName(p.users.name ?? 'Spiller', p.users.nickname),
      );
    }
  }

  const sideWinners = (sideWinnersRes.data ?? []).map((sw) => ({
    label:
      sw.category === 'longest_drive'
        ? `Lengste drive #${sw.position}`
        : `Nærmest pinnen #${sw.position}`,
    winnerUserId: sw.winner_user_id,
  }));

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
        });

  const metaParts = [dateLabel, courseName, holeCount ? `${holeCount} hull` : null].filter(
    Boolean,
  );

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
            <span style={{ fontSize: 28, color: CHAMP_DARK }}>Sluttresultat</span>
          </div>
        </div>

        {/* Game name + meta */}
        <span
          style={{
            fontFamily: serif,
            fontSize: 80,
            fontWeight: 600,
            color: FOREST,
            marginTop: 40,
            lineHeight: 1.05,
          }}
        >
          {gameName}
        </span>
        {metaParts.length > 0 && (
          <span style={{ fontSize: 32, color: MUTED, marginTop: 18 }}>
            {metaParts.join(' · ')}
          </span>
        )}

        <div style={{ height: 2, background: HAIRLINE, marginTop: 32, marginBottom: 8 }} />

        {/* Body */}
        {model === null ? (
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: serif, fontSize: 48, color: TAUPE }}>Spillet er ferdig</span>
          </div>
        ) : model.band === 'matchplay' ? (
          <MatchplayBody model={model} serif={serif} />
        ) : (
          <PlacementBody model={model} serif={serif} />
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
                  background: WHITE,
                  border: `2px solid ${HAIRLINE}`,
                  borderRadius: 24,
                  paddingTop: 22,
                  paddingBottom: 22,
                  paddingLeft: 28,
                  paddingRight: 28,
                }}
              >
                <span style={{ fontSize: 26, color: MUTED }}>{s.label}</span>
                <span
                  style={{
                    fontSize: 34,
                    fontWeight: 500,
                    color: s.isSharer ? CHAMP_DARK : FOREST,
                    marginTop: 6,
                  }}
                >
                  {s.isSharer ? 'Deg' : s.winnerName}
                </span>
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
              Fyr opp golfturneringen på et par minutter
            </span>
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
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
}: {
  model: ShareCardModel;
  serif: string;
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
            <span style={{ fontSize: 28, color: CHAMP_DARK, letterSpacing: '2px' }}>VINNER</span>
            <span style={{ fontFamily: serif, fontSize: 56, fontWeight: 500, color: FOREST, marginTop: 4 }}>
              {winner.name}
            </span>
            {winner.scoreLabel ? (
              <span style={{ fontSize: 36, color: TAUPE, marginTop: 8 }}>{winner.scoreLabel}</span>
            ) : null}
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
              color: FOREST,
              fontWeight: row.isSharer ? 500 : 400,
              marginLeft: 28,
              flex: 1,
            }}
          >
            {row.isSharer ? `${row.name} · Deg` : row.name}
          </span>
          {row.scoreLabel ? (
            <span style={{ fontSize: 36, color: MUTED }}>{row.scoreLabel}</span>
          ) : null}
        </div>
      ))}

      {/* Sharer strip (only when sharer finished outside top 3) */}
      {model.sharerStrip && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: GREEN_TINT,
            border: `2px solid ${GREEN_BORDER}`,
            borderRadius: 28,
            paddingTop: 28,
            paddingBottom: 28,
            paddingLeft: 36,
            paddingRight: 36,
            marginTop: 28,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 24, color: '#3E6450', letterSpacing: '2px' }}>DIN RUNDE</span>
            <span style={{ fontSize: 40, fontWeight: 500, color: FOREST, marginTop: 6 }}>
              {`${model.sharerStrip.rank}. plass${
                model.sharerStrip.scoreLabel ? ` · ${model.sharerStrip.scoreLabel}` : ''
              }`}
            </span>
          </div>
          <span style={{ fontFamily: serif, fontSize: 56, fontWeight: 500, color: CHAMP }}>
            {`${model.sharerStrip.rank}.`}
          </span>
        </div>
      )}
    </div>
  );
}

function MatchplayBody({
  model,
  serif,
}: {
  model: ShareCardModel;
  serif: string;
}) {
  const headline = model.match?.sharerOutcomeLabel || model.match?.headline || 'Matchplay';
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
        <span style={{ fontSize: 28, color: CHAMP_DARK, letterSpacing: '2px' }}>MATCHPLAY</span>
        <span style={{ fontFamily: serif, fontSize: 64, fontWeight: 500, color: FOREST, marginTop: 12 }}>
          {headline}
        </span>
      </div>
    </div>
  );
}
