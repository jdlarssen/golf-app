// Client-side helper for å bestemme hvilken spiller som er Wolf på et gitt
// hull. Regelen har ett hjem, `wolfForHole` i `lib/scoring/modes/wolfTurn.ts`
// (#2314), og denne fila er bare en tynn adapter rundt den.
//
// Hull-sidene på nettet og i appen tar ulven fra motorens hull-rad
// (`WolfHoleRow.wolfUserId`). Denne brukes som reserve når motoren ikke har
// kjørt (valgene eller scorene kunne ikke hentes).
//
// Regelen (`rule`): 'trailing' for spill uten `wolf_rotation`-flagget,
// 'catch_up' for nye spill. Se `wolfTurn.ts` for begge.
//
// Hvis `wolf_hole_choices` allerede har en rad for dette hullet, returnerer vi
// `wolfUserId` derfra (eksplisitt valgt — typisk admin-override eller
// trailing-wolf som ble valgt før vi rakk å rekompute).
//
// Returnerer null hvis vi ikke kan finne en gyldig wolf (defensive — bør ikke
// skje når validatoren har sikret n distinct team_numbers).

import {
  wolfForHole,
  type WolfRotationRule,
  type WolfTurn,
  type WolfTurnPlayer,
} from '../scoring/modes/wolfTurn';

export type WolfRotationPlayer = WolfTurnPlayer;

/**
 * Returnerer userId-en til spilleren som er Wolf på `holeNumber`.
 *
 * @param holeNumber 1..18
 * @param players De n spillerne (3–5) med team_number 1..n
 * @param pointsByUser Poengene før dette hullet. Brukes på de siste hullene,
 *   der stillingen kan bestemme ulven.
 * @param explicitWolfFromChoice Hvis `wolf_hole_choices` har en rad for dette
 *   hullet, gir vi forrang til den lagrede `wolf_user_id` — vi rekomputerer
 *   ikke rotasjonen siden valget allerede er låst.
 * @param rule Regelen spillet går etter (`wolfRotationRule(mode_config)`).
 */
export function determineWolfForHole(
  holeNumber: number,
  players: WolfRotationPlayer[],
  pointsByUser: Map<string, number>,
  explicitWolfFromChoice?: string,
  rule: WolfRotationRule = 'trailing',
): string | null {
  return (
    wolfForHole({
      holeNumber,
      players,
      pointsBefore: pointsByUser,
      explicitWolf: explicitWolfFromChoice,
      rule,
    })?.userId ?? null
  );
}

/**
 * Ulven på hullet slik hull-sidene skal vise den (#2314): en lagret rad
 * vinner, så motorens rad (`engineTurn`), og regelen selv bare som reserve
 * når motoren ikke kunne kjøre. Appen og nettsiden kaller begge denne, så de
 * aldri viser hver sin ulv.
 *
 * `catchUp` følger motoren når den lagrede ulven er den samme spilleren.
 */
export function resolveHoleWolf(args: {
  holeNumber: number;
  players: WolfRotationPlayer[];
  pointsByUser: Map<string, number>;
  storedWolfUserId: string | undefined;
  engineTurn: WolfTurn | null | undefined;
  rule: WolfRotationRule;
}): WolfTurn | null {
  const { holeNumber, players, pointsByUser, storedWolfUserId, engineTurn, rule } = args;
  if (engineTurn) {
    if (
      storedWolfUserId &&
      storedWolfUserId !== engineTurn.userId &&
      players.some((p) => p.userId === storedWolfUserId)
    ) {
      return { userId: storedWolfUserId, catchUp: false };
    }
    return engineTurn;
  }
  return wolfForHole({
    holeNumber,
    players,
    pointsBefore: pointsByUser,
    explicitWolf: storedWolfUserId,
    rule,
  });
}
