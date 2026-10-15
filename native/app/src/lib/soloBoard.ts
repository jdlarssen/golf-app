// #2579: tavla i appen for solo stableford (også modifisert) og slagspill,
// live og ferdig, etter `Tavle-forslag` og `Tavle-ferdig-forslag-*`.
//
// Ren funksjon, ingen React. Skjermen spør én gang og bruker svaret til tre
// ting: pillen i båndet, tavla og stripa nederst. Svaret er `null` nøyaktig
// når Resultater-skjermen ikke tegner tavla (samme porter i samme rekkefølge
// som `LeaderboardBody`: gaten, reveal, ingen slag, motoren), så pillen og
// stripa aldri står over noe annet enn tavla.
//
// Ingen regel her er ny. Tallene er tavlas (`liveBoardFor`) eller det ferdige
// resultatets (`soloResultBoard`); plass, leder, navn i en setning og enheten
// er de delte reglene i `lib/leaderboard/`; stripas knapp er Hjem-kortets
// (`heroAction`, samme regel som `buildHeroModel`).
import { STATUS_LABELS } from '../../../../lib/games/status';
import { showHolesColumn } from '../../../../lib/leaderboard/holesColumn';
import {
  boardRowSrParts,
  boardShowsRank,
  isBoardLeader,
  placeKind,
  sentenceName,
  totalLabel,
  type BoardPlaceRow,
  type BoardRowSrPart,
} from '../../../../lib/leaderboard/boardRules';
import { viewerStanding, type LiveBoardRow, type LiveBoardUnit } from '../../../../lib/leaderboard/liveBoard';
import {
  resultStanding,
  soloResultBoard,
  type ResultBoardRow,
} from '../../../../lib/leaderboard/resultBoard';
import type { ScoreTone } from '../../../../lib/scoring/scoreTone';
import { formatRevealName } from '../../../../lib/names/formatRevealName';
import { MODE_LABELS, type GameMode } from '../../../../lib/scoring/modes/types';
import type { TieDecider } from '../../../../lib/scoring/tiebreaker';
import type { LocalScore } from '../data/db';
import type { BundleGame, GameBundle } from '../data/gameBundle';
import { BOARD_APP_TEXT, BOARD_COMMON_TEXT, BOARD_TEXT } from './boardCopy';
import { gateReason } from './formatGate';
import { heroAction, liveBoardFor, type HeroAction } from './homeHero';
import { formatMessage } from './kavalkadeCopy';
import { hasAnyStroke, leaderboardVisibility } from './leaderboardModel';
import { asModeConfig, computeGameLeaderboard, toPlayerRows } from './scoringContext';

/**
 * Formatene med den nye tavla: slagspill, og stableford (også modifisert)
 * når motoren regner solo: `team_size` er ikke 2, også når feltet mangler
 * (samme valg som `stableford.ts`). Lest fra bundelen, så båndet står før
 * noe er regnet.
 */
export function hasSoloBoard(game: Pick<BundleGame, 'gameMode' | 'modeConfig'>): boolean {
  const mode = game.gameMode as GameMode;
  if (mode === 'solo_strokeplay') return true;
  if (mode !== 'stableford' && mode !== 'modified_stableford') return false;
  const config = asModeConfig(mode, game.modeConfig);
  return config !== null && (config as { team_size?: unknown }).team_size !== 2;
}

/**
 * Båndets kicker og formatlinje: «LØRDAGSRUNDEN · BYNESET NORTH» og
 * «Stableford · 12 spillere · 3 flighter». Spillerne er de som ikke har
 * trukket seg (radene på tavla); flighter står bare når det er flere enn én.
 */
export function boardBand(bundle: GameBundle): { kicker: string; subtitle: string } {
  const active = bundle.players.filter((player) => player.withdrawnAt == null);
  const flights = new Set(
    active.map((player) => player.flightNumber).filter((flight) => flight != null),
  ).size;
  return {
    kicker: [bundle.game.name, bundle.courseName].filter(Boolean).join(' · '),
    subtitle: [
      MODE_LABELS[bundle.game.gameMode as GameMode],
      formatMessage(BOARD_TEXT.players, { count: active.length }),
      ...(flights > 1 ? [formatMessage(BOARD_TEXT.flights, { count: flights })] : []),
    ]
      .filter(Boolean)
      .join(' · '),
  };
}

