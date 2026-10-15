// #2579 PR 2: lagtavla i appen for scramble (texas, ambrose, florida),
// lag-stableford, shamble og best ball, live og ferdig, etter
// `Lagtavle-forslag`, `Lagtavle-ferdig-forslag-*` og
// `Lagtavle-bestball-forslag-*`.
//
// Ren funksjon, ingen React, som `soloBoard.ts`. Svaret er `null` nøyaktig når
// Resultater-skjermen ikke tegner tavla (samme porter i samme rekkefølge som
// `LeaderboardBody`: gaten, reveal, best balls første halvdel, ingen slag,
// motoren), så pillen og stripa aldri står over noe annet enn tavla.
//
// Ingen regel her er ny. Tallene er motorens gjennom `teamLiveBoard` og
// `teamResultBoard` (`lib/leaderboard/`); plass, leder, navn i en setning og
// opplesningen er de delte reglene; best balls port og klipp er
// `firstHalfScope`; stripas knapp er Hjem-kortets (`heroAction`).
import {
  firstHalfHoleNumbersForSegment,
  hiddenHoleNumbersForSegment,
  lastHoleForSegment,
} from '../../../../lib/games/holeScope';
import { STATUS_LABELS } from '../../../../lib/games/status';
import { showHolesColumn } from '../../../../lib/leaderboard/holesColumn';
import {
  boardRowSrParts,
  boardShowsRank,
  isBoardLeader,
  sentenceName,
  type BoardRowSrPart,
} from '../../../../lib/leaderboard/boardRules';
import type { LiveBoardUnit } from '../../../../lib/leaderboard/liveBoard';
import {
  resultStanding,
  teamResultBoard,
  type ResultBoard,
  type TeamBoardResult,
  type TeamResultBoardRow,
} from '../../../../lib/leaderboard/resultBoard';
import {
  bestBallHoleCard,
  scrambleHoleCard,
  teamDisplayUnit,
  teamLiveBoard,
  withoutLatestHolePerTeam,
  type TeamDisplayUnit,
  type TeamHoleTone,
} from '../../../../lib/leaderboard/teamLiveBoard';
import { nameInitials } from '../../../../lib/names/initials';
import type { HoleSegment } from '../../../../lib/scoring/holeSegment';
import { MODE_LABELS, type GameMode, type ModeResult } from '../../../../lib/scoring/modes/types';
import type { ScoreTone } from '../../../../lib/scoring/scoreTone';
import type { LocalScore } from '../data/db';
import type { BundleGame, GameBundle } from '../data/gameBundle';
import {
  BOARD_APP_TEXT,
  BOARD_COMMON_TEXT,
  BOARD_TEAM_TEXT,
  BOARD_TEXT,
  STATE35_TEXT,
} from './boardCopy';
import { formatNameList, shortDisplayName } from './display';
import { gateReason } from './formatGate';
import { heroAction } from './homeHero';
import { formatMessage } from './kavalkadeCopy';
import { firstHalfScope, hasAnyStroke, leaderboardVisibility } from './leaderboardModel';
import { asModeConfig, computeGameLeaderboard } from './scoringContext';
import {
  DECIDED_TEXT,
  placeText,
  srPartText,
  stripAction,
  stripPlace,
  type SoloBoardStripAction,
} from './soloBoard';
import { termText } from './strokeTermText';

/**
 * Formatene med lagtavla: scramble-familien, shamble, best ball, og
 * stableford (også modifisert) når motoren regner lag (`team_size` 2, samme
 * valg som `stableford.ts`; resten er solotavla, `hasSoloBoard`). Lest fra
 * bundelen, så båndet står før noe er regnet.
 */
export function hasTeamBoard(game: Pick<BundleGame, 'gameMode' | 'modeConfig'>): boolean {
  const mode = game.gameMode as GameMode;
  if (
    mode === 'texas_scramble' ||
    mode === 'ambrose' ||
    mode === 'florida_scramble' ||
    mode === 'shamble' ||
    mode === 'best_ball'
  ) {
    return true;
  }
  if (mode !== 'stableford' && mode !== 'modified_stableford') return false;
  const config = asModeConfig(mode, game.modeConfig);
  return config !== null && (config as { team_size?: unknown }).team_size === 2;
}

