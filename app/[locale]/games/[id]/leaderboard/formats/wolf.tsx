import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { WolfView, type WolfPlayerInfo } from '../WolfView';
import { WolfPodium } from '../WolfPodium';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { buildWolfContext } from '@/lib/scoring/context/buildWolfContext';
import { maxHolesPlayed } from '@/lib/scoring/holesPlayed';
import { getWolfChoices } from '@/lib/wolf/getWolfChoices';
import { renderSideTournamentTabs } from '../sideTournament';
import type { GameForHole } from '@/lib/games/getGameWithPlayers';
import type { TeeGender } from '@/lib/games/teeRating';

/**
 * Wolf-grenen (issue #274) — bygger ScoringContext fra rå-rad-ene + per-hull-
 * valg fra `wolf_hole_choices`-tabellen, kjører mode-router-en og velger view
 * per `game.status`:
 *
 *   - `finished` → WolfPodium + WolfView under: feirings-view med Pack-leder-
 *     podium, bragging-stats (Mest Wolf-hull, Blind Wolf-pott) og per-hull-
 *     drilldown under.
 *   - alt annet (active/scheduled) → WolfView alene: live-leaderboard med
 *     spiller-totals + per-hull-tabell. View-en håndterer reveal-modus internt
 *     basert på `scoreVisibility` + `gameStatus` props.
 *
 * Forskjell fra andre modi: vi henter `wolfChoices` separat via `getWolfChoices`
 * (tag-cachet på `game-${id}`) og injecter i ScoringContext. Scoring-laget leser
 * choices for å bestemme outcome per hull; mangler choice → outcome='pending'.
 *
 * Wolf har alltid `team_size: 1` og `teams_count: n` (n=3-5, #465) i mode_config.
 * team_number 1..n er rotation-slot (random permutasjon satt av wizard) — sendes
 * som-er til scoring-laget som bruker det for å bestemme Wolf per hull.
 */
export async function renderWolf(opts: {
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

  // Per-hull-valg fra wolf_hole_choices. Tag-cachet på `game-${id}`, samme
  // cache-tag som getGameWithPlayers — setWolfChoice-mutasjons-action revaliderer
  // den ved hver endring.
  const wolfChoices = await getWolfChoices(gameId);

  // Delt context-bygging (epic #496) — samme kilde som «Hull for hull»-flaten
  // (WolfHolesBody), så map-logikken ikke dupliseres.
  const ctx = buildWolfContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHolesRows,
    scoresRows: rawScoresRows,
    wolfChoices,
  });

  const result = computeModeResult(ctx);
  if (result.kind !== 'wolf') {
    notFound();
  }

  const unknownPlayer = tc('unknownPlayer');
  const holesPlayed = maxHolesPlayed(rawScoresRows);
  const playersById = new Map<string, WolfPlayerInfo>();
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

  // Finished → WolfPodium på toppen + WolfView under (chromeless, så bare
  // én outer shell). Med sideturnering (#576): podiet + view-en pakkes som
  // chromeless mainContent i en LeaderboardTabs-veksler med side-fanen.
  // Active/scheduled → WolfView alene.
  if (game.status === 'finished') {
    const finishedView = (podiumChromeless: boolean) => (
      <>
        <WolfPodium
          gameId={gameId}
          gameName={game.name}
          result={result}
          playersById={playersById}
          backHref={backHref}
          chromeless={podiumChromeless}
        />
        <WolfView
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
    <WolfView
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
