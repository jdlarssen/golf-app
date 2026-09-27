/**
 * A league's management page has two doors: standalone under `/admin/liga/…`
 * and club-scoped under `/klubber/[groupId]/liga/…`. Which one applies is a
 * single `group_id` lookup, and the rule lives here so redirects and links
 * cannot drift apart (AGENTS.md trap 4). Mirror of `lib/cup/cupPaths.ts`.
 *
 * Pure string building, no IO. In a server action `groupId` MUST come from the
 * gate's admin-client read (`requireAdminOrClubAdminOfLeague`), never from the
 * form: the door is derived server-side.
 */
export function ligaBasePath(leagueId: string, groupId: string | null): string {
  return groupId
    ? `/klubber/${groupId}/liga/${leagueId}`
    : `/admin/liga/${leagueId}`;
}