/**
 * Hvilken tegning båndet følger. `Lagtavle-forslag` (live) tegner linja med
 * 85 % krem og tallene i pillen uten faste sifre; de to andre lagtegningene
 * (ferdig, og best ball som alltid er klippet live) har 80 % og faste sifre.
 */
export function teamBandVariant(game: Pick<BundleGame, 'gameMode' | 'status'>): 'team' | 'team-live' {
  return game.status === 'finished' || game.gameMode === 'best_ball' ? 'team' : 'team-live';
}

const teamName = (teamNumber: number) => formatMessage(BOARD_COMMON_TEXT.teamLabel, { number: teamNumber });

function unitText(unit: TeamDisplayUnit): string {
  return unit === 'points' ? BOARD_COMMON_TEXT.poengLabel : unit === 'gross' ? BOARD_TEAM_TEXT.gross : BOARD_TEAM_TEXT.net;
}

/** Lagformatenes resultat, eller `null` for alt annet motoren svarer. */
function asTeamResult(result: ModeResult): TeamBoardResult | null {
  switch (result.kind) {
    case 'texas_scramble':
    case 'best_ball':
    case 'shamble':
      return result;
    case 'stableford':
      return result.variant === 'team' ? result : null;
    default:
      return null;
  }
}

/**
 * Båndets kicker og linje: «FIRMAGOLFEN» (spillet alene) og «Texas scramble ·
 * 4 lag à 4 · netto». Lagene og enheten er motorens (regnet uten slag), så
 * linja alltid sier det samme som kortene. Kan ikke motoren svare, står bare
 * formatet.
 */
export function teamBoardBand(bundle: GameBundle): { kicker: string; subtitle: string } {
  const label = MODE_LABELS[bundle.game.gameMode as GameMode];
  const outcome = computeGameLeaderboard(bundle, []);
  const result = outcome.ok ? asTeamResult(outcome.result) : null;
  if (!result) return { kicker: bundle.game.name, subtitle: label };
  const rows = teamResultBoard(result, teamName).rows;
  const sizes = new Set(rows.map((row) => row.memberIds.length));
  const teams =
    sizes.size === 1
      ? formatMessage(BOARD_TEAM_TEXT.teamsOfSize, { count: rows.length, size: [...sizes][0] })
      : formatMessage(BOARD_TEAM_TEXT.teams, { count: rows.length });
  return {
    kicker: bundle.game.name,
    subtitle: [label, teams, unitText(teamDisplayUnit(result))].join(' · '),
  };
}

export type TeamBoardRow = {
  teamNumber: number;
  /** «Lag 3». */
  name: string;
  /** «–» før noen har spilt, «T2» ved delt plass, ellers plassen. */
  place: string;
  /** Lederen live, vinneren ferdig: gullskive og gullring. */
  leader: boolean;
  you: boolean;
  /** Navnelinja: «Deg, Marte, Jonas og Anders». */
  members: string;
  /** Avatarene hos lederen live, i navnelinjas rekkefølge. */
  initials: string[];
  /** Summen: «39», «—» før laget har spilt. */
  total: string;
  /** Under summen: «netto», «netto · lag-hcp 7», «poeng», «hull 10» eller «8 av 9». */
  under: string;
  /**
   * Prikkene: live de siste fem hullene hos lederen og ditt lag, i best ball
   * alle hullene i første halvdel på hvert lag; `null` uten prikkrad.
   */
  dots: TeamHoleTone[] | null;
  /** «hull 11» ved prikkene live; `null` i best ball og uten prikker. */
  holesNote: string | null;
  /** Plasser opp (+) eller ned (−) siden lagets forrige hull, ved prikkene. */
  movement: number | null;
  /** Ferdig: «Likt med Lag 4 · avgjort på siste ni». */
  note: string | null;
  /** Hele kortet som én linje for skjermleseren. */
  a11y: string;
};

/** «Ditt lag på hull N»: overskriften, hvem sin ball som talte (best ball) og scoren. */
export type TeamHoleCard = {
  heading: string;
  /** Best ball: «Ballen til » + navnene (uthevet) + « talte». */
  lead: { before: string; names: string; after: string } | null;
  /** «3 slag, birdie» (scramble) eller «netto 6, bogey» (best ball). */
  score: string;
};

