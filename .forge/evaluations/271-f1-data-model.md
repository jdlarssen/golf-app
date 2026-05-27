# Evaluation: F1 — Data model for formats + format_intent_mapping

**Date:** 2026-05-27
**Contract:** [.forge/contracts/271-f1-data-model.md](../contracts/271-f1-data-model.md)
**Verdict:** ACCEPT

> **Post-evaluation note (2026-05-27):** Branch was rebased onto main after
> evaluation completed because main had moved on with #217 (fourball_matchplay,
> 0045) and #266 (drop_netto_suffix, 0046). Migration was renumbered
> `0045 → 0047_formats_and_intent_mapping.sql`; seed updated to use new slug
> names (`best_ball` not `best_ball_netto`, `solo_strokeplay` not
> `solo_strokeplay_netto`) and to include `fourball_matchplay`. Version bump
> changed from `1.37.2` to `1.39.1`. Prod-DB updated to match via cascade
> rename. All 12 helper tests still pass. The verdict below reflects the
> pre-rebase state but the corrections are mechanical and don't affect the
> evaluation's conclusions.

## Success Criteria Verification

1. **Migrasjon `0045_formats_and_intent_mapping.sql` finnes og kjører grønt** — PASS
   - File exists at `supabase/migrations/0045_formats_and_intent_mapping.sql` (119 lines).
   - Confirmed applied to remote project via `list_migrations`: `20260527153711 formats_and_intent_mapping`.

2. **`select count(*) from public.formats where is_active = true` returnerer `5`** — PASS
   - `[{"active_format_count":5}]`.

3. **`select count(*) from public.format_intent_mapping` returnerer `10`** — PASS
   - `[{"mapping_count":10}]`.

4. **`games_mode_check` ikke lenger eksisterer** — PASS
   - `pg_constraint` lookup on `public.games` returns 7 CHECK constraints; none named `games_mode_check`. Remaining are unrelated (`games_hcp_allowance_pct_check`, `games_score_visibility_check`, `games_short_id_format`, side-tournament constraints).

5. **`lib/formats/getFormatsForIntent.ts` eksporterer `getFormatsForIntent` + `getCupEligibleFormats`** — PASS
   - Both functions exported. Shape matches contract (slug, display_name, icon_key, short_description, is_primary, sort_order). Sortering på `is_primary desc, sort_order asc` korrekt implementert.

6. **`lib/formats/validateGameMode.ts` eksporterer `isValidActiveGameMode(slug)`** — PASS
   - Function present, returns `Promise<boolean>`, uses `.maybeSingle()` with `is_active = true` filter as per contract.

7. **Supabase types inneholder `formats` og `format_intent_mapping`** — PASS (with path note)
   - Contract sa `lib/supabase/types.ts`, men prosjektet bruker `lib/database.types.ts`. Begge tabeller (Row/Insert/Update + Relationships) er korrekt regenerert på linjene 230–303. Path-avviket er kontrakt-staleness, ikke implementeringsfeil.

8. **Eksisterende game-leaderboard rendres identisk** — PASS (indirect verification)
   - 1500/1500 vitest-tester passerer (full suite), inkludert leaderboard-tester. Migrasjonen rører ikke `games`-schema utover å droppe en CHECK; eksisterende data er intakt (se Integration check).

9. **CHANGELOG.md har ny oppføring** — PASS
   - `### [1.37.2] - 2026-05-27` med tagline-blockquote («Klargjort under panseret …») og `<details><summary>Teknisk</summary>` med Added/Removed-seksjoner. Stilen treffer "under panseret"-tonen kontrakten ba om.
   - Mindre språklig observasjon: «etterhvert» bør egentlig være «etter hvert» (særskriving) — ikke blokker, men en humanizer-pass ville fanget det.

10. **`package.json` versjon bumpet patch** — PASS
    - Pre-build: `1.37.1`. Post-build: `1.37.2`. Korrekt patch-bump.
    - Note: kontrakten skriver `1.8.7 → 1.8.8` i CHANGELOG-eksempelet — det er stale (skrevet før en mellomliggende merge). Implementer gjorde riktig ved å bruke faktisk gjeldende versjon.

## Gates

- **`npx tsc --noEmit`** — PASS (no new errors)
  - 13 errors total, alle i pre-eksisterende test-filer (`app/admin/games/[id]/signups/actions.test.ts`, `app/games/[id]/withdrawActions.test.ts`, `app/signup/[shortId]/actions.test.ts`, `app/signup/[shortId]/teamActions.test.ts`). Verifisert pre-eksisterende via `git stash`-sammenligning: identiske feil med og uten F1-endringene. Per CLAUDE.md (`Eksisterende test-suite er ikke i samsvar`) — utenfor scope. Ingen errors i `lib/formats/`.

- **`npx vitest run lib/formats/`** — PASS
  - `Test Files 2 passed (2)`, `Tests 12 passed (12)`, 616ms. Begge helper-er har dedikerte test-filer.

- **`npm run lint`** — PASS
  - `✖ 8 problems (0 errors, 8 warnings)`. Alle warnings i pre-eksisterende filer (`app/admin/courses/...`, `app/games/[id]/leaderboard/...`); ingen i `lib/formats/`. Contract sier "0 errors required (warnings tolerated)" — oppfylt.

- **`npx vitest run`** — PASS
  - `Test Files 128 passed (128)`, `Tests 1500 passed (1500)`, 13.99s. Ingen regresjoner.

