import { firstName, sharesFirstName } from '../firstName';

// «Hvem sitt utslag» (#2580): the names the tee-shot surfaces show and the
// team order they all use, on the web and in the app alike (same team, same
// order on every device). Relative imports only, so Metro can serve it.

/**
 * Short names for a team, as the artboards write them: the nickname, else the
 * first name, and the full name when two on the team share a first name
 * (#2286). `members` is the team in team order.
 */
export function teeShotNames(
  members: readonly {
    user_id: string;
    users?: { name: string | null; nickname: string | null } | null;
  }[],
  unknownPlayer: string,
): Map<string, string> {
  const fullNames = members.map((m) => m.users?.name ?? null);
  return new Map(
    members.map((m, i) => {
      const nickname = m.users?.nickname?.trim();
      const fullName = fullNames[i] ?? null;
      const others = fullNames.filter((_, j) => j !== i);
      const name =
        nickname || (sharesFirstName(fullName, others) ? fullName : firstName(fullName)) || unknownPlayer;
      return [m.user_id, name];
    }),
  );
}

/**
 * The team order every tee-shot surface uses: by short name (Norwegian
 * collation), then by id. PostgREST returns `game_players` in no set order, and
 * a delivered row can move, so without this the buttons, the lock line («Sigrid
 * og Per trenger …») and the box would shuffle between page loads.
 */
export function sortByTeeShotName<
  T extends { user_id: string; users?: { name: string | null; nickname: string | null } | null },
>(members: readonly T[], unknownPlayer: string): T[] {
  const names = teeShotNames(members, unknownPlayer);
  return [...members].sort(
    (a, b) =>
      (names.get(a.user_id) ?? '').localeCompare(names.get(b.user_id) ?? '', 'nb') ||
      a.user_id.localeCompare(b.user_id),
  );
}