export type TeamBoardStrip = {
  kicker: string;
  /** «2. plass», stort. */
  place: string;
  /** «1 slag bak Lag 3», «8 av 9 hull», eller `null` når bare plassen står. */
  detail: string | null;
  action: SoloBoardStripAction | null;
};

export type TeamBoardModel = {
  /** `first-half` er best ball mens runden pågår (`firstHalfScope`). */
  variant: 'live' | 'first-half' | 'finished';
  pill: { text: string; live: boolean };
  rows: TeamBoardRow[];
  /** Seerens lag, når seeren er med på et. */
  viewerTeam: number | null;
  /** Best ball: «HULL 1–9» og «Hull 10–18 er skjult» over lagene. */
  halves: { shown: string; hidden: string } | null;
  /** Best ball: låskortet under lagene. */
  lock: { heading: string; sub: string } | null;
  holeCard: TeamHoleCard | null;
  /** «Laget ditt», eller `null` når seeren ikke er med på et lag. */
  strip: TeamBoardStrip | null;
};

/**
 * Medlemmene i navnelinjas rekkefølge: seeren først («Deg»), så resten etter
 * navn. Motorens rekkefølge er bruker-id-ens, og rosterets følger ikke
 * radene stabilt, så navnet er den rekkefølgen som står stille.
 */
function members(
  bundle: GameBundle,
  memberIds: readonly string[],
  userId: string | null,
  you: string = BOARD_TEAM_TEXT.you,
): { names: string[]; initials: string[] } {
  const byId = new Map(bundle.players.map((player) => [player.userId, player]));
  const nameOf = (id: string) => shortDisplayName(byId.get(id) ?? { name: null, nickname: null });
  const ordered = [
    ...memberIds.filter((id) => id === userId),
    ...memberIds.filter((id) => id !== userId).sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'no')),
  ];
  return {
    names: ordered.map((id) => (id === userId ? you : nameOf(id))),
    initials: ordered.map((id) => nameInitials(byId.get(id)?.name)),
  };
}

/** Én del av kortets opplesning; lagets egne ord der de skiller seg fra solotavla. */
function teamSrPart(part: BoardRowSrPart, note: string | null, unit: TeamDisplayUnit): string | null {
  if (part.key === 'you') return BOARD_TEAM_TEXT.srYourTeam;
  if (part.key === 'total' && part.total.kind === 'net' && unit === 'gross') {
    return formatMessage(BOARD_TEAM_TEXT.srGross, { total: part.total.value });
  }
  return srPartText(part, note);
}

function rowSr(opts: {
  row: TeamResultBoardRow;
  memberNames: string;
  movement: number | null;
  recent: ScoreTone[];
  boardUnit: LiveBoardUnit;
  unit: TeamDisplayUnit;
  showRank: boolean;
  winner: boolean;
  note: string | null;
  you: boolean;
}): string {
  const { row, memberNames, movement, recent, boardUnit, unit, showRank, winner, note, you } = opts;
  const parts = boardRowSrParts({
    row: { ...row, movement, recent },
    unit: boardUnit,
    showRank,
    isYou: you,
    winner,
    hasNote: note !== null,
  });
  return [row.name, memberNames, ...parts.map((part) => teamSrPart(part, note, unit))]
    .filter(Boolean)
    .join('. ');
}

/** «1 slag bak Lag 3» (lag-stableford: poeng), eller `null` når laget leder eller ikke kan sammenlignes. */
function behindText(
  board: ResultBoard<TeamResultBoardRow>,
  standing: { gap: number | null; leaders: number[] },
): string | null {
  if (standing.gap === null || standing.gap <= 0) return null;
  const points = board.unit === 'points';
  const leader = board.rows.find((row) => row.teamNumber === standing.leaders[0]);
  if (standing.leaders.length > 1 || !leader) {
    return formatMessage(points ? BOARD_TEXT.behindPointsLead : BOARD_TEXT.behindStrokesLead, { gap: standing.gap });
  }
  return formatMessage(points ? BOARD_TEXT.behindPoints : BOARD_TEXT.behindStrokes, {
    gap: standing.gap,
    name: sentenceName(leader, board.rows, (row) => row.name, (row) => row.teamNumber),
  });
}

