// The one home for which name a player is shown with, on the web and in the
// app (#2813). The name always wins; the nickname is only the fallback for a
// user without a name, and never takes the name's place. Where a surface shows
// the nickname next to the name (the board, friends, notifications), it does so
// through the two styles at the bottom of this file.
//
// `nameRuleSites.test.ts` turns red when a file outside `lib/names/` chooses
// between `nickname` and `name` on its own.
//
// Relative imports only: the app imports this file from `native/app/src/`.
import { firstName, sharesFirstName } from '../firstName';

export type PlayerNameParts = {
  name: string | null | undefined;
  nickname?: string | null | undefined;
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/**
 * The full name, else the nickname, else null — the caller keeps its own text
 * for an unknown player.
 */
export function playerName(u: PlayerNameParts | null | undefined): string | null {
  return clean(u?.name) ?? clean(u?.nickname);
}

/**
 * The first name, for surfaces that show only the first name. Without a name
 * the whole nickname, else null.
 */
export function playerFirstName(u: PlayerNameParts | null | undefined): string | null {
  return firstName(clean(u?.name)) ?? clean(u?.nickname);
}

/**
 * The first name, or the full name when another in the same view shares that
 * first name (#2286). Without a name the nickname, else null.
 *
 * @param others the full names of the others in the view.
 */
export function playerShortName(
  u: PlayerNameParts | null | undefined,
  others: ReadonlyArray<string | null | undefined>,
): string | null {
  const name = clean(u?.name);
  if (name === null) return clean(u?.nickname);
  return sharesFirstName(name, others) ? name : firstName(name);
}

/**
 * The board style: `Ola "Kalle" Nordmann`, `Ola "Kalle"` for a one-word name,
 * `"Kalle"` without a name, and just the name without a nickname. Used by the
 * board, the podiums and the finish pages (`formatRevealName` delegates here).
 */
export function playerNameWithNickname(name: string, nickname: string | null | undefined): string {
  const nick = clean(nickname);
  if (nick === null) return name.trim();

  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return `"${nick}"`;
  if (parts.length === 1) return `${parts[0]} "${nick}"`;
  return `${parts[0]} "${nick}" ${parts[parts.length - 1]}`;
}

/**
 * The friends and notifications style: `Ola Nordmann «Kalle»`, and just the
 * base without a nickname. `base` is the caller's name text, which may itself
 * be a fallback (a masked address, a guest label).
 */
export function playerNameWithNicknameAfter(
  base: string,
  nickname: string | null | undefined,
): string {
  const nick = clean(nickname);
  return nick === null ? base : `${base} «${nick}»`;
}
