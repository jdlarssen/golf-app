/**
 * Personvern-vennlig visningsnavn for offentlige flater (#1022, kontrakt-
 * beslutning 3): fornavn + etternavns-initial («Ola N.»), aldri fullt
 * etternavn. Strammere enn `formatRevealName` (fullt navn + kallenavn) fordi
 * den offentlige påmeldingssiden er ment for bred deling på åpne kanaler.
 *
 * Fallback-rekkefølge: navn → kallenavn → null (raden utelates av kalleren).
 */
export function formatPublicName(user: {
  name: string | null;
  nickname: string | null;
}): string | null {
  const parts = (user.name ?? '')
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);

  if (parts.length === 0) {
    const nick = user.nickname?.trim() ?? '';
    return nick.length > 0 ? nick : null;
  }
  if (parts.length === 1) return parts[0];

  const last = parts[parts.length - 1];
  return `${parts[0]} ${last[0].toUpperCase()}.`;
}
