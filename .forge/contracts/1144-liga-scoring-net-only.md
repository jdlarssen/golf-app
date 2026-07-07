# Spec: Liga-oppsett — kollaps scoring net/gross/both → net-only

**Issue:** #1144 · **Branch:** claude/1144-liga-scoring-net-only

## Problem

`CreateLigaForm.tsx` gir admin et 3-radio scoring-valg (Netto / Brutto / Begge) i «Oppsett»-kortet ([app/[locale]/admin/liga/new/CreateLigaForm.tsx:373-417](app/[locale]/admin/liga/new/CreateLigaForm.tsx)). Appen kjører WHS netto (CLAUDE.md), og poeng-baserte formater (stableford / modified) er allerede låst til `net` — både i UI-en (`pointsBased`-grenen viser en låst-tekst i stedet for radioene) og i server-actionen ([lib/league/actions.ts:76](lib/league/actions.ts)). Brutto/Begge gjaldt derfor kun slagspill-ligaer, og prod har **0 ligaer noensinne** — ingen har brukt valget.

**Server-hull (T3):** Fjerner vi bare UI-en, leser `createLeagueDraft` fortsatt `scoring` fra FormData for slagspill ([actions.ts:76](lib/league/actions.ts)) og godtar `gross`/`both` ([actions.ts:107](lib/league/actions.ts)). En håndlaget POST kan da fortsatt sette `scoring='gross'`. DB-CHECK-en tillater det også (`scoring text ... check (scoring in ('net','gross','both'))`, [supabase/migrations/0080_leagues.sql:29](supabase/migrations/0080_leagues.sql)). Kompensasjon: hardkod `scoring='net'` i actionen (ignorer feltet uansett format).

`createLeagueDraft` er den **eneste** insert-siten mot `leagues` (grep bekreftet — ingen andre `from('leagues').insert`). Lese-siden ([getLigaSnapshot.ts:405-407](lib/league/getLigaSnapshot.ts) + [LeagueStandingsPanel.tsx:33-58](components/league/LeagueStandingsPanel.tsx)) beregner allerede kun `net` når `scoring !== 'gross'/'both'`, så når alle nye ligaer er `net` blir Brutto-grenene der uoppnåelige men uskadelige.

## Design

1. **Hardkod net i server-actionen (T3-kompensasjon)** ([lib/league/actions.ts](lib/league/actions.ts)):
   - Erstatt linje 76 (`const scoring = isPointsBasedFormat(format) ? 'net' : str(formData, 'scoring') || 'net';`) med `const scoring = 'net';`. Feltet ignoreres uansett hva FormData inneholder. Stram kommentaren over (linje 74-75) til å si at liga alltid er netto (WHS).
   - Fjern den nå-uoppnåelige valideringen på linje 107 (`if (scoring !== 'net' && scoring !== 'gross' && scoring !== 'both') return { error: 'scoring' };`).
   - `scoring`-variabelen brukes fortsatt i `leagues.insert({ ... scoring, ... })` (linje 163) — den blir alltid `'net'`, så kolonnen fylles riktig. `isPointsBasedFormat`-importen beholdes (fortsatt brukt til `penaltyKind`, linje 82).

2. **Fjern scoring-valget i wizarden** ([app/[locale]/admin/liga/new/CreateLigaForm.tsx](app/[locale]/admin/liga/new/CreateLigaForm.tsx)):
   - Slett hele scoring-`<div className="space-y-2 mb-4">`-blokka (linje 373-417) — den inneholder `standingsLabel`-overskriften, `stablefordStandingsLocked`-teksten og net/gross/both-radioene. «Sesong-modell»-blokka rett under (linje 419+) blir stående uendret.
   - Fjern `const [scoring, setScoring] = useState<Scoring>('net');` (linje 57).
   - Fjern hidden input `<input type="hidden" name="scoring" ... />` (linje 108) — server ignorerer feltet nå.
   - Fjern `type Scoring = 'net' | 'gross' | 'both';` (linje 30) — ubrukt etter over.
   - `pointsBased` (linje 74) beholdes: fortsatt brukt i sesong-modell-/missed-/penalty-tekstene (linje 429-451, 514-517, 557). Kun bruket på linje 108 forsvinner.
   - I error-map-en (linje 84-90): fjern `scoring: 1`-oppslaget og `'scoring'`-medlemmet i type-union-en — koden kan aldri lenger returnere `{ error: 'scoring' }`.

