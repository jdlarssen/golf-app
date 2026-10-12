/**
 * Delt bragd- og par-logikk for personlig statistikk (#946-uttrekk).
 *
 * Bragder (birdie/eagle/hole-in-one/turkey/snowman) utledes RENT av rå slag mot
 * kjønns-par per hull — handicap-uavhengig, format-uavhengig, og uavhengig av om
 * runden hadde en sideturnering (LD/CTP). Brukt av både «Mine tall» livstid
 * (`playerStats`) og sesong-recap (`seasonStats`, #946), så definisjonen har ÉN
 * hjemmel. Ren og I/O-fri (Type A, jf. `lib/scoring/AGENTS.md`).
 */
import type { CourseHoleRow } from '@/lib/supabase/queryFragments';
import type { ScoringGender } from '@/lib/scoring/modes/types';
import { strokeTerm } from '@/lib/scorecard/scoreRail';

/** Ett hull i en runde. `strokes === null` ⇒ uspilt hull. `par` er allerede
 *  kjønns-valgt ved kallstedet (via `parForGender`). */
export type HoleScore = {
  holeNumber: number;
  strokes: number | null;
  par: number;
};

/**
 * Antall per bragd, alle brutto mot kjønns-par. Snowman (8 slag) er et «moment»,
 * IKKE en bragd — feltet bor her, men kallflatene rammer det separat (#946).
 */
export type Achievements = {
  holeInOne: number;
  eagle: number;
  birdie: number;
  turkey: number;
  snowman: number;
};

export const EMPTY_ACHIEVEMENTS: Achievements = {
  holeInOne: 0,
  eagle: 0,
  birdie: 0,
  turkey: 0,
  snowman: 0,
};

/** En notabel hendelse fra én runde — verdt et eget unlock-varsel (#947). */
export type NotableMomentKind = 'hole_in_one' | 'eagle' | 'turkey' | 'snowman';
export type NotableMoment = { kind: NotableMomentKind; count: number };

/**
 * Plukker ut de notable «øyeblikkene» fra én runde for unlock-varselet (#947):
 * hole-in-one, eagle og turkey. Birdie er bevisst UTELATT — den er for vanlig og
 * ville druknet innboksen. Snowman er bevisst UTELATT — en snømann (blow-up-hull)
 * er negativt ladet, og vi varsler ingen om egne tabber (surfaces ingen steder).
 *
 * Hver ace teller også som eagle i `countRoundAchievements` (underPar ≥ 2), så
 * vi trekker hole-in-one fra eagle-tallet her — ellers ville et hole-in-one
 * annonsert «Hole-in-one og Eagle» for ett og samme slag. En ekte ekstra eagle
 * (f.eks. på par-5) overlever, fordi den teller utover ace-en.
 *
 * Returnerer kun øyeblikk med count > 0, i fast rekkefølge
 * (hole-in-one → eagle → turkey) så varsel-copy blir forutsigbar.
 */
export function selectNotableMoments(a: Achievements): NotableMoment[] {
  const eagleSansAce = Math.max(0, a.eagle - a.holeInOne);
  const moments: NotableMoment[] = [
    { kind: 'hole_in_one', count: a.holeInOne },
    { kind: 'eagle', count: eagleSansAce },
    { kind: 'turkey', count: a.turkey },
  ];
  return moments.filter((m) => m.count > 0);
}

/** Kjønns-riktig par for et bane-hull. Default (null/`mens`) → herre-par. */
export function parForGender(
  hole: CourseHoleRow,
  gender: ScoringGender | null,
): number {
  switch (gender) {
    case 'ladies':
      return hole.par_ladies;
    case 'juniors':
      return hole.par_juniors;
    default:
      return hole.par_mens;
  }
}

/**
 * The counting rule for an under-par hole: `'eagle'` for two or more under
 * (an albatross counts as an eagle — the brags have no albatross counter),
 * `'birdie'` for one under. Built on the hole page's `strokeTerm`, so the
 * thresholds have one home. `par <= 0` is invalid data and counts nothing.
 */
export function underParKind(strokes: number, par: number): 'eagle' | 'birdie' | null {
  if (par <= 0) return null;
  const term = strokeTerm(strokes, par);
  if (term === 'albatross' || term === 'eagle') return 'eagle';
  return term === 'birdie' ? 'birdie' : null;
}

export type UnderParMoment = 'hole_in_one' | 'albatross' | 'eagle' | 'birdie';

/**
 * The word for one under-par hole as the follow page (#2286) shows it: one
 * answer per hole, and a hole-in-one wins. Unlike `underParKind`, an albatross
 * keeps its own name, as on the hole page.
 */
export function underParMoment(strokes: number, par: number): UnderParMoment | null {
  if (par <= 0) return null;
  if (strokes === 1) return 'hole_in_one';
  const term = strokeTerm(strokes, par);
  return term === 'albatross' || term === 'eagle' || term === 'birdie' ? term : null;
}

/** En spilt score: ikke-null slag. */
function isPlayed(h: HoleScore): h is HoleScore & { strokes: number } {
  return h.strokes != null;
}

/**
 * Antall ikke-overlappende «turkey»-vinduer i én runde: 3 sammenhengende hull
 * (stigende hull-nr, hver birdie-eller-bedre). Uspilt/manglende hull bryter
 * rekka. Teller per runde, aldri over rundegrenser.
 */
function countTurkeys(holes: HoleScore[]): number {
  const qualifying = holes
    .filter((h) => isPlayed(h) && underParKind(h.strokes!, h.par) !== null)
    .map((h) => h.holeNumber)
    .sort((a, b) => a - b);

  let turkeys = 0;
  let runLength = 0;
  let prevHole: number | null = null;
  for (const holeNumber of qualifying) {
    if (prevHole != null && holeNumber === prevHole + 1) {
      runLength += 1;
    } else {
      runLength = 1;
    }
    prevHole = holeNumber;
    if (runLength === 3) {
      turkeys += 1;
      runLength = 0; // non-overlapping window
    }
  }
  return turkeys;
}

/**
 * Bragder for ÉN runde: per-hull hole-in-one/eagle/birdie/snowman + ikke-
 * overlappende turkey-vinduer. Rent fra rå slag mot kjønns-par — ingen modus-
 * eller sideturnering-avhengighet.
 */
export function countRoundAchievements(holes: HoleScore[]): Achievements {
  const out: Achievements = { ...EMPTY_ACHIEVEMENTS };
  for (const h of holes) {
    if (!isPlayed(h)) continue;
    const strokes = h.strokes;
    if (strokes === 1) out.holeInOne += 1;
    if (strokes === 8) out.snowman += 1;
    const kind = underParKind(strokes, h.par);
    if (kind === 'eagle') out.eagle += 1;
    else if (kind === 'birdie') out.birdie += 1;
  }
  out.turkey = countTurkeys(holes);
  return out;
}
