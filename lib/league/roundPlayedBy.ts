/**
 * «Har spilt / I gang / Mangler» for one round (#2638): the participants split
 * by the round's locks (`deliveredUserIds` / `inProgressUserIds` from the
 * snapshot, the same rule as the start gate). The viewer comes last in their
 * group so the page can write «deg» there.
 *
 * Imports nothing: the native app can read it by relative path.
 */
export type PlayedByEntry = { userId: string; name: string | null; isViewer: boolean };

export type RoundPlayedBy = {
  delivered: PlayedByEntry[];
  inProgress: PlayedByEntry[];
  missing: PlayedByEntry[];
};

export function roundPlayedBy(
  participants: Array<{ userId: string; name: string | null }>,
  deliveredUserIds: string[],
  inProgressUserIds: string[],
  viewerId: string | null,
): RoundPlayedBy {
  const delivered = new Set(deliveredUserIds);
  const inProgress = new Set(inProgressUserIds);
  const groups: RoundPlayedBy = { delivered: [], inProgress: [], missing: [] };
  for (const p of participants) {
    const entry = { userId: p.userId, name: p.name, isViewer: p.userId === viewerId };
    const group = delivered.has(p.userId)
      ? groups.delivered
      : inProgress.has(p.userId)
        ? groups.inProgress
        : groups.missing;
    group.push(entry);
  }
  for (const group of Object.values(groups)) {
    group.sort((a: PlayedByEntry, b: PlayedByEntry) => Number(a.isViewer) - Number(b.isViewer));
  }
  return groups;
}
