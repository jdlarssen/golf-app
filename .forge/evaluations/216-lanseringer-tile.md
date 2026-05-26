# Evaluation: Lanseringer-tile i Sekretariatet (#216)

**Verdict:** ACCEPT

## Criteria Verified

- [x] **`SparkleIcon` finnes i `components/icons/Icons.tsx` og er eksportert via `components/icons/index.ts`** — Definert på [components/icons/Icons.tsx:132-138](components/icons/Icons.tsx#L132-L138), eksportert på [components/icons/index.ts:21](components/icons/index.ts#L21). Følger samme `base(size)`-kontrakt som de andre 10 ikonene (24×24, currentColor, 1.5 stroke, round caps/joins).

- [x] **`/admin` viser 5 tiles for admin-rolle, 5. tile heter «Lanseringer»** — Verifisert i kode på [app/admin/page.tsx:252-288](app/admin/page.tsx#L252-L288). Admin-arrayet har 5 tiles i rekkefølgen Spill / Spillere / Baner / Resultatprotokoll / Lanseringer.

- [x] **Lanseringer-tile linker til `/admin/lanseringer`** — `href: '/admin/lanseringer'` på [app/admin/page.tsx:281](app/admin/page.tsx#L281).

- [x] **`meta`-tekst viser «Sist publisert {dato}» når data finnes, ellers «Ingen publisert ennå»** — [app/admin/page.tsx:282-284](app/admin/page.tsx#L282-L284): `lastPublishedAt ? \`Sist publisert ${formatShortDateNb(lastPublishedAt)}\` : 'Ingen publisert ennå'`. `formatShortDateNb` er importert fra `@/lib/format/date` på linje 18 og bekreftet som ekte funksjon i [lib/format/date.ts:53](lib/format/date.ts#L53).

- [x] **`TileIconKind`-unionen inkluderer `'sparkle'` og switch håndterer den** — Union på [app/admin/page.tsx:175](app/admin/page.tsx#L175), switch-case på [app/admin/page.tsx:559](app/admin/page.tsx#L559) (`if (kind === 'sparkle') return <SparkleIcon width={22} height={22} />`).

- [x] **`TilesSkeleton` renderer 5 placeholders** — [app/admin/page.tsx:340](app/admin/page.tsx#L340): `[0, 1, 2, 3, 4].map(...)`.

- [x] **`package.json` versjon er `1.28.1`** — Bekreftet i diff: `"version": "1.28.1"`. PATCH-bump fra 1.28.0 stemmer med CLAUDE.md-semantikken (tilgjengelighet-polish av eksisterende `/admin/lanseringer`-feature, ingen ny capability).

- [x] **`CHANGELOG.md` har ny oppføring under `1.28.y`-serien med stakeholder-tagline + Teknisk-details** — [CHANGELOG.md:17-31](CHANGELOG.md#L17-L31). Tagline-blockquote på linje 19, `<details><summary>Teknisk</summary>` med `#### Added` og `#### Changed` Keep-a-Changelog-underseksjoner. Plassert under den åpne 1.28.y-tema-headingen — ikke en ny serie-heading.

- [x] **Trusted-non-admin ser fortsatt KUN Baner-tile (regresjon)** — [app/admin/page.tsx:252-288](app/admin/page.tsx#L252-L288): `tiles: Tile[] = role.isAdmin ? [...5 tiles inkludert Lanseringer...] : [banerTile]`. Lanseringer ligger inne i admin-branchen; trusted-non-admin-grenen returnerer kun `[banerTile]`. RLS-policy på `product_updates` (migrasjon `0035`, `select for authenticated using (true)`) tillater også trusted-rolle å lese, men det er irrelevant siden tile-en aldri renderes for dem.

## Gates

- [x] **lint** — `npm run lint` produserer kun de 5 pre-existing-feilene i `e2e/sync/offline-sync.spec.ts` (linjer 80, 91, 101, 126, 158 — alle `@typescript-eslint/no-explicit-any`) som er etablert baseline. Ingen nye feil. Også 8 pre-existing-warnings i andre filer — ingen i de berørte filene.

- [x] **test** — `npm test`: 100 test-filer, 1164 tester, alle passerer. Varighet 12.45s.

- [x] **build** — `npm run build` fullfører uten feil. `/admin` ruten er fortsatt `ƒ` (dynamic, server-rendered). Eneste warning er den pre-existing-turbopack-workspace-root-warningen som ikke er knyttet til denne endringen.

## Concerns (if any)

Ingen blokkere. Småting verdt å notere:

1. **SVG-rendering visuelt usynlig fra evaluator-skrivebordet** — Jeg har bekreftet path-syntaksen er gyldig (M/Q/Z, lukket form, innenfor 0–24 viewBox), at base-helperen gir `stroke="currentColor"` med `fill="none"` (linje), og at SparkleIcon følger samme kontrakt som de andre 10 ikonene. Men jeg har ikke åpnet siden visuelt — kontrakten markerer eksplisitt at visuell sjekk er brukerens jobb («Brukeren tester i prod; ingen lokal Playwright her»). Hvis sparklen ser stygg ut (f.eks. for tett pinch på de konkave kantene), er det polish-justering, ikke kontrakt-brudd.

2. **Cache-konsistens akseptert av kontrakten** — `lastPublishedAt`-meta-en kan henge etter når admin publiserer en ny update, fordi `revalidatePath('/admin')` ikke kalles fra `/admin/lanseringer`-publish-action. Kontrakten markerer dette eksplisitt som «akseptabelt for admin» (Edge Cases-seksjonen). Ingen handling kreves.

3. **Ujevn 5. flis (single bottom-left tile)** — `grid-cols-2 gap-2.5` med 5 tiles gir 2+2+1-layout med en ensom flis nederst-til-venstre. Issue-en og kontrakten aksepterer dette eksplisitt; refactoring til 3-kolonner eller annen layout er ute av scope.

## Notes

- **Scope-disiplin er ren:** Diffen rører kun de 5 filene som kontrakten markerte (`app/admin/page.tsx`, `components/icons/Icons.tsx`, `components/icons/index.ts`, `package.json`, `CHANGELOG.md`) pluss en `package-lock.json`-version-bump. Ingen cache-invalidation, ingen badge-tall, ingen grid-reorganisering — alt det kontrakten eksplisitt ekskluderte.
- **RLS-sanity bekreftet:** `0035_product_updates.sql` har `select for authenticated using (true)` for `product_updates` (linjer 61-64), så admin-rollen leser direkte uten admin-client. Konsistent med kontraktens research-finding.
- **Ingen tester lagt til:** Kontrakten markerer eksplisitt at tester for UI-glue er ute av scope og dekkes av visuell sjekk + Next.js build-typecheck. Ingen eksisterende tester brekker.
- **Worktree-branchen `claude/musing-northcutt-2382dd`** har to commits: `322c186` (docs: kontrakt) + `d0d6aae` (feat: implementasjon). Bygger som forventet på `main` på `041f0d9`.

**ACCEPT.**
