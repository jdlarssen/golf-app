// Hvilke hull gir en rotasjons-slot Wolf-rollen på? (#1874)
//
// `game_players.team_number` er IKKE et lag i wolf — det er plassen i
// rotasjonen, trukket ved start av `assignRotationSlots`. Flatene som viser
// rosteret trenger å si hva plassen betyr, og det eneste ærlige svaret er
// hullene den gir deg rollen på.
//
// Avledet av SAMME formel som motoren (`determineWolf` i
// `lib/scoring/modes/wolf.ts`, speilet i `wolfRotation.ts`): med n spillere er
// R = floor(18/n)·n siste rotasjonshull, og på hull 1..R er Wolf spilleren med
// `team_number === ((hull − 1) % n) + 1`.
//
// Hull R+1..18 (n=4 → 17–18, n=5 → 16–18) er TRAILING: der er Wolf den som
// ligger sist, ikke en fast plass. De hullene hører derfor ikke hjemme i et
// svar som gis før runden er spilt — de annonseres på hull-skjermen når
// stillingen faktisk finnes.

import { rotationSlotRange } from '@/lib/games/assignRotationSlots';

/** Appen og nettsiden fører bare hele runder — rotasjonen regnes over 18 hull. */
const HOLE_COUNT = 18;

/**
 * Hullene der `slot` er Wolf i den FASTE delen av rotasjonen, stigende.
 *
 * Tom liste når spørsmålet ikke gir mening: ugyldig slot (utdatert rad, f.eks.
 * etter frafall), eller et spillertall wolf ikke støtter. Kallsteder tegner da
 * ingen merkelapp i stedet for å gjette.
 *
 * @param slot `team_number` — 1..n
 * @param n Antall aktive spillere i rotasjonen (3–5, se `rotationSlotRange`)
 */
export function wolfLinearHolesForSlot(slot: number, n: number): number[] {
  // Spillertall-grensene har ETT hjem (`rotationSlotRange`) — leses her i
  // stedet for å skrives av på nytt, så en utvidelse av wolf ikke etterlater
  // en glemt 3..5 her inne.
  const range = rotationSlotRange('wolf');
  if (range === null) return [];
  if (!Number.isInteger(n) || n < range.min || n > range.max) return [];
  if (!Number.isInteger(slot) || slot < 1 || slot > n) return [];

  const lastRotationHole = Math.floor(HOLE_COUNT / n) * n;
  const holes: number[] = [];
  for (let hole = slot; hole <= lastRotationHole; hole += n) holes.push(hole);
  return holes;
}
