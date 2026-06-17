# Forge-kontrakt: #672 — Typede Supabase-klienter (schema-drift fanges ved bygging)

**Issue:** [#672](https://github.com/jdlarssen/golf-app/issues/672)
**Branch:** claude/infallible-hypatia-5167f6
**Type:** Ren refactor (ingen oppførselsendring) + prevention-infrastruktur
**Opprettet:** 2026-06-17

## Bakgrunn / hvorfor

Alle fire Supabase-klient-fabrikkene konstrueres uten `<Database>`-generic, så `lib/database.types.ts`
(håndholdt) er koblet til ingenting. Følgen: `course_holes.par` / `game_players.status` og lignende
schema-drift kompilerer grønt og feiler først i prod (rotårsaken til #641/#642/#647). Å koble inn
generic-en gjør hele bug-klassen til byggefeil. Dette issuet er prerequisitt for CI-gaten (#673).

## Målte fakta (scoping gjort 2026-06-17, før bygging)

- Repo-baseline `tsc --noEmit` = **0 feil** (helt rent i dag).
- Å koble inn generic-en gir **16 nye, mekaniske feil** (målt på throwaway-basis, revertert):
  - 10× nullable-propagering (`string | null` sendt der `string` ventes) → null-guard eller trygg default.
  - 6× utypet insert/update-payload (`Record<string,unknown>` mot typet `Insert`/`Update`) → typ lokal variabel.
  - **0 genuine schema-mismatch-bugs** i call-sites i dag (ingen kode leser en kolonne/RPC som ikke finnes).
- Typefila har driftet og MÅ regenereres først:
  - mangler `notifications.archived_at` (0098) og RPC `can_score_for`.
  - har 6 utdaterte `formats`-kolonner (`display_name`, `rules_*`, `short_description`) droppet i 0097.
  - Verifisert: ingen call-site leser de droppede `formats`-kolonnene (kun lokale prop-navn med samme navn).

## Scope-grense

- **I scope:** regenerer types fra prod → koble `<Database>` inn i de 4 fabrikkene → fiks de 16 feilene → legg til `typecheck`-npm-script.
- **Ute av scope:** CI-pipeline / `gen:types`-script / drift-diff-gate (det er #673). Realtime-`setAuth`-typing endres ikke. Ingen RLS/atferdsendring.

## Tekniske beslutninger (mine å ta — eier er ikke-teknisk)

1. **Regenerering:** bruk Supabase MCP `generate_typescript_types` (prosjekt `glofubopddkjhymcbaph`) — autoritativ baseline. Den genererte fila er allerede hentet til `/tmp/torny-audit/generated.types.ts`.
2. **Nullable-fiks (10):** foretrekk ekte null-håndtering / narrowing (guard, `?? default`, tidlig retur) der null-grenen er nåbar. Bruk `!` kun der en oppstrøms-invariant garanterer non-null — og da med en kort kommentar som forklarer invarianten. Aldri skjul en reell null-bane bak `!`.
3. **Payload-fiks (6):** typ den lokale payload-variabelen som tabellens `Insert`/`Update`-type (f.eks. `Database['public']['Tables']['leagues']['Update']`) eller bygg objektet inline i `.update()/.insert()`. For `auditLog.ts` payload: `Json`-typen.
4. **`createClient<Database>` i admin.ts** beholder eksisterende options-objekt; kun generic-parameter legges til.

## Suksesskriterier

- [ ] K1: `lib/database.types.ts` er regenerert fra prod — inneholder `notifications.archived_at` + `can_score_for`, og IKKE de 6 droppede `formats`-kolonnene.
- [ ] K2: Alle fire fabrikkene er parameterisert med `<Database>`: `createServerClient<Database>` (server.ts + middleware.ts), `createBrowserClient<Database>` (client.ts), `createClient<Database>` (admin.ts), hver med `import type { Database }`.
- [ ] K3: `npx tsc --noEmit` gir **0 feil** (alle 16 fallout-feil fikset per beslutning 2/3).
- [ ] K4: Hver av de 16 fiksene er en ekte type-korrekt løsning (guard/typet payload), ikke en `as any`/`@ts-ignore`-undertrykkelse. `git grep -n "as any\|@ts-ignore"` viser ingen NYE forekomster i de endrede filene.
- [ ] K5: `typecheck`-script lagt til i package.json (`"typecheck": "tsc --noEmit"`).
- [ ] K6: Ingen oppførselsendring — `npm test` (vitest) forblir grønn; ingen logikk-/copy-endring utenfor type-fiksene.

## Gates (kjør scoped til det som endres)

- `npx tsc --noEmit` → 0 feil (primær-gate, K3).
- `npm run lint` → ingen nye feil.
- `npm test` → grønn (K6, beviser ren refactor).
- `git grep` for nye `as any`/`@ts-ignore` i endrede filer (K4).

## Risiko / merknad

- Lav risiko: ren type-endring, ingen runtime-effekt. Største felle er å «fikse» en nullable-feil med `!` og skjule en reell null-bane — beslutning 2 adresserer dette og K4 håndhever det.
- Eier tester kun i prod; verifisering her er `tsc`/`vitest`-basert (ingen visuell flate endres).
