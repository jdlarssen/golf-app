/**
 * Maskér en e-postadresse for visning i UI der vi vil bekrefte identitet
 * uten å eksponere hele adressen i klartekst — f.eks. autocomplete-forslag
 * i lag-påmelding (#362), der kapteinen ser co-players hen kan velge.
 *
 *   ola@gmail.com   → ol•••@gmail.com
 *   a@b.com         → a•••@b.com
 *
 * Lokaldelen vises med inntil 2 ledende tegn (1 hvis den er ≤ 2 tegn),
 * resten erstattes med en fast bullet-gruppe. Domenet beholdes helt — det
 * er sjelden sensitivt og hjelper kapteinen å skille gmail fra jobb-adresse.
 *
 * Defensiv: input uten `@` (eller tom) returneres uendret. Vi kaster aldri
 * — dette er ren display-formatering, ikke validering.
 */
export function maskEmail(email: string): string {
  const trimmed = (email ?? '').trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0) return trimmed;

  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at); // inkluderer '@'
  const visible = local.length <= 2 ? 1 : 2;
  return `${local.slice(0, visible)}•••${domain}`;
}
