// native/app/src/lib/formatSetupCopy.ts
// #2753 D3: oppsettet for formatene appen fikk i D3, med nettets ord
// (`wizard.sections.*` i `messages/no.json`). Paritetstesten ved siden av låser
// dem tegn for tegn.

/** `wizard.sections.patsome`. */
export const PATSOME_TEXT = {
  legend: 'Patsome-oppsett',
  segments: [
    {
      holes: 'Hull 1–6',
      format: '4BBB.',
      body: 'Begge spiller sin egen ball, og lagets beste stableford-poeng per hull teller.',
    },
    {
      holes: 'Hull 7–12',
      format: 'Greensome.',
      body: 'Begge slår ut, dere velger det beste utslaget, og så slår dere annethvert slag.',
    },
    {
      holes: 'Hull 13–18',
      format: 'Foursomes.',
      body: 'Dere deler én ball og slår annethvert slag, også fra tee.',
    },
  ],
  handicapNote:
    'Netto bruker riktig handicap per segment: andelen du velger i 4BBB, 60/40 i greensome og 50\u00a0% av summen i foursomes.',
  /** #3002 (F24): andelen på hull 1–6, under Netto. */
  fourballAllowanceLabel: 'Handicap-andel på hull 1–6 (%)',
  fourballAllowanceHint: 'NGF anbefaler 85 for 4BBB. Hull 7–18 har egne regler.',
  scoringFrom: 'Poeng fra',
  net: 'Netto',
  netDesc: 'Handicap-justert',
  gross: 'Brutto',
  grossDesc: 'Rå slag',
} as const;

/** `wizard.sections.nassau` (#2755). */
export const NASSAU_SETUP_TEXT = {
  legend: 'Nassau-oppsett',
  scoringLabel: 'Scoring',
  scoringDescription:
    'Nassau er tre oppgjør i ett: de første ni hullene, de siste ni og alle 18 samlet. Her velger du om handicap eller brutto avgjør hvert oppgjør.',
  scoringNet: 'Med handicap (netto)',
  scoringGross: 'Brutto',
  scoringAriaLabel: 'Nassau-scoring',
} as const;

/** `wizard.sections.wolf` (#2880). */
export const WOLF_SETUP_TEXT = {
  legend: 'Wolf-oppsett',
  scoringLabel: 'Scoring',
  scoringDescription:
    'Her velger du om Wolf-scoringen bruker spillernes handicap-slag, eller om beste rene bruttoslag avgjør hvert hull.',
  scoringNet: 'Med handicap (netto)',
  scoringGross: 'Brutto',
  scoringAriaLabel: 'Wolf-scoring',
  startNote: 'Rotasjonen trekkes når runden starter.',
} as const;

/** `wizard.sections.skins` (#2880). */
export const SKINS_SETUP_TEXT = {
  legend: 'Skins-oppsett',
  scoringLabel: 'Scoring',
  scoringDescription:
    'Hvert hull er verdt 1 skin. Deler to eller flere spillere hullet, ruller skinnet videre til neste hull (da verdt 2, så 3, osv.), helt til én vinner alene og tar hele potten.',
  scoringNet: 'Med handicap (netto)',
  scoringGross: 'Brutto',
  scoringAriaLabel: 'Skins-scoring',
} as const;

/** `wizard.teamSize`: kortene for lagstørrelsen i scramble-familien. */
export const TEAM_SIZE_TEXT = {
  legend: 'Velg lagstørrelse',
  sizes: { 2: 'Par', 3: 'Tremannslag', 4: '4-mann' } as Record<2 | 3 | 4, string>,
  hints: { 2: '2 spillere', 3: '3 spillere', 4: '4 spillere' } as Record<2 | 3 | 4, string>,
} as const;

/** Formatene med laghandicap i prosent av lagets snitt (`TeamHandicapField`). */
export type ScrambleMode = 'texas_scramble' | 'ambrose' | 'florida_scramble';

