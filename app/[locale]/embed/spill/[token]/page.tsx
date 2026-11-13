import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { parseMode } from '@/lib/leaderboard';
import { getGameBySpectateToken } from '@/lib/games/spectate';
import { getGameWithPlayers, type GameWithPlayers } from '@/lib/games/getGameWithPlayers';
import { getAdminClient } from '@/lib/supabase/admin';
import { first } from '@/lib/url/searchParams';
import { renderLeaderboardContent } from '@/app/[locale]/games/[id]/leaderboard/leaderboardContent';
import { SpectatePoller } from '@/app/[locale]/spectate/[token]/SpectatePoller';
import { readBoardRows, readCourseName } from '@/app/[locale]/spectate/[token]/boardRows';
import { EmbedFooter } from '../../EmbedFooter';
import { SponsorStrip } from '@/components/SponsorStrip';
import { safeParsePrizes } from '@/lib/games/prizes';
import { localizeGameName } from '@/lib/games/autoGameName';
import { formatDisplayLabelKey } from '@/lib/games/formatLabel';
import { leagueFlightHasNoPlace } from '@/lib/games/finishedResultBadge';
import { revealState, shouldHideNetto } from '@/lib/games/visibility';
import { buildEmbedBoard, type EmbedBoard as EmbedBoardData } from '@/lib/embed/embedBoard';
import { computeLiveBoard, liveBoardCovers, soloResult } from '@/lib/leaderboard/liveBoard';
import { soloResultBoard } from '@/lib/leaderboard/resultBoard';
import type { AppLocale } from '@/i18n/routing';
import { EmbedThemeScript, parseEmbedTheme } from '../../EmbedThemeScript';
import { EmbedBoard } from './EmbedBoard';

type Params = Promise<{ token: string }>;
type SearchParams = Promise<{ mode?: string | string[]; theme?: string | string[] }>;

// Embeds are widgets, not pages — the public course pages (#1023) own SEO.
export const metadata = {
  robots: { index: false, follow: false },
};

/**
 * Iframe-friendly game leaderboard (#1024). Rides the exact spectate access
 * model (#938): same `games.spectate_token`, same admin-client read path,
 * same reveal-aware leaderboard render — so the embed can never expose more
 * than the live link does, and revoking the token kills both.
 *
 * Differences from /spectate/[token]: no sticky banner (chrome-free for
 * iframes), an always-on attribution footer, a forced light theme
 * (`?theme=dark` opt-in), and frame-ancestors headers that allow framing
 * (set in next.config.ts — the rest of the app refuses framing).
 *
 * #2330: solo strokeplay and solo stableford (`liveBoardCovers`) get the
 * compact card instead — live, finished and while a reveal game hides its
 * net results. Every other format keeps the full board below.
 */
export default async function EmbedGamePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const theme = parseEmbedTheme(first(sp.theme));
  const locale = await getLocale();

  const found = await getGameBySpectateToken(token);
  if (!found) notFound();

  const gwp = await getGameWithPlayers(found.id);
  if (!gwp) notFound();

  const { game } = gwp;

  // Draft/scheduled games have no meaningful leaderboard yet (same rule as
  // the spectate page).
  if (game.status === 'draft' || game.status === 'scheduled') {
    notFound();
  }

  const live = game.status === 'active';
  const spectateHref = `/${locale}/spectate/${token}`;
  const card = liveBoardCovers(game) ? await compactCard({ gwp, gameId: found.id, live }) : null;

  return (
    // data-embed: CSS in app/globals.css hides what cannot work in an iframe
    // without a session or clipboard access (the settlement copy button, #2296).
    <div data-embed>
      <EmbedThemeScript theme={theme} />
      {card ? (
        <EmbedBoard
          live={live}
          gameName={localizeGameName(game.name, card.courseName, locale as AppLocale)}
          formatLabel={card.formatLabel}
          board={card.board}
          spectateHref={spectateHref}
          prizes={safeParsePrizes(game.prizes)}
        />
      ) : (
        <FullBoard
          gwp={gwp}
          gameId={found.id}
          live={live}
          mode={parseMode(sp.mode)}
          // Self-referencing back-href: embed visitors have no session, so any back
          // chevron in the format views must not point into the authed app.
          // #1373: the Netto/Brutto-toggle now reloads this same href with a new
          // `?mode=`, so an opted-in dark embed has to carry `theme` along — otherwise
          // the first toggle-tap would flip an info-screen back to light.
          backHref={`/${locale}/embed/spill/${token}${theme === 'dark' ? '?theme=dark' : ''}`}
          spectateHref={spectateHref}
        />
      )}
    </div>
  );
}

