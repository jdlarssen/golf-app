# Forge-kontrakt: #721 — Umuliggjør spiller-kategori uten tee-rating i veiviseren

**Issue:** [#721](https://github.com/jdlarssen/golf-app/issues/721) · **Type:** bug/fix · **Flyt:** opprett-spill (kjerne)
**Branch:** `fix-tee-missing-rating-guard`
**Bruker-synlig:** Ja (kategori-knapper disables, kategori klemmes ved tee-bytte) → `fix(...)` + **PATCH-bump** + CHANGELOG.

---

## Bakgrunn / rot-årsak (verifisert)

En admin satte en spiller til **junior** og valgte en tee med kun herre-rating (alle Byneset North-tees har `slope_juniors`/`course_rating_juniors` = NULL). Spillet lot seg planlegge, men auto-start (#502) feilet med `tee_missing_rating` → «Runden kom ikke i gang».

Sporing (subagent, file:line):
- `getRatingForGender` ([lib/games/teeRating.ts:24](lib/games/teeRating.ts)) returnerer `null` ved manglende kategori-rating; **alle rendrede sider null-guarder** → ingen rating-forårsaket 500. Den observerte «Noe gikk galt» var transient/urelatert.
- `CourseOption.tee_boxes` bærer `has_mens`/`has_ladies`/`has_juniors` ([GameForm.tsx:28-36](app/[locale]/admin/games/new/GameForm.tsx)).
- Spiller-kategori i `playerGenders: Record<string,'M'|'D'|'J'>` ([useGameFormState.ts:224](app/[locale]/admin/games/new/useGameFormState.ts)).
- M/D/J-toggelen ([TeamsAssignmentSection.tsx:409](app/[locale]/admin/games/new/sections/TeamsAssignmentSection.tsx) tee-per-spiller + et best-ball-grid-toggle rundt :323) tilbyr alle tre uansett tee-støtte.
- Verken `canPublish` ([useGameFormState.ts:1314](app/[locale]/admin/games/new/useGameFormState.ts)) eller `missingForPublish` (~:1327) kryss-sjekker kategori mot tee-rating.

## Eier-beslutning

> «det bør ikke være mulig å velge en tee som ikke eksisterer» — gjør den ugyldige kombinasjonen **umulig å velge** i stedet for å fange den senere.

## Designbeslutning (mekanisme — mitt valg innen eierens retning)

Begrens kategori-valget til det tee-en faktisk rater. Tre lag, ingen `useEffect` (jf. #715-lærdom — bruk setter-wrappere/derivert):

1. **Derivert tilgjengelighet** i hooken:
   ```ts
   const selectedTeeBox = useMemo(
     () => availableTees.find((t) => t.id === teeBoxId) ?? null,
     [availableTees, teeBoxId],
   );
   // Ingen tee valgt ennå → ingen begrensning (default true).
   const teeGenderAvailability = useMemo(() => ({
     M: selectedTeeBox?.has_mens ?? true,
     D: selectedTeeBox?.has_ladies ?? true,
     J: selectedTeeBox?.has_juniors ?? true,
   }), [selectedTeeBox]);
   ```
2. **Klem ved tee-bytte** (setter-wrapper, speiler `setCourseId`-mønsteret):
   - Rename `useState`-setteren til `setTeeBoxIdRaw`; eksportér `setTeeBoxId` som wrapper som setter raw **og** remapper `playerGenders` for hver spiller til en tilgjengelig kategori på den nye tee-en via en ren `clampGenderToTee(g, avail)`-helper (eksportert for test). Fallback-rekkefølge `['M','D','J']`; en junior på herre-only-tee → `M`.
   - `setCourseId` nullstiller tee via `setTeeBoxIdRaw('')` (ingen klem ved tom tee).
   - **Edit-flyt:** klem KUN ved bruker-initiert tee-bytte, ikke ved mount (unngå stille endring av lagret data); backstop-guarden fanger en pre-eksisterende ugyldig tilstand.
3. **Toggle disables** ([TeamsAssignmentSection.tsx], begge toggle-steder): kategori-knapp `disabled={!teeGenderAvailability[g]}` + dempet styling + `title`/`aria` som forklarer hvorfor.
4. **Defensiv publish-backstop** (skal være unåbar via UI): `const playersWithUnratedCategory = selectedPlayerIds.filter((pid) => !teeGenderAvailability[playerGenders[pid] ?? 'M'])`. Legg `playersWithUnratedCategory.length === 0` i `canPublish`, og en melding i `missingForPublish`.

### Scope ut
- Ingen server-side håndheving i `gamePayload.ts` (auto-start håndterer manglende rating pent; dette er forebyggende UX). Notert.
- Ingen tee-dropdown-filtrering (kategori-toggelen er det naturlige stedet; tee velges først).
- Ingen jakt på den transiente 500-en (ingen rating-forårsaket 500 funnet).

---

## Akseptansekriterier

- [ ] **AC1 — Tilgjengelighet derivert.** `teeGenderAvailability` reflekterer valgt tees `has_*`; default alle-true uten valgt tee. (file:line + Type A-test.)
- [ ] **AC2 — Klem ved tee-bytte.** Junior-spiller (default `J`) + bytt til herre-only-tee → `playerGenders[pid]` blir `M`. Multi-kategori-tee bevarer eksisterende gyldig valg. (Type A-test.)
- [ ] **AC3 — `clampGenderToTee` ren + korrekt.** `it.each` over (g, avail)→forventet: J på {M} → M; D på {M,J} → M (D utilgjengelig, første tilgjengelige); M på {M,D,J} → M; J på {M,D,J} → J.
- [ ] **AC4 — Toggle disabler utilgjengelig kategori.** Begge toggle-steder: knapp for kategori tee-en ikke rater er `disabled`. (Kodelesing + evt. én fokusert render-assert.)
- [ ] **AC5 — Defensiv publish-guard.** Tving (via `setPlayerGenders`) en spiller til `J` på herre-only-tee → `canPublish === false` og `missingForPublish` inneholder kategori-rating-meldingen. (Type A-test.)
- [ ] **AC6 — i18n komplett + bilingual.** Ny bruker-copy (disabled-knapp `title` + publish-melding) finnes i `messages/no.json` **og** `messages/en.json`; `catalogParity`-test grønn; humanizer kjørt på norsk copy.
- [ ] **AC7 — Gates grønne.** Co-located test (`useGameFormState.test.ts`) + `tsc --noEmit` + `eslint` på endrede filer, alle grønne. PATCH-bump + CHANGELOG-oppføring i samme commit.

---

## Gates

```bash
npx vitest run "app/[locale]/admin/games/new/useGameFormState.test.ts"
# + evt. TeamsAssignmentSection-testfil hvis render-assert legges til
npx vitest run "lib/i18n" # catalogParity (om den ligger der) — ellers full: npx vitest run catalogParity
npx eslint "app/[locale]/admin/games/new/useGameFormState.ts" "app/[locale]/admin/games/new/sections/TeamsAssignmentSection.tsx"
npm run typecheck
```

## Test-plan (test-disiplin)

- **Type A (TDD, primær):** `clampGenderToTee` (it.each, AC3), hook-klem ved tee-bytte (AC2), `teeGenderAvailability`-derivasjon (AC1), defensiv publish-guard (AC5). Utvid COURSES-fixturen i `useGameFormState.test.ts` med en herre-only-tee + en multi-kategori-tee.
- **Type C (maks én):** kun hvis billig — én assert i en TeamsAssignmentSection-test om at en utilgjengelig kategori-knapp er `disabled`. Ellers dekkes AC4 via kodelesing + hook-drevet `teeGenderAvailability`.
- Ingen «mens jeg var her»-tester.

## Versjon / commit

- `fix(wizard): ...` med **PATCH-bump** (`npm version patch --no-git-tag-version`) + CHANGELOG-oppføring (tagline: «Når en spiller er junior/dame og tee-en mangler den ratingen, kan du ikke lenger velge den kategorien — så runden ikke stopper før den starter»). Humanizer på taglinen.
- Atomiske commits; TDD-disiplin (test → rød → grønn). Alle commits `Refs #721`.
