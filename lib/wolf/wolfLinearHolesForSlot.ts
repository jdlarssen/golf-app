// Hvilke hull gir en rotasjons-slot Wolf-rollen på? (#1874)
//
// `game_players.team_number` er IKKE et lag i wolf — det er plassen i
// rotasjonen, trukket ved start av `assignRotationSlots`. Flatene som viser
// rosteret trenger å si hva plassen betyr, og det eneste ærlige svaret er
// hullene den gir deg rollen på.
//
// Regelen har ett hjem, `lib/scoring/modes/wolfTurn.ts` (#2314): med n
// spillere er hull 1 … L − 1 den faste rundgangen, og der er Wolf spilleren med
// `team_number === ((hull − 1) % n) + 1`. L er `catchUpStartHole(n, rule)`.
//
// Fra hull L kan stillingen bestemme ulven: i gamle spill (`trailing`) er det
// alltid den som ligger sist (n=4 → 17–18, n=5 → 16–18, n=3 → ingen), i nye
// (`catch_up`) den som ligger sist med minst n poeng avstand (n=3 og 5 →
// 16–18, n=4 → 17–18). De hullene hører derfor ikke hjemme i et svar som gis
// før runden er spilt — de annonseres på hull-skjermen når stillingen finnes.

import { rotationSlotRange } from '@/lib/games/assignRotationSlots';
import {
  wolfFixedHolesForSlot,
  type WolfRotationRule,
} from '@/lib/scoring/modes/wolfTurn';

/**
 * Hullene der `slot` er Wolf i den FASTE delen av rotasjonen, stigende.
 *
 * Tom liste når spørsmålet ikke gir mening: ugyldig slot (utdatert rad, f.eks.
 * etter frafall), eller et spillertall wolf ikke støtter. Kallsteder tegner da
 * ingen merkelapp i stedet for å gjette.
 *
 * @param slot `team_number` — 1..n
 * @param n Antall aktive spillere i rotasjonen (3–5, se `rotationSlotRange`)
 * @param rule Regelen spillet går etter (`wolfRotationRule(mode_config)`)
 */
export function wolfLinearHolesForSlot(
  slot: number,
  n: number,
  rule: WolfRotationRule = 'trailing',
): number[] {
  // Spillertall-grensene har ETT hjem (`rotationSlotRange`) — leses her i
  // stedet for å skrives av på nytt, så en utvidelse av wolf ikke etterlater
  // en glemt 3..5 her inne.
  const range = rotationSlotRange('wolf');
  if (range === null) return [];
  if (!Number.isInteger(n) || n < range.min || n > range.max) return [];
  return wolfFixedHolesForSlot(slot, n, rule);
}
