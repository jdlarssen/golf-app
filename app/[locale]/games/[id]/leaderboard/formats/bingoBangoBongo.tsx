import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { HeadToHeadResult, type StripCell } from '../HeadToHeadResult';
import { BingoBangoBongoView, type BingoBangoBongoPlayerInfo } from '../BingoBangoBongoView';
import { BingoBangoBongoPodium } from '../BingoBangoBongoPodium';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { buildBingoBangoBongoContext } from '@/lib/scoring/context/buildBingoBangoBongoContext';
import { maxHolesPlayed } from '@/lib/scoring/holesPlayed';
import { getBingoBangoBongoHoles } from '@/lib/bbb/getBingoBangoBongoHoles';
import { renderSideTournamentTabs } from '../sideTournament';
import { RoundReportCard } from '../RoundReportCard';
import { computeSettlement } from '@/lib/scoring/settlement';
import type { GameForHole } from '@/lib/games/getGameWithPlayers';
import type { TeeGender } from '@/lib/games/teeRating';

/**
 * Bingo Bango Bongo-grenen (issue #277) — henter per-hull-data fra
 * `bingo_bango_bongo_holes`-tabellen, bygger ScoringContext, kjører mode-router-
 * en og velger view per `game.status`:
 *
 *   - `finished` → BingoBangoBongoPodium på toppen + BingoBangoBongoView under
 *     (chromeless, så bare én outer shell). Speiler Wolf-finished-pattern.
 *   - alt annet (active/scheduled) → BingoBangoBongoView alene: per-spiller-
 *     tabell med Bingo/Bango/Bongo/Sum. View-en håndterer reveal-modus internt
 *     (skjuler totaler når score_visibility='reveal' og status='active').
 *
 * Slag (`rawScoresRows`) sendes gjennom til scoring-laget selv om BBB-compute
 * ignorerer dem — holder ScoringContext-shapen konsistent og lar fremtidige
 * sekundær-leaderboards gjenbruke slag-dataen uten ny DB-query.
 */
