import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ShambleView, type ShamblePlayerInfo } from '../ShambleView';
import { ShamblePodium } from '../ShamblePodium';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { maxHolesPlayed } from '@/lib/scoring/holesPlayed';
import { renderSideTournamentTabs } from '../sideTournament';
import { RoundReportCard } from '../RoundReportCard';
import type { GameForHole } from '@/lib/games/getGameWithPlayers';
import type { TeeGender } from '@/lib/games/teeRating';

/**
 * Shamble / Champagne Scramble-grenen (issue #285) — bygger ScoringContext fra
 * rå-rad-ene, kjører mode-router-en (`computeModeResult`) og velger view per
 * `game.status`:
 *
 *   - `finished` → ShamblePodium på toppen + ShambleView under (chromeless): feirings-
 *     podium med vinner-laget + per-hull-rutenett under.
 *   - alt annet (active/scheduled) → ShambleView alene: lag-rangering + per-hull-
 *     tabell live. View-en håndterer reveal-modus internt basert på
 *     `scoreVisibility` + `gameStatus` props.
 *
 * Shamble bruker team_number (validatoren håndhever ≥ 1 per spiller) — vi
 * videresender reell `p.team_number` til scoring-laget, nøyaktig som Texas.
 * Ingen ekstra DB-fetch utover scores (best-N-utledning er ren funksjon av
 * scores). Speiler Nines-datasti for ScoringContext-byggingen, men med
 * team_number fra Texas-mønstret.
 */
export async function renderShamble(opts: {
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

  const ctx = {
    game: {
      id: gameId,
      game_mode: 'shamble' as const,
      mode_config: game.mode_config,
    },
    players: gwp.players
      .filter((p) => p.users != null)
      .map((p) => ({
        userId: p.user_id,
        // Shamble-validatoren håndhever team_number ≥ 1 (speiler Texas-
        // validatoren). Defensive fallback til 0 (som scoring-laget filtrerer
        // bort) hvis kolonnen mot formodning er null.
        teamNumber: p.team_number ?? 0,
        flightNumber: null,
        courseHandicap: p.course_handicap ?? 0,
        // Shamble bruker netto (eller gross, per mode_config.shamble_scoring)
        // basert på spillerens egen handicap — egne baller, ikke delt ball.
        // Sender teeGender gjennom for per-kjønn-par-resolvering (#240).
        teeGender: p.tee_gender,
      })),
    holes: rawHolesRows.map((h) => ({
      number: h.hole_number,
      par: h.par_mens,
      parByGender: {
        mens: h.par_mens,
        ladies: h.par_ladies,
        juniors: h.par_juniors,
      },
      strokeIndex: h.stroke_index,
    })),
    scores: rawScoresRows.map((s) => ({
      userId: s.user_id,
      holeNumber: s.hole_number,
      gross: s.strokes,
    })),
  };

  const result = computeModeResult(ctx);
  // Type-guard mot mode-router-output. Hvis routeren returnerer feil shape
  // faller vi tilbake til notFound() — sikrere enn å rendre tom UI.
  if (result.kind !== 'shamble') {
    notFound();
  }

  const unknownPlayer = tc('unknownPlayer');
  const holesPlayed = maxHolesPlayed(rawScoresRows);
  const playersById = new Map<string, ShamblePlayerInfo>();
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

  // Finished → ShamblePodium på toppen + ShambleView under (chromeless, så bare
  // én outer shell). Med sideturnering (#576): pakkes i en LeaderboardTabs-
  // veksler med side-fanen ('byTeamNumber' — lag-format). Active/scheduled →
  // ShambleView alene.
  if (game.status === 'finished') {
    // #1008: AI-rundereferat, komponert i footerSlot på den avsluttende
    // (chromeless) ShambleView. Ved sideturnering rendres referatet utenfor
    // tab-widgeten (samme mønster som #386 wdSection).
    const reportSection = game.round_report ? (
      <RoundReportCard text={game.round_report} />
    ) : null;
    const finishedView = (podiumChromeless: boolean, footerSlot?: ReactNode) => (
      <>
        <ShamblePodium
          gameId={gameId}
          gameName={game.name}
          result={result}
          playersById={playersById}
          holesPlayed={holesPlayed}
          backHref={backHref}
          chromeless={podiumChromeless}
        />
        <ShambleView
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
            teamGrouping: 'byTeamNumber',
          })}
          {prizeAwardsNode}
          {reportSection}
        </>
      );
    }
    return finishedView(false, <>{prizeAwardsNode}{reportSection}</>);
  }

  return (
    <ShambleView
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
