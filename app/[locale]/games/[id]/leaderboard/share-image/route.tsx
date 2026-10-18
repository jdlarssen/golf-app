import { isValidElement, type ReactNode } from 'react';
import { ImageResponse } from 'next/og';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getGameWithPlayers } from '@/lib/games/getGameWithPlayers';
import { buildModeResultForGame } from '@/lib/scoring/buildModeResultForGame';
import {
  buildShareCardData,
  type ShareCardModel,
  type ShareCardRow,
  type ShareCardScore,
} from '@/lib/games/buildShareCardData';
import { formatPublicName } from '@/lib/names/formatPublicName';
import { formatDisplayLabelKey } from '@/lib/games/formatLabel';
import { localizeGameName } from '@/lib/games/autoGameName';
import { isHoleInSegment } from '@/lib/games/holeScope';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { routing, type AppLocale } from '@/i18n/routing';
import { loadFonts } from '@/lib/og/fonts';
import {
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  cardKicker,
  chooseHeadline,
  rowDisplayName,
  shareCardHeight,
} from '@/lib/og/shareCardLayout';
import { headlineSpec, signedCount, type HeadlineSpec } from '@/lib/og/shareCardHeadline';
import { OgWordmark } from '@/lib/og/wordmark';
import {
  FOREST,
  CHAMP,
  ON_STRONG,
  ACCENT_ON_STRONG,
  HILL_FAR,
  HILL_NEAR,
  MEDAL_INK,
  MEDAL_SILVER,
  MEDAL_BRONZE,
} from '@/lib/og/palette';

/** The `leaderboard.shareCard` translator, resolved on the request locale (#971). */
type ShareT = Awaited<ReturnType<typeof getTranslations>>;

/** Muted light text on the green: the kicker, the labels and the tagline. */
const ON_STRONG_MUTED = 'rgba(236,229,210,0.8)';
const ON_STRONG_META = 'rgba(236,229,210,0.85)';

/** The number in a row: just the figure, locale-neutral («38», «−4», «6»). */
function scoreFigure(score: ShareCardScore): string {
  switch (score.kind) {
    case 'points':
    case 'skins':
      return score.value < 0 ? `−${Math.abs(score.value)}` : String(score.value);
    case 'vsPar':
      return score.label; // −2 / E / +3
  }
}

/** The result as the headline words it: «38 poeng», «6 skins», «−4», «par». */
function resultText(score: ShareCardScore, t: ShareT): { text: string; at: boolean } {
  switch (score.kind) {
    case 'points':
      return { text: signedCount(score.value, (n) => t('points', { n })), at: false };
    case 'skins':
      return { text: t('skins', { n: score.value }), at: false };
    case 'vsPar':
      return { text: score.label === 'E' ? t('par') : score.label, at: true };
  }
}

/**
 * The headline as rich text. `gold` wraps the result; the same call with a
 * pass-through `gold` gives the plain text the layout is measured on.
 */
function headlineNode(
  spec: HeadlineSpec,
  t: ShareT,
  locale: AppLocale,
  gold: (chunks: ReactNode) => ReactNode,
): ReactNode {
  const list = new Intl.ListFormat(locale === 'en' ? 'en-GB' : 'nb-NO', {
    type: 'conjunction',
  });
  switch (spec.kind) {
    case 'finished':
      return t('gameFinished');
    case 'tied':
      return t('tied');
    case 'matchWon':
      return t.rich('winnerWon', { name: list.format(spec.names), margin: spec.margin, gold });
    case 'won':
    case 'shared':
    case 'sharedMany': {
      const { text, at } = resultText(spec.result, t);
      const names = spec.kind === 'sharedMany' ? '' : list.format(spec.names);
      const base = spec.kind === 'won' ? 'headlineWon' : spec.kind === 'shared' ? 'headlineShared' : 'headlineSharedMany';
      return t.rich(at ? `${base}At` : base, { names, result: text, gold });
    }
  }
}

