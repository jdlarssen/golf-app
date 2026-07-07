# Spec: Sideturnering — fjern preset-velger + kategorikatalog (Full pakke som eneste oppførsel)

**Issue:** #1139 · **Branch:** claude/1139-fjern-sideturnering-preset-velger

## Problem

`SideCategoriesPicker.tsx` (563 linjer) gir admin tre forhåndsvalg-chips (Klassisk / Full pakke / Egendefinert) + en katalog på 32 toggle-rader over 6 fieldsets for å skru enkelt-kategorier i sideturneringen av/på. I prod har alle 6 sideturnering-spill kjørt Full pakke (`side_disabled_categories = []`); 0 spill brukte Klassisk (dagens default) eller Egendefinert. Kontrollen er ren kompleksitet uten bruk.

Pickeren er montert to steder — `BasicsSection.tsx:294-297` (uncontrolled, GameForm/edit-pathen, emitter egne hidden inputs) og `AdvancedSettingsSection.tsx:193-198` (controlled, wizard-pathen, #1011-speiling via `GameWizard.tsx:831-838`). Server-parseren `parseSideTournamentFromFormData` ([lib/games/sideTournamentPayload.ts:63-73](lib/games/sideTournamentPayload.ts)) leser `side_disabled_categories` ubetinget fra FormData og deles av både new- og edit-actions. **Fjerner vi bare UI-en, kan en håndlaget POST fortsatt sette disabled-kategorier** — derfor må parseren hardkodes til tom liste (T3-kompensasjon).

Merk at DB-kolonnen `games.side_disabled_categories` og hele **lese-siden** (scoring i `lib/scoring/sideTournament.ts`, leaderboard-views, `computeSharerSideAwards.ts`) leser `game.side_disabled_categories ?? []` uendret. Eksisterende spill påvirkes ikke; nye spill får alltid `[]` = alle kategorier på.

## Design

Nåværende default for **nye** spill er Klassisk ([useGameFormState.ts:582-583](app/[locale]/admin/games/new/useGameFormState.ts)). Etter denne endringen får nye spill Full pakke (`[]`). Vi fjerner hele **skrive-/config-flaten** og beholder **lese-flaten** urørt.

1. **Slett komponenten + testen.**
   - `components/admin/SideCategoriesPicker.tsx` → slett hele fila.
   - `components/admin/SideCategoriesPicker.test.tsx` → slett (dekker kun preset-/katalog-oppførselen som forsvinner).

2. **Fjern mount i BasicsSection** ([app/[locale]/admin/games/new/sections/BasicsSection.tsx](app/[locale]/admin/games/new/sections/BasicsSection.tsx)):
   - Fjern import (linje 18), `initialDisabledCategories`-destructuren (linje 86), og `<SideCategoriesPicker … />`-blokka + tilhørende kommentar (linje 291-297). LD/CTP-fieldsettet rett under (linje 299+) blir stående uendret.

3. **Fjern mount i AdvancedSettingsSection** ([app/[locale]/admin/games/new/sections/AdvancedSettingsSection.tsx](app/[locale]/admin/games/new/sections/AdvancedSettingsSection.tsx)):
   - Fjern import (linje 22), `sideDisabledCategories`/`setSideDisabledCategories`-destructuren (linje 69-70), og `<SideCategoriesPicker … />`-blokka (linje 193-198). LD/CTP-fieldsettet (linje 200+) blir stående.

4. **Fjern #1011-speilingen i GameWizard** ([app/[locale]/admin/games/new/GameWizard.tsx](app/[locale]/admin/games/new/GameWizard.tsx)):
   - Fjern `side_disabled_categories`-hidden-input-map-en (linje 831-838) inne i `sideEnabled`-blokka, og `sideDisabledCategories`-destructuren (linje 798). Stram kommentaren (linje 809-815) så den ikke lenger nevner `side_disabled_categories`. `side_tournament_enabled` / `side_ld_count` / `side_ctp_count`-speilingen blir stående.

5. **Fjern controlled-state i useGameFormState** ([app/[locale]/admin/games/new/useGameFormState.ts](app/[locale]/admin/games/new/useGameFormState.ts)):
   - Fjern `CLASSIC_DISABLED_CATEGORIES`-importen (linje 6), `initialDisabledCategories`-derivasjonen (linje 582-583), `sideDisabledCategories`/`setSideDisabledCategories`-state (linje 598-600), og de tre eksportene i retur-objektet (`sideDisabledCategories`, `setSideDisabledCategories` linje 1817-1818; `initialDisabledCategories` linje 1848).

6. **Hardkod parseren til tom liste (T3-kompensasjon)** ([lib/games/sideTournamentPayload.ts](lib/games/sideTournamentPayload.ts)):
   - I `enabled === true`-grenen: fjern hele `getAll('side_disabled_categories')`-løkka (linje 60-73, inkl. checkbox-array-kommentaren) og returner `disabledCategories: []`. Feltet skal ignoreres uansett hva FormData inneholder.
   - **Fjern nå-ubrukt import.** `ALL_CATEGORY_IDS` (import-linje 6) brukes kun i løkka på linje 69; etter at løkka er borte er importen dangling. Fjern `ALL_CATEGORY_IDS` fra import-blokka (linje 5-8), behold `type SideCategoryId` (fortsatt brukt i `disabledCategories: SideCategoryId[]`). Ellers henger en død import igjen (bryter Success-kriteriet «ingen dangling referanser»; `no-unused-vars` er `warn`, så lint/build fanger den ikke).
   - Fjern union-medlemmet `'bad_side_disabled_categories'` fra `SideTournamentParseResult.errorCode` (linje 30) — det blir uoppnåelig. Consumers ([new/actions.ts:120](app/[locale]/admin/games/new/actions.ts), [edit/actions.ts:105](app/[locale]/admin/games/[id]/edit/actions.ts)) sender bare `sideResult.errorCode` inn i en URL-streng, så en smalere union er trygg (T2 — ingen visnings-map enumererer koden; grep av `bad_side_ld_count`/`bad_side_ctp_count` bekrefter ingen error-code-map).
   - Oppdater type-doc-kommentaren på `disabledCategories` (JSDoc linje 14-19, feltet linje 20) så den sier «alltid tom — kategori-config er fjernet (#1139); alle kategorier er alltid aktive for nye spill».
   - **Ingen endring i actions.ts / edit/actions.ts:** begge skriver `side_disabled_categories: sideDisabledCategories` der `sideDisabledCategories` destruktureres fra `payload.disabledCategories` ([new/actions.ts:129,236](app/[locale]/admin/games/new/actions.ts)). Etter parser-endringen er den alltid `[]`, så insert/update arver riktig verdi uten kode-endring.

7. **Fjern død config-konstant** ([lib/scoring/sideTournamentConfig.ts](lib/scoring/sideTournamentConfig.ts)):
   - `CLASSIC_ENABLED_CATEGORIES` (linje 178-185) og `CLASSIC_DISABLED_CATEGORIES` (linje 191-192) blir ubrukte etter steg 5. Fjern begge (grep bekrefter ingen andre call-sites). `ALL_CATEGORY_IDS`, `SIDE_TOURNAMENT_POINTS` og `SideCategoryId` blir stående — de brukes fortsatt av scoring + `editGameInitialValues.ts`.

8. **Oppdater berørte FormData-tester** (test-disiplin: source-endring → juster tester, ingen nye «mens jeg var her»-tester):
   - [lib/games/sideTournamentPayload.test.ts](lib/games/sideTournamentPayload.test.ts): fjern de to `bad_side_disabled_categories`-casene (linje ~116, ~133). Legg til **én** hostile-POST-guard-case: FormData med `side_disabled_categories`-entries (også en ugyldig verdi) → `result.ok === true` og `payload.disabledCategories` er `[]`. Dette låser T3-kompensasjonen.
   - [app/[locale]/admin/games/new/GameWizard.test.tsx](app/[locale]/admin/games/new/GameWizard.test.tsx): fjern `side_disabled_categories`-assertene (linje 695, 737) og `side_disabled_categories`-feltet i `initialValues` (linje 666, 708). LD/CTP-speilings-assertene beholdes — de er poenget i begge testene.
   - [app/[locale]/admin/games/new/GameForm.test.tsx](app/[locale]/admin/games/new/GameForm.test.tsx): fjern `side_disabled_categories`-assert (linje 1644) + feltet i `initialValues` (linje 1635).

9. **Bruker-synlig → PR + bump + CHANGELOG + staging-verify.**
   - Atomiske commits med `Refs #1139`; PR med `Closes #1139`.
   - `npm version minor --no-git-tag-version` (admin-flaten endrer default-oppførsel → `feat`), stage `package.json` + `package-lock.json`.
   - Én linje i `CHANGELOG.md` under **Funksjoner**, f.eks.: «Sideturneringen kjører nå alltid full pakke — forhåndsvalg-menyen og kategori-listen er borte, så oppsettet går raskere.»
   - Staging-verify før merge: opprett et spill med sideturnering på, bekreft at pickeren er borte, at spillet lagres, og at leaderboard viser full-pakke-kategoriene.

## Edge Cases & Guardrails

- **Legacy-spill med ikke-tom `side_disabled_categories`:** Prod har ingen (alle 6 = `[]`). Om et slikt spill finnes (f.eks. i staging) og redigeres og lagres på nytt, nullstiller edit-actionen `side_disabled_categories` til `[]` (parseren hardkoder tomt) — spillet bytter til Full pakke. Dette er ønsket per issuet (Full pakke som eneste oppførsel), men bygger bør bekrefte at scoring/leaderboard for et allerede-avsluttet legacy-spill ikke re-beregnes (lese-siden leser lagret kolonne; avsluttede spill redigeres ikke).
- **Hostile POST/PATCH via server-action:** Dekkes av steg 6 + guard-testen i steg 8. En rå PostgREST-PATCH direkte mot kolonnen er en separat, allerede-eksisterende RLS-flate (ikke en regresjon fra denne endringen) — se Out of Scope.
- **`GameFormValues.side_disabled_categories`-feltet** ([GameForm.tsx:94](app/[locale]/admin/games/new/GameForm.tsx)) lastes fortsatt av `editGameInitialValues.ts` + revansje-kopi, men konsumeres ikke lenger av noen picker. Det er et ufarlig dangling DB-shape-felt — la selve feltet stå (se Key Decisions). **Men:** JSDoc-en rett over (GameForm.tsx:88-93) sier «For NYE spill defaultes denne til `CLASSIC_DISABLED_CATEGORIES` … starter på Klassisk» — det blir aktivt feil etter denne endringen (nye spill får `[]` = Full pakke) og nevner en konstant som slettes i steg 7. Stram JSDoc-en til å reflektere Full-pakke-default (fjern `CLASSIC_DISABLED_CATEGORIES`-referansen), ellers dokumenterer koden en fjernet oppførsel.

## Key Decisions

1. **Behold lese-/DB-flaten urørt.** Kolonnen `games.side_disabled_categories`, scoring, leaderboard-views, `computeSharerSideAwards`, `editGameInitialValues` og revansje-kopien beholdes. De leser `?? []` og fungerer uendret for eksisterende spill. Kun skrive-/config-UI-en fjernes. Dette holder blast-radius liten og unngår en migrasjon.
2. **Hardkod parseren fremfor å ignorere feltet stille.** Å returnere `disabledCategories: []` eksplisitt (og fjerne parse-løkka) gjør T3-kompensasjonen selv-dokumenterende og testbar, i stedet for å la et ubrukt felt ligge og lese seg inn.
3. **`feat` + MINOR-bump.** Endringen er admin-synlig (kontroller forsvinner) og endrer default-oppførsel for alle nye spill → `feat`, ikke `refactor`. Én Funksjoner-linje i CHANGELOG.

**Claude's Discretion:** Eksakt CHANGELOG-formulering (kjør `humanizer` på den norske linja); nøyaktig plassering/ordlyd av guard-testen i `sideTournamentPayload.test.ts`; hvor mye av kommentar-teksten i GameWizard/parser som strammes; om `GameFormValues.side_disabled_categories`-feltet + dets loaders ryddes helt eller beholdes (anbefalt: behold, minimér blast-radius).

## Success Criteria

- [ ] `SideCategoriesPicker.tsx` + `.test.tsx` er slettet; ingen gjenværende import av `SideCategoriesPicker` i repoet.
- [ ] Opprett-spill-flyten (både wizard-steg og GameForm/edit) viser ingen forhåndsvalg-chips og ingen kategori-katalog under «Sideturnering»; LD/CTP-tellerne står igjen uendret.
- [ ] Et nytt spill opprettet med sideturnering på lagres med `side_disabled_categories = []` (Full pakke).
- [ ] `parseSideTournamentFromFormData` returnerer `disabledCategories: []` uansett hvilke `side_disabled_categories`-verdier FormData inneholder (guard-test grønn).
- [ ] `CLASSIC_ENABLED_CATEGORIES` / `CLASSIC_DISABLED_CATEGORIES` er fjernet; `bad_side_disabled_categories` er fjernet fra error-union-en; ingen dangling referanser.
- [ ] Scoring + leaderboard for eksisterende spill er uendret (lese-siden rørt-fri).
- [ ] `package.json` MINOR-bumpet + én Funksjoner-linje i `CHANGELOG.md`.
- [ ] Staging-verify utført og bevis postet på PR-en.

## Gates
- [ ] `npm run build` (fanger exhaustive-switch/type-drift i Next.js 16)
- [ ] `npm run lint`
- [ ] `npx vitest run lib/games/sideTournamentPayload.test.ts`
- [ ] `npx vitest run "app/[locale]/admin/games/new/GameWizard.test.tsx" "app/[locale]/admin/games/new/GameForm.test.tsx"`
- [ ] `npx vitest run lib/scoring/sideTournament` (bekreft lese-siden urørt)
- [ ] Staging-verify (bruker-synlig): opprett-spill → sideturnering på → lagre → leaderboard

## Files Likely Touched
- `components/admin/SideCategoriesPicker.tsx` — slettes
- `components/admin/SideCategoriesPicker.test.tsx` — slettes
- `app/[locale]/admin/games/new/sections/BasicsSection.tsx` — fjern import + destructure + mount (uncontrolled path)
- `app/[locale]/admin/games/new/sections/AdvancedSettingsSection.tsx` — fjern import + destructure + mount (controlled path)
- `app/[locale]/admin/games/new/GameWizard.tsx` — fjern #1011 hidden-input-speiling for `side_disabled_categories`
- `app/[locale]/admin/games/new/useGameFormState.ts` — fjern state + derivasjon + eksport + CLASSIC-import
- `lib/games/sideTournamentPayload.ts` — hardkod `disabledCategories: []`, fjern parse-løkke + ubrukt `ALL_CATEGORY_IDS`-import + error-union-medlem
- `lib/games/sideTournamentPayload.test.ts` — bytt `bad_side_disabled_categories`-caser mot hostile-POST-guard
- `lib/scoring/sideTournamentConfig.ts` — fjern døde `CLASSIC_*`-konstanter
- `app/[locale]/admin/games/new/GameWizard.test.tsx` — fjern `side_disabled_categories`-assertions/fixture
- `app/[locale]/admin/games/new/GameForm.test.tsx` — fjern `side_disabled_categories`-assertion/fixture
- `package.json` / `package-lock.json` / `CHANGELOG.md` — MINOR-bump + Funksjoner-linje

## Out of Scope
- DB-migrasjon / dropping av kolonnen `games.side_disabled_categories` (beholdes; eksisterende spill leser den).
- Endring av scoring-vekter eller kategori-katalogen i `lib/scoring/` (kun config-UI fjernes, ikke selve kategoriene).
- RLS/column-level-herding mot direkte PostgREST-PATCH av `side_disabled_categories` (allerede-eksisterende admin-flate, ikke en regresjon fra denne endringen; egen sak om ønsket).
- Full opprydding av `GameFormValues.side_disabled_categories` + revansje/edit-loaderne (ufarlig DB-shape-felt; se Key Decisions).
- Master-toggle «Sideturnering på/av» og LD/CTP-tellerne — uendret.
