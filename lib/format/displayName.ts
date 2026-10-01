// Shared display-name helper for PostgREST FK-embeds on `public.users`.
//
// A many-to-one embed comes back as an object, or null when the FK is null or
// the row is hidden.
//
// Used by the courses edit-page audit-kicker and the /admin activity-ledger.

export type DisplayNameUser = { name: string | null; nickname: string | null } | null;

export function displayName(user: DisplayNameUser): string | null {
  if (!user) return null;
  return user.nickname ?? user.name ?? null;
}
