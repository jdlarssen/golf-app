/**
 * Fra lagrede fakta til ett delbart kort (#2130, epic #1040).
 *
 * Kort-ruta (`app/[locale]/kavalkade/[year]/card/[kind]/route.tsx`) tegner bare
 * det denne funksjonen returnerer. All «hvilke tall hører til hvilket kort»
 * bor her, og er ren TS — Type A, som resten av kavalkade-biblioteket
 * (`lib/scoring/AGENTS.md`). Ruta selv er da bare oppsett og piksler.
 *
 * Tallene regnes ALDRI om her. Hvert felt leses rett ut av den lagrede
 * `KavalkadeFacts`, som K1 (#2127) bygget og K2 (#2128) frøs i `kavalkades`.
 * To steder som regner det samme er felle 4 (`docs/bug-prevention.md`).
 *
 * Mangler faktumet kortet hviler på, er svaret `null`, og ruta svarer 404. Da
 * blir heller ingen deleknapp synlig, for knappen gater seg selv på nettopp den
 * 404-en (`lib/share/useSharePng.ts`).
 *
 * Navnene i fakta er spillernes `users.name` slik K1 lastet dem
 * (`loadKavalkadeInput.ts`) — uten kallenavn, og derfor uten `formatRevealName`
 * å hente noe fra. Tomt navn blir til `playerFallback`.
 */

import type {
  GangLeaderFact,
  KavalkadeFacts,
  KavalkadePlayerRef,
  TeammateFact,
} from './buildKavalkadeFacts';

/**
 * Kortene som kan deles. Slug-ene står i URL-en og lagres i
 * `kavalkade_shares.card_kind` — de er identifikatorer, ikke brukertekst, og
 * derfor engelske (CLAUDE.md §Språk).
 *
 * ⚠️ Samme liste står som CHECK-constraint i
 * `supabase/migrations/0183_kavalkade_shares.sql`. To hjem for én regel er
 * felle 4; `cardKindDbCheck.test.ts` holder dem sammen.
 */
export const KAVALKADE_CARD_KINDS = [
  'year',
  'best-round',
  'nemesis-hole',
  'rival',
  'form-peak',
  'team',
  'gang-winner',
  'gang-birdies',
  'gang-snowmen',
  'gang-tightest',
] as const;

export type KavalkadeCardKind = (typeof KAVALKADE_CARD_KINDS)[number];

/** Er dette en slug vi kjenner? Brukes av ruta og av server-actionen. */
export function isKavalkadeCardKind(value: string): value is KavalkadeCardKind {
  return (KAVALKADE_CARD_KINDS as readonly string[]).includes(value);
}

/** En støttelinje under det store tallet. */
export type KavalkadeCardLine = { label: string; value: string };

/** Alt kortet viser. Ferdig formatert — ruta legger bare på piksler. */
export type KavalkadeCardModel = {
  kind: KavalkadeCardKind;
  /** Den lille linja over tittelen, f.eks. «Kavalkaden 2026». */
  eyebrow: string;
  title: string;
  /** Det store tallet eller navnet, med en forklarende linje under. */
  hero: { value: string; caption: string | null };
  /** Opptil tre linjer. Tomme felt utelates, aldri «—». */
  lines: KavalkadeCardLine[];
};

/** Oversettelsene kortet trenger, injisert så modellen holder seg ren. */
export type KavalkadeCardStrings = {
  /** `leaderboard.shareCard`-formen: nøkkel + ICU-verdier. */
  t: (key: string, values?: Record<string, string | number>) => string;
  /** ISO → «14. juni», i Oslo-tid. `null` når datoen mangler. */
  formatDate: (iso: string | null) => string | null;
  /** Navnet en spiller uten registrert navn får. */
  playerFallback: string;
};

