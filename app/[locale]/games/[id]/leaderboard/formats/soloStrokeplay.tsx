import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { HeadToHeadResult, type StripCell } from '../HeadToHeadResult';
import {
  SoloStrokeplayView,
  type SoloStrokeplayPlayerInfo,
} from '../SoloStrokeplayView';
import { SoloStrokeplayPodium } from '../SoloStrokeplayPodium';
import {
  WithdrawnPlayersSection,
  type WithdrawnPlayer,
} from '../WithdrawnPlayersSection';
import { RoundReportCard } from '../RoundReportCard';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { buildSoloStrokeplayContext } from '@/lib/scoring/context/buildSoloStrokeplayContext';
import { maxHolesPlayed } from '@/lib/scoring/holesPlayed';
import { renderSideTournamentTabs } from '../sideTournament';
import { RevealBruttoView } from '../RevealBruttoView';
import { computeLeaderboard } from '@/lib/leaderboard';
import { revealState, shouldHideNetto } from '@/lib/games/visibility';
import type { GameForHole } from '@/lib/games/getGameWithPlayers';
import type { TeeGender } from '@/lib/games/teeRating';

/**
 * Solo strokeplay-grenen — bygger ScoringContext fra rå-rad-ene, kjører
 * mode-router-en (`computeModeResult`) og velger view per `game.status`
 * og `score_visibility`:
 *
 *   - `score_visibility='reveal'` + `status='active'` → RevealBruttoView:
 *     viser brutto-slag-totaler mens netto-rangeringen skjules til admin
 *     avslutter spillet (issue #801).
 *   - `finished` → SoloStrokeplayPodium: topp 3 podium med konfetti på 1.-plass
 *     og resten av rangeringen collapsed under.
 *   - alt annet (active/scheduled, live-visibility) → SoloStrokeplayView: flat
 *     liste sortert på laveste netto-total.
 *
 * Speilet `renderStableford`-pattern for konsistens. Solo strokeplay har
 * `team_size = 1` i `mode_config` (validatoren håndhever), så `teamNumber`
 * sendes som null for å matche scoring-laget sin solo-narrowing.
 *
 * State #3/#3.5-«venterom» er bevisst skipped — slagspill-spillere ser
 * hverandre umiddelbart (samme RLS-policy som stableford og matchplay).
 */
export async function renderSoloStrokeplay(opts: {
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

  // WD (#386): build withdrawn list for the display section. The ctx-builder
  // does its own WD-filtering of players + scores, so we only need the list
  // for the WithdrawnPlayersSection chrome here.
  const unknownPlayer = tc('unknownPlayer');

  const soloWithdrawn: WithdrawnPlayer[] = gwp.players
    .filter((p) => p.users != null && p.withdrawn_at != null)
    .map((p) => ({
      user_id: p.user_id,
      display_name: p.users!.name ?? unknownPlayer,
    }));

  const holesPlayed = maxHolesPlayed(rawScoresRows);

  // Reveal-modus (issue #801): mens spillet er aktivt og score_visibility='reveal'
  // skjules netto-rangeringen — kun brutto-slag vises. Solo strokeplay har
  // team_number=0 i DB (solo-validatoren), så vi tilordner hvert aktive spillers
  // unike sekvensielle teamNumber for computeLeaderboard fra lib/leaderboard.
  const revSt = revealState(game.score_visibility, game.status);
  if (shouldHideNetto(revSt)) {
    const wdSection = <WithdrawnPlayersSection players={soloWithdrawn} />;
    const withdrawnIdsSet = new Set(
      gwp.players
        .filter((p) => p.withdrawn_at != null)
        .map((p) => p.user_id),
    );
    const bruttoPlayers = gwp.players
      .filter((p) => p.users != null && p.withdrawn_at == null)
      .map((p, idx) => ({
        userId: p.user_id,
        name: p.users!.name ?? unknownPlayer,
        nickname: p.users!.nickname ?? null,
        // Solo: each player is their own «team» (sequential 1-based IDs).
        teamNumber: idx + 1,
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

  // Delt context-bygging (epic #496) — samme kilde som «Hull for hull»-flaten
  // (SoloStrokeplayHolesBody), inkl. WD-filtrering, så map-logikken ikke
  // dupliseres.
  const ctx = buildSoloStrokeplayContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHolesRows,
    scoresRows: rawScoresRows,
  });

  const result = computeModeResult(ctx);
  // Type-guard mot mode-router-output. Hvis routeren returnerer feil shape
  // faller vi tilbake til notFound() — sikrere enn å rendre tom UI.
  if (result.kind !== 'solo_strokeplay') {
    notFound();
  }

  const playersById = new Map<string, SoloStrokeplayPlayerInfo>();
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playersById.set(p.user_id, {
      name: p.users.name ?? unknownPlayer,
      nickname: p.users.nickname,
    });
  }

  const wdSection = <WithdrawnPlayersSection players={soloWithdrawn} />;

  // Finished → champagne-podium med konfetti. Ved nøyaktig 2 (aktive) spillere
  // er det en duell → head-to-head-kort i stedet for podium (epic #496);
  // slagspill er lavest-vinner, så `lowerWins` inverterer baren + dommen.
  // 1 eller 3+ → SoloStrokeplayPodium som før. Active/scheduled → flat live-view.
  // Med sideturnering (#576) mates samme reveal (duell eller podium) inn som
  // mainContent i LeaderboardTabs — duell-kortet beholdes også med sideturnering
  // på (#589).
  if (game.status === 'finished') {
    const showSide = game.side_tournament_enabled;
    // #1008: AI-rundereferat, komponert FØR wdSection i footerSlot-kjeden.
    // `undefined` (ikke tomt fragment) når ingen report finnes, slik at
    // viewene forblir byte-identiske med før-#1008.
    const reportSection = game.round_report ? (
      <RoundReportCard text={game.round_report} />
    ) : null;
    // mainContent: duell-kort (2 spillere) eller podium (1/3+). Tar `chromeless`
    // så samme reveal kan rendres frittstående ELLER inni sideturnerings-fanen.
    let mainContent: (chromeless: boolean, footerSlot?: ReactNode) => ReactNode;
    if (result.players.length === 2) {
      // Stabil rekkefølge etter game_players (ikke rank), så fargene følger
      // spiller-identitet — ikke hvem som vant.
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
          score: pl.totalNetStrokes,
          subLabel: th2h('subLabelGross', { gross: pl.totalGrossStrokes }),
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
      // Lavest netto vinner; rank fanger tie-break-cascaden. Tie iff begge
      // deler rank.
      const winnerUserId =
        a.rank === b.rank ? null : a.rank < b.rank ? a.userId : b.userId;
      mainContent = (chromeless, footerSlot) => (
        <HeadToHeadResult
          gameId={gameId}
          gameName={game.name}
          formatLabel={`Slagspill · ${tc('netto')}`}
          unitLabel="slag"
          lowerWins
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
        <SoloStrokeplayPodium
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
    if (showSide) {
      return renderSideTournamentTabs({
        gameId,
        game,
        gwp,
        rawHolesRows,
        rawScoresRows,
        backHref,
        mainContent: mainContent(
          true,
          <>
            {prizeAwardsNode}
            {reportSection}
            {wdSection}
          </>,
        ),
        teamGrouping: 'solo',
      });
    }
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
    <SoloStrokeplayView
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
