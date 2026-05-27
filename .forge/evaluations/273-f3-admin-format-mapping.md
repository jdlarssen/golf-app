# Evaluation: F3 — Admin format-mapping (issue #273)

**Date:** 2026-05-27
**Branch:** claude/273-mapping
**Verdict:** ACCEPT

## Criteria

### 1. Ny route `app/admin/formats/page.tsx` med matrix-UI (desktop) + tabs-fallback (mobile)
**VERIFIED.** `app/admin/formats/page.tsx:42-91` — server-component, gates med `requireAdmin`, leser `getAllFormatsWithMappings()` + `getFormatMappingAudit(50)`, rendrer `FormatsManager` (eier både matrix og tabs) + `AuditLogList`. Tabs-vs-matrix toggles via Tailwind `md:hidden` / `hidden md:block` i `FormatsManager.tsx:159-167` og `:170-283`.

> Avvik fra contract «Files Likely Touched»: implementasjonen bruker én `FormatsManager`-komponent som rendrer BÅDE desktop matrix og mobile tabs i samme DOM (Tailwind responsive classes), i stedet for de planlagte separate `FormatMatrix.tsx` / `FormatTabs.tsx` / `CupSection.tsx`-filene. Det er en bevisst forenkling som unngår dupliserte useOptimistic-state-mountings. Funksjonelt ekvivalent.

### 2. Helper `getAllFormatsWithMappings()` returnerer alle formats + mapping-rader (inkl. nulls)
**VERIFIED.** `lib/formats/getAllFormatsWithMappings.ts:41-102` — bruker `getAdminClient()`, henter alle `formats` + alle `format_intent_mapping`-rader parallelt, bygger map, fyller `mappings[intent] = null` der raden mangler (`:96-98`). Ikke `unstable_cache`-d. Sortert alfabetisk på `display_name`.

### 3. Helper `getFormatMappingAudit(limit)` returnerer joined audit-entries fra `admin_audit_log`
**VERIFIED.** `lib/formats/audit.ts:61-91` — filtrerer `event_type='format_mapping_change'`, leser `id, actor_name, payload, created_at`, mapper `payload` → `{format_slug, intent, change_type, before, after}`. Default `limit=50`.

### 4. 4 server-actions (toggleVisibility, togglePrimary, toggleCupEligible, toggleActive) skriver mutasjon + audit-rad + revalidateTag
**VERIFIED.** Alle fire i `app/admin/formats/actions.ts`:
- `toggleVisibility` `:32-111` — mutasjon (`:63-68` update / `:84-92` insert), audit (`:73-81` / `:98-106`), `revalidateTag('format-mapping', 'max')` `:109`.
- `togglePrimary` `:120-213` — mutasjon (`:165-169` update / `:186-194` insert), audit (`:175-183` / `:200-208`), `revalidateTag` `:211`.
- `toggleCupEligible` `:218-260` — mutasjon `:239-242`, audit `:248-256`, `revalidateTag` `:258`.
- `toggleActive` `:267-309` — mutasjon `:288-291`, audit `:297-305`, `revalidateTag` `:307`.

Alle fire har idempotens-sjekk («no-op hvis next===current») før mutasjon. Alle bruker `recordFormatMappingChange()` → `logAdminEvent()` → INSERT i `admin_audit_log`.

### 5. Server-validering: kan ikke deaktivere siste primary per intent; kan ikke avhuke `is_visible` på rad med `is_primary=true`
**VERIFIED.**
- `togglePrimary` last-primary-sjekk: `actions.ts:141-150`. `COUNT(primary)` for intent, hvis `<=1` redirect til `?error=last_primary`. Korrekt: når denne raden er primary og er den eneste primary, count=1 ≤ 1, blokkeres demote.
- `toggleVisibility` primary-implies-visible-sjekk: `actions.ts:58-61`. Hvis `next=false` og `existing.is_primary=true`, redirect til `?error=demote_first`.

Minor edge case: `togglePrimary`'s last-primary-sjekk kjører før idempotens-sjekk. Hvis admin klikker «remove primary» på en rad som ALLEREDE er `is_primary=false` (theoretical — UI sender `next=on` i det tilfellet), ville sjekken kunne feile falskt. I praksis ikke nåbar via UI siden klikk på `☆` sender `next=on`. Ikke-blokkerende.

### 6. `useOptimistic` på matrix-UI — celle toggles instant, server-action kjøres i bakgrunn, rollback på feil
**VERIFIED.** `FormatsManager.tsx:90-93` initialiserer `useOptimistic(initialFormats, applyAction)`. Submit-pattern `:97-108`:
```ts
startTransition(async () => {
  addOptimistic(action);
  await serverFn(fd);
});
```
Rollback-mekanikken: React 19 reverter optimistic state når transition completes. Server-action redirecter ALLTID (på success, no-op eller error) — server-side re-render av `/admin/formats` gir fersk `initialFormats` fra DB, som erstatter optimistic state. Hvis server-action validation-feiler (f.eks. `last_primary`), DB-mutasjonen kjører ikke, så re-rendered initialFormats viser opprinnelig state → optimistic update dropper. Korrekt rollback-pattern.

### 7. Mobil: 3 tabs (Kompis/Klubb/Solo) + dedikert Cup-accordion under (NOT 4 tabs)
**VERIFIED.** `FormatsManager.tsx:171-188` rendrer 3 tabs (kun `MAPPING_INTENTS = ['kompis', 'klubb', 'solo']` fra `getAllFormatsWithMappings.ts:6-10`). Cup-accordion er separat `<details>` `:245-282`, ikke en tab. Eksakt som contract.

