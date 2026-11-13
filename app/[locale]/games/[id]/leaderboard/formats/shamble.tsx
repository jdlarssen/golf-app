import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ShambleHoleList, ShambleView, type ShamblePlayerInfo } from '../ShambleView';
import { renderTeamLiveBoard } from './teamLiveBoard';
import { ShamblePodium } from '../ShamblePodium';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { buildUniformContext } from '@/lib/scoring/context/buildUniformContext';
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
 *   - alt annet (active/scheduled) → lagtavla (#2316, `renderTeamLiveBoard`)
 *     med «Per hull»-lista under. I reveal-modus er det fortsatt ShambleView,
 *     som håndterer reveal internt basert på `scoreVisibility` + `gameStatus`.
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
      withdrawn_at: string | null;
      /** #2316: the live board's strip reads these. */
      flight_number?: number | null;
      submitted_at?: string | null;
      approved_at?: string | null;
    }[];
  };
  rawHolesRows: { hole_number: number; par_mens: number; par_ladies: number; par_juniors: number; stroke_index: number }[];
  rawScoresRows: { user_id: string; hole_number: number; strokes: number | null }[];
  backHref: string;
  /** #1051/#1119: Premieutdeling-kortet, rendret under podiet i finished-footeren. */
  prizeAwardsNode?: ReactNode;
  /** #2316: whose team is «Ditt lag» and whose strip the live board shows. */
  viewerUserId?: string;
  /** #2316: spectate/embed — no strip, no «Ditt lag». */
  publicView?: boolean;
}) {
  const tc = await getTranslations('leaderboard.common');
  const { gameId, game, gwp, rawHolesRows, rawScoresRows, backHref, prizeAwardsNode, viewerUserId, publicView } = opts;

  // #1958: the shared builder drops withdrawn players and their scores, the
  // same rule the result summary applies, so the live board agrees with it.
  const ctx = buildUniformContext({
    gameId,
    gameMode: 'shamble',
    modeConfig: game.mode_config,
    // Shamble-validatoren håndhever team_number ≥ 1 (speiler Texas-
    // validatoren). Defensive fallback til 0 (som scoring-laget filtrerer
    // bort) hvis kolonnen mot formodning er null (#844).
    players: gwp.players.map((p) => ({ ...p, team_number: p.team_number ?? 0 })),
    holesRows: rawHolesRows,
    scoresRows: rawScoresRows,
  });

  const result = computeModeResult(ctx);
  // Type-guard mot mode-router-output. Hvis routeren returnerer feil shape
  // faller vi tilbake til notFound() — sikrere enn å rendre tom UI.
  if (result.kind !== 'shamble') {
    notFound();
  }

  const unknownPlayer = tc('unknownPlayer');
  // #2067: counted from the context's rows, not the raw ones — they are what
  // the board shows (withdrawn players out, a withdrawn captain's entered holes
  // folded in), so the label never claims more holes than a team has.
  const holesPlayed = maxHolesPlayed(
    ctx.scores.map((s) => ({
      user_id: s.userId,
      hole_number: s.holeNumber,
      strokes: s.gross,
    })),
  );
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
        teamGrouping: 'byTeamNumber',
      });
    }
    return finishedView(false, <>{prizeAwardsNode}{reportSection}</>);
  }

  // #2316: the live board with «Per hull» under it. A blind round keeps
  // ShambleView, which hides the totals and the holes until the game ends.
  if (scoreVisibility === 'live') {
    return renderTeamLiveBoard({
      gameId,
      game,
      players: gwp.players,
      holesRows: rawHolesRows,
      scoresRows: rawScoresRows,
      backHref,
      footerSlot: <ShambleHoleList result={result} playersById={playersById} />,
      viewerUserId,
      publicView,
    });
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
