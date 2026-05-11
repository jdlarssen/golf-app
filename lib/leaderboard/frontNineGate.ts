type Player = { user_id: string; team_number: number };
type Score = { user_id: string; hole_number: number; strokes: number | null };

const FRONT_9 = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/**
 * Returns true when at least one team has all its members' scores entered
 * (non-null strokes) on every hole 1–9. Drives the leaderboard transition
 * from state #3 (locked, "Stille før stormen") to state #3.5 (front 9
 * visible with back 9 still locked).
 *
 * Caller guarantees finite hole numbers; values outside 1–9 are ignored.
 * Scores whose user_id is not present in `players` are ignored (treated as
 * stale rows that don't map to any team).
 */
export function isFrontNineOpen(opts: {
  players: Player[];
  scores: Score[];
}): boolean {
  // Group player user_ids by team.
  const teamGroups = new Map<number, string[]>();
  const knownUserIds = new Set<string>();
  for (const p of opts.players) {
    knownUserIds.add(p.user_id);
    const existing = teamGroups.get(p.team_number) ?? [];
    existing.push(p.user_id);
    teamGroups.set(p.team_number, existing);
  }

  // For each known user, collect the set of front-9 holes they have non-null
  // strokes on. Duplicates collapse into the set naturally.
  const filledByUser = new Map<string, Set<number>>();
  for (const s of opts.scores) {
    if (s.strokes == null) continue;
    if (!knownUserIds.has(s.user_id)) continue;
    if (!FRONT_9.includes(s.hole_number as (typeof FRONT_9)[number])) continue;
    const set = filledByUser.get(s.user_id) ?? new Set<number>();
    set.add(s.hole_number);
    filledByUser.set(s.user_id, set);
  }

  // A team is "front-9 complete" if every member has all 9 front holes filled.
  for (const userIds of teamGroups.values()) {
    // Guard against vacuous truth from [].every(...): an empty team must
    // never satisfy the gate.
    if (userIds.length === 0) continue;
    const allComplete = userIds.every((uid) => {
      const set = filledByUser.get(uid);
      return set != null && FRONT_9.every((h) => set.has(h));
    });
    if (allComplete) return true;
  }
  return false;
}
