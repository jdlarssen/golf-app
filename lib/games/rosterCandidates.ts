/**
 * Shared roster-picker logic for the two near-identical candidate pickers: the
 * admin invite card (`InviteToGameClient`) and the creator roster picker
 * (`CreatorRosterClient`, #429). Extracted in #611.
 *
 * Only the pure name/filter logic is shared. The two surfaces keep their own
 * JSX on purpose: different i18n namespaces, the admin card shows an HCP line,
 * the empty-state UX differs, and the buttons are styled differently. Merging
 * the markup would need a dozen label/flag props — worse than the duplication.
 */
export type RosterCandidate = {
  id: string;
  name: string | null;
  nickname: string | null;
  email: string;
  /**
   * #1017: true = skygge-bruker (`users.is_guest`). Driver «Gjest»-chipen på
   * kandidat-listene. Valgfri (matcher wizard-ens `PlayerOption.isGuest?`) —
   * kilder som ikke tråder den, viser ingen chip.
   */
  isGuest?: boolean;
};

/** «Navn «kallenavn»», eller e-post som fallback når navnet mangler. */
export function rosterDisplayName(c: RosterCandidate): string {
  const base = c.name ?? c.email;
  return c.nickname ? `${base} «${c.nickname}»` : base;
}

/**
 * Case-insensitivt delstreng-søk mot navn + kallenavn + e-post, kappet til
 * `limit`. Tom søkestreng gir de første `limit` kandidatene. Generisk så
 * ekstrafelter (f.eks. admin-kortets `hcpIndex`) bevares på treffene.
 */
export function filterRosterCandidates<T extends RosterCandidate>(
  candidates: T[],
  search: string,
  limit = 25,
): T[] {
  const q = search.trim().toLowerCase();
  if (!q) return candidates.slice(0, limit);
  return candidates
    .filter((c) =>
      `${c.name ?? ''} ${c.nickname ?? ''} ${c.email}`.toLowerCase().includes(q),
    )
    .slice(0, limit);
}
