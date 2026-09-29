// #2254: heltekortet på Hjem — runden du er midt i, regnet ut på telefonen.
//
// Ingen regel her er ny. Hver del spør det stedet regelen allerede bor:
//
//  - **Neste hull og tilstanden** er de samme som på spillets side
//    (`GameHome.tsx`): lagets rader foldes inn (`foldLocalScores`), hullene telles
//    med `filledHolesForOwner` (kapteinens rader i lagformatene), og tilstanden
//    kommer fra `computePrimaryCtaState` med lagets stempel når laget deler kort.
//    Ellers kunne Hjem og spillets side sendt spilleren til to ulike hull.
//  - **Plassen** er tavlas (#2253): `computeLiveBoard` + `viewerStanding`, matet
//    med de samme radene appens resultattabell får (`scoringContext.ts`). Tavla
//    svarer `null` for lagformater, andre formater og reveal-spill, og da viser
//    kortet ingen plass.
//  - **Stengte spill** følger `gateReason`: appen fører dem ikke, så kortet lover
//    ikke «Fortsett på hull N», bare «Åpne runden».
//
// Ren funksjon: ingen nett, ingen SQLite, ingen React. Kalleren har lest
// bundelen og slagene fra enheten.
import type { ActiveCardState } from '../../../../lib/games/activeCardState';
import type { GameStatus } from '../../../../lib/games/status';
import type { ScoreVisibility } from '../../../../lib/games/visibility';
import {
  computeLiveBoard,
  viewerStanding,
  type LiveBoardUnit,
  type ViewerStanding,
} from '../../../../lib/leaderboard/liveBoard';
import { modeCollapsesToTeamCard, type GameMode } from '../../../../lib/scoring/modes/types';
import type { LocalScore } from '../data/db';
import type { GameBundle } from '../data/gameBundle';
import type { HomeCard } from '../data/homeList';
import { gateReason, type GateReason } from './formatGate';
import { nameLookup } from './leaderboardModel';
import { computePrimaryCtaState, nextUnfilledHole } from './primaryCtaState';
import { findInRoster, pendingApprovals, toRoster } from './roster';
import { asModeConfig, toHoleRows, toPlayerRows, toScoreRows } from './scoringContext';
import {
  buildTeamCards,
  filledHolesForOwner,
  findMyTeamCard,
  foldLocalScores,
  myTeamCaptainId,
} from './teamPlay';

/** Appen fører bare hele runder — segment-spill gates bort i `formatGate`. */
export const HERO_HOLE_COUNT = 18;

/** Tidspunktet «nyest» måles på: tee-off når den er satt, ellers opprettet. */
function heroTime(card: HomeCard): string {
  return card.scheduledTeeOffAt ?? card.createdAt;
}

/**
 * Den nyeste runden i gang blir helt; resten blir liggende i samme rekkefølge.
 * Ved likt tidspunkt vinner den første i lista.
 */
export function pickHeroCard(active: readonly HomeCard[]): {
  hero: HomeCard | null;
  rest: HomeCard[];
} {
  let hero: HomeCard | null = null;
  for (const card of active) {
    if (hero === null || heroTime(card) > heroTime(hero)) hero = card;
  }
  return { hero, rest: active.filter((card) => card !== hero) };
}

/**
 * Hva hovedknappen gjør. `hole`: fortsett på hullet. `submit`: alle hull er
 * tastet, gå til scorekortet og lever. `open`: appen kan ikke love noe mer enn
 * spillets side. `null`: kortet er levert eller du er trukket.
 */
export type HeroAction =
  | { kind: 'hole'; holeNumber: number }
  | { kind: 'submit' }
  | { kind: 'open' }
  | null;

