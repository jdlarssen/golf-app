import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { HeadToHeadResult, type StripCell } from '../HeadToHeadResult';
import {
  SoloStablefordView,
  type SoloStablefordPlayerInfo,
} from '../SoloStablefordView';
import { SoloStablefordPodium } from '../SoloStablefordPodium';
import { TeamStablefordView } from '../TeamStablefordView';
import { TeamStablefordPodium } from '../TeamStablefordPodium';
import {
  WithdrawnPlayersSection,
  type WithdrawnPlayer,
} from '../WithdrawnPlayersSection';
import { RoundReportCard } from '../RoundReportCard';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { buildStablefordContext } from '@/lib/scoring/context/buildStablefordContext';
import { maxHolesPlayed } from '@/lib/scoring/holesPlayed';
import { renderSideTournamentTabs } from '../sideTournament';
import { RevealBruttoView } from '../RevealBruttoView';
import { computeLeaderboard } from '@/lib/leaderboard';
import { revealState, shouldHideNetto } from '@/lib/games/visibility';
import type { GameForHole } from '@/lib/games/getGameWithPlayers';
import type { TeeGender } from '@/lib/games/teeRating';

/**
 * Stableford-grenen — bygger ScoringContext fra rå-rad-ene, kjører
 * mode-router-en (`computeModeResult`) og velger view per `game.status`
 * og `score_visibility`:
 *
 *   - `score_visibility='reveal'` + `status='active'` → RevealBruttoView:
 *     viser brutto-slag-totaler mens netto-rangeringen skjules til admin
 *     avslutter spillet (issue #801).
 *   - `finished` → SoloStablefordPodium: topp 3 podium med konfetti på
 *     1.-plass og resten av rangeringen collapsed under.
 *   - alt annet (active/scheduled, live-visibility) → SoloStablefordView:
 *     flat liste sortert på poeng.
 *
 * For best-ball reuser vi state #3/#3.5-grenene fordi de avhenger av flight-
 * og lag-strukturen. Solo-stableford trenger ingen «venterom»-stat ennå
 * (alle ser hverandre umiddelbart via 0031-RLS), så vi viser leaderboarden
 * helt fra første score lander.
 */
