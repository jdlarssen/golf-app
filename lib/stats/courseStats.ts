/**
 * Per-bane prestasjonsoversikt (#940) — ren aggregering av en spillers ferdige
 * runder gruppert på bane.
 *
 * Samme brutto-disiplin som «Mine tall» (`playerStats.ts`): kun **komplette
 * 18-hulls-runder** teller mot snitt/beste/antall (eple-mot-eple). Kallstedet
 * sender `completeBrutto = null` for 9-hulls/ufullstendige runder, så de aldri
 * blandes inn. Modulen er ren og I/O-fri (Type A, jf. `lib/scoring/AGENTS.md`).
 */

/** Én ferdig runde knyttet til en bane. `completeBrutto` er total brutto KUN
 *  for en komplett 18-hulls-runde — ellers `null` (ekskluderes). */
export type CourseRoundInput = {
  courseId: string | null;
  courseName: string;
  completeBrutto: number | null;
};

/** Aggregat for én bane med minst én komplett 18-hulls-runde. */
export type CourseStat = {
  courseId: string;
  courseName: string;
  /** Antall komplette 18-hulls-runder på banen. */
  rounds: number;
  /** Avrundet brutto-snitt over de komplette rundene. */
  average: number;
  /** Laveste brutto over de komplette rundene. */
  best: number;
};

type Bucket = {
  courseName: string;
  totals: number[];
};

/**
 * Grupperer komplette runder per bane og rapporterer antall, brutto-snitt
 * (avrundet) og brutto-beste. Runder uten `courseId` eller uten
 * `completeBrutto` hoppes over. Sortert: flest runder først, deretter banenavn
 * stigende.
 */
export function computeCourseStats(rounds: CourseRoundInput[]): CourseStat[] {
  const buckets = new Map<string, Bucket>();

  for (const round of rounds) {
    if (round.courseId == null || round.completeBrutto == null) continue;
    const bucket = buckets.get(round.courseId) ?? {
      courseName: round.courseName,
      totals: [],
    };
    bucket.totals.push(round.completeBrutto);
    buckets.set(round.courseId, bucket);
  }

  const stats: CourseStat[] = [];
  for (const [courseId, { courseName, totals }] of buckets) {
    stats.push({
      courseId,
      courseName,
      rounds: totals.length,
      average: Math.round(totals.reduce((a, b) => a + b, 0) / totals.length),
      best: Math.min(...totals),
    });
  }

  return stats.sort(
    (a, b) =>
      b.rounds - a.rounds || a.courseName.localeCompare(b.courseName),
  );
}
