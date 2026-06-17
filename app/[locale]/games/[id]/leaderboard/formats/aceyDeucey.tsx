import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AceyDeuceyView, type AceyDeuceyPlayerInfo } from '../AceyDeuceyView';
import { AceyDeuceyPodium } from '../AceyDeuceyPodium';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { buildAceyDeuceyContext } from '@/lib/scoring/context/buildAceyDeuceyContext';
import { maxHolesPlayed } from '@/lib/scoring/holesPlayed';
import { renderSideTournamentTabs } from '../sideTournament';
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
    const finishedView = (podiumChromeless: boolean) => (
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
        mainContent: finishedView(true),
        teamGrouping: 'solo',
      });
    }
    return finishedView(false);
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
    />
  );
}
