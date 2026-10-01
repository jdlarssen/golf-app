// #2265 PR 2: tekstene i Kavalkaden — kortene, fanene, dørene og delebildet.
//
// Webbens to navnerom, `kavalkade.*` og `kavalkadeShare.*` i
// `messages/no.json`, står her tegn for tegn, og testen holder dem like. Malene
// er ICU (`{count, plural, one {# runde} other {# runder}}`), og
// `formatMessage` fyller dem ut slik next-intl gjør for formene webben bruker:
// enkle verdier, flertall med `one`/`other` og `#`, og tall med desimalkomma.
// Testen sammenligner hver mal med `intl-messageformat`, biblioteket webben
// bruker.

/** `kavalkade.*`: siden, fanene, kortene og dørene. */
export const KAVALKADE_TEXT = {
  kicker: 'Kavalkaden',
  backLabel: 'Tilbake',
  heading: 'Golfåret {year}',
  tabsAriaLabel: 'Velg kavalkade',
  tabPersonal: 'Ditt år',
  tabGang: 'Gjengen',
  tabEmpty: 'Ingen kort i denne fanen i år.',
  cardPosition: 'Kort {index} av {total}',
  unknownPlayer: 'Ukjent spiller',
  strokes: 'slag',
  strokesAverage: 'slag i snitt',
  strokesLatest: 'slag sist',
  closedHeading: 'Kavalkaden kommer 24. desember',
  closedBody: 'Da åpner golfåret ditt, kort for kort. Alt du spiller fram til julaften er med.',
  previewBadge: 'Forhåndsvisning. Bare du ser denne før 24. desember.',
  emptyHeading: 'Ingen ferdige runder i {year}',
  emptyBody: 'Kavalkaden regner på runder som er levert. Blir det en runde i år, står den her.',
  openingKicker: 'Året ditt',
  openingRounds: '{count, plural, one {# runde} other {# runder}}',
  openingSolo: '{count} med egen ball',
  openingTeam: '{count} som lag',
  bestRoundKicker: 'Beste runde',
  nemesisKicker: 'Nemesis-hullet',
  nemesisHeading: 'Hull {hole}',
  nemesisAverage: '{value} over par i snitt',
  nemesisPlayed: '{count, plural, one {Spilt # gang} other {Spilt # ganger}}',
  nemesisWorst: 'Flest slag på hullet: {strokes}',
  rivalKicker: 'Rivalen',
  rivalMet: '{count, plural, one {# runde sammen} other {# runder sammen}}',
  rivalRecord: '{wins} seire, {losses} tap, {ties} uavgjort',
  rivalUndecided: 'Ingen av rundene ga et oppgjør.',
  formKicker: 'Formtoppen',
  formStretchRounds: '{count, plural, one {Beste strekk på # runde} other {Beste strekk på # runder}}',
  formSeasonOnly: 'Året så langt, av rundene med alle 18 hull.',
  formSeasonStart: 'Start',
  formSeasonNow: 'Nå',
  formSeasonBest: 'Beste',
  belowKicker: 'Ditt år',
  belowHeading: 'For få runder i år',
  belowBody: 'Din egen kavalkade krever {needed} runder med egen ball. I år har du {count}.',
  belowTeamHint: 'Lagrundene dine står på «Som lag»-kortet.',
  teamKicker: 'Som lag',
  teamRoundsUnit: '{count, plural, one {lagrunde} other {lagrunder}}',
  teamBest: 'Beste lagrunde: {brutto} slag',
  teamBestWith: 'med {names}',
  teamNoCompleteRound: 'Ingen av lagrundene har alle 18 hull registrert.',
  teamBestTeammate: '{count, plural, one {Beste lagkamerat: {names}} other {Beste lagkamerater: {names}}}',
  teamMostRoundsWith: 'Flest lagrunder med {names}',
  gangSummaryKicker: 'Gjengen',
  gangMembersUnit: '{count, plural, one {spiller} other {spillere}}',
  gangGames: '{count, plural, one {# runde sammen} other {# runder sammen}}',
  gangSummaryBody: 'Alle du fullførte minst én runde med i år.',
  gangTopWinnerKicker: 'Årets vinner',
  gangWins: '{count, plural, one {# seier} other {# seire}}',
  gangMostBirdiesKicker: 'Flest birdier',
  gangBirdies: '{count, plural, one {# birdie} other {# birdier}}',
  gangMostSnowmenKicker: 'Årets snowman',
  gangSnowmen: '{count} snowman',
  gangTightestKicker: 'Tetteste oppgjør',
  gangTightestMargin: 'Skilt av {margin} slag',
  gangTightestShared: 'Delt ledelse',
  gangTightestLine: '{leader} {leaderBrutto} mot {runnerUp} {runnerUpBrutto}',
  homeTeaserTitle: 'Kavalkaden kommer 24. desember',
  homeTeaserBody: 'Golfåret ditt, kort for kort. Alt du spiller fram til julaften er med.',
  homeLinkTitle: 'Kavalkaden {year} er åpen',
  homeLinkBody: 'Bla gjennom året ditt og gjengens. Del kortene du vil vise fram.',
  homeLinkCta: 'Åpne Kavalkaden',
  historikkLinkTitle: 'Kavalkaden {year}',
  historikkLinkBody: 'Golfåret ditt og gjengens, kort for kort.',
} as const;