/**
 * The compact card's data (#2330), or `null` when the engine unexpectedly has
 * no board (a half-set-up game): the page then falls back to the full board,
 * never to an empty frame. A reveal game hiding net results reads no scores
 * (`board: null`). Scores are read with the service-role client only here,
 * after the token is resolved — as the full board and the big screen do.
 */
async function compactCard({
  gwp,
  gameId,
  live,
}: {
  gwp: GameWithPlayers;
  gameId: string;
  live: boolean;
}): Promise<{ board: EmbedBoardData | null; formatLabel: string; courseName: string | null } | null> {
  const { game, players } = gwp;
  const admin = getAdminClient();
  const [tModes, courseName] = await Promise.all([
    getTranslations('modes'),
    readCourseName(admin, game.course_id),
  ]);
  const formatLabel = tModes(
    formatDisplayLabelKey(game.game_mode, game.mode_config) as Parameters<typeof tModes>[0],
  );

  if (shouldHideNetto(revealState(game.score_visibility, game.status))) {
    return { board: null, formatLabel, courseName };
  }

  const { holesRows, scoresRows } = await readBoardRows(admin, game, gameId);
  if (live) {
    const board = computeLiveBoard({ gameId, game, players, holesRows, scoresRows });
    if (!board) return null;
    return {
      board: buildEmbedBoard({
        unit: board.unit,
        holesPlayed: board.holesPlayed,
        leagueFlight: board.leagueFlight === true,
        rows: board.rows,
      }),
      formatLabel,
      courseName,
    };
  }

  const result = soloResult({ gameId, game, players, holesRows, scoresRows });
  if (!result) return null;
  const finished = soloResultBoard(result, players);
  return {
    board: buildEmbedBoard({
      unit: finished.unit,
      holesPlayed: finished.holesPlayed,
      leagueFlight: leagueFlightHasNoPlace(game.league_round_id != null),
      rows: finished.rows,
    }),
    formatLabel,
    courseName,
  };
}

/** Every format without the compact card: the full board as before #2330. */
async function FullBoard({
  gwp,
  gameId,
  live,
  mode,
  backHref,
  spectateHref,
}: {
  gwp: GameWithPlayers;
  gameId: string;
  live: boolean;
  mode: ReturnType<typeof parseMode>;
  backHref: string;
  spectateHref: string;
}) {
  const { game } = gwp;
  const t = await getTranslations('embed');

  const leaderboardNode = await renderLeaderboardContent({
    gameId,
    game,
    mode,
    backHref,
    supabase: getAdminClient(),
    includeReactions: false,
    // #1373: samme regel som spectate — ingen /games/*-lenker i en iframe uten
    // session; toggelen laster embed-siden på nytt med ny ?mode=.
    publicView: true,
    viewerUserId: '',
  });

  return (
    <>
      {leaderboardNode}
      {/* #1051: sponsorstripe over embed-footeren (self-hider uten sponsor). */}
      <SponsorStrip prizes={safeParsePrizes(game.prizes)} />
      <EmbedFooter
        href={spectateHref}
        live={live}
        statusLabel={live ? t('liveStatus') : t('resultStatus')}
      />
      <SpectatePoller live={live} />
    </>
  );
}