## Integration check

- **Existing game-rows still queryable?** Yes. Confirmed via `select g.game_mode, count(*), ... from games g left join formats f on f.slug = g.game_mode group by ...`:
  - `stableford` (1 row, 2026-05-24) → `has_format_row = true` ✓
  - `best_ball` (1 row, 2026-05-14) → `has_format_row = false` (orphan, see below)

- **Was the `best_ball` orphan pre-existing?** Yes. Orphan row `id e045ac34-f7ad-480b-b46b-10b1d3627ca8` was created `2026-05-14 11:14:25 UTC`. Migration `0045` was applied `2026-05-27 17:37:11 UTC` — **13 days before** the migration. Not caused by F1.
  - This row even predates migration `0033_texas_scramble.sql` (2026-05-25), which last widened `games_mode_check` — meaning the CHECK constraint at the time it was created presumably accepted `'best_ball'`. The slug was renamed `best_ball → best_ball_netto` somewhere between (likely the `drop_netto_suffix`-or-reversal cycle). The orphan is a known pre-existing data-debt, not F1's responsibility.
  - This is exactly the "soft-deactivation must not break historical games" scenario the contract explicitly designed for (no FK between `games.game_mode` and `formats.slug`). The orphan demonstrates the design choice was correct.

- **Tests touching game_mode logic still passing?** All 1500 tests green, including `lib/scoring/`-modes-tester og leaderboard-renderingstester som joiner mot game_mode.

## Schema-level spot checks (bonus, not contract criteria)

- **RLS-policies:** 4 policies konfigurert som spec'd (formats_read + formats_admin_write + format_intent_mapping_read + format_intent_mapping_admin_write).
- **Triggers:** `formats_set_updated_at` + `format_intent_mapping_set_updated_at` (BEFORE UPDATE) registrert.
- **Seed-data:** Alle 5 slugs matcher `GameMode`-union i `lib/scoring/modes/types.ts:5-10` eksakt. `singles_matchplay.is_cup_eligible = true`, øvrige `false` — riktig.
- **Mapping-distribusjon:** 4 primary + 0 sekundære i klubb (4 primary kort), 2 primary + 2 sekundære i kompis, 2 primary + 0 sekundære i solo. Stemmer med design-doc-tabellen i kontrakten.

## Findings

1. **(non-blocker, doc)** Kontrakten refererer `lib/supabase/types.ts` (success criterion #7 og "Files Likely Touched") — riktig path er `lib/database.types.ts`. Implementer regenererte riktig fil. Bare kontrakt-tekst som er stale, ingen kode-feil.

2. **(non-blocker, doc)** Kontraktens CHANGELOG-eksempel sier `1.8.7 → 1.8.8`. Faktisk versjon i repo var `1.37.1`. Implementer bumpet korrekt til `1.37.2` per faktisk state. Kontrakten ble skrevet før en mellomliggende parallell merge.

3. **(non-blocker, copy)** «etterhvert» i ny CHANGELOG-blockquote bør være «etter hvert» (særskriving) per humanizer-policy i CLAUDE.md. Bagatell — ikke verdt egen commit, kan fanges neste gang noen rører fila.

4. **(non-blocker, observasjon)** `getFormatsForIntent`-helperen bruker cache-keys `['format-intent-mapping']` mens kontrakten skrev `['format-mapping']`. Begge er taggetmed `'format-mapping'` for `revalidateTag`-kompatibilitet, men cache-key og tag er ulike concepts — implementer valgte mer beskrivende cache-keys (separate per-helper: `format-intent-mapping` vs `cup-eligible-formats`) mens beholder felles tag. Det er en god avgjørelse (ulike cache-keys → ulike memoisering per helper), men avviker fra kontraktens shape uten å nevne det. Funksjonell oppførsel identisk med contract intent.

5. **(non-blocker, ekstra defensivt)** Helperen handterer både `formats` returnert som object og array fra PostgREST (linje 58: `Array.isArray(row.formats) ? row.formats[0] : row.formats`). Kontrakten antok bare object-form. Defensiv kode + dedikert test for array-kant (`'handterer formats-relasjon som array (PostgREST kant-tilfelle)'`) — solid valg.

6. **(non-blocker, test-disiplin)** Test-filene følger Type-A-mønsteret (klassisk TDD med mocked grenser) som CLAUDE.md foreskriver for `lib/`-helpers. Assertions er presise, ingen kopier-lim av mock-oppsett mellom de to test-filene (hver bygger sin egen relevante chain). Bra disiplin.

## Recommendation

**ACCEPT.** F1 lander akkurat det kontrakten lovet og gjør det med god disiplin: schema er korrekt på remote, alle 10 success criteria er uavhengig verifiserbare, alle 4 gates passerer (med nullrelaterte pre-eksisterende warnings/errors), og det er null brukersynlig regresjon (1500 tester grønt). Den ene "orphan"-game-raden (`best_ball` istedenfor `best_ball_netto`) er bekreftet pre-eksisterende (13 dager før migrasjonen) og er nettopp scenariet kontraktens "ingen FK"-designvalg var ment å overleve — så orphan-en validerer designet snarere enn å avsløre en feil. De fem non-blocker findings er kontrakt-staleness (path + versjon) og polish-detaljer (én særskrivings-feil i CHANGELOG, dokumentasjonsavvik på cache-key-navn), ingen av dem grunn til å holde igjen merge. Foundation er klar for F2 og F3.
