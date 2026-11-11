/**
 * #2749: who counts as paid and who the reminder reaches, as pure rules. One
 * home for the server core (`lib/games/payments.ts`, which is server-only), the
 * web's «Hvem har betalt?» button (`BetalingClient.tsx`) and the admin game
 * page's Betaling card, so the button's number and «Purret N» never disagree.
 */

export type CountablePlayer = { paid: boolean; withdrawn: boolean; isGuest: boolean };

/** The reminder's target rule: not paid, not withdrawn, not a guest (placeholder address). */
export function isRemindable(p: CountablePlayer): boolean {
  return !p.paid && !p.withdrawn && !p.isGuest;
}

/** The counts the web's Betaling card and the app's card show. */
export function paymentCounts(players: readonly CountablePlayer[]) {
  const active = players.filter((p) => !p.withdrawn);
  return {
    paidCount: active.filter((p) => p.paid).length,
    totalCount: active.length,
    remindable: players.filter(isRemindable).length,
  };
}
