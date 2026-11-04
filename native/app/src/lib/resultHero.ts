// #2756: resultatet øverst på den ferdige tavla (tegningene `Resultat-B-*`), og
// kortet «Del resultat» sender.
//
// Setningen og kortet deler regelen for hvem som nevnes og hvilken ordlyd som
// gjelder (`headlineSpec`), men ikke tallet: kortet teller lagets resultat mot
// par, som nettets kort, mens setningen står rett over tavla og sier det samme
// som raden (`podiumFor`).
//
// Alt her er rent og regnes fra `outcome.result`, så det virker uten nett.
import {
  buildShareCardData,
  type ShareCardModel,
} from '../../../../lib/games/buildShareCardData';
import { isLeagueCardAlone } from '../../../../lib/games/finishedResultBadge';
import { formatDisplayLabelKey } from '../../../../lib/games/formatLabel';
import { isHoleInSegment } from '../../../../lib/games/holeScope';
import { formatVsPar } from '../../../../lib/leaderboard/vsPar';
import { podiumFor, type Podium, type PodiumRow } from '../../../../lib/leaderboard/podium';
import { formatPublicName } from '../../../../lib/names/formatPublicName';
import {
  MAX_SHARED_NAMES,
  headlineSpec,
  headlineWordLines,
  keepGoldTogether,
  lineText,
  osloDate,
  resultWords,
  signedCount,
  type HeadlineSpec,
  type ShareResultT,
  type Word,
} from '../../../../lib/og/shareCardHeadline';
import {
  cardKicker,
  chooseHeadline,
  shareCardHeight,
} from '../../../../lib/og/shareCardLayout';
import { matchRows, placementRows, type CardRow } from '../../../../lib/og/shareCardRows';
import type { HoleSegment } from '../../../../lib/scoring/holeSegment';
import type { GameMode, GameModeConfig, ModeResult } from '../../../../lib/scoring/modes/types';
import type { GameBundle } from '../data/gameBundle';
import { BOARD_COMMON_TEXT } from './boardCopy';
import { formatNameList } from './display';
import { formatMessage } from './kavalkadeCopy';
import { RESULT_APP_TEXT, RESULT_CARD_TEXT, RESULT_MODE_TEXT } from './resultCardCopy';
import { teamMembers } from './teamBoard';

/** Kortet slik `ResultShareCard` tegner det. */
export type ResultCardModel = {
  kicker: string;
  headline: { lines: Word[][]; fontSize: number };
  meta: string;
  rows: CardRow[];
  tagline: Word[];
  /** Bildets høyde i rutas piksler; bredden er alltid 1080. */
  height: number;
};

export type ResultHeroModel = {
  /** Setningen, linje for linje; gull er resultatet. */
  lines: Word[][];
  /** Gull i kursiv, som på kortet; marginen i matchplay («3&2») står rett. */
  goldItalic: boolean;
  /** Lagets medlemmer under setningen, når ett lag vant. */
  members: string | null;
  /** Noen vant: konfettien kan fyre. */
  celebrates: boolean;
  /** Setningen sier alt om utfallet, så matchkortet trenger ikke si det igjen. */
  resultInSentence: boolean;
  /** Hele setningen for skjermleseren. */
  a11y: string;
  gameId: string;
  endedAt: string | null;
  card: ResultCardModel;
};

/** En mal med `<gold>` som ord, fylt ut som next-intl gjør. */
export function templateWords(
  template: string,
  values: Record<string, string | number> = {},
): Word[] {
  let gold = false;
  const words: Word[] = [];
  for (const part of formatMessage(template, values).split(/(<gold>|<\/gold>)/)) {
    if (part === '<gold>') gold = true;
    else if (part === '</gold>') gold = false;
    else {
      for (const text of part.split(/\s+/).filter(Boolean)) words.push({ text, gold });
    }
  }
  return words;
}

const resultT: ShareResultT = (key, values) => formatMessage(RESULT_CARD_TEXT[key], values);

