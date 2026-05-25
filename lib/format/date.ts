/**
 * Norwegian short-date formatting helpers.
 *
 * Standardisert nb-NO-locale på tvers av appen. Vi bruker hand-rolled
 * måneds-forkortelser i stedet for `Intl.DateTimeFormat('nb-NO', { month: 'short' })`
 * fordi Intl's nb-NO `short`-format avgir månedsnavn med trailing dot
 * («mai.», «aug.») — eksisterende UI bruker pixel-stabil utgang uten dot
 * («14. mai», «3. aug»), så vi holder oss til en deterministisk tabell for
 * å unngå visuell drift på tvers av Node-versjoner / ICU-data.
 *
 * For tee-off-spesifikk formattering med Europe/Oslo-pinning, se `teeOff.ts`.
 * Disse helpers'ene leser dato-deler fra Date#getDate/getMonth/getFullYear,
 * altså browser-/server-lokal tid. For verdier som skal være TZ-stabile
 * (tee-off-tidspunkter), bruk `formatTeeOffDate` i stedet.
 */

const MONTH_NAMES_NB = [
  'jan',
  'feb',
  'mar',
  'apr',
  'mai',
  'jun',
  'jul',
  'aug',
  'sep',
  'okt',
  'nov',
  'des',
] as const;

const MONTH_NAMES_NB_LONG = [
  'januar',
  'februar',
  'mars',
  'april',
  'mai',
  'juni',
  'juli',
  'august',
  'september',
  'oktober',
  'november',
  'desember',
] as const;

/**
 * "14. mai" — dag + forkortet måned, uten år.
 *
 * Brukes i admin-lister og kort der året er underforstått (typisk
 * inneværende sesong).
 */
export function formatShortDateNb(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  return `${d.getDate()}. ${MONTH_NAMES_NB[d.getMonth()]}`;
}

/**
 * "14. mai 2026" — dag + forkortet måned + år.
 *
 * Brukes der året er meningsfullt (bane-listen, sletting-bekreftelse,
 * spiller-historikk over flere sesonger).
 */
export function formatShortDateNbWithYear(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  return `${d.getDate()}. ${MONTH_NAMES_NB[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * "mai 2026" — fullt månedsnavn lowercase + år, norsk konvensjon.
 *
 * Brukes for periode-etiketter i produkt-oppdaterings-digest (issue #202)
 * og andre flater der vi viser en hel måned som tidsperiode.
 */
export function formatMonthLongNb(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  return `${MONTH_NAMES_NB_LONG[d.getMonth()]} ${d.getFullYear()}`;
}
