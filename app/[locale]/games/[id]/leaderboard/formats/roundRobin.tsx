import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { RoundRobinView, type RoundRobinPlayerInfo } from '../RoundRobinView';
import { RoundRobinPodium } from '../RoundRobinPodium';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { buildRoundRobinContext } from '@/lib/scoring/context/buildRoundRobinContext';
import { maxHolesPlayed } from '@/lib/scoring/holesPlayed';
import { renderSideTournamentTabs } from '../sideTournament';
import { RoundReportCard } from '../RoundReportCard';
import type { GameForHole } from '@/lib/games/getGameWithPlayers';
import type { TeeGender } from '@/lib/games/teeRating';

/**
 * Round Robin-grenen (issue #280) — 4-spiller rotating partner-format. Henter
 * scorer fra eksisterende `scores`-tabell (ingen per-hull-ekstratabell — rotasjonen
 * er ren deterministisk funksjon av slot-nummer + hull-nummer). Velger view per
 * `game.status`:
 *
 *   - `finished` → RoundRobinPodium på toppen + RoundRobinView under (chromeless).
 *     Speiler Wolf-finished-pattern.
 *   - alt annet (active/scheduled) → RoundRobinView alene: per-spiller-rangering
 *     på hull-seire + segment-sammendrag (de 3 roterende konstellasjonene).
 *     View-en håndterer reveal-modus internt.
 *
 * Forskjell fra Wolf: ingen `wolfChoices`-fetch. Scorer + spillere er nok.
 * Speiler `renderBingoBangoBongo` uten per-hull-table-injektion.
 */
export async function renderRoundRobin(opts: {
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
  const { gameId, game, gwp, rawHolesRows, rawScoresRows, backHref, prizeAwardsNode } = opts;

  // Bygges via den delte `buildRoundRobinContext`-helperen (epic #496) slik at
  // leaderboard-flaten og «Hull for hull»-flaten (`RoundRobinHolesBody`) deler
  // kilde — ingen duplisert ctx-map. team_number (slot A/B/C/D) sendes som-er
  // til scoring-laget som bruker det til rotasjons-konstellasjon per segment.
  const ctx = buildRoundRobinContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHolesRows,
    scoresRows: rawScoresRows,
  });

  const result = computeModeResult(ctx);
  if (result.kind !== 'round_robin') {
    notFound();
  }

  const unknownPlayer = tc('unknownPlayer');
  const holesPlayed = maxHolesPlayed(rawScoresRows);
  const playersById = new Map<string, RoundRobinPlayerInfo>();
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

  // Finished → RoundRobinPodium på toppen + RoundRobinView under (chromeless,
  // så bare én outer shell). Med sideturnering (#576): pakkes i en
  // LeaderboardTabs-veksler med side-fanen. Active/scheduled → RoundRobinView alene.
  if (game.status === 'finished') {
    // #1008: AI-rundereferat, komponert i footerSlot på den avsluttende
    // (chromeless) RoundRobinView. Ved sideturnering rendres referatet
    // utenfor tab-widgeten (samme mønster som #386 wdSection).
    const reportSection = game.round_report ? (
      <RoundReportCard text={game.round_report} />
    ) : null;
    const finishedView = (podiumChromeless: boolean, footerSlot?: ReactNode) => (
      <>
        <RoundRobinPodium
          gameId={gameId}
          gameName={game.name}
          result={result}
          playersById={playersById}
          backHref={backHref}
          chromeless={podiumChromeless}
        />
        <RoundRobinView
          gameId={gameId}
          gameName={game.name}
          result={result}
          playersById={playersById}
          holesPlayed={holesPlayed}
          scoreVisibility={scoreVisibility}
          gameStatus={game.status}
          backHref={backHref}
          chromeless
          footerSlot={footerSlot}
        />
      </>
    );
    if (game.side_tournament_enabled) {
      return renderSideTournamentTabs({
        gameId,
        game,
        gwp,
        rawHolesRows,
        rawScoresRows,
        backHref,
        mainContent: finishedView(
          true,
          <>
            {prizeAwardsNode}
            {reportSection}
          </>,
        ),
        teamGrouping: 'solo',
      });
    }
    return finishedView(false, <>{prizeAwardsNode}{reportSection}</>);
  }

  return (
    <RoundRobinView
      gameId={gameId}
      gameName={game.name}
      result={result}
      playersById={playersById}
      holesPlayed={holesPlayed}
      scoreVisibility={scoreVisibility}
      gameStatus={game.status}
      backHref={backHref}
    />
  );
}
