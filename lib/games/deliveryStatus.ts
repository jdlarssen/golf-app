/**
 * Leverings-status per spiller for admin-spillerstatus-flaten (#376).
 *
 * Ren klassifisering: tar en spillers fremdrift + leverings-/godkjennings-/
 * trekk-tilstand og returnerer hvilken bøtte de hører til. Driver både
 * status-badgen på spillerstatus-sida og purre-mål-utvelgelsen (kun
 * `ready_not_delivered` purres — de er ferdige men har ikke levert).
 *
 * Appen er normalt 18-hull (`scores.hole_number between 1 and 18`), så
 * «ferdig» betyr som regel 18 hull med registrert slag. #1441 (splittet
 * cup-dag) introduserte front9/back9-spill som kun spiller 9 av de 18 —
 * `classifyDeliveryStatus` tar derfor et valgfritt `expectedHoles`
 * (default `TOTAL_HOLES`) som callers med et segment-spill sender inn via
 * `holeCountForSegment(game.hole_segment)` (lib/games/holeScope.ts).
 */

export const TOTAL_HOLES = 18;

export type DeliveryStatus =
  | 'withdrawn' // trukket — skal ikke levere
  | 'delivered' // levert (og godkjent, eller godkjenning ikke påkrevd)
  | 'pending_approval' // levert, venter peer-godkjenning
  | 'ready_not_delivered' // 18/18 registrert, men ikke levert — purre-kandidat
  | 'playing' // midt i runden (1–17 hull)
  | 'not_started'; // ingen registreringer ennå

export function classifyDeliveryStatus(opts: {
  holesFilled: number;
  submittedAt: string | null;
  approvedAt: string | null;
  withdrawnAt: string | null;
  requirePeerApproval: boolean;
  /**
   * Antall hull som skal til for «ferdig» (#1441). Default `TOTAL_HOLES`
   * (18) — segment-spill (front9/back9) sender inn 9.
   */
  expectedHoles?: number;
}): DeliveryStatus {
  const {
    holesFilled,
    submittedAt,
    approvedAt,
    withdrawnAt,
    requirePeerApproval,
    expectedHoles = TOTAL_HOLES,
  } = opts;

  // Trekk har forrang over alt annet — en trukket spiller skal ikke purres
  // selv om de har levert eller står midt i runden.
  if (withdrawnAt) return 'withdrawn';

  if (submittedAt) {
    if (requirePeerApproval && !approvedAt) return 'pending_approval';
    return 'delivered';
  }

  // Ikke levert:
  if (holesFilled >= expectedHoles) return 'ready_not_delivered';
  if (holesFilled > 0) return 'playing';
  return 'not_started';
}

type ReminderRosterRow = {
  user_id: string;
  submitted_at: string | null;
  withdrawn_at: string | null;
  users: { is_guest: boolean } | null;
};

type ReminderSelectionOpts<T extends ReminderRosterRow> = {
  players: readonly T[];
  filledByUser: ReadonlyMap<string, number>;
  expectedHoles: number;
  /**
   * #1466: brukere med et ulevert back9-søsken — ekskluderes (de purres via
   * back9-spillet). Tom/utelatt for vanlige spill og back9-spill.
   */
  undeliveredSiblingUserIds?: ReadonlySet<string>;
};

/**
 * #1933: why a player who still owes a card is or is not reminded. `null` =
 * owes nothing (delivered or withdrawn). Target selection and the per-reason
 * counts both read this, so the button's number and the sentence under it
 * cannot disagree.
 *
 * Order matters: a guest is never reminded however far they got, and a
 * split-day player hands in the whole round on back9 whatever the front9 hole
 * count — so both win over «not finished yet».
 */
type ReminderReach = 'target' | 'guest' | 'split_day' | 'unfinished';

function reminderReach<T extends ReminderRosterRow>(
  p: T,
  opts: ReminderSelectionOpts<T>,
): ReminderReach | null {
  if (p.submitted_at || p.withdrawn_at) return null;
  if (p.users?.is_guest) return 'guest';
  if (opts.undeliveredSiblingUserIds?.has(p.user_id)) return 'split_day';
  if ((opts.filledByUser.get(p.user_id) ?? 0) < opts.expectedHoles) {
    return 'unfinished';
  }
  return 'target';
}

/**
 * Purre-mål-utvelgelse for admin-purringen (#376/#1466). En spiller er et mål
 * når hen er ferdig (`holesFilled >= expectedHoles`), ikke levert, ikke trukket
 * og ikke gjest — OG (#1466) ikke har et ulevert back9-søsken. På en splittet
 * cup-dag purres front9-spillere med ulevert back9-halvdel via back9-spillet i
 * stedet, siden én levering dekker hele runden; her ekskluderes de.
 *
 * Ren funksjon slik at mål-utvelgelsen kan enhetstestes uten å mocke
 * requireAdmin/redirect. Callers bygger `filledByUser` fra scores og
 * `undeliveredSiblingUserIds` fra ett batch-oppslag (aldri per-spiller-loop).
 */
export function selectDeliveryReminderTargets<T extends ReminderRosterRow>(
  opts: ReminderSelectionOpts<T>,
): T[] {
  return opts.players.filter((p) => reminderReach(p, opts) === 'target');
}

/** #1933: the players a reminder does NOT reach, per reason. */
export type UnremindableCounts = {
  /** Not every hole entered yet — a reminder helps once they have. */
  unfinished: number;
  /** Guests hand in through their marker and have no address to remind. */
  guests: number;
  /** #1466: hand in the whole round on the same day's back9 game. */
  splitDay: number;
};

/**
 * Counterpart of {@link selectDeliveryReminderTargets}: everyone who still owes
 * a card and is not a target lands in exactly one bucket. Lets the surfaces say
 * why fewer can be reminded than are missing, without calling a finished guest
 * unfinished.
 */
export function countUnremindable<T extends ReminderRosterRow>(
  opts: ReminderSelectionOpts<T>,
): UnremindableCounts {
  const counts: UnremindableCounts = { unfinished: 0, guests: 0, splitDay: 0 };
  for (const p of opts.players) {
    const reach = reminderReach(p, opts);
    if (reach === 'unfinished') counts.unfinished += 1;
    else if (reach === 'guest') counts.guests += 1;
    else if (reach === 'split_day') counts.splitDay += 1;
  }
  return counts;
}