export function buildKavalkadeCardModel(
  facts: KavalkadeFacts,
  kind: KavalkadeCardKind,
  strings: KavalkadeCardStrings,
): KavalkadeCardModel | null {
  const { t } = strings;
  const eyebrow = t('eyebrow', { year: facts.year });
  const card = (
    title: string,
    hero: { value: string; caption: string | null },
    lines: (KavalkadeCardLine | null)[],
  ): KavalkadeCardModel => ({
    kind,
    eyebrow,
    title,
    hero,
    lines: lines.filter((l): l is KavalkadeCardLine => l !== null).slice(0, 3),
  });

  switch (kind) {
    case 'year':
      return buildYearCard(facts, strings, card);
    case 'best-round':
      return buildBestRoundCard(facts, strings, card);
    case 'nemesis-hole':
      return buildNemesisCard(facts, strings, card);
    case 'rival':
      return buildRivalCard(facts, strings, card);
    case 'form-peak':
      return buildFormPeakCard(facts, strings, card);
    case 'team':
      return buildTeamCard(facts, strings, card);
    case 'gang-winner':
      return buildGangLeaderCard(facts.gang?.topWinner ?? null, 'gangWinner', strings, card);
    case 'gang-birdies':
      return buildGangLeaderCard(facts.gang?.mostBirdies ?? null, 'gangBirdies', strings, card);
    case 'gang-snowmen':
      return buildGangLeaderCard(facts.gang?.mostSnowmen ?? null, 'gangSnowmen', strings, card);
    case 'gang-tightest':
      return buildTightestCard(facts, strings, card);
  }
}

/** Kortbyggerens felles innpakning, sendt inn så hver gren slipper å gjenta den. */
type CardFactory = (
  title: string,
  hero: { value: string; caption: string | null },
  lines: (KavalkadeCardLine | null)[],
) => KavalkadeCardModel;

function buildYearCard(
  facts: KavalkadeFacts,
  { t }: KavalkadeCardStrings,
  card: CardFactory,
): KavalkadeCardModel | null {
  if (facts.rounds === 0) return null;
  return card(
    t('year.title'),
    { value: String(facts.rounds), caption: t('year.rounds', { n: facts.rounds }) },
    [
      facts.soloRounds > 0
        ? { label: t('year.soloLabel'), value: t('year.rounds', { n: facts.soloRounds }) }
        : null,
      facts.teamRounds > 0
        ? { label: t('year.teamLabel'), value: t('year.rounds', { n: facts.teamRounds }) }
        : null,
      facts.gang
        ? {
            label: t('year.gangLabel'),
            value: t('year.gangValue', { players: facts.gang.members, games: facts.gang.games }),
          }
        : null,
    ],
  );
}

function buildBestRoundCard(
  facts: KavalkadeFacts,
  { t, formatDate }: KavalkadeCardStrings,
  card: CardFactory,
): KavalkadeCardModel | null {
  const best = facts.personal?.bestRound;
  if (!best) return null;
  const date = formatDate(best.playedAt);
  return card(
    t('bestRound.title'),
    { value: String(best.brutto), caption: t('bestRound.strokes') },
    [
      { label: t('bestRound.gameLabel'), value: best.gameName },
      best.courseName ? { label: t('bestRound.courseLabel'), value: best.courseName } : null,
      date ? { label: t('bestRound.dateLabel'), value: date } : null,
    ],
  );
}

function buildNemesisCard(
  facts: KavalkadeFacts,
  { t }: KavalkadeCardStrings,
  card: CardFactory,
): KavalkadeCardModel | null {
  const hole = facts.personal?.nemesisHole;
  if (!hole) return null;
  return card(
    t('nemesisHole.title'),
    {
      value: t('nemesisHole.hole', { n: hole.holeNumber }),
      caption: t('nemesisHole.overPar', { n: hole.averageToPar }),
    },
    [
      { label: t('nemesisHole.playedLabel'), value: t('nemesisHole.times', { n: hole.played }) },
      {
        label: t('nemesisHole.worstLabel'),
        value: t('nemesisHole.strokes', { n: hole.worstStrokes }),
      },
    ],
  );
}

function buildRivalCard(
  facts: KavalkadeFacts,
  strings: KavalkadeCardStrings,
  card: CardFactory,
): KavalkadeCardModel | null {
  const rival = facts.personal?.rival;
  if (!rival) return null;
  const { t } = strings;
  return card(
    t('rival.title', { name: playerName(rival, strings) }),
    {
      // Sifrene er tall, ikke tekst — de leses likt på begge språk.
      value: `${rival.wins}–${rival.losses}–${rival.ties}`,
      caption: t('rival.record'),
    },
    [
      { label: t('rival.metLabel'), value: t('rival.rounds', { n: rival.met }) },
      rival.decided > 0
        ? { label: t('rival.decidedLabel'), value: t('rival.rounds', { n: rival.decided }) }
        : null,
    ],
  );
}

