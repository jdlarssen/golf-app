// Client-side helper for å bestemme hvilken spiller som er Wolf på et gitt
// hull. Speiler `determineWolf()` i `lib/scoring/modes/wolf.ts` slik at UI-en
// kan vise riktig Wolf-badge uten å rekjøre hele scoring-modulen i nettleseren.
//
// Rotasjons-regel (rotation: 'random_with_trailing'):
//   - Hull 1-16: wolf = spilleren med team_number === ((holeNumber - 1) % 4) + 1
//   - Hull 17-18: wolf = spilleren med lavest totalPoints etter forrige hull
//                 (tiebreak: team_number ASC, deterministisk)
//   - Hvis `wolf_hole_choices` allerede har en rad for dette hullet, returnerer
//     vi `wolfUserId` derfra (eksplisitt valgt — typisk admin-override eller
//     trailing-wolf som ble valgt før vi rakk å rekompute).
//
// Returnerer null hvis vi ikke kan finne en gyldig wolf (defensive — bør ikke
// skje når validatoren har sikret 4 distinct team_numbers).

export interface WolfRotationPlayer {
  userId: string;
  teamNumber: number;
}

/**
 * Returnerer userId-en til spilleren som er Wolf på `holeNumber`.
 *
 * @param holeNumber 1..18
 * @param players De 4 spillerne med team_number 1-4
 * @param pointsByUser Akkumulerte poeng per spiller før dette hullet
 *   (server-side computert via `computeLeaderboard`). Brukes for trailing-
 *   wolf på hull 17-18.
 * @param explicitWolfFromChoice Hvis `wolf_hole_choices` har en rad for dette
 *   hullet, gir vi forrang til den lagrede `wolf_user_id` — vi rekomputerer
 *   ikke rotasjonen siden valget allerede er låst.
 */
export function determineWolfForHole(
  holeNumber: number,
  players: WolfRotationPlayer[],
  pointsByUser: Map<string, number>,
  explicitWolfFromChoice?: string,
): string | null {
  if (explicitWolfFromChoice) {
    const explicit = players.find((p) => p.userId === explicitWolfFromChoice);
    if (explicit) return explicit.userId;
  }

  if (players.length === 0) return null;

  if (holeNumber >= 1 && holeNumber <= 16) {
    const slot = ((holeNumber - 1) % 4) + 1;
    return players.find((p) => p.teamNumber === slot)?.userId ?? null;
  }

  // Hull 17-18: trailing-wolf. Sorter kopi på (totalPoints ASC, team_number ASC).
  const sorted = [...players].sort((a, b) => {
    const ta = pointsByUser.get(a.userId) ?? 0;
    const tb = pointsByUser.get(b.userId) ?? 0;
    if (ta !== tb) return ta - tb;
    return a.teamNumber - b.teamNumber;
  });
  return sorted[0]?.userId ?? null;
}
