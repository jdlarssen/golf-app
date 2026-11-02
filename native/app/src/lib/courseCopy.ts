// native/app/src/lib/courseCopy.ts
// #2757: tekstene på «Ny bane» i appen, og oversettelsen fra kode til setning.
//
// Det aller meste er nettets ordlyd (`messages/no.json`, `courseForm.*`), og
// `courseCopy.test.ts` krever likhet tegn for tegn. App-egne er døra i banesteget,
// par-hintet (appen går også til 6) og linjene for tall utenfor grensene, som
// nettleseren selv sier fra om på nettet.
//
// **Switchen har ingen `default`**, som `describeCreateGameFailure`: en ny kode gir
// rød `tsc` til noen har skrevet setningen.
import { TEE_BOUNDS } from '../../../../lib/courses/coursePayload';
import { addAnywayName } from '../../../../lib/courses/similarCoursesPanel';
import type { CourseDraftProblem } from './courseDraft';
import { formatNameList } from './display';

export const COURSE_TEXT = {
  newCourseLink: 'Finner du ikke banen? Legg den inn',
  topTitle: 'Ny bane',
  subtitle: 'Skriv av scorekortet fra klubben. Banen blir tilgjengelig for alle.',
  nameLabel: 'Navn på banen',
  namePlaceholder: 'f.eks. Stiklestad Golfbane',
  holeCountLegend: 'Hvor mange hull?',
  holeCount18: '18 hull',
  holeCount9: '9 hull, spilles to ganger',
  gridFront: 'Hull 1–9',
  gridBack: 'Hull 10–18',
  gridHole: 'Hull',
  gridPar: 'Par',
  gridIndex: 'Indeks',
  gridIndexRound1: 'Indeks 1. runde',
  gridIndexRound2: 'Indeks 2. runde',
  parTapHint: 'Trykk på par for å bytte 3 → 4 → 5 → 6',
  holesHint: 'Skriv av indeksen fra scorekortet. Hvert tall fra 1 til 18 brukes én gang.',
  nineHint:
    'Står det to indekser per hull på scorekortet, skriver du begge. Står det bare én, trykker du «Fordel», så blir det oddetall første runde og partall andre. Hull 10–18 blir de samme hullene.',
  splitButton: 'Fordel: oddetall 1. runde, partall 2. runde',
  splitDone: 'Fordelt. Rett tallene hvis scorekortet sier noe annet.',
  teeChipsKicker: 'Hvilke tee-er har banen?',
  teeChipOther: '+ Annen',
  teeCustomNameLabel: 'Navn på tee-en',
  teeCustomNamePlaceholder: "f.eks. 57 eller Men's I",
  teeCustomNameAdd: 'Legg til',
  teeTableKicker: 'Slope og course rating',
  teeColMens: 'Herre · slope / CR',
  teeColLadies: 'Dame · slope / CR',
  teeColJuniors: 'Junior · slope / CR',
  teeGenderMens: 'herre',
  teeGenderLadies: 'dame',
  teeGenderJuniors: 'junior',
  teeFieldSlope: 'slope',
  teeFieldCr: 'CR',
  teeEmptyHint:
    'Mangler et felt på scorekortet, lar du det stå tomt. Da kan ikke det kjønnet spille fra den tee-en.',
  teeNineHint:
    'Slope, CR og lengde gjelder 18 hull, altså to runder. Står det bare 9-hullstall på scorekortet, ganger du CR og lengden med to. Slope er den samme.',
  addJuniors: '+ Junior',
  removeJuniors: 'Fjern junior-kolonnen',
  teeLength: 'Lengde (m)',
  similarHeading: 'Finnes banen alt?',
  useThis: 'Bruk denne',
  save: 'Lagre bane',
  saving: 'Lagrer …',
  saveFailed: 'Noe gikk galt under lagring. Prøv igjen.',
  saveOffline: 'Fikk ikke kontakt. Sjekk nettet og prøv igjen.',
} as const;

const list = (numbers: readonly number[]) => formatNameList(numbers.map(String));

/** «12 000», med hardt mellomrom, så tallet aldri brekker over to linjer. */
const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+$)/g, '\u00a0');

