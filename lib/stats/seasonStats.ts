/**
 * Sesong-/års-oppsummering (#946) — ren aggregering av en spillers ferdige runder
 * bøttet på Oslo-kalenderår.
 *
 * Samme brutto-disiplin som «Mine tall»/per-bane: snitt + beste KUN over komplette
 * 18-hulls-runder (kallstedet sender `completeBrutto = null` ellers, så de aldri
 * blandes inn). Runder teller ALLE daterte ferdige runder i året — paritet med
 * historikk-tellingen. Bragder summeres fra per-runde-tellingen
 * (`countRoundAchievements`), uavhengig av modus/sideturnering. Udaterte runder
 * (`year == null`) hoppes over. Ren og I/O-fri (Type A, jf. `lib/scoring/AGENTS.md`).
 */
import { EMPTY_ACHIEVEMENTS, type Achievements } from './achievements';

/** Én ferdig runde forberedt for sesong-bøtting. */
export type SeasonRoundInput = {
  /** Oslo-kalenderår for runden; `null` ⇒ udaterbar (ekskluderes). */
  year: number | null;
  /** Total brutto for en komplett 18-hulls-runde, ellers `null` (ekskluderes fra snitt/beste). */
  completeBrutto: number | null;
  /** Per-runde bragder, allerede regnet fra rå scorer mot kjønns-par. */
  achievements: Achievements;
};

/** Aggregat for ett år med minst én datert ferdig runde. */
export type SeasonSummary = {
  year: number;
  /** Antall daterte ferdige runder i året (teller alle, også uten komplett brutto). */
  rounds: number;
  /** Snitt brutto over komplette 18-runder, avrundet. `null` hvis ingen komplette. */
  grossAverage: number | null;
  /** Laveste brutto over komplette 18-runder. `null` hvis ingen komplette. */
  bestRound: number | null;
  /** Summerte bragder over året (snowman inkludert, men rammes separat i UI-et). */
  achievements: Achievements;
};

type Bucket = {
  rounds: number;
  completeTotals: number[];
  achievements: Achievements;
};

/**
 * Bøtter runder per år, summerer, og rapporterer per-år snitt/beste (komplett-18)
 * + runde-antall + bragder. Sortert NYESTE år først. Udaterte runder hoppes over.
 */
export function computeSeasonStats(rounds: SeasonRoundInput[]): SeasonSummary[] {
  const buckets = new Map<number, Bucket>();

  for (const round of rounds) {
    if (round.year == null) continue;
    let bucket = buckets.get(round.year);
    if (!bucket) {
      bucket = {
        rounds: 0,
        completeTotals: [],
        achievements: { ...EMPTY_ACHIEVEMENTS },
      };
      buckets.set(round.year, bucket);
    }
    bucket.rounds += 1;
    if (round.completeBrutto != null) {
      bucket.completeTotals.push(round.completeBrutto);
    }
    bucket.achievements.holeInOne += round.achievements.holeInOne;
    bucket.achievements.eagle += round.achievements.eagle;
    bucket.achievements.birdie += round.achievements.birdie;
    bucket.achievements.turkey += round.achievements.turkey;
    bucket.achievements.snowman += round.achievements.snowman;
  }

  const summaries: SeasonSummary[] = [];
  for (const [year, b] of buckets) {
    const grossAverage =
      b.completeTotals.length > 0
        ? Math.round(
            b.completeTotals.reduce((a, c) => a + c, 0) / b.completeTotals.length,
          )
        : null;
    const bestRound =
      b.completeTotals.length > 0 ? Math.min(...b.completeTotals) : null;
    summaries.push({
      year,
      rounds: b.rounds,
      grossAverage,
      bestRound,
      achievements: b.achievements,
    });
  }

  return summaries.sort((a, b) => b.year - a.year);
}
