export type ClubRole = 'owner' | 'admin' | 'member';

/**
 * Who may remove another member from a club. An owner removes anyone; an
 * admin removes admins and members, never an owner.
 *
 * The rule's home is the database: the "group_members delete admin or self"
 * policy (migration 0248) decides. This mirror only keeps the screens from
 * offering a removal the database refuses. Leaving the club yourself is a
 * different route (/forlat).
 */
export function canRemoveClubMember(
  callerRole: ClubRole | null | undefined,
  targetRole: ClubRole,
): boolean {
  if (callerRole === 'owner') return true;
  return callerRole === 'admin' && targetRole !== 'owner';
}
