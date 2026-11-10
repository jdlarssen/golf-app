/**
 * The receipt after «Lever» (`?status=` on the game home).
 *
 * #2200: the core narrows `alsoFor` with its own rule, over scores that may be
 * newer than the page. Fewer flightmates' cards than the form asked for gets
 * its own receipt, so it never reads as if every card went.
 * #2814: in a simulator league the kept cards are handed over, not delivered
 * (`handedOver`), and the receipt says the flightmates send them in.
 */
export function deliveryReceipt(
  result: { alsoDelivered: number; handedOver?: number },
  askedMates: number,
): 'submitted' | 'submitted_partial' | 'submitted_handed_over' {
  const reached = result.handedOver ?? result.alsoDelivered;
  if (reached < askedMates) return 'submitted_partial';
  return result.handedOver ? 'submitted_handed_over' : 'submitted';
}
