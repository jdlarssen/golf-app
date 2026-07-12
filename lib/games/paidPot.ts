/**
 * #1175: den innbetalte potten — sum av startkontingenter for spillere som har
 * betalt og ikke er trukket. Vises som anker ved siden av den isolerte
 * kontingenten («Startkontingent 100 kr / Potten er nå 800 kr») for å gjøre
 * prisen relativ (UX Peak ankereffekt).
 *
 * Regelen holdes bevisst IDENTISK med admin-sidens «X av Y betalt»-telling
 * (`app/[locale]/admin/games/[id]/page.tsx` → `withdrawn_at == null &&
 * paid_at != null`) og med purre-utvelgelsen (#1145), så de tre tallene aldri
 * divergerer. En betalt spiller som trekker seg beholder `paid_at` i DB
 * (historikk, #1049), men teller ikke i potten.
 *
 * Ærlig og voksende: kun faktisk innbetalt, aldri «forventet pott» av ubetalte
 * kontingenter (eier-beslutning #1175).
 */

/** Minste felt-sett potten trenger fra en spiller-rad. */
export type PotPlayer = {
  paid_at: string | null;
  withdrawn_at: string | null;
};

/**
 * Innbetalt pott i kr = `entryFeeKr` × antall spillere med `paid_at` satt og
 * `withdrawn_at` null. Returnerer 0 når det ikke er noen kontingent
 * (`entryFeeKr <= 0`) — da finnes ingen pott å ankre mot.
 */
export function computePaidPotKr(
  players: ReadonlyArray<PotPlayer>,
  entryFeeKr: number,
): number {
  if (entryFeeKr <= 0) return 0;
  const payers = players.filter(
    (p) => p.paid_at != null && p.withdrawn_at == null,
  ).length;
  return entryFeeKr * payers;
}