/** `wizard.allowanceProps.texas|ambrose|florida`, og `sumEquivalent`. */
export const TEAM_HANDICAP_TEXT = {
  legend: 'Laghandicap',
  description: 'Laget spiller på en andel av spillernes banehandicap. Tørny regner det om til slag per hull.',
  /** #3002 (F23): de to valgene under Netto, og NGFs tabell per lagstørrelse. */
  ruleNgfTitle: 'Standard',
  /** «B: formelen» (eieren 27.11): i Ambrose er «Standard» formelen. */
  ambroseStandardHelper: 'Ambrose-formelen: laget spiller på halve snittet av spillernes banehandicap.',
  rulePctTitle: 'Egen prosent',
  ngfHelper: {
    2: 'NGF vekter hver spiller etter banehandicap, fra lavest til høyest: 35 og 15\u00a0%.',
    3: 'NGF vekter hver spiller etter banehandicap, fra lavest til høyest: 30, 20 og 10\u00a0%.',
    4: 'NGF vekter hver spiller etter banehandicap, fra lavest til høyest: 25, 20, 15 og 10\u00a0%.',
  } as Record<2 | 3 | 4, string>,
  bruttoHelper:
    'Ingen laghandicap — laveste bruttoscore per hull per lag vinner. Scratch-format.',
  inputLabel: 'Prosent av lagets snitthandicap',
  nettoHelper: {
    texas_scramble: {
      2: 'Startverdi for 2-mannslag: 50 (25\u00a0% av summen).',
      3: 'Startverdi for 3-mannslag: 45 (15\u00a0% av summen).',
      4: 'Startverdi for 4-mannslag: 40 (10\u00a0% av summen).',
    },
    ambrose: {
      2: 'Ambrose-formelen gir alltid halve snittet: 50 (25\u00a0% av summen for 2-mannslag).',
      3: 'Ambrose-formelen gir alltid halve snittet: 50 (16,7\u00a0% av summen for 3-mannslag).',
      4: 'Ambrose-formelen gir alltid halve snittet: 50 (12,5\u00a0% av summen for 4-mannslag).',
    },
    florida_scramble: {
      3: 'Startverdi for 3-mannslag: 45 (15\u00a0% av summen).',
      4: 'Startverdi for 4-mannslag: 40 (10\u00a0% av summen).',
    },
  } as Record<ScrambleMode, Partial<Record<2 | 3 | 4, string>>>,
} as const;

/** «Valget ditt tilsvarer 12,5\u00a0% av summen av banehandicapene.» Én desimal, som nettets `Intl`. */
export function sumEquivalentText(sumPct: number): string {
  const rounded = Math.round(sumPct * 10) / 10;
  return `Valget ditt tilsvarer ${String(rounded).replace('.', ',')}\u00a0% av summen av banehandicapene.`;
}

/** `wizard.sections.shamble`. */
export const SHAMBLE_TEXT = {
  legend: 'Shamble-oppsett',
  teamSizeLabel: 'Lagstørrelse',
  teamSize: { 3: '3-mannslag', 4: '4-mannslag' } as Record<3 | 4, string>,
  teamSizeDesc: { 3: '3 spillere per lag', 4: '4 spillere per lag' } as Record<3 | 4, string>,
  variantLabel: 'Variant',
  variantShamble: 'Shamble',
  variantShambleDesc: 'De 2 beste teller',
  variantChampagne: 'Champagne Scramble',
  variantChampagneDesc: 'Velg antall',
  countLabel: 'Antall som teller',
  countSingle: 'laveste score',
  countPlural: 'laveste scorer',
  scoringLabel: 'Tellemåte',
  net: 'Netto',
  netDesc: 'Handicap-justert',
  gross: 'Brutto',
  grossDesc: 'Rå slag',
  allowanceLabel: 'Handicap-andel (%)',
  allowanceHint: 'Andel av spillerens handicap som teller. 100 = fullt banehandicap (standard).',
} as const;