### 8. Status-chip per format-rad: Aktiv / Inaktiv / Ny (klikkbar for active-toggle)
**VERIFIED.** `RowStatusChip.tsx:3` definerer `RowStatus = 'aktiv' | 'inaktiv' | 'ny'`. `deriveStatus` i `FormatsManager.tsx:70-77`: inaktiv hvis `!is_active`, ny hvis ingen mappings + ikke cup-eligible, ellers aktiv. Chip rendres som `<button onClick={() => handleActiveToggle(...)}>` i både desktop `:344-348` og mobile `:209-212`.

### 9. Audit-log-seksjon nederst (siste 50 entries, accordion på mobil)
**VERIFIED.** `page.tsx:84-88` rendrer `<AuditLogList entries={getFormatMappingAudit(50)} />` under matrix. `AuditLogList.tsx:65-86` bruker `<details open>` (alltid åpen) med en mobile-only summary linje (`md:hidden` på summary) — desktop ser direkte innholdet, mobile kan kollapse. Pragmatisk variant av «accordion på mobil, alltid utvidet på desktop» — funksjonelt korrekt.

### 10. Admin-tile på `/admin/page.tsx` → `/admin/formats`
**VERIFIED.** `app/admin/page.tsx:306-311` — Formats-tile med `href: '/admin/formats'`, ikon `'formats'`. Icon-mapping `:585` peker til `<FormatsIcon />` fra `components/icons/Icons.tsx:143`. Tile-meta «Styr spillformene i wizarden».

### 11. Type C render-test for matrix-view + mobile tabs + cup-section
**VERIFIED.** `FormatsManager.test.tsx` — 1 test som dekker BÅDE desktop-matrix og mobile-tabs (begge i DOM samtidig via responsive classes). Asserter format-rader, status-chip, cup-eligible-checkbox-klikk (toggleCupEligible called), primary-star-klikk (togglePrimary called med riktig FormData). +1 test for `RowStatusChip` + 2 for `AuditLogList`. Contract krevde «matrix-view + mobile tabs + cup-section» — alle tre rendres i samme test og verifiseres via formato-rad-tellinger og action-spies.

### 12. CHANGELOG-oppføring + version bump (1.40.0 → 1.41.0)
**VERIFIED.** `package.json` viser `"version": "1.41.0"`. `CHANGELOG.md:23-55` har `## 1.41.y — Admin format-mapping` tema-heading + `### [1.41.0] - 2026-05-27` med tagline-blockquote + Teknisk-details. Tidligere 1.40.y-serien er wrapped i `<details>` `:57-` som per minor-serie-konvensjon.

## Gates

- **`npx tsc --noEmit`:** Kun pre-existing test-errors i `actions.test.ts` / `teamActions.test.ts` / `withdrawActions.test.ts` / `signups/actions.test.ts` (alle relatert til Mock<typeof X>-spread issues i ikke-F3-filer). 0 nye errors fra F3.
- **`npx vitest run app/admin/formats/ lib/formats/`:** 5 test-filer / 16 tester passed.
- **`npx vitest run` (full):** 137 test-filer / 1568 tester passed.
- **`npm run lint`:** 0 errors, 9 pre-existing warnings (unused vars i leaderboard-views). Ingen F3-relaterte.

## Verdict reasoning

Alle 12 success criteria er verifisert mot konkret kode med fil:linje-referanser. Server-actions skriver audit-rad per mutasjon (gjenbruker `logAdminEvent` mot `admin_audit_log`), idempotens-sjekk forhindrer doble audit-entries, og `revalidateTag('format-mapping', 'max')` propagerer state til F1's wizard-helpers. `useOptimistic`-pattern er korrekt strukturert — `addOptimistic` inne i `startTransition`, server-action returnerer alltid en redirect som trigger re-render med fersk server-state, så optimistic update enten persisterer (på success) eller forsvinner (på validation-error / no-op). Last-primary- og demote-first-validations er begge implementert med korrekt logikk (count(primary) ≤ 1 blokkerer demote; `is_primary=true && next=false` blokkerer hide). Mobile layout har de 3 spesifikke intent-tabs + cup-accordion, ikke 4 tabs.

Avvik fra contract: `FormatMatrix.tsx` / `FormatTabs.tsx` / `CupSection.tsx` ble konsolidert til én `FormatsManager.tsx` med Tailwind responsive classes — bevisst forenkling for å unngå duplikat useOptimistic-state, ikke et tap av funksjonalitet. Hele test/lint-gate-suiten er grønn (16 F3-tester, 1568 totale, 0 lint-errors).

## Open notes

- Minor logical edge case i `togglePrimary`: last-primary-validation kjører før idempotens-sjekk. Ikke nåbar via UI (klikk på ☆ sender alltid `next=on` for non-primary, og klikk på ★ sender alltid `next=off` for primary), men kan returnere `last_primary`-error på direkte form-submit med stale state. Vurder å bytte rekkefølge (idempotens først) i en senere polish-PR.
- TypeScript-feilene i `app/signup/[shortId]/actions.test.ts` og søsken-filer er pre-eksisterende og urelatert til F3. Spores separat ifølge testing-disiplin.
- `_void before;` på `AuditLogList.tsx:34` er en uvanlig konstruksjon (kommentar antyder at `before` er reservert for fremtidig bruk). Ikke et problem, men ESLint kunne kommentere det i en review.
- Manuell verifisering (ikke i scope for kald evaluering): faktisk DB-write til `admin_audit_log`, faktisk `revalidateTag`-propagering til wizard-flyt, faktisk visuell utforming på iPhone Safari (mobile-tabs + cup-accordion).
