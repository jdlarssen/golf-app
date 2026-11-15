// #2283: en falsk server for innmeldingene på hullet, til testene av kortene.
//
// Kortene testes gjennom den ekte `useSideClaims`-hooken, så hver henting og
// hver lagring går samme vei som i appen. Serveren holder radene, gir hver
// skriving en ny `updatedAt`, og lar testen holde igjen en lagring eller en
// henting og slippe den når scenarioet trenger det (en kamerat som skriver midt
// i, en henting som henger og så feiler).
//
//   jest.mock('../../data/sideClaims', () => require('../../test/sideClaimsServer').sideClaimsModule);
import type { GirClaim, SideClaim, SideClaimWrite, SideClaimWriteResult } from '../data/sideClaims';

type Answer = SideClaimWriteResult;
type GirWrite = { gameId: string; holeNumber: number; userIds: readonly string[]; hit: boolean };

interface HeldWrite {
  fn: 'record_side_claim' | 'record_gir_claims';
  /** Slipp lagringen. `ok` skriver radene; en feilkode skriver ingenting. */
  release: (answer?: Answer) => void;
}

interface HeldRead {
  /** Svar med det serveren har når hentingen slippes. */
  release: () => void;
  /** La hentingen feile (nettfeil). */
  fail: () => void;
}

export const server = {
  /** Hvem appen er logget inn som; `entered_by` på det appen skriver. */
  me: 'me',
  side: [] as SideClaim[],
  gir: [] as GirClaim[],
  tick: 0,
  /** Lagringer venter på `release` i `heldWrites`. */
  holdWrites: false,
  /** Hentinger venter på `release`/`fail` i `heldReads`. */
  holdReads: false,
  /** Så mange av de neste hentingene feiler. */
  failReads: 0,
  heldWrites: [] as HeldWrite[],
  heldReads: [] as HeldRead[],
  /** Alt appen har sendt, i rekkefølge. */
  writes: [] as { fn: HeldWrite['fn']; args: unknown }[],
};

export function resetServer(): void {
  server.me = 'me';
  server.side = [];
  server.gir = [];
  server.tick = 0;
  server.holdWrites = false;
  server.holdReads = false;
  server.failReads = 0;
  server.heldWrites = [];
  server.heldReads = [];
  server.writes = [];
}

function stamp(): string {
  server.tick += 1;
  return `2026-11-15T10:00:${String(server.tick).padStart(2, '0')}Z`;
}

/** Skriv som en annen i flighten, rett i serveren (en kamerats telefon). */
export function writeSideAs(by: string, write: Omit<SideClaimWrite, 'gameId'>): void {
  server.side = server.side.filter((c) => !(c.category === write.category && c.holeNumber === write.holeNumber));
  server.side.push({
    category: write.category,
    holeNumber: write.holeNumber,
    winnerUserId: write.winnerUserId,
    distanceM: write.winnerUserId == null ? null : write.distanceM,
    enteredBy: by,
    updatedAt: stamp(),
  });
}

export function writeGirAs(by: string, write: Omit<GirWrite, 'gameId'>): void {
  const at = stamp();
  server.gir = server.gir.filter((r) => !(r.holeNumber === write.holeNumber && write.userIds.includes(r.userId)));
  for (const userId of write.userIds) {
    server.gir.push({ holeNumber: write.holeNumber, userId, hit: write.hit, enteredBy: by, updatedAt: at });
  }
}

function read<T>(rows: () => T[]): Promise<T[]> {
  if (server.failReads > 0) {
    server.failReads -= 1;
    return Promise.reject(new Error('nett'));
  }
  if (!server.holdReads) return Promise.resolve(rows().map((r) => ({ ...r })));
  return new Promise((resolve, reject) => {
    server.heldReads.push({
      release: () => resolve(rows().map((r) => ({ ...r }))),
      fail: () => reject(new Error('nett')),
    });
  });
}

function write(fn: HeldWrite['fn'], args: unknown, apply: () => void): Promise<Answer> {
  server.writes.push({ fn, args });
  const settle = (answer: Answer = { ok: true }): Answer => {
    if (answer.ok) apply();
    return answer;
  };
  if (!server.holdWrites) return Promise.resolve(settle());
  return new Promise((resolve) => {
    server.heldWrites.push({ fn, release: (answer) => resolve(settle(answer)) });
  });
}

/** Stand-in for `src/data/sideClaims.ts`, med samme API. */
export const sideClaimsModule = {
  fetchSideClaims: jest.fn((_gameId: string, holeNumber: number) =>
    read(() => server.side.filter((c) => c.holeNumber === holeNumber)),
  ),
  fetchGirClaims: jest.fn((_gameId: string, holeNumber: number) =>
    read(() => server.gir.filter((r) => r.holeNumber === holeNumber)),
  ),
  recordSideClaim: jest.fn((args: SideClaimWrite) =>
    write('record_side_claim', args, () => writeSideAs(server.me, args)),
  ),
  recordGirClaims: jest.fn((args: GirWrite) =>
    write('record_gir_claims', { ...args, userIds: [...args.userIds] }, () => writeGirAs(server.me, args)),
  ),
};