export async function renderStableford(opts: {
  gameId: string;
  game: GameForHole;
  gwp: {
    players: {
      user_id: string;
      team_number: number;
      users: { name: string | null; nickname: string | null } | null;
      course_handicap: number | null;
      tee_gender: TeeGender;
      withdrawn_at: string | null;
    }[];
  };
  rawHolesRows: { hole_number: number; par_mens: number; par_ladies: number; par_juniors: number; stroke_index: number }[];
  rawScoresRows: { user_id: string; hole_number: number; strokes: number | null }[];
  backHref: string;
  /** #1051: Premieutdeling-kortet, rendret under podiet i finished-footeren. */
  prizeAwardsNode?: ReactNode;
}) {
  const tc = await getTranslations('leaderboard.common');
  const th2h = await getTranslations('leaderboard.h2h');
  const { gameId, game, gwp, rawHolesRows, rawScoresRows, backHref, prizeAwardsNode } = opts;

  // Stableford-grenen dekker både 'stableford' og 'modified_stableford'.
  // game.game_mode er en GameMode-union; vi narrower til de to stableford-
  // modusene for buildStablefordContext (game_mode-passthrough så router-en
  // velger riktig poeng-tabell).
  const stablefordMode: 'stableford' | 'modified_stableford' =
    game.game_mode === 'modified_stableford' ? 'modified_stableford' : 'stableford';
  const holesPlayed = maxHolesPlayed(rawScoresRows);

  // WD (#386): build withdrawn list for the display section. The ctx-builder
  // does its own WD-filtering of players + scores.
  const unknownPlayer = tc('unknownPlayer');

  const stablefordWithdrawn: WithdrawnPlayer[] = gwp.players
    .filter((p) => p.users != null && p.withdrawn_at != null)
    .map((p) => ({
      user_id: p.user_id,
      display_name: p.users!.name ?? unknownPlayer,
    }));

  // Delt context-bygging (epic #496) — samme kilde som «Hull for hull»-flaten
  // (SoloStablefordHolesBody), inkl. WD-filtrering + team-variant teamNumber.
  const ctx = buildStablefordContext({
    gameId,
    gameMode: stablefordMode,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHolesRows,
    scoresRows: rawScoresRows,
  });

  const result = computeModeResult(ctx);
  // Type-guard mot mode-router-output. Hvis routeren returnerer feil shape
  // (skal ikke kunne skje siden ctx.game.game_mode = 'stableford' tvinger
  // kind), faller vi tilbake til notFound() — sikrere enn å rendre tom UI.
  if (result.kind !== 'stableford') {
    notFound();
  }

  const playersById = new Map<string, SoloStablefordPlayerInfo>();
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playersById.set(p.user_id, {
      name: p.users.name ?? unknownPlayer,
      nickname: p.users.nickname,
    });
  }

  // Sideturnering vises kun etter at admin har avsluttet spillet, og kun hvis
  // admin valgte å legge til en sideturnering ved opprettelse (issue #165).
  // Live/scheduled status faller alltid tilbake til den enkle podium/view-en
  // — sideturneringen er designet som et post-game-reveal-element parallelt
  // til hovedpodiet.
  const showSideTournament =
    game.status === 'finished' && game.side_tournament_enabled;

  // The WD section is appended after the main leaderboard content on every
  // return path. Renders nothing when stablefordWithdrawn is empty.
  const wdSection = <WithdrawnPlayersSection players={stablefordWithdrawn} />;

  // #1008: AI-rundereferat, komponert FØR wdSection i footerSlot-kjeden. Only
  // ever non-null when the game is finished (round_report is written by the
  // finish actions), so gating on the field alone is sufficient here.
  const reportSection = game.round_report ? (
    <RoundReportCard text={game.round_report} />
  ) : null;

  // Reveal-modus (issue #801): mens spillet er aktivt og score_visibility='reveal'
  // skjules netto-rangeringen — kun brutto-slag vises. RevealBruttoView bruker
  // computeLeaderboard fra lib/leaderboard med mode:'brutto'. For solo-stableford
  // (team_number=0 i DB) tilordner vi hvert aktive spillers unike sekvensielle
  // teamNumber for å gruppere de som enkeltspiller-«lag». For team-stableford
  // brukes game_players.team_number direkte. Ferdig spill (status='finished')
  // faller gjennom til normal podium-vei.
  const revSt = revealState(game.score_visibility, game.status);
  if (shouldHideNetto(revSt)) {
    const activePlayers = gwp.players.filter(
      (p) => p.users != null && p.withdrawn_at == null,
    );
    // Determine whether this is the team-variant (par-stableford: team_size=2).
    // The same logic as buildStablefordContext so we stay in sync.
    const modeConfig = game.mode_config as { team_size?: number } | null;
    const isTeamVariant =
      modeConfig != null &&
      typeof modeConfig === 'object' &&
      modeConfig.team_size === 2;
    const bruttoPlayers = activePlayers.map((p, idx) => ({
      userId: p.user_id,
      name: p.users!.name ?? unknownPlayer,
      nickname: p.users!.nickname ?? null,
      // Team variant: use the real team_number. Solo: assign sequential IDs
      // (1-based) so each player forms their own one-person «team» in the
      // brutto computeLeaderboard call (team_number=0 in DB for solo formats).
      teamNumber: isTeamVariant ? p.team_number : idx + 1,
      courseHandicap: p.course_handicap ?? 0,
      teeGender: p.tee_gender,
    }));
    const bruttoHoles = rawHolesRows.map((h) => ({
      holeNumber: h.hole_number,
      par: h.par_mens,
      parByGender: {
        mens: h.par_mens,
        ladies: h.par_ladies,
        juniors: h.par_juniors,
      },
      strokeIndex: h.stroke_index,
    }));
    const withdrawnIdsSet = new Set(
      gwp.players
        .filter((p) => p.withdrawn_at != null)
        .map((p) => p.user_id),
    );
    const bruttoScores = rawScoresRows
      .filter((s) => !withdrawnIdsSet.has(s.user_id))
      .map((s) => ({
        userId: s.user_id,
        holeNumber: s.hole_number,
        strokes: s.strokes,
      }));
    const bruttoLines = computeLeaderboard({
      mode: 'brutto',
      players: bruttoPlayers,
      holes: bruttoHoles,
      scores: bruttoScores,
    });
    const orderedBrutto = [...bruttoLines].sort((a, b) => a.rank - b.rank);
    return (
      <RevealBruttoView
        gameId={gameId}
        gameName={game.name}
        teams={orderedBrutto}
        holesPlayed={holesPlayed}
        backHref={backHref}
        footerSlot={wdSection}
      />
    );
  }

  // Variant-router: par-stableford (team) → team-view/podium, solo → solo-
  // view/podium. State4-flippen (finished vs live) er identisk på begge:
  // finished → champagne-podium med konfetti, alt annet → flat live-leaderboard.
  if (result.variant === 'team') {
    if (game.status === 'finished') {
      const podium = (chromeless: boolean, footerSlot?: ReactNode) => (
        <TeamStablefordPodium
          gameId={gameId}
          gameName={game.name}
          result={result}
          playersById={playersById}
          holesPlayed={holesPlayed}
          backHref={backHref}
          chromeless={chromeless}
          footerSlot={footerSlot}
        />
      );
      if (!showSideTournament) {
        return podium(
          false,
          <>
            {prizeAwardsNode}
            {reportSection}
            {wdSection}
          </>,
        );
      }
      return (
        <>
          {await renderSideTournamentTabs({
            gameId,
            game,
            gwp,
            rawHolesRows,
            rawScoresRows,
            backHref,
            mainContent: podium(true),
            teamGrouping: 'byTeamNumber',
          })}
          {prizeAwardsNode}
          {reportSection}
          {wdSection}
        </>
      );
    }
    return (
      <TeamStablefordView
        gameId={gameId}
        gameName={game.name}
        result={result}
        playersById={playersById}
        holesPlayed={holesPlayed}
        backHref={backHref}
        footerSlot={wdSection}
      />
    );
  }

  // Finished → reveal-podium (fase 6). Active/scheduled → flat live-view.
  if (game.status === 'finished') {
    // Ved nøyaktig 2 spillere er det en duell → head-to-head-kort i stedet for
    // podium (epic #496). Stableford er høyest-vinner, så HeadToHeadResult
    // brukes med default (ingen lowerWins). Med sideturnering (#576) mates
    // samme reveal (duell eller podium) inn som mainContent i LeaderboardTabs —
    // duell-kortet beholdes også med sideturnering på (#589).
    // mainContent tar `chromeless` så samme reveal kan rendres frittstående
    // ELLER inni sideturnerings-fanen.
    let mainContent: (chromeless: boolean, footerSlot?: ReactNode) => ReactNode;
    if (result.players.length === 2) {
      const order = gwp.players.map((p) => p.user_id);
      const [a, b] = [...result.players].sort(
        (x, y) => order.indexOf(x.userId) - order.indexOf(y.userId),
      );
      const sideFor = (pl: typeof a) => {
        const info = playersById.get(pl.userId);
        return {
          userId: pl.userId,
          name: info?.name ?? unknownPlayer,
          nickname: info?.nickname ?? null,
          score: pl.totalPoints,
          subLabel: th2h('subLabelHolesPlayed', { count: pl.holesPlayed }),
        };
      };
      const strip: StripCell[] = result.holes.map((h): StripCell => {
        if (h.bestUserIds.length === 1) {
          if (h.bestUserIds[0] === a.userId) return 'a';
          if (h.bestUserIds[0] === b.userId) return 'b';
          return 'unplayed';
        }
        if (h.bestUserIds.length > 1) return 'halved';
        return 'unplayed';
      });
      const winnerUserId =
        a.rank === b.rank ? null : a.rank < b.rank ? a.userId : b.userId;
      mainContent = (chromeless, footerSlot) => (
        <HeadToHeadResult
          gameId={gameId}
          gameName={game.name}
          formatLabel={
            stablefordMode === 'modified_stableford'
              ? 'Modifisert Stableford'
              : 'Stableford'
          }
          unitLabel="poeng"
          sideA={sideFor(a)}
          sideB={sideFor(b)}
          winnerUserId={winnerUserId}
          strip={strip}
          backHref={backHref}
          chromeless={chromeless}
          footerSlot={footerSlot}
        />
      );
    } else {
      mainContent = (chromeless, footerSlot) => (
        <SoloStablefordPodium
          gameId={gameId}
          gameName={game.name}
          result={result}
          playersById={playersById}
          holesPlayed={holesPlayed}
          backHref={backHref}
          chromeless={chromeless}
          footerSlot={footerSlot}
        />
      );
    }
    if (!showSideTournament) {
      return mainContent(
        false,
        <>
          {prizeAwardsNode}
          {reportSection}
          {wdSection}
        </>,
      );
    }
    return (
      <>
        {await renderSideTournamentTabs({
          gameId,
          game,
          gwp,
          rawHolesRows,
          rawScoresRows,
          backHref,
          mainContent: mainContent(true),
          teamGrouping: 'solo',
        })}
        {reportSection}
        {wdSection}
      </>
    );
  }

  return (
    <SoloStablefordView
      gameId={gameId}
      gameName={game.name}
      result={result}
      playersById={playersById}
      holesPlayed={holesPlayed}
      backHref={backHref}
      footerSlot={wdSection}
    />
  );
}
