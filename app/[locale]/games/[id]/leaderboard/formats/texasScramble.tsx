import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import {
  TexasScrambleView,
  type TexasScramblePlayerInfo,
} from '../TexasScrambleView';
import { TexasScramblePodium } from '../TexasScramblePodium';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { maxHolesPlayed } from '@/lib/scoring/holesPlayed';
import { renderSideTournamentTabs } from '../sideTournament';
import { RoundReportCard } from '../RoundReportCard';
import { RevealBruttoView } from '../RevealBruttoView';
import { computeLeaderboard } from '@/lib/leaderboard';
import { revealState, shouldHideNetto } from '@/lib/games/visibility';
import type { GameForHole } from '@/lib/games/getGameWithPlayers';
import type { TeeGender } from '@/lib/games/teeRating';

/**
 * Texas scramble-grenen (issue #44) — bygger ScoringContext fra rå-rad-ene,
 * kjører mode-router-en (`computeModeResult`) og velger view per `game.status`
 * og `score_visibility`:
 *
 *   - `score_visibility='reveal'` + `status='active'` → RevealBruttoView:
 *     viser brutto-slag-totaler per lag mens netto-rangeringen skjules til
 *     admin avslutter spillet (issue #801).
 *   - `finished` → TexasScramblePodium: topp 3 lag på podiet med konfetti
 *     på 1.-plass og resten av rangeringen collapsed under.
 *   - alt annet (active/scheduled, live-visibility) → TexasScrambleView: flat
 *     liste sortert på laveste lag-netto.
 *
 * Speilet `renderSoloStrokeplay`-pattern for konsistens. Texas har
 * `team_size: 2 | 4` i mode_config og `team_number` per spiller — vi
 * videresender team_number til scoring-laget, og scoring-laget grupperer
 * og velger kaptein lex-min.
 *
 * Ambrose og Florida ruter gjennom denne funksjonen via isScrambleFamily —
 * reveal-modus dekker dermed alle tre scramble-variantene.
 *
 * State #3/#3.5-«venterom» bevisst skipped — alle lag-medlemmer ser hverandre
 * umiddelbart (samme RLS-policy som stableford/matchplay/solo-strokeplay).
 */
export async function renderTexasScramble(opts: {
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
  /** Format-label for sub-tittel i view + podium. Gjennomgis fra MODE_LABELS[game.game_mode]. */
  formatLabel?: string;
}) {
  const tc = await getTranslations('leaderboard.common');
  const { gameId, game, gwp, rawHolesRows, rawScoresRows, backHref, formatLabel } = opts;

  // Reveal-modus (issue #801): mens spillet er aktivt og score_visibility='reveal'
  // skjules netto-rangeringen — kun brutto-slag per lag vises. Texas scramble
  // (og Ambrose/Florida som ruter gjennom hit) har reelle team_number-verdier,
  // så vi videresender dem direkte til computeLeaderboard fra lib/leaderboard.
  const revSt = revealState(game.score_visibility, game.status);
  if (shouldHideNetto(revSt)) {
    const unknownPlayerForReveal = tc('unknownPlayer');
    const bruttoPlayers = gwp.players
      .filter((p) => p.users != null)
      .map((p) => ({
        userId: p.user_id,
        name: p.users!.name ?? unknownPlayerForReveal,
        nickname: p.users!.nickname ?? null,
        teamNumber: p.team_number ?? 0,
        courseHandicap: p.course_handicap ?? 0,
        teeGender: p.tee_gender,
      }));
    const bruttoHoles = rawHolesRows.map((h) => ({
      holeNumber: h.hole_number,
      par: h.par_mens,
      parByGender: {
        mens: h.par_mens,
        ladies: h.par_ladies,
        juniors: h.par_juniors,
      },
      strokeIndex: h.stroke_index,
    }));
    const bruttoScores = rawScoresRows.map((s) => ({
      userId: s.user_id,
      holeNumber: s.hole_number,
      strokes: s.strokes,
    }));
    const bruttoLines = computeLeaderboard({
      mode: 'brutto',
      players: bruttoPlayers,
      holes: bruttoHoles,
      scores: bruttoScores,
    });
    const orderedBrutto = [...bruttoLines].sort((a, b) => a.rank - b.rank);
    const holesPlayedForReveal = new Set(rawScoresRows.map((s) => s.hole_number)).size;
    return (
      <RevealBruttoView
        gameId={gameId}
        gameName={game.name}
        teams={orderedBrutto}
        holesPlayed={holesPlayedForReveal}
        backHref={backHref}
      />
    );
  }

  const ctx = {
    game: {
      id: gameId,
      game_mode: game.game_mode,
      mode_config: game.mode_config,
    },
    players: gwp.players
      .filter((p) => p.users != null)
      .map((p) => ({
        userId: p.user_id,
        // Texas-validatoren håndhever team_number ≥ 1. Defensive fallback til
        // 0 (som scoring-laget filtrerer bort) hvis kolonnen mot formodning er
        // null — bedre å hoppe over enn å kaste her.
        teamNumber: p.team_number ?? 0,
        flightNumber: null,
        courseHandicap: p.course_handicap ?? 0,
        // #240 — Texas spiller én ball per lag, så par per hull avgjøres av
        // lag-kapteinens tee_gender (lex-min userId). Sender per-spiller
        // teeGender gjennom; texasScramble-modulen velger kaptein-varianten.
        teeGender: p.tee_gender,
      })),
    holes: rawHolesRows.map((h) => ({
      number: h.hole_number,
      par: h.par_mens,
      // #240 — per-kjønn-par-tabell. Texas-modulen leser parFor(hole, captain.teeGender)
      // for å bestemme hull-par når lag har avvikende kapteins-tee.
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
  if (result.kind !== 'texas_scramble') {
    notFound();
  }

  const unknownPlayer = tc('unknownPlayer');
  const holesPlayed = maxHolesPlayed(rawScoresRows);
  const playersById = new Map<string, TexasScramblePlayerInfo>();
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playersById.set(p.user_id, {
      name: p.users.name ?? unknownPlayer,
      nickname: p.users.nickname,
    });
  }

  // Finished → TexasScramblePodium. Med sideturnering (#576): podiet pakkes
  // som chromeless mainContent i en LeaderboardTabs-veksler med side-fanen.
  // Lag-format → 'byTeamNumber' så lag-aggregerte sidekategorier gjelder.
  if (game.status === 'finished') {
    // #1008: AI-rundereferat, komponert i footerSlot (ingen wdSection her —
    // Texas scramble sporer ikke trukne spillere separat i denne grenen).
    const reportSection = game.round_report ? (
      <RoundReportCard text={game.round_report} />
    ) : null;
    const podium = (chromeless: boolean) => (
      <TexasScramblePodium
        gameId={gameId}
        gameName={game.name}
        result={result}
        playersById={playersById}
        holesPlayed={holesPlayed}
        backHref={backHref}
        formatLabel={formatLabel}
        chromeless={chromeless}
        footerSlot={chromeless ? undefined : reportSection}
      />
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
            mainContent: podium(true),
            teamGrouping: 'byTeamNumber',
          })}
          {reportSection}
        </>
      );
    }
    return podium(false);
  }

  return (
    <TexasScrambleView
      gameId={gameId}
      gameName={game.name}
      result={result}
      playersById={playersById}
      holesPlayed={holesPlayed}
      backHref={backHref}
      formatLabel={formatLabel}
    />
  );
}
