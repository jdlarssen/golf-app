import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { WolfView, type WolfPlayerInfo } from '../WolfView';
import { WolfPodium } from '../WolfPodium';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { buildWolfContext } from '@/lib/scoring/context/buildWolfContext';
import { maxHolesPlayed } from '@/lib/scoring/holesPlayed';
import { getWolfChoices } from '@/lib/wolf/getWolfChoices';
import { renderSideTournamentTabs } from '../sideTournament';
import { RoundReportCard } from '../RoundReportCard';
import { computeSettlement } from '@/lib/scoring/settlement';
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
  /** #1051/#1119: Premieutdeling-kortet, rendret under podiet i finished-footeren. */
  prizeAwardsNode?: ReactNode;
}) {
  const tc = await getTranslations('leaderboard.common');
  const tSettle = await getTranslations('leaderboard.common.settlement');
  const { gameId, game, gwp, rawHolesRows, rawScoresRows, backHref, prizeAwardsNode } = opts;

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

  // Pengeoppgjør (#937) — null når kr_per_unit ikke er satt eller ≤ 0.
  // mode_config er innsnevret til wolf-varianten etter notFound()-vakten over.
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
    // #1008: AI-rundereferat, komponert i footerSlot på den avsluttende
    // (chromeless) WolfView — ingen wdSection i denne grenen i dag. Ved
    // sideturnering rendres referatet utenfor tab-widgeten (samme mønster
    // som #386 wdSection i nassau/skins/bbb) i stedet for inni mainContent-
    // fanen, slik at det ikke gjentas eller forsvinner bak side-fanen.
    const reportSection = game.round_report ? (
      <RoundReportCard text={game.round_report} />
    ) : null;
    const finishedView = (podiumChromeless: boolean, footerSlot?: ReactNode) => (
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
    <WolfView
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
