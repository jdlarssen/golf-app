/**
 * Konverterer en newline-separert textarea-streng til string[] | null.
 *
 * Regler:
 * - Splitter på newline, trimmer hver linje.
 * - Filtrerer vekk tomme linjer.
 * - Hvis resulterende array er tom, returnerer null (= "bruk standardtekst").
 *
 * Brukes av `updateFormatContent`-action for rules_points-feltet.
 */
export function parsePointsTextarea(raw: string): string[] | null {
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.length > 0 ? lines : null;
}