3. **Fjern infoScoring-raden i liga-styringen** ([app/[locale]/admin/liga/[id]/LigaManagement.tsx](app/[locale]/admin/liga/[id]/LigaManagement.tsx)):
   - Slett hele info-`<div className="flex justify-between gap-2">`-raden for scoring (linje 160-165) — `dt` = `manage.infoScoring`, `dd` = `manage.scoringLabel.${league.scoring}`. Format-raden over (154-159) og standings-model-raden under (166+) blir stående.

4. **Server-guard-test (T3-lås)** ([lib/league/actions.test.ts](lib/league/actions.test.ts)):
   - Legg til **én** Type A-case i `createLeagueDraft`-suiten: en FormData som setter `scoring='gross'` skal likevel resultere i en `leagues.insert` med `scoring: 'net'`. Gjenbruk eksisterende `buildSupabaseMock`/`leagueForm()`-mønster (linje ~114-140) og assert på insert-payloaden. Dette låser at server-hullet er lukket uansett format. Ingen andre nye tester.

5. **Bruker-synlig (admin) → PR + bump + CHANGELOG + staging-verify.**
   - Atomiske commits med `Refs #1144`; PR med `Closes #1144`.
   - `npm version minor --no-git-tag-version` (admin-synlig kontroll forsvinner → `feat`), stage `package.json` + `package-lock.json`.
   - Én linje i `CHANGELOG.md` under **Funksjoner**, f.eks.: «Liga-oppsettet spør ikke lenger om netto/brutto — alle ligaer kjører netto (som resten av appen), så oppsettet går raskere.» (kjør `humanizer` på formuleringen).
   - Staging-verify før merge: åpne `/admin/liga/new`, bekreft at scoring-valget er borte, opprett en slagspill-liga, og bekreft i `/admin/liga/[id]` at scoring-info-raden er borte og at ligaen lagres.

## Edge Cases & Guardrails

- **Hostile POST med `scoring=gross`:** Dekkes av steg 1 (hardkod) + guard-testen i steg 4. En rå PostgREST-PATCH direkte mot `leagues.scoring` er en allerede-eksisterende admin-RLS-flate (ikke en regresjon fra denne endringen) — se Out of Scope.
- **Eksisterende ligaer med `scoring != 'net'`:** Prod har 0 ligaer. Skulle en `gross`/`both`-liga finnes i staging, leser lese-siden ([getLigaSnapshot.ts:405-407](lib/league/getLigaSnapshot.ts)) fortsatt kolonnen og rendrer brutto-tabellen via [LeagueStandingsPanel.tsx](components/league/LeagueStandingsPanel.tsx) — den flaten røres ikke, så gamle data brekker ikke. Kun nye ligaer tvinges til `net`.
- **Ingen ny i18n-nøkkel trengs.** Endringen fjerner bruk av nøkler, den legger ingen til.

## Key Decisions