function buildFormPeakCard(
  facts: KavalkadeFacts,
  { t, formatDate }: KavalkadeCardStrings,
  card: CardFactory,
): KavalkadeCardModel | null {
  const peak = facts.personal?.formPeak;
  if (!peak?.stretch) return null;
  const stretch = peak.stretch;
  const from = formatDate(stretch.fromDate);
  const to = formatDate(stretch.toDate);
  return card(
    t('formPeak.title'),
    {
      value: String(stretch.averageBrutto),
      caption: t('formPeak.average', { n: stretch.rounds }),
    },
    [
      from && to
        ? { label: t('formPeak.periodLabel'), value: t('formPeak.period', { from, to }) }
        : null,
      peak.season
        ? {
            label: t('formPeak.seasonBestLabel'),
            value: t('bestRound.strokesValue', { n: peak.season.brutto.best }),
          }
        : null,
    ],
  );
}

function buildTeamCard(
  facts: KavalkadeFacts,
  strings: KavalkadeCardStrings,
  card: CardFactory,
): KavalkadeCardModel | null {
  const team = facts.team;
  if (!team || team.rounds === 0) return null;
  const { t, formatDate } = strings;
  const best = team.bestRound;
  const bestDate = best ? formatDate(best.playedAt) : null;
  return card(
    t('team.title'),
    { value: String(team.rounds), caption: t('team.rounds', { n: team.rounds }) },
    [
      best
        ? {
            label: t('team.bestLabel'),
            value: t('bestRound.strokesValue', { n: best.brutto }),
          }
        : null,
      best?.courseName
        ? { label: t('team.courseLabel'), value: [best.courseName, bestDate].filter(Boolean).join(' · ') }
        : null,
      team.bestTeammates.length > 0
        ? {
            label: t('team.bestTeammateLabel', { count: team.bestTeammates.length }),
            value: joinNames(team.bestTeammates, strings),
          }
        : null,
    ],
  );
}

function buildGangLeaderCard(
  leader: GangLeaderFact | null,
  key: 'gangWinner' | 'gangBirdies' | 'gangSnowmen',
  strings: KavalkadeCardStrings,
  card: CardFactory,
): KavalkadeCardModel | null {
  if (!leader) return null;
  const { t } = strings;
  return card(
    t(`${key}.title`),
    { value: playerName(leader, strings), caption: t(`${key}.count`, { n: leader.count }) },
    [],
  );
}

function buildTightestCard(
  facts: KavalkadeFacts,
  strings: KavalkadeCardStrings,
  card: CardFactory,
): KavalkadeCardModel | null {
  const tight = facts.gang?.tightestFinish;
  if (!tight) return null;
  const { t, formatDate } = strings;
  const date = formatDate(tight.playedAt);
  return card(
    t('gangTightest.title'),
    {
      value:
        tight.strokeMargin === 0
          ? t('gangTightest.shared')
          : t('gangTightest.margin', { n: tight.strokeMargin }),
      caption: t('gangTightest.caption'),
    },
    [
      {
        label: playerName(tight.leader, strings),
        value: t('bestRound.strokesValue', { n: tight.leader.brutto }),
      },
      {
        label: playerName(tight.runnerUp, strings),
        value: t('bestRound.strokesValue', { n: tight.runnerUp.brutto }),
      },
      tight.courseName
        ? {
            label: t('gangTightest.whereLabel'),
            value: [tight.courseName, date].filter(Boolean).join(' · '),
          }
        : null,
    ],
  );
}

/** Navnet slik det står i fakta, eller reservenavnet når det mangler. */
function playerName(
  player: KavalkadePlayerRef,
  { playerFallback }: KavalkadeCardStrings,
): string {
  const name = player.name?.trim() ?? '';
  return name.length > 0 ? name : playerFallback;
}

/** «Ada», «Ada og Bo», «Ada, Bo og Cato» — ekte likhet vises, aldri kuttes. */
function joinNames(players: TeammateFact[], strings: KavalkadeCardStrings): string {
  const names = players.map((p) => playerName(p, strings));
  if (names.length <= 1) return names[0] ?? strings.playerFallback;
  const and = strings.t('and');
  return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`;
}