export type SoloBoardRow = {
  userId: string;
  name: string;
  /** «–» før noen har spilt, «T4» ved delt plass, ellers plassen. */
  place: string;
  /** Lederen live, vinneren ferdig: gullskive og gullring. */
  leader: boolean;
  you: boolean;
  holesPlayed: number;
  /** Tallet i tavlas enhet: «18», «−2», «74». */
  total: string;
  /** Live: plasser opp (+) eller ned (−) siden forrige hull; `null` uten pil. */
  movement: number | null;
  /** Live: fargen på de siste fem hullene, eldst først. */
  recent: ScoreTone[];
  /** Ferdig: «Likt med Jonas · avgjort på siste ni». */
  note: string | null;
  /** Hele raden som én linje for skjermleseren, som webbens `boardRowSr`. */
  a11y: string;
};

export type SoloBoardStripAction =
  | { kind: 'hole'; holeNumber: number; label: string }
  | { kind: 'submit'; label: string }
  | { kind: 'scorecard'; label: string };

export type SoloBoardStrip = {
  kicker: string;
  /** «3. plass · 3 poeng bak Marte», eller bare plassen. */
  text: string;
  action: SoloBoardStripAction | null;
};

export type SoloBoardModel = {
  variant: 'live' | 'finished';
  pill: { text: string; live: boolean };
  /** Overskriften over tallene: «Poeng» eller «Netto». */
  totalHeading: string;
  showHoles: boolean;
  rows: SoloBoardRow[];
  /** Seeren når hen står på tavla (raden «Vis alle» folder rundt). */
  viewerId: string | null;
  /** «Din runde» / «Ditt resultat», eller `null` når seeren ikke står på tavla. */
  strip: SoloBoardStrip | null;
};

// Plassen, likt-linja, opplesningen og stripas knapp deles med lagtavla
// (`teamBoard.ts`): samme ord og samme regel på begge tavlene.

/** Plassen i skiva og i stripa: «–», «T4» eller «3». */
export function placeText(row: BoardPlaceRow, showRank: boolean): string {
  const kind = placeKind(row, showRank);
  return kind === 'none'
    ? '–'
    : kind === 'tied'
      ? formatMessage(BOARD_TEXT.tiedRank, { rank: row.rank })
      : String(row.rank);
}

export function stripPlace(standing: { rank: number; tied: boolean }): string {
  return formatMessage(standing.tied ? BOARD_TEXT.stripTiedPlace : BOARD_TEXT.stripPlace, {
    rank: standing.rank,
  });
}

export const DECIDED_TEXT: Record<Exclude<TieDecider, 'total'>, string> = {
  back9: BOARD_APP_TEXT.decidedBack9,
  back6: BOARD_APP_TEXT.decidedBack6,
  back3: BOARD_APP_TEXT.decidedBack3,
  hole18: BOARD_APP_TEXT.decidedHole18,
};

/**
 * Radens navn som webbens tavle og sidekortet skriver det (`boardDisplayName`,
 * `lib/sideTournament.ts`): kallenavnet mellom fornavn og etternavn, eller
 * «(ukjent spiller)». Det samme navnet går inn i `sentenceName`.
 */
const rowName = (row: { name: string | null; nickname: string | null }) =>
  row.name ? formatRevealName(row.name, row.nickname) : BOARD_COMMON_TEXT.unknownPlayerFull;

/** Én del av radens opplesning med webbens ord; rekkefølgen er `boardRowSrParts`. */
export function srPartText(part: BoardRowSrPart, note: string | null): string | null {
  switch (part.key) {
    case 'place':
      return formatMessage(part.tied ? BOARD_TEXT.srTiedPlace : BOARD_TEXT.srPlace, { rank: part.rank });
    case 'winner':
      return BOARD_APP_TEXT.winner;
    case 'total': {
      const total = part.total;
      switch (total.kind) {
        case 'none':
          return BOARD_TEXT.srNoTotal;
        case 'points':
          return formatMessage(BOARD_TEXT.srPoints, { total: total.value });
        case 'net':
          return formatMessage(BOARD_TEXT.srNet, { total: total.value });
        case 'even':
          return BOARD_TEXT.srEven;
        case 'over':
          return formatMessage(BOARD_TEXT.srOverPar, { count: total.value });
        case 'under':
          return formatMessage(BOARD_TEXT.srUnderPar, { count: total.value });
      }
      break;
    }
    case 'movement':
      return part.direction === 'up'
        ? formatMessage(BOARD_TEXT.srUp, { count: part.count })
        : part.direction === 'down'
          ? formatMessage(BOARD_TEXT.srDown, { count: part.count })
          : BOARD_TEXT.srSame;
    case 'recent':
      return formatMessage(BOARD_TEXT.srRecent, {
        tones: part.tones.map((tone) => BOARD_TEXT.tone[tone]).join(', '),
      });
    case 'holes':
      return formatMessage(BOARD_COMMON_TEXT.holesPlayedCount, { count: part.count });
    case 'note':
      return note;
    case 'you':
      return BOARD_TEXT.srYou;
  }
  return null;
}

