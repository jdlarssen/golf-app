// Shared display-name helper for PostgREST FK-embeds on `public.users`.
//
// PostgREST returns FK-embeds as arrays (even for many-to-one) until the FK
// is declared one-to-one in the schema. We accept both array- and object-
// form so callers don't have to defensively coerce at each site.
//
// Used by the courses edit-page audit-kicker and the /admin activity-ledger.

export type DisplayNameUser =
  | { name: string | null; nickname: string | null }
  | { name: string | null; nickname: string | null }[]
  | null;

export function displayName(user: DisplayNameUser): string | null {
  if (!user) return null;
  const row = Array.isArray(user) ? user[0] : user;
  if (!row) return null;
  return row.nickname ?? row.name ?? null;
}
