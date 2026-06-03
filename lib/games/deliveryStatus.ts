/**
 * Leverings-status per spiller for admin-spillerstatus-flaten (#376).
 *
 * Ren klassifisering: tar en spillers fremdrift + leverings-/godkjennings-/
 * trekk-tilstand og returnerer hvilken bøtte de hører til. Driver både
 * status-badgen på spillerstatus-sida og purre-mål-utvelgelsen (kun
 * `ready_not_delivered` purres — de er ferdige men har ikke levert).
 *
 * Appen er 18-hull (`scores.hole_number between 1 and 18`), så «ferdig»
 * betyr 18 hull med registrert slag.
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
}): DeliveryStatus {
  const {
    holesFilled,
    submittedAt,
    approvedAt,
    withdrawnAt,
    requirePeerApproval,
  } = opts;

  // Trekk har forrang over alt annet — en trukket spiller skal ikke purres
  // selv om de har levert eller står midt i runden.
  if (withdrawnAt) return 'withdrawn';

  if (submittedAt) {
    if (requirePeerApproval && !approvedAt) return 'pending_approval';
    return 'delivered';
  }

  // Ikke levert:
  if (holesFilled >= TOTAL_HOLES) return 'ready_not_delivered';
  if (holesFilled > 0) return 'playing';
  return 'not_started';
}

/**
 * Purre-kandidat = ferdig med runden, men ikke levert (og ikke trukket).
 * Dette er den eneste statusen auto-nudgen og admin-purringen treffer.
 */
export function isDeliveryReminderTarget(status: DeliveryStatus): boolean {
  return status === 'ready_not_delivered';
}