/**
 * Lagtavla for skjermen, eller `null` når Resultater-skjermen viser noe annet
 * (et annet format, et stengt spill, en blind runde, best ball før et lag har
 * spilt første halvdel, ingen slag, eller når motoren ikke kan svare).
 */
export function teamBoardFor(opts: {
  bundle: GameBundle;
  /** Foldet (`useTeamScores`), som tavla og Hjem-kortet får dem. */
  scores: readonly LocalScore[];
  userId: string | null;
}): TeamBoardModel | null {
  const { bundle, scores, userId } = opts;
  const { game } = bundle;
  if (!hasTeamBoard(game) || gateReason(game) !== null) return null;
  if (leaderboardVisibility(game.scoreVisibility, game.status, game.gameMode as GameMode) !== 'full') {
    return null;
  }
  const scope = firstHalfScope(bundle, scores);
  if (scope.view === 'waiting' || !hasAnyStroke(scope.scores)) return null;
  return game.status === 'finished'
    ? finishedBoard(bundle, scores, userId)
    : liveBoard(bundle, scores, scope, userId);
}

/** Slagene uten hvert lags siste hull (i hullrekkefølge), for bevegelsen. */
function withoutLatestHole(bundle: GameBundle, scores: readonly LocalScore[]): LocalScore[] {
  const teamOf = new Map(bundle.players.map((player) => [player.userId, player.teamNumber]));
  const kept = new Set(
    withoutLatestHolePerTeam(
      scores.map((score, index) => ({
        user_id: score.userId,
        hole_number: score.holeNumber,
        strokes: score.strokes,
        index,
      })),
      (userId) => teamOf.get(userId) ?? null,
      bundle.game.holeSegment as HoleSegment,
    ).map((row) => row.index),
  );
  return scores.filter((_, index) => kept.has(index));
}

function viewerTeamOf(rows: readonly TeamResultBoardRow[], userId: string | null): number | null {
  if (!userId) return null;
  return rows.find((row) => row.memberIds.includes(userId))?.teamNumber ?? null;
}

