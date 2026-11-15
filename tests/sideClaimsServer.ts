import { vi } from 'vitest';
import type { GirClaim, HoleClaimsRead, SideClaim, SideClaimWriteResult } from '@/lib/games/sideClaims';

/**
 * #2283 (part D3): a fake server for the flights' side-contest reports, for the
 * tests of the row and the sheet. The cards run through the real
 * `useSideClaims`, so every read and every save goes the way it does on the
 * hole page. The server keeps the rows, stamps each write with a new
 * `updatedAt`, and lets a test hold back a save or a read and release it when
 * the scenario needs it (a flight-mate writing in between, a read that hangs
 * and then fails). The same model as the app's `src/test/sideClaimsServer.ts`.
 *
 *   vi.mock('./sideClaimActions', () => ({
 *     recordSideClaim: (...args) => fake.recordSideClaim(...args),
 *     recordGirClaims: (...args) => fake.recordGirClaims(...args),
 *   }));
 *   vi.mock('@/lib/games/sideClaims', async (importOriginal) => ({
 *     ...(await importOriginal<typeof import('@/lib/games/sideClaims')>()),
 *     readHoleClaims: (...args) => fake.readHoleClaims(...args),
 *   }));
 */

interface HeldWrite {
  fn: 'record_side_claim' | 'record_gir_claims';
  /** Release the save. `ok` writes the rows; a code writes nothing. */
  release: (answer?: SideClaimWriteResult) => void;
}

interface HeldRead {
  /** Answer with what the server holds when the read is released. */
  release: () => void;
  /** Let the read fail (a network error). */
  fail: () => void;
}

type SideWrite = {
  gameId?: string;
  category: SideClaim['category'];
  holeNumber: number;
  winnerUserId: string | null;
  distanceM: number | null;
};
type GirWrite = { gameId?: string; holeNumber: number; userIds: readonly string[]; hit: boolean };

export const server = {
  /** Who the app is signed in as; `entered_by` on what it writes. */
  me: 'me',
  side: [] as SideClaim[],
  gir: [] as GirClaim[],
  tick: 0,
  /** Saves wait for `release` in `heldWrites`. */
  holdWrites: false,
  /** Reads wait for `release`/`fail` in `heldReads`. */
  holdReads: false,
  /** This many of the next reads fail. */
  failReads: 0,
  /** This many of the next saves reject, as a server action does when the network is gone. */
  rejectWrites: 0,
  heldWrites: [] as HeldWrite[],
  heldReads: [] as HeldRead[],
};

export function resetServer(): void {
  server.me = 'me';
  server.side = [];
  server.gir = [];
  server.tick = 0;
  server.holdWrites = false;
  server.holdReads = false;
  server.failReads = 0;
  server.rejectWrites = 0;
  server.heldWrites = [];
  server.heldReads = [];
  fake.readHoleClaims.mockClear();
  fake.recordSideClaim.mockClear();
  fake.recordGirClaims.mockClear();
}

function stamp(): string {
  server.tick += 1;
  return `2026-11-15T10:00:${String(server.tick).padStart(2, '0')}Z`;
}

/** Write as someone else in the flight, straight into the server (a flight-mate's phone). */
export function writeSideAs(by: string, write: SideWrite): void {
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

export function writeGirAs(by: string, write: GirWrite): void {
  const at = stamp();
  server.gir = server.gir.filter((r) => !(r.holeNumber === write.holeNumber && write.userIds.includes(r.userId)));
  for (const userId of write.userIds) {
    server.gir.push({ holeNumber: write.holeNumber, userId, hit: write.hit, enteredBy: by, updatedAt: at });
  }
}

function snapshot(hole: number, need: { side: boolean; gir: boolean }): HoleClaimsRead {
  return {
    ok: true,
    side: need.side ? server.side.filter((c) => c.holeNumber === hole).map((c) => ({ ...c })) : undefined,
    gir: need.gir ? server.gir.filter((r) => r.holeNumber === hole).map((r) => ({ ...r })) : undefined,
  };
}

function write(fn: HeldWrite['fn'], apply: () => void): Promise<SideClaimWriteResult> {
  if (server.rejectWrites > 0) {
    server.rejectWrites -= 1;
    return Promise.reject(new Error('network'));
  }
  const settle = (answer: SideClaimWriteResult = { ok: true }): SideClaimWriteResult => {
    if (answer.ok) apply();
    return answer;
  };
  if (!server.holdWrites) return Promise.resolve(settle());
  return new Promise((resolve) => {
    server.heldWrites.push({ fn, release: (answer) => resolve(settle(answer)) });
  });
}

export const fake = {
  readHoleClaims: vi.fn(
    (_client: unknown, args: { gameId: string; holeNumber: number; need: { side: boolean; gir: boolean } }) => {
      if (server.failReads > 0) {
        server.failReads -= 1;
        return Promise.resolve<HoleClaimsRead>({ ok: false, error: new Error('network') });
      }
      if (!server.holdReads) return Promise.resolve(snapshot(args.holeNumber, args.need));
      return new Promise<HoleClaimsRead>((resolve) => {
        server.heldReads.push({
          release: () => resolve(snapshot(args.holeNumber, args.need)),
          fail: () => resolve({ ok: false, error: new Error('network') }),
        });
      });
    },
  ),
  recordSideClaim: vi.fn((args: SideWrite) => write('record_side_claim', () => writeSideAs(server.me, args))),
  recordGirClaims: vi.fn((args: GirWrite) => write('record_gir_claims', () => writeGirAs(server.me, args))),
};
