// Hvem er ulv på et hull i Wolf (#2314). Regelen har ETT hjem her: motoren
// (`wolf.ts`), hull-sidene på nettet og i appen og rosteret leser den herfra,
// så alle viser samme ulv.
//
// To regler, valgt av `mode_config.wolf_rotation` (stemplet ved opprettelse):
//
//   - 'trailing' (spill laget før #2314): hull 1..R går på rundgang, der
//     R = floor(18/n)·n. Hull R+1..18 går til den som ligger sist, uansett
//     avstand. n = 3 → R = 18, ingen sluttdel.
//   - 'catch_up' (nye spill): fra hull L (16 med tre eller fem spillere, 17
//     med fire) er den som ligger sist ulv BARE når den ligger minst n poeng
//     bak lederen, det en Lone Wolf-seier gir med innsats 1. Ellers går
//     rundgangen videre. Ingen kø og ingen garantert tur: catch-up gir
//     sisteplassen en ekstra tur, og da kan en annen miste sin siste.
//
// Rundgangen: ulv = spilleren med `team_number === ((hull − 1) % n) + 1`.
// Sist: lavest poeng før hullet, tiebreak `team_number` stigende.
// En lagret rad i `wolf_hole_choices` vinner alltid.
//
// Ingen importer med sti-alias: appen (`native/app`) leser fila med relativ sti.

export type WolfRotationRule = 'trailing' | 'catch_up';

export interface WolfTurnPlayer {
  userId: string;
  teamNumber: number;
}

export interface WolfTurn {
  userId: string;
  /** Regelen ga hullet til den som ligger sist (bare `catch_up`). */
  catchUp: boolean;
}

export type WolfUpcomingHole =
  | { hole: number; wolfUserId: string | null; catchUp: boolean }
  | { hole: number; settlesAfterHole: number };

/** Appen og nettsiden fører bare hele runder. */
const HOLE_COUNT = 18;

/** Catch-up-starten per spillertall. Eieren valgte 16–18 også for tre. */
const CATCH_UP_START: Record<number, number> = { 3: 16, 4: 17, 5: 16 };

/** Regelen et spill går etter. Uten flagget er det regelen fra før #2314. */
export function wolfRotationRule(modeConfig: unknown): WolfRotationRule {
  if (modeConfig === null || typeof modeConfig !== 'object') return 'trailing';
  return (modeConfig as { wolf_rotation?: unknown }).wolf_rotation === 'catch_up'
    ? 'catch_up'
    : 'trailing';
}

/**
 * Første hull der stillingen kan bestemme ulven. `trailing` gir
 * floor(18/n)·n + 1 (19 for tre spillere, altså ingen).
 */
export function catchUpStartHole(n: number, rule: WolfRotationRule): number {
  const trailingStart = n > 0 ? Math.floor(HOLE_COUNT / n) * n + 1 : HOLE_COUNT + 1;
  if (rule === 'catch_up') return CATCH_UP_START[n] ?? trailingStart;
  return trailingStart;
}

function rotationWolf(
  holeNumber: number,
  players: readonly WolfTurnPlayer[],
): string | null {
  const slot = ((holeNumber - 1) % players.length) + 1;
  return players.find((p) => p.teamNumber === slot)?.userId ?? null;
}

/** Den som ligger sist før hullet. Tiebreak `team_number` stigende. */
function trailingPlayer(
  players: readonly WolfTurnPlayer[],
  pointsBefore: ReadonlyMap<string, number>,
): WolfTurnPlayer | null {
  const sorted = [...players].sort((a, b) => {
    const ta = pointsBefore.get(a.userId) ?? 0;
    const tb = pointsBefore.get(b.userId) ?? 0;
    if (ta !== tb) return ta - tb;
    return a.teamNumber - b.teamNumber;
  });
  return sorted[0] ?? null;
}

/** Hvor mange poeng den som ligger sist, er bak lederen. 0 uten spillere. */
export function wolfCatchUpGap(
  players: readonly WolfTurnPlayer[],
  pointsBefore: ReadonlyMap<string, number>,
): number {
  if (players.length === 0) return 0;
  const values = players.map((p) => pointsBefore.get(p.userId) ?? 0);
  return Math.max(...values) - Math.min(...values);
}

/** Hva regelen alene gir, uten en lagret rad. */
function ruleWolf(
  holeNumber: number,
  players: readonly WolfTurnPlayer[],
  pointsBefore: ReadonlyMap<string, number>,
  rule: WolfRotationRule,
): WolfTurn | null {
  const n = players.length;
  if (n === 0) return null;
  const start = catchUpStartHole(n, rule);
  if (holeNumber >= 1 && holeNumber < start) {
    const userId = rotationWolf(holeNumber, players);
    return userId === null ? null : { userId, catchUp: false };
  }

  const last = trailingPlayer(players, pointsBefore);
  if (last === null) return null;
  if (rule === 'trailing') return { userId: last.userId, catchUp: false };

  // Avstand n gir catch-up, n − 1 gir det ikke.
  if (wolfCatchUpGap(players, pointsBefore) >= n) {
    return { userId: last.userId, catchUp: true };
  }
  const userId = rotationWolf(holeNumber, players);
  return userId === null ? null : { userId, catchUp: false };
}

