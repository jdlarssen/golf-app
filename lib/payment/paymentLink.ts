/**
 * #1049: tolkning av `games.payment_link` (fritekst) ved visning.
 *
 * Feltet er fritekst — arrangøren limer inn enten et Vipps-nummer (99 %-tilfellet)
 * eller en betalingslenke (URL). Vi tolker det først ved visning, aldri ved lagring,
 * så en endret tolknings-regel ikke krever migrasjon.
 *
 * `isPaymentUrl` er også XSS-vakta: KUN `http(s)://`-lenker gjøres klikkbare.
 * Alt annet (inkl. `javascript:`, `data:`, `vipps://`, bare-tall) behandles som
 * ren tekst / Vipps-nummer og rendres uten href.
 */
export function isPaymentUrl(link: string | null | undefined): boolean {
  if (!link) return false;
  return /^https?:\/\//i.test(link.trim());
}
