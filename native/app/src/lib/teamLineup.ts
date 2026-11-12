// native/app/src/lib/teamLineup.ts
// #2840: oppstillingen i lagskjemaet. Du står først, og etter deg kommer
// `teamSize - 1` plasser. En venn du velger, går til første ledige plass fra venstre.
// Tar du en venn ut, blir plassen ledig og de andre blir stående, så en skive aldri
// hopper sidelengs. Ren og I/O-fri (Type A).
import type { AppTeamSignupMember } from '../../../../lib/games/appRoundInviteView';

/** Plassene etter deg: en venns id, eller `null` for en ledig plass. */
export type TeamSlots = readonly (string | null)[];

/** Plassene før noen er valgt. Et lag på fire har tre. */
export function emptySlots(teamSize: number): (string | null)[] {
  return Array.from({ length: Math.max(0, teamSize - 1) }, () => null);
}

/**
 * Vennen på første ledige plass, og hvilken plass det ble. `null` når laget er fullt
 * eller vennen alt står der.
 */
export function placeInSlots(
  slots: TeamSlots,
  friendId: string,
): { slots: (string | null)[]; index: number } | null {
  if (slots.includes(friendId)) return null;
  const index = slots.indexOf(null);
  if (index === -1) return null;
  const next = [...slots];
  next[index] = friendId;
  return { slots: next, index };
}

/** Vennen ut av laget. Plassen blir ledig. */
export function removeFromSlots(slots: TeamSlots, friendId: string): (string | null)[] {
  return slots.map((id) => (id === friendId ? null : id));
}

/** Hvor mange plasser som er ledige. */
export function openSlotCount(slots: TeamSlots): number {
  return slots.filter((id) => id === null).length;
}

/** Vennene som er valgt, fra venstre. Det ruta får som `memberIds`. */
export function pickedIds(slots: TeamSlots): string[] {
  return slots.filter((id): id is string => id !== null);
}

/**
 * Hvem på laget som er deg, i svaret på en invitasjon. Serveren merker din egen
 * rad (`isYou`, #2840). Uten merket rad (en eldre server) er ingen skive merket.
 */
export function selfMemberIndex(members: readonly AppTeamSignupMember[]): number {
  return members.findIndex((member) => member.isYou);
}
