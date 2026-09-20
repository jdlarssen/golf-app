/**
 * «Hvilken dag — og hvilket år — hører denne runden til?» (#2127)
 *
 * Regelen er én linje, men den hadde to hjem: `/profile/historikk` definerte den
 * privat, og Kavalkaden trengte nøyaktig samme bøtting. To kopier av en dato-regel
 * er felle 4 (`docs/bug-prevention.md`) — så den bor her nå, og begge kaller hit.
 *
 * Runden dateres av den planlagte utslagstiden når den finnes, ellers av når spillet
 * ble avsluttet. Året leses på **Oslo-kalender** via `osloParts`, aldri med lokale
 * `Date`-gettere: Vercel kjører UTC, så en runde som slo ut 1. januar kl. 00.30 norsk
 * tid ville ellers havnet i fjoråret (#648).
 *
 * Ren og I/O-fri (Type A, jf. `lib/scoring/AGENTS.md`).
 */
import { osloParts } from '@/lib/format/teeOff';

/** Minste felles form for en runde som skal dateres. */
export type DatedRound = {
  scheduled_tee_off_at: string | null;
  ended_at: string | null;
};

/**
 * Effektiv runde-dato: planlagt utslag, ellers avslutning. `null` når runden ikke
 * har noen av delene (udaterbar — kallstedene utelater den).
 */
export function effectiveDate(round: DatedRound): Date | null {
  const iso = round.scheduled_tee_off_at ?? round.ended_at;
  if (iso == null) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Oslo-kalenderåret runden hører til, eller `null` når den er udaterbar. */
export function effectiveYear(round: DatedRound): number | null {
  const date = effectiveDate(round);
  return date ? osloParts(date).year : null;
}
