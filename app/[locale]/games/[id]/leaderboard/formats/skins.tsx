import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { HeadToHeadResult, type StripCell } from '../HeadToHeadResult';
import { SkinsView, type SkinsPlayerInfo } from '../SkinsView';
import { SkinsPodium } from '../SkinsPodium';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { buildSkinsContext } from '@/lib/scoring/context/buildSkinsContext';
import { maxHolesPlayed } from '@/lib/scoring/holesPlayed';
import { renderSideTournamentTabs } from '../sideTournament';
import { RoundReportCard } from '../RoundReportCard';
import { computeSettlement } from '@/lib/scoring/settlement';
import type { GameForHole } from '@/lib/games/getGameWithPlayers';
import type { TeeGender } from '@/lib/games/teeRating';

/**
 * Skins-grenen (issue #275) — bygger ScoringContext fra rå-rad-ene, kjører
 * mode-router-en (`computeModeResult`) og velger view per `game.status`:
 *
 *   - `finished` → SkinsPodium på toppen + SkinsView under (chromeless): feirings-
 *     podium med skins-vinner + per-hull carryover-drilldown under.
 *   - alt annet (active/scheduled) → SkinsView alene: spiller-totals + per-hull-
 *     tabell live. View-en håndterer reveal-modus internt basert på
 *     `scoreVisibility` + `gameStatus` props.
 *
 * Skins trenger ingen ekstra DB-fetch utover scores (carryover er ren funksjon
 * av scores). Speiler Nassau-pattern uten wolfChoices-injeksjon.
 */
export async function renderSkins(opts: {
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
  /** #1051/#1119: Premieutdeling-kortet, rendret under podiet i finished-footeren. */
  prizeAwardsNode?: ReactNode;
}) {
  const tc = await getTranslations('leaderboard.common');
  const tsk = await getTranslations('leaderboard.skins');
  const th2h = await getTranslations('leaderboard.h2h');
  const tSettle = await getTranslations('leaderboard.common.settlement');
  const { gameId, game, gwp, rawHolesRows, rawScoresRows, backHref, prizeAwardsNode } = opts;

  // Delt context-bygging (epic #496) — samme kilde som «Hull for hull»-flaten
  // (SkinsHolesBody), så map-logikken ikke dupliseres.
  const ctx = buildSkinsContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHolesRows,
    scoresRows: rawScoresRows,
  });

  const result = computeModeResult(ctx);
  if (result.kind !== 'skins') {
    notFound();
  }

  // Pengeoppgjør (#937) — null når kr_per_unit ikke er satt eller ≤ 0.
  // mode_config er innsnevret til skins-varianten etter notFound()-vakten over.
  const krPerUnit =
    'kr_per_unit' in game.mode_config && typeof game.mode_config.kr_per_unit === 'number'
      ? game.mode_config.kr_per_unit
      : 0;
  const settlement = computeSettlement({
    units: result.players.map((p) => ({ userId: p.userId, units: p.totalSkins })),
    krPerUnit,
    unitLabel: tSettle('units.skin'),
  });

  const unknownPlayer = tc('unknownPlayer');
  const holesPlayed = maxHolesPlayed(rawScoresRows);

  const playersById = new Map<string, SkinsPlayerInfo>();
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

  // Finished → resultat-flate på toppen + SkinsView under (chromeless, så bare
  // én outer shell). Ved nøyaktig 2 spillere er det en duell → head-to-head-
  // kort i stedet for podium (epic #496). 3+ → SkinsPodium som før.
  // Med sideturnering (#576) mates samme reveal (duell eller podium) inn som
  // mainContent i LeaderboardTabs — duell-kortet beholdes også med sideturnering
  // på (#589). Active/scheduled → SkinsView alene.
  if (game.status === 'finished') {
    const showSide = game.side_tournament_enabled;
    // #1008: AI-rundereferat, komponert i footerSlot-kjeden.
    const reportSection = game.round_report ? (
      <RoundReportCard text={game.round_report} />
    ) : null;
    // mainContent: duell-kort (2 spillere) eller podium (3+), alltid med
    // SkinsView under. Tar `chromeless` så samme reveal kan rendres
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
          score: pl.totalSkins,
          subLabel: th2h('subLabelHolesWon', { count: pl.holesWon }),
        };
      };
      const strip: StripCell[] = result.holes.map((h): StripCell => {
        if (h.outcome === 'won') {
          if (h.winnerUserId === a.userId) return 'a';
          if (h.winnerUserId === b.userId) return 'b';
          return 'unplayed';
        }
        if (h.outcome === 'carryover') return 'halved';
        return 'unplayed';
      });
      // Tie iff begge deler rank (lik totalSkins OG holesWon); ellers er den
      // rank-1 spilleren vinner — også på holesWon-tiebreak ved lik totalSkins.
      const winnerUserId =
        a.rank === b.rank ? null : (a.rank < b.rank ? a.userId : b.userId);
      const hangingNote =
        result.carriedPot > 0
          ? tsk('carriedNote', { count: result.carriedPot })
          : null;
      // Ved 2 spillere sier duellkortet alt (inkl. carryover-noten) — den fulle
      // SkinsView under ville gjenta samme resultat (#600). Vis kun kortet.
      mainContent = (chromeless, footerSlot) => (
        <HeadToHeadResult
          gameId={gameId}
          gameName={game.name}
          formatLabel={`Skins · ${result.scoring === 'net' ? tc('netto') : tc('brutto')}`}
          unitLabel="skins"
          sideA={sideFor(a)}
          sideB={sideFor(b)}
          winnerUserId={winnerUserId}
          strip={strip}
          hangingNote={hangingNote}
          backHref={backHref}
          chromeless={chromeless}
          footerSlot={footerSlot}
        />
      );
    } else {
      mainContent = (chromeless, footerSlot) => (
        <>
          <SkinsPodium
            gameId={gameId}
            gameName={game.name}
            result={result}
            playersById={playersById}
            backHref={backHref}
            chromeless={chromeless}
          />
          <SkinsView
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
          </>,
        ),
        teamGrouping: 'solo',
      });
    }
    return mainContent(false, <>{prizeAwardsNode}{reportSection}</>);
  }

  return (
    <SkinsView
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
