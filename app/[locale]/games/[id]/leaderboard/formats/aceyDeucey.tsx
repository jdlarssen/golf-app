import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AceyDeuceyView, type AceyDeuceyPlayerInfo } from '../AceyDeuceyView';
import { AceyDeuceyPodium } from '../AceyDeuceyPodium';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { buildAceyDeuceyContext } from '@/lib/scoring/context/buildAceyDeuceyContext';
import { maxHolesPlayed } from '@/lib/scoring/holesPlayed';
import { renderSideTournamentTabs } from '../sideTournament';
import { RoundReportCard } from '../RoundReportCard';
import { computeSettlement } from '@/lib/scoring/settlement';
import type { GameForHole } from '@/lib/games/getGameWithPlayers';
import type { TeeGender } from '@/lib/games/teeRating';

/**
 * Acey Deucey-grenen (issue #279) — bygger ScoringContext fra rå-rad-ene, kjører
 * mode-router-en (`computeModeResult`) og velger view per `game.status`:
 *
 *   - `finished` → AceyDeuceyPodium på toppen + AceyDeuceyView under (chromeless):
 *     feirings-podium med vinner + per-hull ace/deuce-drilldown under.
 *   - alt annet (active/scheduled) → AceyDeuceyView alene: spiller-totaler med
 *     fortegn + per-hull-tabell live. View-en håndterer reveal-modus internt
 *     basert på `scoreVisibility` + `gameStatus` props.
 *
 * Acey Deucey trenger ingen ekstra DB-fetch (rent slag-derivert) — speiler
 * renderSkins-pattern uten carryover-logikk.
 */
export async function renderAceyDeucey(opts: {
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

  // Bygges via den delte `buildAceyDeuceyContext`-helperen (epic #496) slik at
  // leaderboard-flaten og «Hull for hull»-flaten (`AceyDeuceyHolesBody`) deler
  // kilde — ingen duplisert ctx-map.
  const ctx = buildAceyDeuceyContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHolesRows,
    scoresRows: rawScoresRows,
  });

  const result = computeModeResult(ctx);
  if (result.kind !== 'acey_deucey') {
    notFound();
  }

  // Pengeoppgjør (#937) — null når kr_per_unit ikke er satt eller ≤ 0.
  // Acey Deucey bruker `total` (ace−deuce-sum, kan være negativ) som enhetsfelt.
  // mode_config er innsnevret til acey_deucey-varianten etter notFound()-vakten over.
  const krPerUnit =
    'kr_per_unit' in game.mode_config && typeof game.mode_config.kr_per_unit === 'number'
      ? game.mode_config.kr_per_unit
      : 0;
  const settlement = computeSettlement({
    units: result.players.map((p) => ({ userId: p.userId, units: p.total })),
    krPerUnit,
    unitLabel: tSettle('units.poeng'),
  });

  const unknownPlayer = tc('unknownPlayer');
  const holesPlayed = maxHolesPlayed(rawScoresRows);
  const playersById = new Map<string, AceyDeuceyPlayerInfo>();
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

  // Finished → AceyDeuceyPodium på toppen + AceyDeuceyView under (chromeless,
  // så bare én outer shell). Med sideturnering (#576): pakkes i en
  // LeaderboardTabs-veksler med side-fanen. Active/scheduled → AceyDeuceyView alene.
  if (game.status === 'finished') {
    // #1008: AI-rundereferat, komponert i footerSlot på den avsluttende
    // (chromeless) AceyDeuceyView. Ved sideturnering rendres referatet
    // utenfor tab-widgeten (samme mønster som #386 wdSection).
    const reportSection = game.round_report ? (
      <RoundReportCard text={game.round_report} />
    ) : null;
    const finishedView = (podiumChromeless: boolean, footerSlot?: ReactNode) => (
      <>
        <AceyDeuceyPodium
          gameId={gameId}
          gameName={game.name}
          result={result}
          playersById={playersById}
          backHref={backHref}
          chromeless={podiumChromeless}
        />
        <AceyDeuceyView
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
    if (game.side_tournament_enabled) {
      return (
        <>
          {await renderSideTournamentTabs({
            gameId,
            game,
            gwp,
            rawHolesRows,
            rawScoresRows,
            backHref,
            mainContent: finishedView(true),
            teamGrouping: 'solo',
          })}
          {reportSection}
        </>
      );
    }
    return finishedView(false, reportSection);
  }

  return (
    <AceyDeuceyView
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
