import type { ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { firstName } from '@/lib/firstName';
import { COURSE_HOLES_SELECT, SCORES_SELECT } from '@/lib/supabase/queryFragments';
import { isFrontNineOpen } from '@/lib/leaderboard/frontNineGate';
import {
  EMPTY_NAV_CONTEXT,
  type LeaderboardNavContext,
} from '@/lib/leaderboard/navContext';
import { holeNumbersForSegment, firstHalfHoleNumbersForSegment } from '@/lib/games/holeScope';
import {
  computeLeaderboard,
  type LbHole,
  type LbPlayer,
  type LbScore,
  type LeaderboardMode,
} from '@/lib/leaderboard';
import { State4View } from './State4View';
import { RevealHiddenView } from './RevealHiddenView';
import { LeaderboardTabs } from './LeaderboardTabs';
import {
  SideTournamentView,
  type SideTournamentTeam,
} from './SideTournamentView';
import {
  WithdrawnPlayersSection,
  type WithdrawnPlayer,
} from './WithdrawnPlayersSection';
import { RoundReportCard } from './RoundReportCard';
import {
  calculateSideTournament,
  type SideTournamentInput,
} from '@/lib/scoring/sideTournament';
import { buildSideTournamentInput } from '@/lib/scoring/sideTournamentInput';
import { revealState } from '@/lib/games/visibility';
import { formatRevealName } from '@/lib/names/formatRevealName';
import {
  getGameWithPlayers,
  type GameForHole,
} from '@/lib/games/getGameWithPlayers';
import { localizeGameName } from '@/lib/games/autoGameName';
import type { AppLocale } from '@/i18n/routing';
import { isStablefordFamily, isScrambleFamily, isAlternateShotMatchplay } from '@/lib/scoring';
import { MODE_LABELS } from '@/lib/scoring/modes/types';
import {
  fetchSideWinners,
  buildPrizeAwards,
  getResultReadClient,
} from './leaderboardContext';
import { PrizeAwardsCard } from '@/components/PrizeAwardsCard';
import { ReactionsProvider } from './ReactionsProvider';
import { fetchGameReactions } from '@/lib/games/reactions/fetch';
import { renderStableford } from './formats/stableford';
import { renderMatchplay } from './formats/matchplay';
import { renderFourballMatchplay } from './formats/fourballMatchplay';
import { renderFoursomesMatchplay } from './formats/foursomesMatchplay';
import { renderSoloStrokeplay } from './formats/soloStrokeplay';
import { renderTexasScramble } from './formats/texasScramble';
import { renderWolf } from './formats/wolf';
import { renderNassau } from './formats/nassau';
import { renderSkins } from './formats/skins';
import { renderBingoBangoBongo } from './formats/bingoBangoBongo';
import { renderNines } from './formats/nines';
import { renderRoundRobin } from './formats/roundRobin';
import { renderAceyDeucey } from './formats/aceyDeucey';
import { renderShamble } from './formats/shamble';
import { renderPatsome } from './formats/patsome';
import { renderState3, renderState35 } from './formats/state3';
import type {
  SideWinnerRow,
  CourseHoleRow,
  ScoreRow,
} from './leaderboardTypes';

export type LeaderboardContentOpts = {
  gameId: string;
  game: GameForHole;
  mode: LeaderboardMode;
  backHref: string;
  /**
   * Back-navigation context threaded into every leaderboard-internal link
   * (drilldown, Netto/Brutto-toggle) so the back-arrow keeps pointing at the
   * entry-point the viewer actually came from (#1517). Omit on routes with no
   * such context — the chromeless spectate/embed views.
   */
  navContext?: LeaderboardNavContext;
  supabase: SupabaseClient<Database>;
  includeReactions: boolean;
  viewerUserId: string;
  /**
   * Mount `ReactionsProvider` in its inert state (#1488, K11). Non-participants
   * may open a FINISHED game's leaderboard (#1468), but the reaction write is
   * RLS-gated to participants — tapping would just fail silently. The caller
   * passes `!isParticipant` so a spectator's taps do nothing (no server call).
   * Only consulted when `includeReactions` is true.
   */
  reactionsDisabled?: boolean;
  /**
   * True on the public, session-less surfaces — `/spectate/[token]` and
   * `/embed/spill/[token]` (#1373). They reuse this renderer, but `/games/*` is
   * not in `PUBLIC_PATH_PATTERN` (proxy.ts), so every link into it is a dead
   * end that lands an anonymous viewer on /login. Drilldown links, the drill
   * hint and the CSV export are therefore dropped, and the Netto/Brutto-toggle
   * points back at `backHref` — the public page's own path, which parses
   * `?mode=` itself. Defaults to false: the authed leaderboard is unchanged.
   */
  publicView?: boolean;
};

/**
 * Shared rendering logic for the leaderboard — used by both the authed
 * `/leaderboard` route (page.tsx) and the public `/spectate/[token]` route.
 *
 * Contract:
 *   - Does NOT resolve the viewer itself — caller provides `supabase`. På et
 *     FERDIG spill byttes den ut med service-role-klienten (#1542,
 *     `getResultReadClient`); på alt annet brukes den som-den-er, så spectate
 *     beholder sin egen admin-klient for live-følging.
 *   - Fetches course_holes, scores, courses, and (when enabled) side-winners
 *     via the passed `supabase` client.
 *   - When `includeReactions` is true: fetches reactions and wraps the
 *     individual-format views in `ReactionsProvider`. When false, the wrapper
 *     is an identity function — `ReactionsProvider` is never mounted.
 *   - The `viewerUserId` is only used when `includeReactions` is true.
 *
 * Refs #938
 */
export async function renderLeaderboardContent({
  gameId,
  game: gameRow,
  mode,
  backHref,
  navContext = EMPTY_NAV_CONTEXT,
  supabase,
  includeReactions,
  viewerUserId,
  reactionsDisabled = false,
  publicView = false,
}: LeaderboardContentOpts): Promise<ReactNode> {
  const [tc, locale] = await Promise.all([
    getTranslations('leaderboard.common'),
    getLocale(),
  ]);

  // Players come from the tag-cached helper (cache hit since the outer
  // page already warmed it). Holes + scores stay direct fetches.
  // #624 — banenavnet hentes slankt parallelt (ikke via den cachede
  // getGameWithPlayers, som bevisst ikke joiner courses) for å re-lokalisere
  // det auto-genererte spillnavnet ved visning.
  // #943 — reactions fetch runs in parallel only when includeReactions is true.
  const reactionsFetch = includeReactions
    ? fetchGameReactions(supabase, gameId, viewerUserId)
    : Promise.resolve({} as Awaited<ReturnType<typeof fetchGameReactions>>);

  // #1441 (D3): a DERIVED game (source_game_id set) owns no scores of its
  // own — every score read redirects to the host game. A host game's own
  // `source_game_id` is null, so `?? gameId` is a no-op for it (today's
  // behavior, byte-identical).
  const scoresGameId = gameRow.source_game_id ?? gameId;

  // #1542: resultat-dataene leses med den klienten regelen i
  // `getResultReadClient` peker ut — service-role på et FERDIG spill, ellers
  // klienten kallstedet sendte inn (uendret for spectate/live). Uten dette gir
  // RLS 0 rader til alle som ikke selv spilte kampen, og cup-publikummet som
  // matchkortene lenker hit møter et tomt kort.
  const readClient = await getResultReadClient(gameRow.status, supabase);

  const [gwp, rawHolesRes, rawScoresRes, courseRes, reactionSummary] = await Promise.all([
    getGameWithPlayers(gameId),
    readClient
      .from('course_holes')
      .select(COURSE_HOLES_SELECT)
      .eq('course_id', gameRow.course_id)
      .order('hole_number', { ascending: true })
      .returns<CourseHoleRow[]>(),
    readClient
      .from('scores')
      .select(SCORES_SELECT)
      .eq('game_id', scoresGameId)
      .returns<ScoreRow[]>(),
    gameRow.course_id
      ? readClient
          .from('courses')
          .select('name')
          .eq('id', gameRow.course_id)
          .maybeSingle<{ name: string }>()
      : Promise.resolve({ data: null as { name: string } | null }),
    reactionsFetch,
  ]);

  // #943 — wraps the 9 individual-player format returns in ReactionsProvider
  // when includeReactions is true. When false, it is an identity wrapper so
  // ReactionsProvider is never mounted (spectate route, #938).
  const withReactions = (node: ReactNode): ReactNode =>
    includeReactions ? (
      <ReactionsProvider
        gameId={gameId}
        initial={reactionSummary}
        disabled={reactionsDisabled}
      >
        {node}
      </ReactionsProvider>
    ) : (
      node
    );

  if (!gwp) notFound();
  if (rawHolesRes.error) throw rawHolesRes.error;
  if (rawScoresRes.error) throw rawScoresRes.error;

  // #624 — lokaliser det frosne spillnavnet én gang ved kilden.
  const game: GameForHole = {
    ...gameRow,
    name: localizeGameName(
      gameRow.name,
      courseRes.data?.name ?? null,
      locale as AppLocale,
    ),
  };

  // #1441 (D1/D2): filter the shared course-holes + scores rows down to the
  // game's `hole_segment` scope ONCE, here, before they reach any format
  // consumer below. 'full' (today's default) resolves to every hole number
  // 1-18 — a no-op filter, byte-identical to pre-#1441 behavior. 'front9'/
  // 'back9' narrow both arrays to their 9 hole numbers, which every format
  // branch (matchplay/fourball/foursomes included — D2's "caller passes
  // segment-filtered holes" contract) then treats as the game's full scope.
  const scopedHoleNumbers = new Set(holeNumbersForSegment(game.hole_segment));
  const scopedHolesRows = (rawHolesRes.data ?? []).filter((h) =>
    scopedHoleNumbers.has(h.hole_number),
  );
  const scopedScoresRows = (rawScoresRes.data ?? []).filter((s) =>
    scopedHoleNumbers.has(s.hole_number),
  );

  // #1051: Premieutdeling — kobler premiebordet til vinnerne på et avsluttet
  // spill, rendret rett under podiet via footerSlot i format-renderene. Regnes
  // ut ÉN gang her (buildPrizeAwards no-op-er billig når spillet ikke har
  // premier), og tres inn i best-ball-, stableford- og solo-strokeplay-podiene.
  // Null når spillet ikke har premier eller ingen premie fikk vinner.
  const prizeAwardsNode =
    game.status === 'finished'
      ? await (async () => {
          const awards = await buildPrizeAwards(readClient, gameId, game.prizes);
          return awards.length > 0 ? <PrizeAwardsCard awards={awards} /> : null;
        })()
      : null;

  // Stableford-grenen
  if (isStablefordFamily(game.game_mode)) {
    return withReactions(await renderStableford({
      gameId,
      game,
      gwp,
      rawHolesRows: scopedHolesRows,
      rawScoresRows: scopedScoresRows,
      backHref,
      prizeAwardsNode,
    }));
  }

  // Matchplay-grenen (1v1 hull-for-hull)
  if (game.game_mode === 'singles_matchplay') {
    return renderMatchplay({
      gameId,
      game,
      gwp,
      rawHolesRows: scopedHolesRows,
      rawScoresRows: scopedScoresRows,
      backHref,
    });
  }

  // Fourball matchplay (2v2 lag-best matchplay)
  if (game.game_mode === 'fourball_matchplay') {
    return renderFourballMatchplay({
      gameId,
      game,
      gwp,
      rawHolesRows: scopedHolesRows,
      rawScoresRows: scopedScoresRows,
      backHref,
    });
  }

  // Foursomes-familien (vekselslag-format)
  if (isAlternateShotMatchplay(game.game_mode)) {
    return renderFoursomesMatchplay({
      gameId,
      game,
      gwp,
      rawHolesRows: scopedHolesRows,
      rawScoresRows: scopedScoresRows,
      backHref,
    });
  }

  // Solo strokeplay
  if (game.game_mode === 'solo_strokeplay') {
    return withReactions(await renderSoloStrokeplay({
      gameId,
      game,
      gwp,
      rawHolesRows: scopedHolesRows,
      rawScoresRows: scopedScoresRows,
      backHref,
      prizeAwardsNode,
    }));
  }

  // Texas scramble og Ambrose
  if (isScrambleFamily(game.game_mode)) {
    return renderTexasScramble({
      gameId,
      game,
      gwp,
      rawHolesRows: scopedHolesRows,
      rawScoresRows: scopedScoresRows,
      backHref,
      prizeAwardsNode,
      formatLabel: MODE_LABELS[game.game_mode],
    });
  }

  // Wolf
  if (game.game_mode === 'wolf') {
    return withReactions(await renderWolf({
      gameId,
      game,
      gwp,
      rawHolesRows: scopedHolesRows,
      rawScoresRows: scopedScoresRows,
      backHref,
      prizeAwardsNode,
    }));
  }

  // Nassau
  if (game.game_mode === 'nassau') {
    return withReactions(await renderNassau({
      gameId,
      game,
      gwp,
      rawHolesRows: scopedHolesRows,
      rawScoresRows: scopedScoresRows,
      backHref,
      prizeAwardsNode,
    }));
  }

  // Skins med carryover
  if (game.game_mode === 'skins') {
    return withReactions(await renderSkins({
      gameId,
      game,
      gwp,
      rawHolesRows: scopedHolesRows,
      rawScoresRows: scopedScoresRows,
      backHref,
      prizeAwardsNode,
    }));
  }

  // Bingo Bango Bongo
  if (game.game_mode === 'bingo_bango_bongo') {
    return withReactions(await renderBingoBangoBongo({
      gameId,
      game,
      gwp,
      rawHolesRows: scopedHolesRows,
      rawScoresRows: scopedScoresRows,
      backHref,
      prizeAwardsNode,
    }));
  }

  // Nines / Split Sixes
  if (game.game_mode === 'nines') {
    return withReactions(await renderNines({
      gameId,
      game,
      gwp,
      rawHolesRows: scopedHolesRows,
      rawScoresRows: scopedScoresRows,
      backHref,
      prizeAwardsNode,
    }));
  }

  // Round Robin
  if (game.game_mode === 'round_robin') {
    return withReactions(await renderRoundRobin({
      gameId,
      game,
      gwp,
      rawHolesRows: scopedHolesRows,
      rawScoresRows: scopedScoresRows,
      backHref,
      prizeAwardsNode,
    }));
  }

  // Acey Deucey
  if (game.game_mode === 'acey_deucey') {
    return withReactions(await renderAceyDeucey({
      gameId,
      game,
      gwp,
      rawHolesRows: scopedHolesRows,
      rawScoresRows: scopedScoresRows,
      backHref,
      prizeAwardsNode,
    }));
  }

  // Shamble / Champagne Scramble
  if (game.game_mode === 'shamble') {
    return renderShamble({
      gameId,
      game,
      gwp,
      rawHolesRows: scopedHolesRows,
      rawScoresRows: scopedScoresRows,
      backHref,
      prizeAwardsNode,
    });
  }

  // Patsome
  if (game.game_mode === 'patsome') {
    return renderPatsome({
      gameId,
      game,
      gwp,
      rawHolesRows: scopedHolesRows,
      rawScoresRows: scopedScoresRows,
      backHref,
      prizeAwardsNode,
    });
  }

  // WD (#386): build the withdrawn list BEFORE the active-players map.
  // Only for best_ball (this default branch).
  const unknownPlayer = tc('unknownPlayer');

  const bestBallWithdrawn: WithdrawnPlayer[] = gwp.players
    .filter((p) => p.users != null && p.withdrawn_at != null)
    .map((p) => ({
      user_id: p.user_id,
      display_name: p.users!.name ?? unknownPlayer,
    }));
  const bestBallWithdrawnIds = new Set(bestBallWithdrawn.map((p) => p.user_id));

  const players: LbPlayer[] = gwp.players
    .filter((p) => p.users != null && p.withdrawn_at == null)
    .map((p) => ({
      userId: p.user_id,
      name: p.users!.name ?? unknownPlayer,
      nickname: p.users!.nickname,
      teamNumber: p.team_number,
      courseHandicap: p.course_handicap ?? 0,
      teeGender: p.tee_gender,
    }));

  const holes: LbHole[] = (scopedHolesRows).map((h) => ({
    holeNumber: h.hole_number,
    par: h.par_mens,
    parByGender: {
      mens: h.par_mens,
      ladies: h.par_ladies,
      juniors: h.par_juniors,
    },
    strokeIndex: h.stroke_index,
  }));

  const scores: LbScore[] = (scopedScoresRows)
    .filter((s) => !bestBallWithdrawnIds.has(s.user_id))
    .map((s) => ({
      userId: s.user_id,
      holeNumber: s.hole_number,
      strokes: s.strokes,
    }));

  // F1: view branching. State #3 (timeglass) when game hasn't progressed far
  // enough to show anything meaningful — either still scheduled, or active
  // but no team has finished front 9 yet. State #3.5 (front 9 visible, back
  // 9 locked) when at least one team has completed front 9 but game isn't
  // finished. Full leaderboard once status flips to finished.
  const frontNineOpen = isFrontNineOpen({
    players: gwp.players.map((p) => ({
      user_id: p.user_id,
      team_number: p.team_number,
    })),
    scores: (scopedScoresRows).map((s) => ({
      user_id: s.user_id,
      hole_number: s.hole_number,
      strokes: s.strokes,
    })),
    // #1441: 'full' resolves to [1..9] — byte-identical to the pre-#1441
    // hardcoded default. front9/back9 games get their own first-half gate.
    gateHoles: firstHalfHoleNumbersForSegment(game.hole_segment),
  });

  type View =
    | 'state3'
    | 'state3.5'
    | 'full'
    | 'reveal-active'
    | 'reveal-finished';

  const state = revealState(game.score_visibility, game.status);
  let view: View;
  if (state === 'live-always') {
    view =
      game.status === 'finished'
        ? 'full'
        : !frontNineOpen
          ? 'state3'
          : 'state3.5';
  } else if (state === 'reveal-active') {
    view = 'reveal-active';
  } else {
    view = 'reveal-finished';
  }

  if (view === 'state3') {
    return renderState3({
      gameId,
      teeOffAt: game.scheduled_tee_off_at,
      players,
      backHref,
    });
  }

  if (view === 'state3.5') {
    return renderState35({
      gameId,
      mode,
      players,
      holes,
      scores,
      backHref,
      holeSegment: game.hole_segment,
      navContext,
      publicView,
    });
  }

  // #1441 D12: this branch is only ever reached by best_ball (every other
  // mode has an early return above with its own reveal handling — matchplay/
  // fourball/foursomes use the same RevealHiddenView, solo/stroke formats
  // keep RevealBruttoView). Blind cup-day requires "ingenting avsløres" —
  // stricter than RevealBruttoView's brutto-totals preview.
  if (view === 'reveal-active') {
    return <RevealHiddenView gameName={game.name} backHref={backHref} />;
  }

  const lines = computeLeaderboard({ mode, players, holes, scores });
  const orderedLines = [...lines].sort((a, b) => a.rank - b.rank);
  const coursePar = holes.reduce((sum, h) => sum + h.par, 0);
  const holesPlayed = new Set(scores.map((s) => s.holeNumber)).size;

  const showSideTournament = game.side_tournament_enabled;

  // #1008: AI-rundereferat, komponert FØR WithdrawnPlayersSection i footerSlot-
  // kjeden. This fallthrough (view 'full' or 'reveal-finished') is only ever
  // reached when the game is finished, so gating on the field alone is
  // sufficient — mirrors the stableford.tsx renderer's `wdSection` pattern.
  const reportSection = game.round_report ? (
    <RoundReportCard text={game.round_report} />
  ) : null;

  if (!showSideTournament) {
    return (
      <State4View
        gameId={gameId}
        gameName={game.name}
        teams={orderedLines}
        mode={mode}
        coursePar={coursePar}
        holesPlayed={holesPlayed}
        backHref={backHref}
        navContext={navContext}
        publicView={publicView}
        footerSlot={
          <>
            {prizeAwardsNode}
            {reportSection}
            <WithdrawnPlayersSection players={bestBallWithdrawn} />
          </>
        }
      />
    );
  }

  const sideWinnerRows: SideWinnerRow[] = await fetchSideWinners(readClient, gameId);

  const nettoLines =
    mode === 'netto'
      ? orderedLines
      : computeLeaderboard({ mode: 'netto', players, holes, scores });

  const sortedNettoLines = [...nettoLines].sort(
    (a, b) => a.teamNumber - b.teamNumber,
  );

  const sideTeams: SideTournamentTeam[] = sortedNettoLines.map((line) => ({
    teamId: line.teamNumber,
    label: tc('teamLabel', { number: line.teamNumber }),
    members: line.players.map((p) => ({
      userId: p.userId,
      displayName: formatRevealName(p.name ?? '', p.nickname),
      firstName:
        firstName(p.name) ??
        formatRevealName(p.name ?? '', p.nickname) ??
        '?',
    })),
  }));

  const sideInput: SideTournamentInput = buildSideTournamentInput({
    nettoLines,
    holes: holes.map((h) => ({
      holeNumber: h.holeNumber,
      par: h.par,
      strokeIndex: h.strokeIndex,
    })),
    ldCount: game.side_ld_count as 0 | 1 | 2,
    ctpCount: game.side_ctp_count as 0 | 1 | 2,
    disabledCategories: game.side_disabled_categories ?? [],
    sideWinnerRows,
  });

  const sideResult = calculateSideTournament(sideInput);

  return (
    <AppShell>
      <TopBar backHref={backHref} kicker={game.name} />
      <LeaderboardTabs
        mainContent={
          <>
            <State4View
              gameId={gameId}
              gameName={game.name}
              teams={orderedLines}
              mode={mode}
              coursePar={coursePar}
              holesPlayed={holesPlayed}
              backHref={backHref}
              navContext={navContext}
              publicView={publicView}
              chromeless
            />
            {prizeAwardsNode}
            {reportSection}
            <WithdrawnPlayersSection players={bestBallWithdrawn} />
          </>
        }
        sideContent={
          <SideTournamentView
            teams={sideTeams}
            result={sideResult}
            ldCount={sideInput.config.ldCount}
            ctpCount={sideInput.config.ctpCount}
            sideWinners={sideInput.sideWinners}
            coursePars={sideInput.coursePars}
            disabledCategories={game.side_disabled_categories ?? []}
          />
        }
      />
    </AppShell>
  );
}
