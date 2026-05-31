/**
 * Ren, deterministisk paring-motor for cup-templating (#219, Ryder Cup fase 4).
 *
 * Tar to lag-rostre + en sesjonsplan og produserer et skjelett av matcher
 * (`PlannedMatch[]`) klart til batch-opprettelse. Ingen I/O — testbar i
 * isolasjon. Random-strategien tar en injiserbar `rng` slik at tester kan seede
 * den; produksjon bruker `Math.random`.
 *
 * Regler:
 *  - Innen én sesjon spiller hver spiller maks én match.
 *  - På tvers av sesjoner gjenbrukes spillere (ny order + nytt utvalg per sesjon).
 *  - Antall matcher klampes til hva det minste laget kan fylle; overskytende
 *    spillere i en sesjon blir «bye» (utelatt fra den sesjonen).
 */

import type { CupSessionFormat, SessionPlan } from './cupTemplates';

export type PairingStrategy = 'random' | 'handicap';

export type CupPlayer = {
  userId: string;
  name: string;
  hcpIndex: number;
};

export type PlannedMatch = {
  /** Stabil id innen planen, f.eks. `singles_matchplay-1`. */
  id: string;
  format: CupSessionFormat;
  /** Bruker-rettet norsk label, f.eks. «Singel 1». */
  label: string;
  /** userIds fra lag 1 (1 for singles, 2 for 2v2-format). */
  side1: string[];
  /** userIds fra lag 2. */
  side2: string[];
};

/** Tilfeldighetskilde i [0, 1) — injiserbar for deterministiske tester. */
export type Rng = () => number;

const FORMAT_LABEL: Record<CupSessionFormat, string> = {
  singles_matchplay: 'Singel',
  fourball_matchplay: 'Four-ball',
  foursomes_matchplay: 'Foursome',
};

export function cupMatchLabel(format: CupSessionFormat, n: number): string {
  return `${FORMAT_LABEL[format]} ${n}`;
}

function playersPerSide(format: CupSessionFormat): number {
  return format === 'singles_matchplay' ? 1 : 2;
}

/** Fisher-Yates med injiserbar rng. Returnerer en ny array. */
function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Sorterer/stokker et lag i den rekkefølgen paringen skal konsumere det. */
function orderTeam(team: CupPlayer[], strategy: PairingStrategy, rng: Rng): CupPlayer[] {
  if (strategy === 'handicap') {
    return [...team].sort((a, b) => a.hcpIndex - b.hcpIndex);
  }
  return shuffle(team, rng);
}

/**
 * Velger spillerne for én side i match-indeks `i`.
 *  - singles: spiller på rang `i`.
 *  - 2v2 handicap: sterk+svak (rang `i` + rang `len-1-i`) for balanse.
 *  - 2v2 random: påfølgende par (`2i`, `2i+1`) fra den stokkede rekkefølgen.
 */
function pickSide(
  ordered: CupPlayer[],
  i: number,
  perSide: number,
  strategy: PairingStrategy,
): string[] {
  if (perSide === 1) return [ordered[i].userId];
  if (strategy === 'handicap') {
    return [ordered[i].userId, ordered[ordered.length - 1 - i].userId];
  }
  return [ordered[2 * i].userId, ordered[2 * i + 1].userId];
}

export function generateCupPlan(input: {
  team1: CupPlayer[];
  team2: CupPlayer[];
  sessions: SessionPlan[];
  strategy: PairingStrategy;
  rng?: Rng;
}): PlannedMatch[] {
  const { team1, team2, sessions, strategy } = input;
  const rng = input.rng ?? Math.random;

  const matches: PlannedMatch[] = [];
  const formatCounter = new Map<CupSessionFormat, number>();

  for (const session of sessions) {
    const perSide = playersPerSide(session.format);
    const feasible = Math.min(
      session.matchCount,
      Math.floor(team1.length / perSide),
      Math.floor(team2.length / perSide),
    );
    if (feasible <= 0) continue;

    const ordered1 = orderTeam(team1, strategy, rng);
    const ordered2 = orderTeam(team2, strategy, rng);

    for (let i = 0; i < feasible; i++) {
      const n = (formatCounter.get(session.format) ?? 0) + 1;
      formatCounter.set(session.format, n);
      matches.push({
        id: `${session.format}-${n}`,
        format: session.format,
        label: cupMatchLabel(session.format, n),
        side1: pickSide(ordered1, i, perSide, strategy),
        side2: pickSide(ordered2, i, perSide, strategy),
      });
    }
  }

  return matches;
}
