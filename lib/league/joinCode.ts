/**
 * The code in a league's shareable join link, `/liga/bli-med/<code>` (#2662).
 *
 * Eight characters from `[0-9a-z]`: short enough to survive Messenger and SMS,
 * like the cup and club links, and 36^8 ≈ 2.8 × 10^12 codes so nobody guesses
 * one. `leagues_join_code_format` (migration 0221) CHECKs the same pattern, and
 * `joinCode.test.ts` asserts that the two agree (AGENTS.md trap 4).
 */

export const JOIN_CODE_RE = /^[0-9a-z]{8}$/;

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const LENGTH = 8;
// 252 = 7 × 36. A byte at or above it would wrap onto the first four
// characters and make them likelier, so it is drawn again.
const BYTE_LIMIT = 252;

/** Postgres unique_violation: the drawn code is taken. */
const UNIQUE_VIOLATION = '23505';

export function isJoinCode(code: string): boolean {
  return JOIN_CODE_RE.test(code);
}

/**
 * The absolute link people share. Built like the club and cup links
 * (`NEXT_PUBLIC_APP_URL`, else prod), unprefixed: the visitor's own locale
 * takes over when they open it.
 */
export function leagueJoinUrl(code: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://tornygolf.no'}/liga/bli-med/${code}`;
}

type FillRandom = (buf: Uint8Array) => Uint8Array;

const fillRandom: FillRandom = (buf) => crypto.getRandomValues(buf);

export function newJoinCode(fill: FillRandom = fillRandom): string {
  let code = '';
  while (code.length < LENGTH) {
    const bytes = fill(new Uint8Array(LENGTH - code.length));
    for (const b of bytes) {
      if (b < BYTE_LIMIT) code += ALPHABET[b % ALPHABET.length];
    }
  }
  return code;
}

/**
 * Writes a row with a fresh code, and draws once more if the unique index says
 * the code is taken. A second collision is returned to the caller as its error:
 * at 2.8 × 10^12 codes, two in a row means something else is wrong.
 */
export async function writeWithFreshJoinCode<T extends { error: { code?: string } | null }>(
  write: (code: string) => PromiseLike<T>,
): Promise<T> {
  const first = await write(newJoinCode());
  if (first.error?.code !== UNIQUE_VIOLATION) return first;
  return write(newJoinCode());
}