function liveBoard(
  bundle: GameBundle,
  scores: readonly LocalScore[],
  scope: ReturnType<typeof firstHalfScope>,
  userId: string | null,
): TeamBoardModel | null {
  const outcome = computeGameLeaderboard(scope.bundle, scope.scores);
  const result = outcome.ok ? asTeamResult(outcome.result) : null;
  if (!result) return null;
  const firstHalf = scope.view === 'first-half';
  // Best ball viser ingen bevegelse, så den regnes ikke.
  const before = firstHalf ? null : computeGameLeaderboard(scope.bundle, withoutLatestHole(bundle, scope.scores));
  const previous = before?.ok ? asTeamResult(before.result) : null;
  // Modifisert stableford har sin egen poengtabell; resultatet sier det ikke.
  const board = teamLiveBoard(result, previous, teamName, {
    stablefordTable: bundle.game.gameMode === 'modified_stableford' ? 'modified' : 'standard',
  });
  if (board.rows.length === 0) return null;

  const unit = teamDisplayUnit(result);
  const showRank = boardShowsRank(board.holesPlayed);
  const viewerTeam = viewerTeamOf(board.rows, userId);
  const halfHoles = scope.bundle.holes.length;

  const rows = board.rows.map((row): TeamBoardRow => {
    const leader = showRank && isBoardLeader(row);
    const you = row.teamNumber === viewerTeam;
    const team = members(bundle, row.memberIds, userId);
    const memberNames = formatNameList(team.names);
    const holes = formatMessage(BOARD_TEAM_TEXT.holes, { holes: row.holesPlayed });
    // Live har bare lederen og ditt lag prikker og bevegelse; best ball har
    // prikker på alle lag og ingen bevegelse. Før lagets første hull har ditt
    // lag ingen prikker å vise, og står som de andre med «hull 0».
    const marked = (leader || you) && row.holesPlayed > 0;
    const movement = !firstHalf && marked ? row.movement : null;
    const recent = firstHalf || marked ? row.recent : [];
    return {
      teamNumber: row.teamNumber,
      name: row.name,
      place: placeText(row, showRank),
      leader,
      you,
      members: memberNames,
      initials: team.initials,
      total: row.total === null ? '—' : String(row.total),
      under: firstHalf
        ? formatMessage(BOARD_TEAM_TEXT.ofHoles, { played: row.holesPlayed, total: halfHoles })
        : marked
          ? unitText(unit)
          : holes,
      dots: firstHalf ? row.tones.map((hole) => hole.tone) : marked ? row.recent : null,
      holesNote: !firstHalf && marked ? holes : null,
      movement,
      note: null,
      a11y: rowSr({
        row,
        memberNames,
        movement,
        recent,
        boardUnit: board.unit,
        unit,
        showRank,
        winner: false,
        note: null,
        you,
      }),
    };
  });

  const standing = viewerTeam !== null ? resultStanding(board, (row) => row.teamNumber, viewerTeam) : null;
  const mine = board.rows.find((row) => row.teamNumber === viewerTeam);
  const strip: TeamBoardStrip | null =
    standing && mine && userId
      ? {
          kicker: BOARD_TEAM_TEXT.stripKicker,
          place: stripPlace(standing),
          detail: firstHalf
            ? formatMessage(BOARD_TEAM_TEXT.stripOfHoles, { played: mine.holesPlayed, total: halfHoles })
            : behindText(board, standing),
          action: stripAction(heroAction({ bundle, scores, userId })),
        }
      : null;

  return {
    variant: firstHalf ? 'first-half' : 'live',
    pill: {
      text:
        bundle.game.status === 'scheduled'
          ? STATUS_LABELS.scheduled
          : board.holesPlayed === 0
            ? BOARD_TEXT.pillLive
            : formatMessage(BOARD_TEXT.pillLiveAfter, { holes: board.holesPlayed }),
      live: bundle.game.status === 'active',
    },
    rows,
    viewerTeam,
    halves: firstHalf ? halvesText() : null,
    lock: firstHalf ? lockText() : null,
    holeCard: viewerTeam === null ? null : holeCard(bundle, result, viewerTeam, firstHalf, userId),
    strip,
  };
}

/** Hullene i første halvdel og resten, samme spenn som webbens tavle (`holeScope.ts`). */
function halves(): { open: number[]; hidden: number[]; last: number } {
  return {
    open: firstHalfHoleNumbersForSegment('full'),
    hidden: hiddenHoleNumbersForSegment('full'),
    last: lastHoleForSegment('full'),
  };
}

function halvesText(): { shown: string; hidden: string } {
  const { open, hidden } = halves();
  return {
    shown: formatMessage(STATE35_TEXT.segmentHalfLabel, { from: open[0], to: open[open.length - 1] }),
    hidden: formatMessage(BOARD_TEAM_TEXT.hiddenHalf, { from: hidden[0], to: hidden[hidden.length - 1] }),
  };
}

function lockText(): { heading: string; sub: string } {
  const { hidden, last } = halves();
  return {
    heading: formatMessage(STATE35_TEXT.lockedHeading, { last }),
    sub: formatMessage(STATE35_TEXT.lockedSub, { from: hidden[0], to: hidden[hidden.length - 1] }),
  };
}

/**
 * «Ditt lag på hull N»: scramble-familien live («3 slag, birdie», brutto
 * begge), best ball i første halvdel («Ballen til Kristian talte · netto 6,
 * bogey», netto begge). Ikke shamble eller lag-stableford.
 */