/** Hva som stopper «Lagre bane». Tee-linjene og indekslinjene er nettets (`SaveStatus`). */
export function describeCourseProblem(problem: CourseDraftProblem): string {
  switch (problem.code) {
    case 'name_required':
      return 'Banen må ha et navn.';
    case 'bad_par':
      return 'Par må være et helt tall mellom 3 og 6 på hvert hull.';
    case 'si_invalid':
      return problem.holes.length === 1
        ? `Indeksen på hull ${problem.holes[0]} må være et helt tall fra 1 til 18`
        : `Indeksene på hull ${list(problem.holes)} må være hele tall fra 1 til 18`;
    case 'si_duplicate':
      return describeDuplicates(problem.numbers);
    case 'si_missing':
      return problem.count === 1 ? 'Mangler én indeks' : `Mangler ${problem.count} indekser`;
    case 'tee_required':
      return 'Velg minst én tee';
    case 'tee_partial_rating':
      return `${problem.name} trenger både slope og CR`;
    case 'tee_no_rating':
      return `${problem.name} mangler slope og CR`;
    case 'tee_out_of_range':
      switch (problem.field) {
        case 'slope':
          return `Slope på ${problem.name} må være et helt tall fra ${TEE_BOUNDS.slope.min} til ${TEE_BOUNDS.slope.max}`;
        case 'cr':
          return `CR på ${problem.name} må være et tall fra ${TEE_BOUNDS.cr.min} til ${TEE_BOUNDS.cr.max}`;
        case 'length':
          return `Lengden på ${problem.name} må være et helt tall fra ${thousands(TEE_BOUNDS.length.min)} til ${thousands(TEE_BOUNDS.length.max)} meter`;
      }
  }
}

export function describeDuplicates(numbers: readonly number[]): string {
  return numbers.length === 1
    ? `Indeks ${numbers[0]} er brukt mer enn én gang`
    : `Indeksene ${list(numbers)} er brukt mer enn én gang`;
}

/** Mens opptil seks mangler, står tallene; deretter antallet (`indexStatusLine`). */
export function describeMissingList(numbers: readonly number[]): string {
  return `Mangler indeks ${list(numbers)}. Hvert tall fra 1 til 18 brukes én gang.`;
}

export function describeMissingCount(count: number): string {
  return `Mangler ${count} indekser. Hvert tall fra 1 til 18 brukes én gang.`;
}

export function describeCourseSaveFailure(code: 'network' | 'not_authenticated' | 'db' | 'no_row'): string {
  return code === 'network' ? COURSE_TEXT.saveOffline : COURSE_TEXT.saveFailed;
}

export function parTotalLine(total: number): string {
  return `Par ${total}`;
}

export function parTotalNineLine(nine: number, total: number): string {
  return `Par ${nine} · ${total} for 18 hull`;
}

export function parCellLabel(hole: number, par: string): string {
  return `Par for hull ${hole}: ${par}. Trykk for å endre`;
}

export function indexCellLabel(hole: number, round: 1 | 2 | null): string {
  return round === 2 ? `Indeks for hull ${hole}, 2. runde` : `Indeks for hull ${hole}`;
}

export function teeCellLabel(name: string, gender: string, field: string): string {
  return `${name}, ${gender}, ${field}`;
}

export function teeLengthLabel(name: string): string {
  return `${name}, lengde i meter`;
}

export function teeNameDuplicate(name: string): string {
  return `Banen har alt en tee som heter ${name}`;
}

export function teeMaxReached(max: number): string {
  return `Banen kan ha opptil ${max} tee-er`;
}

const TEE_COUNT_WORDS = [
  'ingen tee-er',
  'én tee',
  'to tee-er',
  'tre tee-er',
  'fire tee-er',
  'fem tee-er',
  'seks tee-er',
  'sju tee-er',
  'åtte tee-er',
  'ni tee-er',
  'ti tee-er',
  'elleve tee-er',
  'tolv tee-er',
];

/** «18 hull · par 72 · to tee-er · brukt i 41 runder» (`courseForm.similar.meta`). */
export function similarCourseMeta(course: {
  holeCount: number;
  par: number;
  teeCount: number;
  roundCount: number;
}): string {
  const tees = TEE_COUNT_WORDS[course.teeCount] ?? `${course.teeCount} tee-er`;
  const rounds =
    course.roundCount === 0
      ? 'ikke brukt ennå'
      : course.roundCount === 1
        ? 'brukt i én runde'
        : `brukt i ${course.roundCount} runder`;
  return `${course.holeCount} hull · par ${course.par} · ${tees} · ${rounds}`;
}

/** «Nei, legg til «Byneset» som ny bane», med et langt navn kuttet (`addAnywayName`). */
export function addAnywayLabel(query: string): string {
  const { name, clipped } = addAnywayName(query);
  return clipped ? `Nei, legg til «${name}…» som ny bane` : `Nei, legg til «${name}» som ny bane`;
}
