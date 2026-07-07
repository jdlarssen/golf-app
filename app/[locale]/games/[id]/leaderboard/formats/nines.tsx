import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { NinesView, type NinesPlayerInfo } from '../NinesView';
import { NinesPodium } from '../NinesPodium';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { buildNinesContext } from '@/lib/scoring/context/buildNinesContext';
import { maxHolesPlayed } from '@/lib/scoring/holesPlayed';
import { renderSideTournamentTabs } from '../sideTournament';
import { RoundReportCard } from '../RoundReportCard';
import { computeSettlement } from '@/lib/scoring/settlement';
import type { GameForHole } from '@/lib/games/getGameWithPlayers';
import type { TeeGender } from '@/lib/games/teeRating';

/**
 * Nines / Split Sixes-grenen (issue #278) — bygger ScoringContext fra rå-rad-ene,
 * kjører mode-router-en (`computeModeResult`) og velger view per `game.status`:
 *
 *   - `finished` → NinesPodium på toppen + NinesView under (chromeless): feirings-
 *     podium med poeng-vinner + per-hull-rutenett under.
 *   - alt annet (active/scheduled) → NinesView alene: spiller-totals + per-hull-
 *     tabell live. View-en håndterer reveal-modus internt basert på
 *     `scoreVisibility` + `gameStatus` props.
 *
 * Nines trenger ingen ekstra DB-fetch utover scores (poengfordeling er ren funksjon
 * av scores). Speiler Skins-pattern uten wolfChoices-/bbb-injeksjon.
 */
export async function renderNines(opts: {
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
  const tSettle = await getTranslations('leaderboard.common.settlement');
  const { gameId, game, gwp, rawHolesRows, rawScoresRows, backHref, prizeAwardsNode } = opts;

  // Bygges via den delte `buildNinesContext`-helperen (epic #496) slik at
  // leaderboard-flaten og «Hull for hull»-flaten (`NinesHolesBody`) deler
  // kilde — ingen duplisert ctx-map.
  const ctx = buildNinesContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHolesRows,
    scoresRows: rawScoresRows,
  });

  const result = computeModeResult(ctx);
  if (result.kind !== 'nines') {
    notFound();
  }

  // Pengeoppgjør (#937) — null når kr_per_unit ikke er satt eller ≤ 0.
  // mode_config er innsnevret til nines-varianten etter notFound()-vakten over.
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
  const playersById = new Map<string, NinesPlayerInfo>();
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

  // Finished → NinesPodium på toppen + NinesView under (chromeless, så bare
  // én outer shell). Med sideturnering (#576): pakkes i en LeaderboardTabs-
  // veksler med side-fanen. Active/scheduled → NinesView alene.
  if (game.status === 'finished') {
    // #1008: AI-rundereferat, komponert i footerSlot på den avsluttende
    // (chromeless) NinesView — ingen wdSection i denne grenen i dag. Ved
    // sideturnering rendres referatet utenfor tab-widgeten (samme mønster
    // som #386 wdSection i nassau/skins/bbb) i stedet for inni mainContent-
    // fanen, slik at det ikke gjentas eller forsvinner bak side-fanen.
    const reportSection = game.round_report ? (
      <RoundReportCard text={game.round_report} />
    ) : null;
    const finishedView = (podiumChromeless: boolean, footerSlot?: ReactNode) => (
      <>
        <NinesPodium
          gameId={gameId}
          gameName={game.name}
          result={result}
          playersById={playersById}
          backHref={backHref}
          chromeless={podiumChromeless}
        />
        <NinesView
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
          {prizeAwardsNode}
          {reportSection}
        </>
      );
    }
    return finishedView(false, <>{prizeAwardsNode}{reportSection}</>);
  }

  return (
    <NinesView
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