/** Marks the gold part of a rich-text message; `inlineWords` reads it back. */
function Gold({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

type Word = { text: string; gold: boolean };

/** Rich text as a flat list of words, each marked gold or not. */
function inlineWords(node: ReactNode, gold = false): Word[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap((n) => inlineWords(n, gold));
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
      .split(/\s+/)
      .filter(Boolean)
      .map((text) => ({ text, gold }));
  }
  if (isValidElement(node)) {
    const { children } = node.props as { children?: ReactNode };
    return inlineWords(children, gold || node.type === Gold);
  }
  return [];
}

/** Joins a run of gold words into one item, so «38 poeng» never splits across lines. */
function keepGoldTogether(words: Word[]): Word[] {
  const out: Word[] = [];
  for (const w of words) {
    const last = out[out.length - 1];
    if (w.gold && last?.gold) last.text += ` ${w.text}`;
    else out.push({ ...w });
  }
  return out;
}

/**
 * The headline's words in lines. A result headline breaks before its
 * preposition, as the artboard does («Marte vant» / «med 38 poeng»); the other
 * headlines run as one block that wraps on width.
 */
function headlineWordLines(words: Word[], spec: HeadlineSpec): Word[][] {
  const resultHeadline =
    spec.kind === 'won' || spec.kind === 'shared' || spec.kind === 'sharedMany';
  const gold = words.findIndex((w) => w.gold);
  if (!resultHeadline || gold < 1) return [words];
  return [words.slice(0, gold - 1), words.slice(gold - 1)];
}

/** The lines as one string, «\n» between them, for `headlineLayout`. */
function lineText(lines: Word[][]): string {
  return lines.map((line) => line.map((w) => w.text).join(' ')).join('\n');
}

/**
 * Text with a gold part, drawn word by word. Satori cannot mix styled spans
 * into one running line (a string next to a span becomes two flex items that
 * lose the space between them), so each word is its own flex item that wraps
 * like text, with `gap` standing in for the space. Each entry of `lines` is
 * its own wrapping block.
 */
function InlineText({
  lines,
  gap,
  italic = false,
}: {
  lines: Word[][];
  gap: number;
  italic?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {lines.map((words, li) => (
        <div key={li} style={{ display: 'flex', flexWrap: 'wrap', columnGap: gap }}>
          {keepGoldTogether(words).map((w, i) => (
            <span
              key={i}
              style={
                w.gold
                  ? { color: ACCENT_ON_STRONG, ...(italic ? { fontStyle: 'italic' } : {}) }
                  : undefined
              }
            >
              {w.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** One row of the card, before it is drawn. */
type CardRow = {
  /** The rank printed in the medallion; null for a matchplay side. */
  rank: number | null;
  name: string;
  /** The figure on the right; null on a losing or halved matchplay side. */
  figure: string | null;
  winner: boolean;
};

function placementRows(model: ShareCardModel): CardRow[] {
  const winnerRank = model.winners.length > 0 ? model.winners[0].rank : null;
  return model.podium.slice(0, 3).map((r: ShareCardRow) => ({
    rank: r.rank,
    name: rowDisplayName(r.memberNames),
    figure: scoreFigure(r.score),
    winner: winnerRank !== null && r.rank === winnerRank,
  }));
}

function matchRows(model: ShareCardModel): CardRow[] {
  const match = model.match;
  if (!match) return [];
  const margin = match.headline.kind === 'winner' ? match.headline.margin : null;
  return match.sides.map((side) => ({
    rank: null,
    name: rowDisplayName(side.memberNames),
    figure: side.won ? margin : null,
    winner: side.won,
  }));
}

function osloDate(iso: string | null, locale: AppLocale): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'nb-NO', {
      timeZone: 'Europe/Oslo',
      day: 'numeric',
      month: 'long',
      // Satori draws a no-break space wider than a space.
    }).format(new Date(iso)).replace(/\u00a0/g, ' ');
  } catch {
    return null;
  }
}

function notFound(): Response {
  return new Response('Not found', { status: 404 });
}

/**
 * Shareable result-card PNG for a finished game (#942). Rendered server-side
 * with next/og's `ImageResponse` (Satori → PNG, flexbox-only CSS), with fonts
 * from `lib/og/fonts.ts`. The card is the artifact a
 * player fires into a group chat via the Web Share API — self-contained so
 * recipients never hit the auth wall a shared *link* would.
 *
 * A fixed 1080×1350 portrait on forest green (#2319): who won in the headline,
 * and just the podium (three rows, two sides in matchplay) under it. The card
 * is the same for everyone who fetches it — it has no row for the person who
 * shares and no side-prize badges, so nothing on it depends on the session.
 * The session only opens the gate (#2312): a participant or not, `?p=` is
 * ignored.
 *
 * Only `status='finished'` games render — never leak in-progress scores via an
 * image. A finished game is NOT world-readable in RLS (#1542); the data is read
 * with the admin client (RLS-bypass, like `getGameWithPlayers`), so the gate in
 * `GET` is the enforcement.
 *
 * No `export const runtime` — the project's `cacheComponents` config forbids
 * route-segment runtime config; the handler runs on the default Node runtime,
 * which `ImageResponse` and the admin client both need.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; id: string }> },
): Promise<Response> {
  const { locale, id } = await params;
  const resolvedLocale: AppLocale = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;
  const [t, tModes] = await Promise.all([
    getTranslations({ locale: resolvedLocale, namespace: 'leaderboard.shareCard' }),
    getTranslations({ locale: resolvedLocale, namespace: 'modes' }),
  ]);
  const playerFallback = t('playerFallback');
  // Gate: signed in + finished game, on purpose — owner choice B in #1632, the
  // same gate as `leaderboard/page.tsx` and `leaderboard/export/route.ts`. The
  // data below is read with the service role, so this check IS the access
  // control. Tighten or loosen it here and change those two in the same commit.
  // The session opens the gate and nothing more: the card is neutral (#2319).
  const viewerId = await getProxyVerifiedUserId();
  if (!viewerId) return notFound();

  const gwp = await getGameWithPlayers(id);
  if (!gwp || gwp.game.status !== 'finished') return notFound();

  const { game, players } = gwp;
  const admin = getAdminClient();

  const [result, holesRes, courseRes, gameMetaRes] = await Promise.all([
    // #2217: a cup match on 9 holes is scored over its own holes, and a
    // derived single reads the host's strokes — like the stored result
    // (runFinishPipeline). Without them a front9 match came out halved and
    // a derived single had no winner on the card.
    buildModeResultForGame(admin, {
      id: game.id,
      game_mode: game.game_mode,
      mode_config: game.mode_config,
      course_id: game.course_id,
      hole_segment: game.hole_segment,
      source_game_id: game.source_game_id,
    }),
    admin
      .from('course_holes')
      .select('hole_number, par_mens')
      .eq('course_id', game.course_id)
      .returns<{ hole_number: number; par_mens: number }[]>(),
    admin.from('courses').select('name').eq('id', game.course_id).single<{ name: string }>(),
    admin.from('games').select('ended_at').eq('id', game.id).single<{ ended_at: string | null }>(),
  ]);

  const courseName = courseRes.data?.name ?? null;
  // Par and the «9 hull» meta note cover the game's own holes (#2217), same
  // filter as the round report (generateRoundReport.ts).
  const holeRows = (holesRes.data ?? []).filter((h) =>
    isHoleInSegment(h.hole_number, game.hole_segment),
  );
  const parByHole = new Map(holeRows.map((h) => [h.hole_number, h.par_mens]));
  const holeCount = holeRows.length;
  const dateLabel = osloDate(gameMetaRes.data?.ended_at ?? null, resolvedLocale);
  const gameName = localizeGameName(game.name, courseName, resolvedLocale);
  const kicker = cardKicker(gameName, courseName);

  // Public names («Marte L.»), the same as the sign-up page shows (#2319).
  const nameByUserId = new Map<string, string>();
  for (const p of players) {
    if (p.users) {
      nameByUserId.set(p.user_id, formatPublicName(p.users) ?? playerFallback);
    }
  }

  const { fonts, hasFraunces, hasInter } = await loadFonts({
    frauncesItalic: true,
    inter600: true,
  });
  const serif = hasFraunces ? 'Fraunces' : 'serif';
  const sans = hasInter ? 'Inter' : 'sans-serif';

  // Finished but no computable result (no scores yet) → minimal brand card.
  const model: ShareCardModel | null =
    result === null
      ? null
      : buildShareCardData({
          result,
          nameByUserId,
          sharerId: null,
          parByHole,
          sideWinners: [],
          playerFallback,
        });

  const spec = headlineSpec(model);
  const gold = (chunks: ReactNode) => <Gold>{chunks}</Gold>;
  // The headline breaks before its preposition when that fits the artboard's
  // 116px on three lines; otherwise it runs as one wrapping block.
  const headlineWords = inlineWords(headlineNode(spec, t, resolvedLocale, gold));
  const headlineVariants = [headlineWordLines(headlineWords, spec), [headlineWords]];
  const headlineChoice = chooseHeadline(headlineVariants.map(lineText));
  const headlineLines = headlineVariants[headlineChoice.index];

  const activePlayers = players.filter((p) => !p.withdrawn_at).length;
  const metaParts = [
    tModes(formatDisplayLabelKey(game.game_mode, game.mode_config) as Parameters<typeof tModes>[0]),
    t('players', { n: activePlayers }),
    dateLabel,
    holeCount === 9 ? t('holes', { n: holeCount }) : null,
  ].filter(Boolean);
  const meta = metaParts.join(' · ');

  const rows: CardRow[] =
    model === null ? [] : model.band === 'matchplay' ? matchRows(model) : placementRows(model);
  const cardHeight = shareCardHeight(model, {
    headlineLines: headlineChoice.lines,
    headlineFontSize: headlineChoice.fontSize,
    kicker,
    meta,
  });
  const upper = (text: string) => text.toLocaleUpperCase(resolvedLocale === 'en' ? 'en' : 'nb');

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          background: FOREST,
          padding: '68px 72px',
          fontFamily: sans,
          color: ON_STRONG,
        }}
      >
        {/* Two hills along the bottom edge, the artboard's paths in full size. */}
        <svg
          width={SHARE_CARD_WIDTH}
          height={SHARE_CARD_HEIGHT}
          viewBox="0 0 540 675"
          style={{ position: 'absolute', left: 0, bottom: 0 }}
        >
          <path
            d="M-40 560 C 120 500, 260 620, 420 540 S 600 520, 620 560 L620 700 L-40 700 Z"
            fill={HILL_FAR}
          />
          <path
            d="M-40 610 C 140 570, 300 660, 460 600 S 620 590, 640 620 L640 700 L-40 700 Z"
            fill={HILL_NEAR}
          />
        </svg>

        {/* Header row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 54,
          }}
        >
          <OgWordmark fontFamily={serif} fontSize={44} fontWeight={600} color={ON_STRONG} />
          <span
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: 5.76,
              color: ON_STRONG_MUTED,
            }}
          >
            {upper(t('finalResult'))}
          </span>
        </div>

        {/* Kicker, headline and meta line */}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 68 }}>
          <span
            style={{
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: 6.76,
              color: ON_STRONG_MUTED,
            }}
          >
            {upper(kicker)}
          </span>
          <div
            style={{
              display: 'flex',
              marginTop: 20,
              fontFamily: serif,
              fontSize: headlineChoice.fontSize,
              fontWeight: 500,
              lineHeight: 1.02,
              color: ON_STRONG,
            }}
          >
            <InlineText
              lines={headlineLines}
              gap={Math.round(headlineChoice.fontSize * 0.22)}
              italic
            />
          </div>
          <span style={{ fontSize: 30, color: ON_STRONG_META, marginTop: 20 }}>{meta}</span>
        </div>

        {/* The podium: up to three rows, two sides in matchplay */}
        {rows.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 60, gap: 20 }}>
            {rows.map((row, i) => (
              <ResultRow key={i} row={row} serif={serif} />
            ))}
          </div>
        )}

        {/* Bottom line pinned to the bottom */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginTop: 'auto',
          }}
        >
          <div style={{ display: 'flex', fontSize: 26, color: ON_STRONG_MUTED }}>
            <InlineText lines={[inlineWords(t.rich('taglinePun', { gold }))]} gap={6} />
          </div>
          <span style={{ fontSize: 26, fontWeight: 600, color: ON_STRONG }}>tornygolf.no</span>
        </div>
      </div>
    ),
    {
      width: SHARE_CARD_WIDTH,
      height: cardHeight,
      fonts: fonts.length > 0 ? fonts : undefined,
      headers: {
        // The button prefetches once per leaderboard view; the recipient gets
        // the shared *file*, never this URL — so no CDN sharing is needed, and
        // the gate depends on the session cookie, so cache privately only.
        'Cache-Control': 'private, max-age=300',
      },
    },
  );
}