function holeCard(
  bundle: GameBundle,
  result: TeamBoardResult,
  viewerTeam: number,
  firstHalf: boolean,
  userId: string | null,
): TeamHoleCard | null {
  if (result.kind === 'texas_scramble' && !firstHalf) {
    const card = scrambleHoleCard(result, viewerTeam);
    if (!card) return null;
    return {
      heading: formatMessage(BOARD_TEAM_TEXT.holeCardHeading, { hole: card.holeNumber }),
      lead: null,
      score: formatMessage(BOARD_TEAM_TEXT.scrambleScore, {
        strokes: card.strokes,
        term: termText(card.term, card.overPar).toLowerCase(),
      }),
    };
  }
  if (result.kind === 'best_ball' && firstHalf) {
    const card = bestBallHoleCard(result, viewerTeam);
    if (!card) return null;
    const [before, after] = BOARD_TEAM_TEXT.bestBallBall.split('{names}');
    return {
      heading: formatMessage(BOARD_TEAM_TEXT.holeCardHeading, { hole: card.holeNumber }),
      // Inne i setningen er seeren «deg», ikke «Deg» som først i navnelinja.
      lead: {
        before,
        names: formatNameList(members(bundle, card.contributorIds, userId, BOARD_TEAM_TEXT.youInSentence).names),
        after,
      },
      score: formatMessage(BOARD_TEAM_TEXT.bestBallScore, {
        net: card.net,
        term: termText(card.term, card.overPar).toLowerCase(),
      }),
    };
  }
  return null;
}

function finishedBoard(
  bundle: GameBundle,
  scores: readonly LocalScore[],
  userId: string | null,
): TeamBoardModel | null {
  const outcome = computeGameLeaderboard(bundle, scores);
  const result = outcome.ok ? asTeamResult(outcome.result) : null;
  if (!result) return null;
  const board = teamResultBoard(result, teamName);
  if (board.rows.length === 0) return null;
  const unit = teamDisplayUnit(result);
  const showRank = boardShowsRank(board.holesPlayed);
  const viewerTeam = viewerTeamOf(board.rows, userId);
  const byNumber = new Map(board.rows.map((row) => [row.teamNumber, row]));
  // Som solotavlas HULL-kolonne (#1982): har lagene spilt ulikt antall hull,
  // får hvert kort hullene etter enheten, så summene ikke ser like lange ut.
  const showHoles = showHolesColumn('finished', board.rows.map((row) => row.holesPlayed));

  const note = (row: TeamResultBoardRow): string | null => {
    if (row.decidedBy === null || row.decidedBy === 'total' || row.above === null) return null;
    const above = byNumber.get(row.above);
    return above
      ? formatMessage(DECIDED_TEXT[row.decidedBy], {
          name: sentenceName(above, board.rows, (r) => r.name, (r) => r.teamNumber),
        })
      : null;
  };

  const rows = board.rows.map((row): TeamBoardRow => {
    const you = row.teamNumber === viewerTeam;
    const team = members(bundle, row.memberIds, userId);
    const memberNames = formatNameList(team.names);
    const rowNote = note(row);
    return {
      teamNumber: row.teamNumber,
      name: row.name,
      place: placeText(row, showRank),
      leader: isBoardLeader(row),
      you,
      members: memberNames,
      initials: team.initials,
      total: row.total === null ? '—' : String(row.total),
      under: [
        row.teamHandicap === null
          ? unitText(unit)
          : formatMessage(BOARD_TEAM_TEXT.teamHandicap, { unit: unitText(unit), hcp: row.teamHandicap }),
        ...(showHoles ? [formatMessage(BOARD_TEAM_TEXT.holes, { holes: row.holesPlayed })] : []),
      ].join(' · '),
      dots: null,
      holesNote: null,
      movement: null,
      note: rowNote,
      a11y: rowSr({
        row,
        memberNames,
        movement: null,
        recent: [],
        boardUnit: board.unit,
        unit,
        showRank,
        winner: isBoardLeader(row),
        note: rowNote,
        you,
      }),
    };
  });

  const standing = viewerTeam !== null ? resultStanding(board, (row) => row.teamNumber, viewerTeam) : null;
  return {
    variant: 'finished',
    pill: { text: formatMessage(BOARD_APP_TEXT.pillFinished, { holes: board.holesPlayed }), live: false },
    rows,
    viewerTeam,
    halves: null,
    lock: null,
    holeCard: null,
    strip: standing
      ? {
          kicker: BOARD_TEAM_TEXT.stripKicker,
          place: stripPlace(standing),
          detail: behindText(board, standing),
          action: { kind: 'scorecard', label: BOARD_APP_TEXT.scorecard },
        }
      : null,
  };
}
