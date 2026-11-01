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
//    ikke «Fortsett på hull N», bare «Åpne runden». Det samme gjelder en avledet
//    kamp, som ikke føres selv.
//  - **Delt cup-dag** (#2752): hullene er segmentets. Første halvdel ender på
//    broen til hull 10, og Hjem folder begge halvdelene til ett kort, med samme
//    regel som nettet (`mergePairState`).
//
// Ren funksjon: ingen nett, ingen SQLite, ingen React. Kalleren har lest
// bundelen og slagene fra enheten.
import type { ActiveCardState } from '../../../../lib/games/activeCardState';
import { isLeagueFieldAlone } from '../../../../lib/games/finishedResultBadge';
import { mergePairState } from '../../../../lib/games/pairActiveCard';
import { computePrimaryCtaState } from '../../../../lib/games/primaryCtaState';
import type { GameStatus } from '../../../../lib/games/status';
import type { ScoreVisibility } from '../../../../lib/games/visibility';
import {
  computeLiveBoard,
  viewerStanding,
  type LiveBoard,
  type LiveBoardUnit,
  type ViewerStanding,
} from '../../../../lib/leaderboard/liveBoard';
import type { HoleSegment } from '../../../../lib/scoring/holeSegment';
import { modeCollapsesToTeamCard, type GameMode } from '../../../../lib/scoring/modes/types';
import type { LocalScore } from '../data/db';
import type { GameBundle } from '../data/gameBundle';
import type { HomeCard } from '../data/homeList';
import { gateReason, type GateReason } from './formatGate';
import { nameLookup } from './leaderboardModel';
import { nextUnfilledHole } from './primaryCtaState';
import { findInRoster, pendingApprovals, toRoster } from './roster';
import { asModeConfig, toHoleRows, toPlayerRows, toScoreRows } from './scoringContext';
import { bridgeHole, gameHoleNumbers, isDerivedGame } from './segmentRound';
import {
  buildTeamCards,
  filledHolesForOwner,
  findMyTeamCard,
  foldLocalScores,
  myTeamCaptainId,
} from './teamPlay';

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
 *
 * `gameId` er satt når målet ligger i den andre halvdelen av en delt cup-dag
 * (#2752). Uten den gjelder knappen spillet kortet står for.
 */
export type HeroAction =
  | { kind: 'hole'; holeNumber: number; gameId?: string }
  | { kind: 'submit'; gameId?: string }
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
  /**
   * #2712 (eieren 31.10): en ligaflight med én aktiv spiller. Hjem viser da
   * bare poengene, ingen plass (samme regel som `finishedResultBadge`).
   */
  leagueSolo: boolean;
  /**
   * #2712: ligaflighten har markørgodkjenning (simulatorliga), så etiketten er
   * «Venter på markøren» eller «Godkjent». Ellers den vanlige etiketten.
   */
  leagueMarker: boolean;
}

/**
 * Tavla for spillet (#2253, #2579), matet med de samme radene appens
 * resultattabell får (`scoringContext.ts`). Den ene materen: Hjem-kortet og
 * Resultater-skjermen leser begge herfra. `null` når tavla ikke viser noe for
 * spillet, og når `mode_config` peker på et annet format (samme «nei» som
 * resultattabellen).
 *
 * `scores` er foldet (`foldLocalScores`, på tavla `useTeamScores`), aldri rå
 * lokale rader. Bundelen kjenner ikke `start_type`, så siste fem hull og
 * pilene følger hullrekkefølgen fra hull 1, også på en gunstart.
 */
export function liveBoardFor(bundle: GameBundle, scores: readonly LocalScore[]): LiveBoard | null {
  if (bundle.holes.length === 0) return null;
  const mode = bundle.game.gameMode as GameMode;
  const modeConfig = asModeConfig(mode, bundle.game.modeConfig);
  if (modeConfig === null) return null;
  const players = toPlayerRows(bundle);
  return computeLiveBoard({
    gameId: bundle.game.id,
    game: {
      game_mode: mode,
      mode_config: modeConfig,
      status: bundle.game.status as GameStatus,
      score_visibility: bundle.game.scoreVisibility as ScoreVisibility,
      hole_segment: bundle.game.holeSegment as HoleSegment,
      league_round_id: bundle.game.leagueRoundId,
    },
    players,
    holesRows: toHoleRows(bundle),
    scoresRows: toScoreRows(scores, new Set(players.map((p) => p.user_id))),
  });
}

/**
 * Plassen på tavla for meg. `null` når tavla ikke viser noe for spillet, og
 * når jeg ikke har spilt et hull ennå: da sier en plass ingenting.
 *
 * Oppsummeringen på scorekortet (#2299) spør den samme, så plassen der er den
 * samme som her og på tavla.
 */
export function liveStanding(
  bundle: GameBundle,
  scores: readonly LocalScore[],
  userId: string,
): { standing: ViewerStanding; unit: LiveBoardUnit; leagueAlone: boolean } | null {
  const board = liveBoardFor(bundle, scores);
  if (!board) return null;
  const standing = viewerStanding(board, userId);
  if (!standing || standing.total === null) return null;
  // #2712: tavlas svar på om dette er en ligarunde spilt alene (uten plass).
  return { standing, unit: board.unit, leagueAlone: board.leagueAlone === true };
}

type HeroInput = {
  bundle: GameBundle;
  scores: readonly LocalScore[];
  userId: string;
};

