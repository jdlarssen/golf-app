/**
 * Tak for personlige (frittstående) cuper (#526).
 *
 * En vanlig bruker kan lage sin egen cup blant venner, men capped til en
 * «1 helg»-størrelse Ryder Cup. Global admin er uncapped (sekretariatet kjører
 * klubb-skala). Klubb-cuper (#480/#524) har egne, uncappede regler.
 *
 * Match-taket er i praksis det bindende: 4 matcher à maks 4 spillere = ≤16
 * distinkte deltakere, godt under spiller-taket. Begge er med for robusthet.
 */

/** Maks antall matcher i en personlig cup (ikke-admin). */
export const MAX_PERSONAL_CUP_MATCHES = 4;

/** Maks antall distinkte deltakere i en personlig cup (ikke-admin). Samme
 * offentlige tak som Kompis-runder (#525). */
export const MAX_PERSONAL_CUP_PLAYERS = 24;

/**
 * True hvis `totalMatches` overskrider match-taket for en ikke-admin. Admin er
 * alltid under taket (uncapped). `totalMatches` er forventet antall matcher
 * cupen ville hatt etter handlingen (eksisterende + nye).
 */
export function exceedsPersonalMatchCap(
  totalMatches: number,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return false;
  return totalMatches > MAX_PERSONAL_CUP_MATCHES;
}

/**
 * True hvis `distinctPlayers` overskrider deltaker-taket for en ikke-admin.
 * Admin er alltid under taket (uncapped). `distinctPlayers` er forventet antall
 * distinkte deltakere etter handlingen (eksisterende ∪ nye).
 */
export function exceedsPersonalPlayerCap(
  distinctPlayers: number,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return false;
  return distinctPlayers > MAX_PERSONAL_CUP_PLAYERS;
}
