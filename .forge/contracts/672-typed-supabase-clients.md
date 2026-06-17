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

- [x] K1: `lib/database.types.ts` regenerert fra prod (commit b2617a9c). Evidens: i fila nå `archived_at`×6, `can_score_for`×1, `display_name`×0 (de 6 droppede `formats`-kolonnene borte).
- [x] K2: Alle fire fabrikkene parameterisert (commit 50fd56f0): `createServerClient<Database>` i server.ts:6 + middleware.ts:24, `createBrowserClient<Database>` i client.ts:4, `createClient<Database>` i admin.ts:15; hver med `import type { Database } from '@/lib/database.types'`.
- [x] K3: `npm run typecheck` → **0 feil** (alle 16 fallout-feil fikset).
- [x] K4: Ingen nye `as any`/`@ts-ignore` — `git diff --name-only HEAD~1 | xargs grep "as any\|@ts-ignore"` = NONE. Fiksene: 5× `as string`-after-guard (codebase-idiom), 3× nullable RPC-arg-cast m/kommentar, 5× `TablesUpdate<...>`/`Json`.
- [x] K5: `"typecheck": "tsc --noEmit"` lagt til i package.json scripts (commit 50fd56f0).
- [x] K6: `npm test` → 281 filer / **3561 tester grønne**. Kun type-narrowing endret; ingen runtime-/logikk-/copy-endring.

## Gates (kjør scoped til det som endres)

- `npx tsc --noEmit` → 0 feil (primær-gate, K3).
- `npm run lint` → ingen nye feil.
- `npm test` → grønn (K6, beviser ren refactor).
- `git grep` for nye `as any`/`@ts-ignore` i endrede filer (K4).

## Risiko / merknad

- Lav risiko: ren type-endring, ingen runtime-effekt. Største felle er å «fikse» en nullable-feil med `!` og skjule en reell null-bane — beslutning 2 adresserer dette og K4 håndhever det.
- Eier tester kun i prod; verifisering her er `tsc`/`vitest`-basert (ingen visuell flate endres).