/**
 * Ulven på `holeNumber`, eller `null` når ingen gyldig ulv finnes (tom
 * spillerliste, eller ingen spiller på plassen i rundgangen).
 *
 * @param pointsBefore Poengene før hullet (etter hull h − 1).
 * @param explicitWolf `wolf_user_id` fra en lagret rad for hullet. Vinner
 *   alltid. Er det samme spiller som regelen gir, beholdes `catchUp`.
 */
export function wolfForHole(args: {
  holeNumber: number;
  players: readonly WolfTurnPlayer[];
  pointsBefore: ReadonlyMap<string, number>;
  explicitWolf?: string | null;
  rule: WolfRotationRule;
}): WolfTurn | null {
  const { holeNumber, players, pointsBefore, explicitWolf, rule } = args;
  const fromRule = ruleWolf(holeNumber, players, pointsBefore, rule);
  if (explicitWolf && players.some((p) => p.userId === explicitWolf)) {
    return {
      userId: explicitWolf,
      catchUp: fromRule?.userId === explicitWolf ? fromRule.catchUp : false,
    };
  }
  return fromRule;
}

/**
 * Poengene før `holeNumber`, summert fra motorens hull-rader. Det er
 * stillingen regelen ser når den velger ulv på hullet.
 */
export function wolfPointsBeforeHole(
  holes:
    | ReadonlyArray<{ holeNumber: number; pointsByPlayer: Record<string, number> }>
    | undefined,
  holeNumber: number,
): Map<string, number> {
  const points = new Map<string, number>();
  for (const row of holes ?? []) {
    if (row.holeNumber >= holeNumber) continue;
    for (const [userId, value] of Object.entries(row.pointsByPlayer)) {
      points.set(userId, (points.get(userId) ?? 0) + value);
    }
  }
  return points;
}

/**
 * Wolf-rekkefølgen fra `fromHole` og `count` hull framover, til og med 18.
 *
 * `fromHole` er alltid kjent (stillingen før den er `pointsBefore`). Et senere
 * hull i rundgangen er kjent. Et senere hull fra catch-up-starten er kjent
 * bare med en lagret rad; ellers avgjøres det etter hullet før.
 */
export function wolfUpcoming(args: {
  fromHole: number;
  count: number;
  players: readonly WolfTurnPlayer[];
  pointsBefore: ReadonlyMap<string, number>;
  choices: ReadonlyArray<{ holeNumber: number; wolfUserId: string }>;
  rule: WolfRotationRule;
}): WolfUpcomingHole[] {
  const { fromHole, count, players, pointsBefore, choices, rule } = args;
  const start = catchUpStartHole(players.length, rule);
  const out: WolfUpcomingHole[] = [];
  const last = Math.min(HOLE_COUNT, fromHole + count - 1);
  for (let hole = fromHole; hole <= last; hole += 1) {
    const explicitWolf = choices.find((c) => c.holeNumber === hole)?.wolfUserId;
    if (hole === fromHole) {
      const turn = wolfForHole({ holeNumber: hole, players, pointsBefore, explicitWolf, rule });
      out.push({ hole, wolfUserId: turn?.userId ?? null, catchUp: turn?.catchUp ?? false });
      continue;
    }
    if (hole < start) {
      // Stillingen spiller ingen rolle i rundgangen.
      const turn = wolfForHole({ holeNumber: hole, players, pointsBefore: new Map(), explicitWolf, rule });
      out.push({ hole, wolfUserId: turn?.userId ?? null, catchUp: false });
      continue;
    }
    if (explicitWolf && players.some((p) => p.userId === explicitWolf)) {
      out.push({ hole, wolfUserId: explicitWolf, catchUp: false });
      continue;
    }
    out.push({ hole, settlesAfterHole: hole - 1 });
  }
  return out;
}

/**
 * Hullene der `slot` er ulv i den faste delen av rundgangen (hull 1 … L − 1),
 * stigende. Tom liste for en ugyldig plass eller et ugyldig spillertall.
 */
export function wolfFixedHolesForSlot(
  slot: number,
  n: number,
  rule: WolfRotationRule,
): number[] {
  if (!Number.isInteger(n) || n < 1) return [];
  if (!Number.isInteger(slot) || slot < 1 || slot > n) return [];
  const end = Math.min(HOLE_COUNT, catchUpStartHole(n, rule) - 1);
  const holes: number[] = [];
  for (let hole = slot; hole <= end; hole += n) holes.push(hole);
  return holes;
}