export interface HeroModel {
  /** Hvorfor appen ikke fører runden, eller `null` når den gjør det. */
  gate: GateReason | null;
  state: ActiveCardState;
  holeCount: number;
  /** Hull med slag — mine, eller lagets i formatene som deler kort. */
  played: number;
  nextHole: number;
  action: HeroAction;
  /** Plassen på tavla, eller `null` når tavla ikke viser den. */
  standing: ViewerStanding | null;
  /** Hva totalen teller: poeng, netto mot par eller netto slag. */
  unit: LiveBoardUnit | null;
  /** Kort som venter på godkjenningen min (samme regel som spillets side). */
  approvals: number;
}

/**
 * Plassen på tavla for meg. `null` når tavla ikke viser noe for spillet, når
 * `mode_config` peker på et annet format (samme «nei» som resultattabellen),
 * og når jeg ikke har spilt et hull ennå: da sier en plass ingenting.
 */
function liveStanding(
  bundle: GameBundle,
  scores: readonly LocalScore[],
  userId: string,
): { standing: ViewerStanding; unit: LiveBoardUnit } | null {
  if (bundle.holes.length === 0) return null;
  const mode = bundle.game.gameMode as GameMode;
  const modeConfig = asModeConfig(mode, bundle.game.modeConfig);
  if (modeConfig === null) return null;
  const players = toPlayerRows(bundle);
  const board = computeLiveBoard({
    gameId: bundle.game.id,
    game: {
      game_mode: mode,
      mode_config: modeConfig,
      status: bundle.game.status as GameStatus,
      score_visibility: bundle.game.scoreVisibility as ScoreVisibility,
    },
    players,
    holesRows: toHoleRows(bundle),
    scoresRows: toScoreRows(scores, new Set(players.map((p) => p.user_id))),
  });
  if (!board) return null;
  const standing = viewerStanding(board, userId);
  if (!standing || standing.total === null) return null;
  return { standing, unit: board.unit };
}

export function buildHeroModel(opts: {
  bundle: GameBundle;
  scores: readonly LocalScore[];
  userId: string;
}): HeroModel {
  const { bundle, userId } = opts;
  const { game } = bundle;
  const mode = game.gameMode as GameMode;
  const roster = toRoster(bundle.players);
  const me = findInRoster(roster, userId);
  const gate = gateReason(game);

  // Samme rekkefølge som spillets side: fold først, så les.
  const scores = foldLocalScores(opts.scores, roster, mode);
  const captainId = myTeamCaptainId(roster, userId);
  const teamCard =
    captainId != null && modeCollapsesToTeamCard(mode, HERO_HOLE_COUNT)
      ? findMyTeamCard(buildTeamCards(roster, nameLookup(bundle.players)), userId)
      : null;
  const filled = filledHolesForOwner(scores, mode, userId, captainId);
  const played = filled.length;
  const nextHole = nextUnfilledHole(filled, HERO_HOLE_COUNT);

  const cta = computePrimaryCtaState({
    strokesCount: played,
    totalHoles: HERO_HOLE_COUNT,
    submittedAt: teamCard ? teamCard.submittedAt : (me?.player.submittedAt ?? null),
    approvedAt: teamCard ? teamCard.approvedAt : (me?.player.approvedAt ?? null),
    requirePeerApproval: game.requirePeerApproval,
  });
  const state: ActiveCardState = me?.player.withdrawnAt
    ? 'withdrawn'
    : cta === 'submitted_pending_approval'
      ? 'pending_approval'
      : cta === 'submitted_approved'
        ? 'submitted'
        : 'continue';

  const playable = gate === null && me !== undefined && game.status === 'active';
  const action: HeroAction = !playable
    ? { kind: 'open' }
    : state !== 'continue'
      ? null
      : cta === 'ready_to_submit'
        ? { kind: 'submit' }
        : { kind: 'hole', holeNumber: nextHole };

  const live = playable && state !== 'withdrawn' ? liveStanding(bundle, scores, userId) : null;

  return {
    gate,
    state,
    holeCount: HERO_HOLE_COUNT,
    played,
    nextHole,
    action,
    standing: live?.standing ?? null,
    unit: live?.unit ?? null,
    approvals: me ? pendingApprovals(roster, game, userId).length : 0,
  };
}