/**
 * Raden lest opp i én linje: navnet først (webben leser det fra skiltet rett
 * før), så delene i den delte rekkefølgen (`boardRowSrParts`).
 */
function rowSr(opts: {
  name: string;
  row: BoardPlaceRow & Pick<LiveBoardRow, 'total' | 'movement' | 'recent'>;
  showRank: boolean;
  unit: LiveBoardUnit;
  winner: boolean;
  note: string | null;
  you: boolean;
}): string {
  const { name, row, showRank, unit, winner, note, you } = opts;
  const parts = boardRowSrParts({ row, unit, showRank, isYou: you, winner, hasNote: note !== null });
  return [name, ...parts.map((part) => srPartText(part, note))].filter(Boolean).join('. ');
}

/**
 * Stripas knapp, med Hjem-kortets regel (`heroAction`): neste hull, eller
 * «Lever scorekort» når alle hull er ført. `open` og `null` gir ingen knapp.
 */
export function stripAction(action: HeroAction): SoloBoardStripAction | null {
  return action?.kind === 'hole'
    ? {
        kind: 'hole',
        holeNumber: action.holeNumber,
        label: formatMessage(BOARD_TEXT.stripHole, { hole: action.holeNumber }),
      }
    : action?.kind === 'submit'
      ? { kind: 'submit', label: BOARD_TEXT.stripSubmit }
      : null;
}

/**
 * Tavla for skjermen, eller `null` når Resultater-skjermen viser noe annet
 * (et annet format, et stengt spill, en reveal-runde som skjuler netto, ingen
 * slag, eller når motoren ikke kan svare).
 */
export function soloBoardFor(opts: {
  bundle: GameBundle;
  /** Foldet (`useTeamScores`), som tavla og Hjem-kortet får dem. */
  scores: readonly LocalScore[];
  userId: string | null;
}): SoloBoardModel | null {
  const { bundle, scores, userId } = opts;
  const { game } = bundle;
  if (!hasSoloBoard(game) || gateReason(game) !== null) return null;
  if (leaderboardVisibility(game.scoreVisibility, game.status, game.gameMode as GameMode) !== 'full') {
    return null;
  }
  if (!hasAnyStroke(scores)) return null;
  return game.status === 'finished'
    ? finishedBoard(bundle, scores, userId)
    : liveBoard(bundle, scores, userId);
}

function liveBoard(
  bundle: GameBundle,
  scores: readonly LocalScore[],
  userId: string | null,
): SoloBoardModel | null {
  const board = liveBoardFor(bundle, scores);
  if (!board || board.rows.length === 0) return null;
  const showRank = boardShowsRank(board.holesPlayed);
  const keyOf = (row: { userId: string }) => row.userId;

  const standing = userId ? viewerStanding(board, userId) : null;
  let strip: SoloBoardStrip | null = null;
  if (standing && userId) {
    const action = heroAction({ bundle, scores, userId });
    const leaderRow = board.rows.find((row) => row.userId === standing.leaderUserIds[0]);
    const behind =
      standing.gap === null || standing.gap <= 0
        ? null
        : standing.leaderUserIds.length > 1 || !leaderRow
          ? formatMessage(
              board.unit === 'points' ? BOARD_TEXT.behindPointsLead : BOARD_TEXT.behindStrokesLead,
              { gap: standing.gap },
            )
          : formatMessage(board.unit === 'points' ? BOARD_TEXT.behindPoints : BOARD_TEXT.behindStrokes, {
              gap: standing.gap,
              name: sentenceName(leaderRow, board.rows, rowName, keyOf),
            });
    strip = {
      kicker: BOARD_TEXT.stripKicker,
      text: [stripPlace(standing), behind].filter(Boolean).join(' · '),
      action: stripAction(action),
    };
  }

  // Som webbens tavle: et planlagt spill sier «Planlagt» (statusens navn), og
  // prikken står bare mens runden pågår.
  const scheduled = bundle.game.status === 'scheduled';
  return {
    variant: 'live',
    pill: {
      text: scheduled
        ? STATUS_LABELS.scheduled
        : board.holesPlayed === 0
          ? BOARD_TEXT.pillLive
          : formatMessage(BOARD_TEXT.pillLiveAfter, { holes: board.holesPlayed }),
      live: bundle.game.status === 'active',
    },
    totalHeading: totalHeading(board.unit),
    showHoles: showHolesColumn(bundle.game.status, board.rows.map((row) => row.holesPlayed)),
    rows: board.rows.map((row) => ({
      userId: row.userId,
      name: rowName(row),
      place: placeText(row, showRank),
      leader: showRank && isBoardLeader(row),
      you: row.userId === userId,
      holesPlayed: row.holesPlayed,
      total: totalLabel(board.unit, row.total),
      movement: row.movement,
      recent: row.recent,
      note: null,
      a11y: rowSr({
        name: rowName(row),
        row,
        showRank,
        unit: board.unit,
        winner: false,
        note: null,
        you: row.userId === userId,
      }),
    })),
    viewerId: standing ? userId : null,
    strip,
  };
}