1. **Behold lese-flaten (standings) urørt.** `getLigaSnapshot.ts:405-407`, `LeagueStandingsPanel.tsx` (Netto/Brutto-bryter + `grossOnlyCaption`), `LeagueStandingsByScoring`/`StandingsMetric`-typene og `liga.standings.*`-nøklene beholdes. Når alle nye ligaer er `net` blir brutto-grenene uoppnåelige, men uskadelige — å rive dem ut kaskaderer inn i typer + snapshot-beregning og er en uforholdsmessig endring for et LOW-PRIO subtraksjons-issue. Blast-radius holdes minimal og på skrive-flaten.
2. **Utsett DB-CHECK-innstrammingen.** Issuet nevner den som valgfri («evt. stram CHECK til net-only»). Server-hardkoden (steg 1) er den garanterte backstoppen for alle app-opprettede ligaer, og kolonnen støtter legitimt et supersett av verdier (som en enum med ubrukte medlemmer). En innstramming til `check (scoring in ('net'))` ville kreve en migrasjon + eier-gatet prod-DDL (`touch .claude/approve-prod`) som ikke kan kjøres autonomt — den blokkerer unødig for null reell gevinst (0 ligaer). Kan tas som eget follow-up-issue hvis full trap-#4-linjering ønskes senere.
3. **`feat` + MINOR-bump.** En admin-synlig kontroll fjernes fra liga-oppsettet → `feat` (speiler #1139-presedensen), MINOR-bump + én Funksjoner-linje.

**Claude's Discretion:** Eksakt CHANGELOG-formulering (kjør `humanizer` på den norske linja); nøyaktig plassering/ordlyd av guard-testen i `actions.test.ts` og hvordan insert-payloaden inspiseres via `buildSupabaseMock`; om nå-foreldreløse i18n-nøkler (`liga.create.standingsLabel`, `stablefordStandingsLocked`, `scoringNet/Gross/Both*`, `liga.create.errors.scoring`, `liga.manage.infoScoring`, `liga.manage.scoringLabel.*`) ryddes fra `messages/no.json` + `messages/en.json` (anbefalt: rydd i begge locales for balanse — men uskadelig å la ligge; `liga.standings.*`-nøklene BEHOLDES, de brukes fortsatt av standings-panelet).

## Success Criteria

- [ ] `/admin/liga/new` viser ikke lenger noe Netto/Brutto/Begge-valg; «Sesong-modell»-blokka står igjen uendret.
- [ ] `createLeagueDraft` skriver alltid `scoring: 'net'` til `leagues`, uansett hvilken `scoring`-verdi FormData inneholder (guard-test grønn).
- [ ] En ny slagspill-liga opprettes uten feil og lagres med `scoring = 'net'`.
- [ ] `/admin/liga/[id]` viser ikke lenger scoring-info-raden; øvrige info-rader (format, sesong-modell, bane-omfang, runder, deltakere) står igjen.
- [ ] `type Scoring`, `scoring`-state, hidden input og `scoring`-valideringen er fjernet; ingen dangling referanser (`npm run build` + `lint` grønt).
- [ ] `package.json` MINOR-bumpet + én Funksjoner-linje i `CHANGELOG.md`.
- [ ] Staging-verify utført og bevis postet på PR-en.

## Gates
- [ ] `npm run build` (fanger type-drift / dangling `Scoring`-referanser i Next.js 16)
- [ ] `npm run lint`
- [ ] `npx vitest run lib/league/actions.test.ts`
- [ ] Staging-verify (admin-synlig): `/admin/liga/new` (valg borte) → opprett slagspill-liga → `/admin/liga/[id]` (info-rad borte)

## Files Likely Touched
- `lib/league/actions.ts` — hardkod `scoring='net'`, fjern formData-lesing + uoppnåelig validering (T3-kompensasjon)
- `app/[locale]/admin/liga/new/CreateLigaForm.tsx` — fjern scoring-fieldset, state, hidden input, `Scoring`-type, `scoring` i error-map
- `app/[locale]/admin/liga/[id]/LigaManagement.tsx` — fjern infoScoring-info-raden
- `lib/league/actions.test.ts` — én guard-test: posted `scoring='gross'` → insert `scoring: 'net'`
- `messages/no.json` / `messages/en.json` — (discretion) rydd foreldreløse `liga.create.scoring*` / `manage.infoScoring` / `manage.scoringLabel` / `create.errors.scoring`-nøkler
- `package.json` / `package-lock.json` / `CHANGELOG.md` — MINOR-bump + Funksjoner-linje

## Out of Scope
- DB-CHECK-innstramming av `leagues.scoring` til net-only (migrasjon + eier-gatet prod-DDL) — utsatt, se Key Decisions; eget follow-up-issue hvis ønsket.
- Standings-lese-flaten: `getLigaSnapshot.ts` scoring-beregning, `LeagueStandingsPanel.tsx` Netto/Brutto-bryter + `grossOnlyCaption`, `LeagueStandingsByScoring`/`StandingsMetric`-typene — beholdes (dead-but-harmless; egen opprydding om ønsket).
- Liga standings-modeller, missed-round-penalty og modified_stableford — avvist av revisor, låst i #452-brainstorming; ikke rør.
- RLS/column-level-herding mot direkte PostgREST-PATCH av `leagues.scoring` — allerede-eksisterende admin-flate, ikke en regresjon fra denne endringen.
