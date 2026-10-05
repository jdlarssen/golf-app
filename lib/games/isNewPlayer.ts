type Read<K extends string> = ({ ok: true } & { [P in K]: readonly unknown[] }) | { ok: false };

/**
 * Whether the Klubbhus room shows the new player's version (#2494, artboard
 * `Klubbhus-forslag-ny-spiller-*`): only when all three reads worked and
 * found nothing: no standalone round you made, of any status (the room reads
 * one row for that, the same games as `getArrangedRounds`), no club
 * (`getMyClubs`) and no cup of any kind (`getMyCupIds`, finished ones too).
 * A failed read is never «new»: you get the room from #2493, whose sections
 * show their own error box when their reads fail (#2490).
 */
export function isNewPlayer(reads: {
  rounds: Read<'games'>;
  clubs: Read<'clubs'>;
  cups: Read<'ids'>;
}): boolean {
  const { rounds, clubs, cups } = reads;
  return (
    rounds.ok && rounds.games.length === 0 &&
    clubs.ok && clubs.clubs.length === 0 &&
    cups.ok && cups.ids.length === 0
  );
}
