/**
 * Tak for personlige (frittstående) cuper (#526).
 *
 * En vanlig bruker kan lage sin egen cup blant venner, men capped til en
 * «1 helg»-størrelse Ryder Cup. Global admin er uncapped (sekretariatet kjører
 * klubb-skala). Klubb-cuper (#480/#524) har egne, uncappede regler.
 *
 * Match-taket ble hevet 4 → 16 (#1441): splittet-cup-dag-bunten er 4 matcher
 * per flight (greensome + best ball + 2 singles), så en ikke-admin som setter
 * opp en hel cup-dag selv (3 flights × 4 matcher = 12, opp mot 16 med litt
 * slingringsmonn) trenger et tak som faktisk får plass til formatet. Spiller-
 * taket (24, uendret) er nå det reelt bindende for en full 6v6-dag — 4
 * matcher à maks 2 spillere/side ville tidligere vært det bindende taket, men
 * er det ikke lenger ved 16.
 */

/** Maks antall matcher i en personlig cup (ikke-admin). */
export const MAX_PERSONAL_CUP_MATCHES = 16;

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