/** `kavalkadeShare.*`: deleknappen og delebildet (webbens PNG-rute). */
export const KAVALKADE_SHARE_TEXT = {
  eyebrow: 'Kavalkaden {year}',
  shareCard: 'Del kortet',
  shareText: 'Golfåret mitt, kort for kort. Se ditt eget på tornygolf.no',
  playerFallback: 'Spiller',
  and: 'og',
  tagline: 'Fyr opp golfturneringen på et par minutter',
  year: {
    title: 'Golfåret ditt',
    rounds: '{n, plural, one {# runde} other {# runder}}',
    soloLabel: 'Med egen ball',
    teamLabel: 'Som lag',
    gangLabel: 'Gjengen',
    gangValue: '{players} spillere, {games} runder',
  },
  bestRound: {
    title: 'Årets beste runde',
    strokes: 'slag brutto',
    strokesValue: '{n} slag',
    gameLabel: 'Spill',
    courseLabel: 'Bane',
    dateLabel: 'Dato',
  },
  nemesisHole: {
    title: 'Nemesis-hullet',
    hole: 'Hull {n}',
    overPar: '{n} over par i snitt',
    playedLabel: 'Spilt',
    times: '{n, plural, one {# gang} other {# ganger}}',
    worstLabel: 'Verste besøk',
    strokes: '{n} slag',
  },
  rival: {
    title: 'Regnskapet mot {name}',
    record: 'seire · tap · uavgjort',
    metLabel: 'Møttes',
    rounds: '{n, plural, one {# runde} other {# runder}}',
    decidedLabel: 'Avgjort',
  },
  formPeak: {
    title: 'Formtoppen',
    average: 'i snitt over {n} runder',
    periodLabel: 'Perioden',
    period: '{from} til {to}',
    seasonBestLabel: 'Årets beste',
  },
  team: {
    title: 'Som lag',
    rounds: '{n, plural, one {# lagrunde} other {# lagrunder}}',
    bestLabel: 'Beste lagrunde',
    courseLabel: 'Hvor',
    bestTeammateLabel: '{count, plural, one {Beste lagkamerat} other {Beste lagkamerater}}',
  },
  gangWinner: {
    title: 'Årets vinner',
    count: '{n, plural, one {# seier} other {# seire}}',
  },
  gangBirdies: {
    title: 'Flest birdier',
    count: '{n, plural, one {# birdie} other {# birdier}}',
  },
  gangSnowmen: {
    title: 'Årets snowman',
    count: '{n, plural, one {# snowman} other {# snowman}}',
  },
  gangTightest: {
    title: 'Tetteste oppgjør',
    margin: '{n} slag',
    shared: 'Delt ledelse',
    caption: 'skilte de to beste',
    whereLabel: 'Hvor',
  },
} as const;

