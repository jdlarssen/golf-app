const NORWEGIAN_MONTHS = [
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

export interface SuggestGameNameInput {
  /** Bane-navn fra valgt course. `null` eller `''` returnerer tom streng. */
  courseName: string | null;
  /** `datetime-local`-format `'YYYY-MM-DDTHH:mm'`, eller `''` for ingen tee-off. */
  scheduledTeeOffAt: string;
}

/**
 * Bygger forslag til spillnavn ut fra valgt bane og tee-off-tid. Brukes av
 * GameWizard for å pre-fylle navn-feltet på steg 4 så admin slipper å skrive
 * det i hånd. Returnerer tom streng når bane ikke er valgt — wizard-en sikrer
 * at steg 4 ikke kan publisere før admin har skrevet inn et navn manuelt.
 *
 * Norske måneder lowercase (`mai`, ikke `Mai`) per norsk skriftspråk.
 */
export function suggestGameName({
  courseName,
  scheduledTeeOffAt,
}: SuggestGameNameInput): string {
  if (!courseName) return '';
  if (!scheduledTeeOffAt) return courseName;
  const date = new Date(scheduledTeeOffAt);
  if (Number.isNaN(date.getTime())) return courseName;
  const day = date.getDate();
  const month = NORWEGIAN_MONTHS[date.getMonth()];
  return `${courseName} ${day}. ${month}`;
}