function finishedBoard(
  bundle: GameBundle,
  scores: readonly LocalScore[],
  userId: string | null,
): SoloBoardModel | null {
  const outcome = computeGameLeaderboard(bundle, scores);
  if (!outcome.ok) return null;
  const { result } = outcome;
  if (!(result.kind === 'solo_strokeplay' || (result.kind === 'stableford' && result.variant === 'solo'))) {
    return null;
  }
  const board = soloResultBoard(result, toPlayerRows(bundle));
  if (board.rows.length === 0) return null;
  const showRank = boardShowsRank(board.holesPlayed);
  const keyOf = (row: ResultBoardRow) => row.userId;
  const byId = new Map(board.rows.map((row) => [row.userId, row]));

  const note = (row: ResultBoardRow): string | null => {
    if (row.decidedBy === null || row.decidedBy === 'total' || row.above === null) return null;
    const above = byId.get(row.above);
    return above
      ? formatMessage(DECIDED_TEXT[row.decidedBy], { name: sentenceName(above, board.rows, rowName, keyOf) })
      : null;
  };

  const standing = userId ? resultStanding(board, keyOf, userId) : null;
  let strip: SoloBoardStrip | null = null;
  if (standing) {
    const leaderRow = byId.get(standing.leaders[0]);
    // Likt med lederen på totalen (skilt på siste ni) gir 0: da står bare plassen.
    const behind =
      standing.gap === null || standing.gap <= 0
        ? null
        : standing.leaders.length > 1 || !leaderRow
          ? formatMessage(BOARD_APP_TEXT.behindShortLead, { gap: standing.gap })
          : formatMessage(BOARD_APP_TEXT.behindShort, {
              gap: standing.gap,
              name: sentenceName(leaderRow, board.rows, rowName, keyOf),
            });
    strip = {
      kicker: BOARD_APP_TEXT.resultKicker,
      text: [stripPlace(standing), behind].filter(Boolean).join(' · '),
      action: { kind: 'scorecard', label: BOARD_APP_TEXT.scorecard },
    };
  }

  return {
    variant: 'finished',
    pill: { text: formatMessage(BOARD_APP_TEXT.pillFinished, { holes: board.holesPlayed }), live: false },
    totalHeading: totalHeading(board.unit),
    showHoles: showHolesColumn('finished', board.rows.map((row) => row.holesPlayed)),
    rows: board.rows.map((row) => ({
      userId: row.userId,
      name: rowName(row),
      place: placeText(row, showRank),
      leader: isBoardLeader(row),
      you: row.userId === userId,
      holesPlayed: row.holesPlayed,
      total: totalLabel(board.unit, row.total),
      movement: null,
      recent: [],
      note: note(row),
      a11y: rowSr({
        name: rowName(row),
        row: { ...row, movement: null, recent: [] },
        showRank,
        unit: board.unit,
        winner: isBoardLeader(row),
        note: note(row),
        you: row.userId === userId,
      }),
    })),
    viewerId: standing ? userId : null,
    strip,
  };
}

function totalHeading(unit: LiveBoardUnit): string {
  return unit === 'points' ? BOARD_TEXT.colPoints : BOARD_TEXT.colNet;
}