export async function renderBingoBangoBongo(opts: {
  gameId: string;
  game: GameForHole;
  gwp: {
    players: {
      user_id: string;
      team_number: number;
      users: { name: string | null; nickname: string | null } | null;
      course_handicap: number | null;
      tee_gender: TeeGender;
    }[];
  };
  rawHolesRows: { hole_number: number; par_mens: number; par_ladies: number; par_juniors: number; stroke_index: number }[];
  rawScoresRows: { user_id: string; hole_number: number; strokes: number | null }[];
  backHref: string;
}) {
  const tc = await getTranslations('leaderboard.common');
  const tSettle = await getTranslations('leaderboard.common.settlement');
  const { gameId, game, gwp, rawHolesRows, rawScoresRows, backHref } = opts;

  // Per-hull-prestasjonsdata fra bingo_bango_bongo_holes. Tag-cachet på
  // `game-${id}`, samme cache-tag som getGameWithPlayers — setBingoBangoBongoHole-
  // mutasjons-action revaliderer den ved hver endring.
  const bingoBangoBongoHoles = await getBingoBangoBongoHoles(gameId);

  // Bygges via den delte `buildBingoBangoBongoContext`-helperen (epic #496) slik
  // at både leaderboard-flaten og «Hull for hull»-flaten bygger konteksten likt
  // fra samme kilde — ingen duplisert ctx-map.
  const ctx = buildBingoBangoBongoContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHolesRows,
    scoresRows: rawScoresRows,
    bingoBangoBongoHoles,
  });

  const result = computeModeResult(ctx);
  // Type-guard mot mode-router-output. Hvis routeren returnerer feil shape
  // faller vi tilbake til notFound() — sikrere enn å rendre tom UI.
  if (result.kind !== 'bingo_bango_bongo') {
    notFound();
  }

  // Pengeoppgjør (#937) — null når kr_per_unit ikke er satt eller ≤ 0.
  // mode_config er innsnevret til bingo_bango_bongo-varianten etter notFound()-vakten.
  const krPerUnit =
    'kr_per_unit' in game.mode_config && typeof game.mode_config.kr_per_unit === 'number'
      ? game.mode_config.kr_per_unit
      : 0;
  const settlement = computeSettlement({
    units: result.players.map((p) => ({ userId: p.userId, units: p.totalPoints })),
    krPerUnit,
    unitLabel: tSettle('units.poeng'),
  });

  const unknownPlayer = tc('unknownPlayer');
  const holesPlayed = maxHolesPlayed(rawScoresRows);
  const playersById = new Map<string, BingoBangoBongoPlayerInfo>();
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playersById.set(p.user_id, {
      name: p.users.name ?? unknownPlayer,
      nickname: p.users.nickname,
    });
  }

  // Score-visibility normaliseres til 'live' | 'reveal' for view-en.
  const scoreVisibility: 'live' | 'reveal' =
    game.score_visibility === 'reveal' ? 'reveal' : 'live';

  // Finished → resultat-flate på toppen + BingoBangoBongoView under (chromeless,
  // så bare én outer shell). Ved nøyaktig 2 spillere er det en duell → head-to-
  // head-kort i stedet for podium (epic #496, Stream B). BBB er det siste
  // formatet som kan være 2p, så dette lukker H2H-strømmen. 3+ → BingoBangoBongoPodium
  // som før. Med sideturnering (#576) mates samme reveal (duell eller podium)
  // inn som mainContent i LeaderboardTabs — duell-kortet beholdes også med
  // sideturnering på (#589). Active/scheduled → BingoBangoBongoView alene.
  if (game.status === 'finished') {
    const showSide = game.side_tournament_enabled;
    // #1008: AI-rundereferat, komponert i footerSlot-kjeden.
    const reportSection = game.round_report ? (
      <RoundReportCard text={game.round_report} />
    ) : null;
    // mainContent: duell-kort (2 spillere) eller podium (3+), alltid med
    // BingoBangoBongoView under. Tar `chromeless` så samme reveal kan rendres
    // frittstående ELLER inni sideturnerings-fanen.
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
          score: pl.totalPoints,
          subLabel: `${pl.bingos} bingo · ${pl.bangos} bango · ${pl.bongos} bongo`,
        };
      };
      // Momentum-strip: hvem fikk flest poeng på hullet. Begge 0 (uregistrert)
      // → unplayed; likt og > 0 → delt.
      const strip: StripCell[] = result.holes.map((h): StripCell => {
        const aPts = h.pointsByPlayer[a.userId] ?? 0;
        const bPts = h.pointsByPlayer[b.userId] ?? 0;
        if (aPts === 0 && bPts === 0) return 'unplayed';
        if (aPts > bPts) return 'a';
        if (bPts > aPts) return 'b';
        return 'halved';
      });
      // Tie iff begge deler rank (lik totalPoints OG cascade); ellers er rank-1
      // vinner.
      const winnerUserId =
        a.rank === b.rank ? null : a.rank < b.rank ? a.userId : b.userId;
      // Ved 2 spillere sier duellkortet alt (vinner, totaler, fordeling,
      // 18-hulls-strip) — den fulle BingoBangoBongoView under ville gjenta
      // nøyaktig samme tall (#600). Vis kun kortet, som Stableford/Slagspill.
      mainContent = (chromeless, footerSlot) => (
        <HeadToHeadResult
          gameId={gameId}
          gameName={game.name}
          formatLabel="Bingo Bango Bongo"
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
        <>
          <BingoBangoBongoPodium
            gameId={gameId}
            gameName={game.name}
            result={result}
            playersById={playersById}
            backHref={backHref}
            chromeless={chromeless}
          />
          <BingoBangoBongoView
            gameId={gameId}
            gameName={game.name}
            result={result}
            playersById={playersById}
            holesPlayed={holesPlayed}
            scoreVisibility={scoreVisibility}
            gameStatus={game.status}
            backHref={backHref}
            chromeless
            settlement={settlement}
            footerSlot={footerSlot}
          />
        </>
      );
    }
    if (showSide) {
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
        </>
      );
    }
    return mainContent(false, reportSection);
  }

  return (
    <BingoBangoBongoView
      gameId={gameId}
      gameName={game.name}
      result={result}
      playersById={playersById}
      holesPlayed={holesPlayed}
      scoreVisibility={scoreVisibility}
      gameStatus={game.status}
      backHref={backHref}
      settlement={settlement}
    />
  );
}
