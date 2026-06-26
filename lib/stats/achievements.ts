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
    .filter((h) => isPlayed(h) && h.par > 0 && h.par - h.strokes! >= 1)
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
    if (h.par > 0) {
      const underPar = h.par - strokes;
      if (underPar >= 2) out.eagle += 1;
      else if (underPar === 1) out.birdie += 1;
    }
  }
  out.turkey = countTurkeys(holes);
  return out;
}
