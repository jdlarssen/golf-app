import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { HeadToHeadResult, type StripCell } from '../HeadToHeadResult';
import { NassauView, type NassauPlayerInfo } from '../NassauView';
import { NassauPodium } from '../NassauPodium';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { buildNassauContext } from '@/lib/scoring/context/buildNassauContext';
import { maxHolesPlayed } from '@/lib/scoring/holesPlayed';
import { renderSideTournamentTabs } from '../sideTournament';
import { RoundReportCard } from '../RoundReportCard';
import { computeSettlement } from '@/lib/scoring/settlement';
import type { GameForHole } from '@/lib/games/getGameWithPlayers';
import type { TeeGender } from '@/lib/games/teeRating';

/**
 * Nassau-grenen (issue #276) — bygger ScoringContext fra rå-rad-ene, kjører
 * mode-router-en (`computeModeResult`) og velger view per `game.status`:
 *
 *   - `finished` → NassauPodium + NassauView (chromeless): aggregert unit-
 *     podium med sweep-feiring + tre stacked seksjon-rangeringer under.
 *   - alt annet (active/scheduled) → NassauView alene: tre stacked seksjon-
 *     rangeringer (Front 9 / Back 9 / Totalt 18 hull) live.
 *
 * I motsetning til Wolf trenger Nassau ingen per-hull-tabell — scoring kjører
 * fra eksisterende `scores`-tabell. Strukturen speiler `renderSoloStrokeplay`-
 * pattern, men view-en håndterer reveal-modus internt (skjuler totaler når
 * score_visibility='reveal' og status='active').
 */
export async function renderNassau(opts: {
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
  const tn = await getTranslations('leaderboard.nassau');
  const tSettle = await getTranslations('leaderboard.common.settlement');
  const { gameId, game, gwp, rawHolesRows, rawScoresRows, backHref, prizeAwardsNode } = opts;

  // Delt context-bygging (epic #496) — samme kilde som «Hull for hull»-flaten
  // (NassauHolesBody), så map-logikken ikke dupliseres.
  const ctx = buildNassauContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHolesRows,
    scoresRows: rawScoresRows,
  });

  const result = computeModeResult(ctx);
  if (result.kind !== 'nassau') {
    notFound();
  }

  // Pengeoppgjør (#937) — null når kr_per_unit ikke er satt eller ≤ 0.
  // Nassau bruker `units` (antall vunnede seksjoner, 0–3) fra NassauUnitLine.
  // mode_config er innsnevret til nassau-varianten etter notFound()-vakten over.
  const krPerUnit =
    'kr_per_unit' in game.mode_config && typeof game.mode_config.kr_per_unit === 'number'
      ? game.mode_config.kr_per_unit
      : 0;
  const settlement = computeSettlement({
    units: result.players.map((p) => ({ userId: p.userId, units: p.units })),
    krPerUnit,
    unitLabel: tSettle('units.seksjon'),
  });

  const unknownPlayer = tc('unknownPlayer');
  const holesPlayed = maxHolesPlayed(rawScoresRows);

  const playersById = new Map<string, NassauPlayerInfo>();
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playersById.set(p.user_id, {
      name: p.users.name ?? unknownPlayer,
      nickname: p.users.nickname,
    });
  }

  // Score-visibility normaliseres til 'live' | 'reveal' for view-en — DB-
  // kolonnen er en enum av samme to verdier, men vi caster defensivt.
  const scoreVisibility: 'live' | 'reveal' =
    game.score_visibility === 'reveal' ? 'reveal' : 'live';

  // Finished → resultat-flate på toppen + NassauView under (chromeless, så bare
  // én outer shell). Ved nøyaktig 2 spillere er det en duell → head-to-head-
  // kort i stedet for podium (epic #496). 3+ → NassauPodium som før.
  // Med sideturnering (#576) mates samme reveal (duell eller podium) inn som
  // mainContent i LeaderboardTabs — duell-kortet beholdes også med sideturnering
  // på (#589). Active/scheduled → NassauView alene.
  if (game.status === 'finished') {
    const showSide = game.side_tournament_enabled;
    // #1008: AI-rundereferat, komponert i footerSlot-kjeden.
    const reportSection = game.round_report ? (
      <RoundReportCard text={game.round_report} />
    ) : null;
    // mainContent: duell-kort (2 spillere) eller podium (3+), alltid med
    // NassauView under. Tar `chromeless` så samme reveal kan rendres
    // frittstående ELLER inni sideturnerings-fanen.
    let mainContent: (chromeless: boolean, footerSlot?: ReactNode) => ReactNode;
    if (result.players.length === 2) {
      // Stabil rekkefølge etter game_players (ikke rank), så fargene følger
      // spiller-identitet — ikke hvem som vant.
      const order = gwp.players.map((p) => p.user_id);
      const [a, b] = [...result.players].sort(
        (x, y) => order.indexOf(x.userId) - order.indexOf(y.userId),
      );
      const sectionLabel = (line: typeof a): string => {
        const won: string[] = [];
        if (line.unitBreakdown.front9) won.push(tn('front9Label'));
        if (line.unitBreakdown.back9) won.push(tn('back9Label'));
        if (line.unitBreakdown.total18) won.push(tn('totalLabel'));
        return won.length > 0 ? won.join(' · ') : tn('noSections');
      };
      const sideFor = (pl: typeof a) => {
        const info = playersById.get(pl.userId);
        return {
          userId: pl.userId,
          name: info?.name ?? unknownPlayer,
          nickname: info?.nickname ?? null,
          score: pl.units,
          subLabel: sectionLabel(pl),
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
      // Units kan være like (f.eks. 1–1 med én pushet seksjon); da avgjør
      // total18-cascaden, fanget av rank. Tie iff begge deler rank.
      const winnerUserId =
        a.rank === b.rank ? null : a.rank < b.rank ? a.userId : b.userId;
      // Push-note: seksjoner som endte delt (tied 1.-plass) deler ingen unit ut.
      const s = result.sections;
      const pushed: string[] = [];
      if (!s.front9.isPending && s.front9.winnerUserIds.length > 1)
        pushed.push(tn('front9Label'));
      if (!s.back9.isPending && s.back9.winnerUserIds.length > 1)
        pushed.push(tn('back9Label'));
      if (!s.total18.isPending && s.total18.winnerUserIds.length > 1)
        pushed.push(tn('totalLabel'));
      const hangingNote =
        pushed.length > 0 ? tn('pushedNote', { sections: pushed.join(' og ') }) : null;
      // Ved 2 spillere sier duellkortet alt — den fulle NassauView under
      // ville gjenta samme resultat (#600). Vis kun kortet.
      mainContent = (chromeless, footerSlot) => (
        <HeadToHeadResult
          gameId={gameId}
          gameName={game.name}
          formatLabel={`Nassau · ${result.scoring === 'net' ? tc('netto') : tc('brutto')}`}
          unitLabel={tn('unitSections')}
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
          <NassauPodium
            gameId={gameId}
            gameName={game.name}
            result={result}
            playersById={playersById}
            backHref={backHref}
            chromeless={chromeless}
          />
          <NassauView
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
          {prizeAwardsNode}
          {reportSection}
        </>
      );
    }
    return mainContent(false, <>{prizeAwardsNode}{reportSection}</>);
  }

  return (
    <NassauView
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