/** The medallion's fill: gold for a winner, silver for 2, bronze for 3. */
function medallionFill(rank: number, winner: boolean): Record<string, string> {
  if (winner) return { background: CHAMP };
  if (rank === 2) return { backgroundImage: MEDAL_SILVER };
  if (rank >= 3) return { backgroundImage: MEDAL_BRONZE };
  // Rank 1 without a winner (a skins round nobody won): a plain disc, no gold.
  return { background: 'rgba(236,229,210,0.18)' };
}

function ResultRow({ row, serif }: { row: CardRow; serif: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        background: row.winner ? 'rgba(236,229,210,0.1)' : 'rgba(236,229,210,0.06)',
        ...(row.winner ? { border: '2px solid rgba(201,169,97,0.7)' } : {}),
        borderRadius: 32,
        padding: '24px 32px',
      }}
    >
      {row.rank !== null && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 76,
            height: 76,
            borderRadius: 999,
            flexShrink: 0,
            marginRight: 28,
            ...medallionFill(row.rank, row.winner),
          }}
        >
          <span
            style={{
              fontFamily: serif,
              fontSize: 36,
              fontWeight: 600,
              // The plain disc of a skins round nobody won is dark: light digit there.
              color: row.winner || row.rank >= 2 ? MEDAL_INK : ON_STRONG,
            }}
          >
            {row.rank}
          </span>
        </div>
      )}
      <span
        style={{
          flexGrow: 1,
          flexShrink: 1,
          minWidth: 0,
          fontFamily: serif,
          fontSize: 48,
          fontWeight: 500,
          color: ON_STRONG,
        }}
      >
        {row.name}
      </span>
      {row.figure !== null && (
        <span
          style={{
            flexShrink: 0,
            marginLeft: 28,
            fontFamily: serif,
            fontSize: 52,
            fontWeight: 600,
            color: row.winner ? ACCENT_ON_STRONG : ON_STRONG,
          }}
        >
          {row.figure}
        </span>
      )}
    </div>
  );
}
