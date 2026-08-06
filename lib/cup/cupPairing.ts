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

import type { HoleSegment } from '@/lib/scoring/holeSegment';
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
  /**
   * Hvilket segment av runden matchen spilles over (#1441, D1/D2).
   * `generateCupPlan` setter dette til `'full'` på ALLE matcher den emitter
   * (de tre eksisterende presetene splitter aldri front/back) —
   * `generateSplitDayPlan` setter `'front9'`/`'back9'` per bunt-match.
   * Valgfritt i TYPEN (ikke i faktisk generator-output) fordi
   * `app/[locale]/admin/cup/[id]/generer/actions.test.ts` bygger
   * `PlannedMatch`-fixtures for hånd uten feltet — utenfor scope å endre i
   * denne fasen (F3a), så et required felt ville brukket den filens tsc.
   */
  segment?: HoleSegment;
  /**
   * Plan-lokal id til match-en denne matchen LESER scores fra i stedet for å
   * eie egne (#1441, D3) — kun satt på splittet-cup-dagens avledede singles
   * (peker på flightens best-ball-match).
   */
  sourceId?: string;
  /**
   * Hvilken fysisk flight/gruppe matchen hører til (#1441, D4) — kun satt av
   * `generateSplitDayPlan`. De tre sesjonsbaserte presetene har ikke et
   * flight-konsept (spillere gjenbrukes på tvers av HELE laget per sesjon,
   * ikke gruppert i faste fire-mannsflighter).
   */
  flightIndex?: number;
};

/**
 * Bunt-spesifikk matchformat for splittet cup-dag (#1441, D4). `best_ball` er
 * BEVISST IKKE lagt til `CupSessionFormat`: det unionet er `Record`-nøkkel
 * flere steder i `GenerateMatchesWizard.tsx` (fritt sesjonsvalg wizarden
 * tilbyr brukeren), og best_ball forekommer ALDRI som et fritt sesjonsvalg —
 * det er kun bunt-generatorens maskin-genererte host-match. Å utvide
 * `CupSessionFormat` ville tvunget `Record<CupSessionFormat, string>`-
 * literalene der til å håndtere en modus wizarden aldri tilbyr fritt, langt
 * utenfor denne fasens (F3a) scope. `cupMatchLabel` aksepterer denne bredere
 * typen slik at bunt-generatoren kan gjenbruke samme label-helper.
 */
export type CupBundleFormat = CupSessionFormat | 'best_ball';

/**
 * `generateSplitDayPlan`s bunt-matcher — speiler `PlannedMatch` men widener
 * `format` til `CupBundleFormat` og gjør `segment`/`flightIndex` required
 * (hver bunt-match har alltid et konkret segment og en konkret flight). Egen
 * type i stedet for å widene `PlannedMatch.format` direkte: `PlannedMatch` er
 * konsumert av `createCupMatchesFromPlan` (generer/actions.ts) med en
 * `cupMatchModeConfig(format: CupSessionFormat, …)`-parameter — å widene
 * `PlannedMatch.format` ville brukket den (utenfor scope, F3b sin jobb).
 */
export type PlannedBundleMatch = Omit<PlannedMatch, 'format' | 'segment' | 'flightIndex'> & {
  format: CupBundleFormat;
  segment: HoleSegment;
  flightIndex: number;
};

/** Tilfeldighetskilde i [0, 1) — injiserbar for deterministiske tester. */
export type Rng = () => number;

const FORMAT_LABEL: Record<CupBundleFormat, string> = {
  singles_matchplay: 'Singel',
  fourball_matchplay: 'Four-ball',
  foursomes_matchplay: 'Foursome',
  greensome_matchplay: 'Greensome',
  chapman_matchplay: 'Chapman',
  gruesome_matchplay: 'Gruesome',
  best_ball: 'Best ball',
};

export function cupMatchLabel(format: CupBundleFormat, n: number): string {
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
        // #1441 (D1/D2): the three session-based presets never split
        // front9/back9 — every match plays the full round.
        segment: 'full',
      });
    }
  }

  return matches;
}