/** Det appen sier selv, der webben har en egen side for feilen. */
export const KAVALKADE_APP_TEXT = {
  loadFailed: 'Fikk ikke hentet Kavalkaden. Prøv igjen.',
  retry: 'Prøv igjen',
  shareFailed: 'Fikk ikke delt kortet. Prøv igjen.',
} as const;

export type MessageValues = Readonly<Record<string, string | number>>;

/**
 * Et tall slik next-intl skriver det på norsk: desimalkomma, opptil tre
 * desimaler uten nuller på slutten, og minustegnet `−` (U+2212). Kavalkadens tall er
 * under tusen, så tusenskilletegnet trengs ikke.
 */
export function formatNumberNb(value: number, maxFractionDigits = 3): string {
  const factor = 10 ** maxFractionDigits;
  const rounded = Math.round(Math.abs(value) * factor) / factor;
  const text = String(rounded).replace('.', ',');
  return value < 0 && rounded !== 0 ? `−${text}` : text;
}

function formatValue(value: string | number): string {
  return typeof value === 'number' ? formatNumberNb(value) : value;
}

/** Indeksen til `}` som lukker `{` på `start`. */
function closingBrace(template: string, start: number): number {
  let depth = 0;
  for (let i = start; i < template.length; i += 1) {
    if (template[i] === '{') depth += 1;
    else if (template[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error(`formatMessage: unbalanced braces in «${template}»`);
}

/** `one {…} other {…}` → `{ one: '…', other: '…' }`. */
function pluralBranches(options: string): Record<string, string> {
  const branches: Record<string, string> = {};
  let i = 0;
  while (i < options.length) {
    const open = options.indexOf('{', i);
    if (open === -1) break;
    const close = closingBrace(options, open);
    branches[options.slice(i, open).trim()] = options.slice(open + 1, close);
    i = close + 1;
  }
  return branches;
}

function formatArgument(body: string, values: MessageValues): string {
  const [name, type, ...rest] = body.split(',');
  const value = values[name.trim()];
  if (value === undefined) throw new Error(`formatMessage: missing value «${name.trim()}»`);
  if (type === undefined) return formatValue(value);
  if (type.trim() !== 'plural') throw new Error(`formatMessage: unsupported type «${type.trim()}»`);
  const n = Number(value);
  const branches = pluralBranches(rest.join(','));
  // Norsk bokmål har bare `one` (nøyaktig 1) og `other`.
  const branch = branches[`=${n}`] ?? (n === 1 ? branches.one : undefined) ?? branches.other;
  if (branch === undefined) throw new Error(`formatMessage: no branch for ${n} in «${body}»`);
  return formatMessage(branch.replace(/#/g, formatNumberNb(n)), values);
}

/** Fyller ut en ICU-mal fra webben. Kaster når en verdi mangler. */
export function formatMessage(template: string, values: MessageValues = {}): string {
  let out = '';
  let i = 0;
  while (i < template.length) {
    if (template[i] !== '{') {
      out += template[i];
      i += 1;
      continue;
    }
    const close = closingBrace(template, i);
    out += formatArgument(template.slice(i + 1, close), values);
    i = close + 1;
  }
  return out;
}

export type KavalkadeKey = keyof typeof KAVALKADE_TEXT;

/** `t` fra `useTranslations('kavalkade')`. */
export function kavalkadeT(key: KavalkadeKey, values?: MessageValues): string {
  return formatMessage(KAVALKADE_TEXT[key], values);
}

/**
 * `t` fra `getTranslations('kavalkadeShare')`, med punktum-stier som
 * `'year.title'`. Formen `buildKavalkadeCardModel` tar inn.
 */
export function kavalkadeShareT(key: string, values?: MessageValues): string {
  let node: unknown = KAVALKADE_SHARE_TEXT;
  for (const part of key.split('.')) {
    node = node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined;
  }
  if (typeof node !== 'string') throw new Error(`kavalkadeShareT: unknown key «${key}»`);
  return formatMessage(node, values);
}
