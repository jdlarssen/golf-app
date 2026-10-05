type Read<K extends string> = ({ ok: true } & { [P in K]: readonly unknown[] }) | { ok: false };

/**
 * Whether the Klubbhus room shows the new player's version (#2494, artboard
 * `Klubbhus-forslag-ny-spiller-*`): only when all three reads worked and
 * found nothing, no standalone round you made (`getArrangedRounds`), no club
 * (`getMyClubs`) and no cup of any kind (`getMyCupIds`, finished ones too).
 * A failed read is never «new»: the room from #2493 shows the error box in
 * that section instead (#2490).
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
