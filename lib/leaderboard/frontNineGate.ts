type Player = { user_id: string; team_number: number };
type Score = { user_id: string; hole_number: number; strokes: number | null };

const FRONT_9 = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/**
 * Returns true when at least one team has all its members' scores entered
 * (non-null strokes) on every hole in `gateHoles`. Drives the leaderboard
 * transition from state #3 (locked, "Stille før stormen") to state #3.5
 * (`gateHoles` visible with the rest of the round still locked).
 *
 * `gateHoles` defaults to the front 9 (1–9) — today's full-18-hole behavior,
 * unchanged. Segment games (#1441 splittet cup-dag) pass a narrower list —
 * `lib/games/holeScope.ts`'s `firstHalfHoleNumbersForSegment(segment)` — so
 * a back9 game (holes 10–18) can open the gate too: the hardcoded 1–9 range
 * would never appear in a back9 game's scores, so the gate would silently
 * never open without this. Caller guarantees finite hole numbers; values
 * outside `gateHoles` are ignored. Scores whose user_id is not present in
 * `players` are ignored (treated as stale rows that don't map to any team).
 */
export function isFrontNineOpen(opts: {
  players: Player[];
  scores: Score[];
  gateHoles?: readonly number[];
}): boolean {
  const gateHoles = opts.gateHoles ?? FRONT_9;

  // Group player user_ids by team.
  const teamGroups = new Map<number, string[]>();
  const knownUserIds = new Set<string>();
  for (const p of opts.players) {
    knownUserIds.add(p.user_id);
    const existing = teamGroups.get(p.team_number) ?? [];
    existing.push(p.user_id);
    teamGroups.set(p.team_number, existing);
  }

  // For each known user, collect the set of gate holes they have non-null
  // strokes on. Duplicates collapse into the set naturally.
  const filledByUser = new Map<string, Set<number>>();
  for (const s of opts.scores) {
    if (s.strokes == null) continue;
    if (!knownUserIds.has(s.user_id)) continue;
    if (!gateHoles.includes(s.hole_number)) continue;
    const set = filledByUser.get(s.user_id) ?? new Set<number>();
    set.add(s.hole_number);
    filledByUser.set(s.user_id, set);
  }

  // A team is "gate complete" if every member has all gate holes filled.
  for (const userIds of teamGroups.values()) {
    // Guard against vacuous truth from [].every(...): an empty team must
    // never satisfy the gate.
    if (userIds.length === 0) continue;
    const allComplete = userIds.every((uid) => {
      const set = filledByUser.get(uid);
      return set != null && gateHoles.every((h) => set.has(h));
    });
    if (allComplete) return true;
  }
  return false;
}