/** Kortets ordlyd, regel for regel som `headlineNode` i PNG-ruta. */
function cardWords(spec: HeadlineSpec): Word[] {
  const t = RESULT_CARD_TEXT;
  switch (spec.kind) {
    case 'finished':
      return templateWords(t.gameFinished);
    case 'tied':
      return templateWords(t.tied);
    case 'approved':
      return templateWords(t.approved);
    case 'matchWon':
      return templateWords(t.winnerWon, { name: formatNameList(spec.names), margin: spec.margin });
    case 'won':
    case 'shared':
    case 'sharedMany': {
      const { text, at } = resultWords(spec.result, resultT);
      const names = spec.kind === 'sharedMany' ? '' : formatNameList(spec.names);
      return templateWords(templateFor(spec.kind, at), { names, result: text });
    }
  }
}

function templateFor(kind: 'won' | 'shared' | 'sharedMany', at: boolean): string {
  const t = RESULT_CARD_TEXT;
  if (kind === 'won') return at ? t.headlineWonAt : t.headlineWon;
  if (kind === 'shared') return at ? t.headlineSharedAt : t.headlineShared;
  return at ? t.headlineSharedManyAt : t.headlineSharedMany;
}

/** Formatnavnet på metalinja, slått opp som nettet gjør det. */
function modeLabel(mode: string, config: unknown): string {
  const key = formatDisplayLabelKey(mode as GameMode, (config ?? {}) as GameModeConfig);
  if (key.startsWith('modeVariants.')) {
    return RESULT_MODE_TEXT.modeVariants[key.slice('modeVariants.'.length) as keyof typeof RESULT_MODE_TEXT.modeVariants];
  }
  return (RESULT_MODE_TEXT as unknown as Record<string, string>)[key] ?? mode;
}