/**
 * Bygger «Splittet cup-dag»-bunten (#1441, D4): per flight (2v2, 4 fysiske
 * spillere) genereres FIRE cup-matcher i denne rekkefølgen:
 *
 *   1. greensome_matchplay, front9 — flightens 2v2 (egen føring, som i dag).
 *   2. best_ball, back9 — SAMME fire spillere, individuell føring. Dette er
 *      HOST-matchen (#1441, D3): de to singles-matchene under leser scores
 *      herfra via `sourceId`, de fører aldri egne.
 *   3+4. singles_matchplay × 2, back9 — 1v1 innad i flighten, paret rank1 mot
 *      rank1 og rank2 mot rank2 (samme rangering `pickSide` produserte for
 *      greensome/best-ball-paret over — se kommentar på `flightPair` under).
 *
 * Antall flights = `floor(min(team1.length, team2.length) / 2)` (2 spillere
 * per side per flight; overskytende spillere blir bye, som i den eksisterende
 * 2v2-klampingen i `generateCupPlan`). Egen funksjon (ikke en gren i
 * `generateCupPlan`) fordi bunt-strukturen ikke passer sesjons-modellen der:
 * `generateCupPlan` kjører ETT format over gjenbrukte spillere fra HELE laget
 * per sesjon, mens denne bunten er FIRE avhengige matcher over DE SAMME fire
 * spillerne i én fast flight — et fundamentalt annet konsept (delt
 * `sourceId`, flight-lokal singles-paring, tre ulike formater per enhet).
 */
export function generateSplitDayPlan(input: {
  team1: CupPlayer[];
  team2: CupPlayer[];
  strategy: PairingStrategy;
  rng?: Rng;
}): PlannedBundleMatch[] {
  const { team1, team2, strategy } = input;
  const rng = input.rng ?? Math.random;

  const flightCount = Math.min(Math.floor(team1.length / 2), Math.floor(team2.length / 2));
  if (flightCount <= 0) return [];

  const ordered1 = orderTeam(team1, strategy, rng);
  const ordered2 = orderTeam(team2, strategy, rng);

  const matches: PlannedBundleMatch[] = [];
  const formatCounter = new Map<CupBundleFormat, number>();
  const nextId = (format: CupBundleFormat): { id: string; label: string } => {
    const n = (formatCounter.get(format) ?? 0) + 1;
    formatCounter.set(format, n);
    return { id: `${format}-${n}`, label: cupMatchLabel(format, n) };
  };

  for (let i = 0; i < flightCount; i++) {
    const flightIndex = i + 1;
    // `pickSide` with perSide=2 returns [rank1Player, rank2Player] for BOTH
    // strategies (handicap: strong+weak by index; random: consecutive pair
    // from the shuffled order) — reused here to get the flight's 2v2 pairing
    // AND the rank identities the singles pairing below keys off.
    const side1Pair = pickSide(ordered1, i, 2, strategy);
    const side2Pair = pickSide(ordered2, i, 2, strategy);

    const greensome = nextId('greensome_matchplay');
    matches.push({
      id: greensome.id,
      format: 'greensome_matchplay',
      label: greensome.label,
      side1: side1Pair,
      side2: side2Pair,
      segment: 'front9',
      flightIndex,
    });

    const bestBall = nextId('best_ball');
    matches.push({
      id: bestBall.id,
      format: 'best_ball',
      label: bestBall.label,
      side1: side1Pair,
      side2: side2Pair,
      segment: 'back9',
      flightIndex,
    });

    // rank1 vs rank1, rank2 vs rank2 (default pairing — the oppstillings-
    // editor in F3b lets the organizer re-pair within the flight).
    const singles1 = nextId('singles_matchplay');
    matches.push({
      id: singles1.id,
      format: 'singles_matchplay',
      label: singles1.label,
      side1: [side1Pair[0]],
      side2: [side2Pair[0]],
      segment: 'back9',
      sourceId: bestBall.id,
      flightIndex,
    });

    const singles2 = nextId('singles_matchplay');
    matches.push({
      id: singles2.id,
      format: 'singles_matchplay',
      label: singles2.label,
      side1: [side1Pair[1]],
      side2: [side2Pair[1]],
      segment: 'back9',
      sourceId: bestBall.id,
      flightIndex,
    });
  }

  return matches;
}