/**
 * Den andre halvdelen av en delt cup-dag, slik den ligger på enheten. Hjem gir
 * den til `buildHeroModel`, som da svarer for hele runden.
 */
type HeroSibling = Pick<HeroInput, 'bundle' | 'scores'>;

/**
 * Alt på kortet unntatt plassen: tilstanden, hullene og hva knappen gjør.
 * Ren og billig (ingen motor), så tavla (#2579) kan spørre etter knappen
 * uten å regne tavla en gang til.
 */
function heroProgress(opts: HeroInput) {
  const { bundle, userId } = opts;
  const { game } = bundle;
  const mode = game.gameMode as GameMode;
  const roster = toRoster(bundle.players);
  const me = findInRoster(roster, userId);
  const gate = gateReason(game);

  // Samme rekkefølge som spillets side: fold først, så les.
  const scores = foldLocalScores(opts.scores, roster, mode);
  const captainId = myTeamCaptainId(roster, userId);
  const holes = gameHoleNumbers(game);
  const teamCard =
    // Hull 18 svarer på om runden deler kort (patsome er det eneste formatet der
    // svaret varierer, og det er stengt). Spørsmålet gjelder ikke segmentet.
    captainId != null && modeCollapsesToTeamCard(mode, 18)
      ? findMyTeamCard(buildTeamCards(roster, nameLookup(bundle.players)), userId)
      : null;
  const own = new Set(holes);
  const filled = filledHolesForOwner(scores, mode, userId, captainId).filter((hole) => own.has(hole));
  const played = filled.length;
  const nextHole = nextUnfilledHole(filled, holes);

  const cta = computePrimaryCtaState({
    strokesCount: played,
    totalHoles: holes.length,
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

  const playable =
    gate === null && !isDerivedGame(game) && me !== undefined && game.status === 'active';
  // Første halvdel av en delt cup-dag leverer ikke selv: broen er hovedknappen.
  const bridge = bridgeHole(bundle);
  const action: HeroAction = !playable
    ? { kind: 'open' }
    : state !== 'continue'
      ? null
      : cta !== 'ready_to_submit'
        ? { kind: 'hole', holeNumber: nextHole }
        : bridge
          ? { kind: 'hole', holeNumber: bridge.holeNumber, gameId: bridge.gameId }
          : { kind: 'submit' };

  return { gate, state, played, holeCount: holes.length, nextHole, action, playable, scores, roster, me };
}

/**
 * Knappen på Hjem-kortet, alene. Tavlas stripe (#2579) bruker samme regel som
 * kortet, uten at plassen regnes ut på nytt.
 */
export function heroAction(opts: HeroInput): HeroAction {
  return heroProgress(opts).action;
}

/**
 * Hele runden på en delt cup-dag: hullene til begge halvdelene, og knappen til
 * der spilleren er. Første halvdel til den er ført, så andre, så leveringen.
 * Samme rekkefølge som `mergePairExtras` på nettet.
 */
function foldSplitRound(
  front: ReturnType<typeof heroProgress>,
  backInput: HeroInput,
): Pick<HeroModel, 'state' | 'holeCount' | 'played' | 'nextHole' | 'action'> {
  const back = heroProgress(backInput);
  const inFront = front.action?.kind === 'hole' && front.played < front.holeCount;
  const backGame = backInput.bundle.game.id;
  const backAction: HeroAction =
    back.action?.kind === 'hole' || back.action?.kind === 'submit'
      ? { ...back.action, gameId: backGame }
      : back.action;
  return {
    state: mergePairState(front.state, back.state),
    holeCount: front.holeCount + back.holeCount,
    played: front.played + back.played,
    nextHole: inFront ? front.nextHole : back.nextHole,
    // Et kort sendt tilbake på første halvdel etter leveringen: `back` har ingen
    // knapp, og første halvdel leverer selv igjen.
    action: inFront ? front.action : (backAction ?? front.action),
  };
}

export function buildHeroModel(opts: HeroInput & { sibling?: HeroSibling | null }): HeroModel {
  const { bundle, userId } = opts;
  const progress = heroProgress(opts);
  const { gate, playable, scores, roster, me } = progress;
  const round = opts.sibling
    ? foldSplitRound(progress, { ...opts.sibling, userId })
    : progress;

  const live =
    playable && round.state !== 'withdrawn' ? liveStanding(bundle, scores, userId) : null;
  const approvalsOn = (input: { bundle: GameBundle }) =>
    pendingApprovals(toRoster(input.bundle.players), input.bundle.game, userId).length;

  return {
    gate,
    state: round.state,
    holeCount: round.holeCount,
    played: round.played,
    nextHole: round.nextHole,
    action: round.action,
    standing: live?.standing ?? null,
    unit: live?.unit ?? null,
    approvals: me
      ? pendingApprovals(roster, bundle.game, userId).length +
        (opts.sibling ? approvalsOn(opts.sibling) : 0)
      : 0,
    // Any league flight with one active player has no placement: the same
    // rule as `finishedResultBadge`, which «Forrige runde» uses on this screen.
    leagueSolo: isLeagueFieldAlone(
      bundle.game.leagueRoundId != null,
      bundle.players.filter((player) => player.withdrawnAt == null).length,
    ),
    // A simulator-league flight is `leagueRoundId` + peer approval, as in
    // `isGameOrganiser` and `playerWithdrawKind`.
    leagueMarker: bundle.game.leagueRoundId != null && bundle.game.requirePeerApproval,
  };
}