function cardModel(bundle: GameBundle, model: ShareCardModel, spec: HeadlineSpec): ResultCardModel {
  const { game } = bundle;
  const holes = bundle.holes.filter((hole) => isHoleInSegment(hole.holeNumber, game.holeSegment as HoleSegment));
  const kicker = cardKicker(game.name, bundle.courseName);
  const words = cardWords(spec);
  const variants = [headlineWordLines(words, spec), [words]];
  const choice = chooseHeadline(variants.map(lineText));
  const active = bundle.players.filter((player) => player.withdrawnAt == null).length;
  const meta = [
    modeLabel(game.gameMode, game.modeConfig),
    formatMessage(RESULT_CARD_TEXT.players, { n: active }),
    osloDate(game.endedAt, 'nb-NO'),
    holes.length === 9 ? formatMessage(RESULT_CARD_TEXT.holes, { n: holes.length }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const alone = isLeagueCardAlone(model, game.leagueRoundId != null);
  return {
    kicker,
    headline: {
      lines: variants[choice.index].map(keepGoldTogether),
      fontSize: choice.fontSize,
    },
    meta,
    rows: model.band === 'matchplay' ? matchRows(model) : placementRows(model, alone),
    tagline: keepGoldTogether(templateWords(RESULT_CARD_TEXT.taglinePun)),
    height: shareCardHeight(model, {
      headlineLines: choice.lines,
      headlineFontSize: choice.fontSize,
      kicker,
      meta,
    }),
  };
}

/** Radens tall i setningens ord: «38 poeng», «62 netto», «−4», «6 skins», «7 hull». */
function figureWords(row: PodiumRow): { text: string; at: boolean } | null {
  const { total, unit } = row;
  if (total === null) return null;
  switch (unit) {
    case 'points':
      return resultWords({ kind: 'points', value: total }, resultT);
    case 'skins':
      return resultWords({ kind: 'skins', value: total }, resultT);
    case 'toPar':
      return resultWords({ kind: 'vsPar', label: formatVsPar(total) }, resultT);
    case 'holes':
      return {
        text: signedCount(total, (n) => formatMessage(RESULT_CARD_TEXT.holes, { n })),
        at: false,
      };
    case 'net':
      return { text: formatMessage(RESULT_APP_TEXT.net, { n: total }), at: true };
    case 'gross':
      return { text: formatMessage(RESULT_APP_TEXT.gross, { n: total }), at: true };
  }
}

/** Én linje uten resultat: «Spillet er ferdig», «Uavgjort», «Godkjent». */
const plainLine = (template: string): Word[][] => [templateWords(template)];

type Sentence = { lines: Word[][]; goldItalic: boolean; celebrates: boolean; resultInSentence: boolean };

const CALM = { goldItalic: false, celebrates: false, resultInSentence: false };

function sentenceFor(spec: HeadlineSpec, podium: Podium | null): Sentence {
  switch (spec.kind) {
    case 'finished':
      return { ...CALM, lines: plainLine(RESULT_CARD_TEXT.gameFinished) };
    case 'approved':
      return { ...CALM, lines: plainLine(RESULT_CARD_TEXT.approved) };
    case 'tied':
      return { ...CALM, lines: plainLine(RESULT_CARD_TEXT.tied), resultInSentence: true };
    case 'matchWon':
      return {
        lines: [
          keepGoldTogether(
            templateWords(RESULT_CARD_TEXT.winnerWon, {
              name: formatNameList(spec.names),
              margin: spec.margin,
            }),
          ),
        ],
        goldItalic: false,
        celebrates: true,
        resultInSentence: true,
      };
    case 'won':
    case 'shared':
    case 'sharedMany':
      break;
  }

  const winner = podium?.winners[0];
  const figure = winner ? figureWords(winner) : null;
  // Ingen tall å si (Bingo Bango Bongo uten utdelte poeng): den rolige linja.
  if (!podium || !winner || !figure) {
    return { ...CALM, lines: plainLine(RESULT_CARD_TEXT.gameFinished) };
  }

  // Et lag heter «Lag 3» i setningen, som på raden under; medlemmene står under.
  const team = winner.teamNumber !== null;
  const names = team
    ? podium.winners.map((row) => formatMessage(BOARD_COMMON_TEXT.teamLabel, { number: row.teamNumber ?? 0 }))
    : spec.kind === 'sharedMany'
      ? []
      : spec.names;
  const kind =
    podium.winners.length === 1
      ? 'won'
      : names.length === 0 || names.length > MAX_SHARED_NAMES
        ? 'sharedMany'
        : 'shared';
  const words = templateWords(templateFor(kind, figure.at), {
    names: formatNameList(names),
    result: figure.text,
  });
  const split = headlineWordLines(words, { kind, names, result: { kind: 'points', value: 0 } } as HeadlineSpec);
  // To vinnere: «Marte og Jonas» / «delte seieren» / «med 36 poeng». Uten brudd
  // blir «seieren» stående alene på en 390 pt bred skjerm.
  const lines =
    kind === 'shared'
      ? (() => {
          const at = split[0].findIndex((word) => word.text === 'delte');
          return at > 0 ? [split[0].slice(0, at), split[0].slice(at), ...split.slice(1)] : split;
        })()
      : split;
  return {
    lines: lines.map(keepGoldTogether),
    goldItalic: true,
    celebrates: true,
    resultInSentence: true,
  };
}

/** Hele modellen for et avsluttet spill, regnet fra samme resultat som tavla. */
export function resultHeroFor(opts: {
  bundle: GameBundle;
  result: ModeResult;
  userId: string | null;
}): ResultHeroModel {
  const { bundle, result, userId } = opts;
  const { game } = bundle;
  const leagueFlight = game.leagueRoundId != null;
  const nameByUserId = new Map(
    bundle.players.map((player) => [
      player.userId,
      formatPublicName(player) ?? RESULT_CARD_TEXT.playerFallback,
    ]),
  );
  const parByHole = new Map(
    bundle.holes
      .filter((hole) => isHoleInSegment(hole.holeNumber, game.holeSegment as HoleSegment))
      .map((hole) => [hole.holeNumber, hole.parMens]),
  );
  const model = buildShareCardData({
    result,
    nameByUserId,
    sharerId: null,
    parByHole,
    sideWinners: [],
    playerFallback: RESULT_CARD_TEXT.playerFallback,
  });
  const spec = headlineSpec(model, { leagueFlight });
  const podium = podiumFor(result, { leagueFlight });
  const sentence = sentenceFor(spec, podium);
  const soleTeam =
    podium?.winners.length === 1 && podium.winners[0].teamNumber !== null ? podium.winners[0] : null;
  return {
    ...sentence,
    members:
      sentence.celebrates && soleTeam
        ? formatNameList(teamMembers(bundle, soleTeam.memberIds, userId).names)
        : null,
    a11y: sentence.lines.map((line) => line.map((word) => word.text).join(' ')).join(' '),
    gameId: game.id,
    endedAt: game.endedAt ?? null,
    card: cardModel(bundle, model, spec),
  };
}
