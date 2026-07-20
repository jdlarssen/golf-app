/**
 * Absolutt regex som matcher rot-URL-en («/») for en gitt baseURL, med
 * valgfri trailing slash og query-streng.
 *
 * `toHaveURL` sammenligner mot HELE URL-en, så mønsteret må være absolutt —
 * en path-only regex matcher aldri en redirect til `/` (#698). Host + port
 * kommer fra baseURL, som er port-styrt via `PLAYWRIGHT_PORT` (#1259), slik at
 * en worktree-isolert kjøring på en annen port fortsatt får riktig mønster.
 */
export function rootUrlPattern(baseURL: string | undefined): RegExp {
  if (!baseURL) {
    throw new Error(
      'rootUrlPattern krever baseURL — sett use.baseURL i playwright.config.ts.',
    );
  }
  const escaped = baseURL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}/?(\\?.*)?$`);
}
