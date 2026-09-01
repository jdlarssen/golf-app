/**
 * Tak for personlige (frittstående) cuper (#526).
 *
 * En vanlig bruker kan lage sin egen cup blant venner, capped til Ryder
 * Cup-skala (#1883): 16 spillere per lag + kapteiner og et fullt
 * 8 foursomes + 8 four-ball + 12 singler-oppsett (28 matcher / 34
 * deltakere) skal få plass med slingringsmonn. Global admin er uncapped
 * (sekretariatet kjører klubb-skala). Klubb-cuper (#480/#524) har egne,
 * uncappede regler.
 *
 * Historikk: match-taket 4 → 16 i #1441 (splittet-cup-dag-bunten),
 * 16 → 36 i #1883. Spiller-taket delte verdi med Kompis-runde-taket
 * (#525, 24) fram til #1883 — de to er nå frikoblet, og 24-taket for
 * Kompis-runder lever videre der.
 *
 * Fixtures som ligger PÅ taket skal utledes fra konstantene under, aldri
 * skrives som litteraler — ellers går de rødt neste gang taket flyttes
 * (AGENTS.md-felle 4: en regel har ett hjem).
 */

/** Maks antall matcher i en personlig cup (ikke-admin). */
export const MAX_PERSONAL_CUP_MATCHES = 36;

/** Maks antall distinkte deltakere i en personlig cup (ikke-admin). */
export const MAX_PERSONAL_CUP_PLAYERS = 40;

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
