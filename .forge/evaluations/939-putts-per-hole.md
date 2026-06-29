# Forge-evaluering: Putt-registrering per hull (#939)

**Evaluator:** skeptical fresh-context agent
**Branch:** `claude/festive-brattain-f6ace8`, commits `3b7cc93c..HEAD`
**Dato:** 2026-06-30

## Automatiske porter (kjørt selv, Node 22)

| Gate | Resultat |
|------|----------|
| `npx tsc --noEmit` | **PASS** — exit 0, ingen feil |
| `npx eslint` (14 endrede src-filer) | **PASS** — 0 errors, 2 warnings (pre-eksisterende `complexity`-warnings på HoleClient.tsx + hole-page.tsx; ikke nye, ikke putts-relaterte) |
| `npx vitest run` (7 putts-relaterte testfiler) | **PASS** — 7 filer, 71 tester grønne |
| `npm run build` | **PASS** — exit 0, «✓ Compiled successfully in 3.8s» |

## Per-kriterium

### K1 — Schema: PASS
Staging SQL bekreftet: `putts integer, is_nullable=YES, column_default=null`. CHECK = `CHECK (((putts IS NULL) OR ((putts >= 0) AND (putts <= 10))))`. Nullable med fornuftig grense, frikoblet fra strokes. Migrasjonsfila `0123_add_scores_putts.sql:26-27` bruker `add column if not exists` (idempotent).

### K2 — RPC: PASS
Staging `pg_get_function_arguments` viser **nøyaktig én** overload: `upsert_score_if_newer(uuid,uuid,integer,integer,uuid,timestamptz,integer)` med `p_putts integer DEFAULT NULL`. `prosecdef=false` (= security invoker → RLS gjelder). Den gamle 6-arg-versjonen er droppet (`drop function if exists ...` på linje 30) → **ingen ambiguous PostgREST-overload**. Bakoverkompatibel: et 6-arg-kall resolver til default-null. INSERT- og UPDATE-grenene skriver/returnerer begge `putts`.

### K3 — Sync-merge: PASS
`writeScore.ts:52-53`: omittet felt (`undefined`) beholder eksisterende (`existing?.strokes ?? null`); eksplisitt `null` nullstiller. `writeScore.test.ts` «strokes/putts merge» dekker alle 4 contract-cases (strokes-only bevarer putts, putts-only bevarer strokes, eksplisitt null nullstiller mens omittet bevares, ny rad → putts null). Grønne.

### K4 — Sync-payload: PASS
- `syncWorker.ts:51` sender `p_putts: (score.putts ?? null) as number`.
- `syncWorker.ts:129-137` server-wins-grenen oppdaterer `putts: row.putts ?? null` lokalt (holder Dexie i sync).
- `realtime.ts:9,31` bærer `putts` i type + merge (`row.putts ?? null`).
- `RealtimeMount.tsx:19-20,34` SELECT inkluderer `putts`, merge coalescer.
- HoleClient-seed via hole-`page.tsx:582,612` (begge stier: lag-kaptein + solo) seeder `initialPutts` fra `scoreRow.putts`; seed-query (page.tsx:181-187) har INGEN strokes-not-null-filter → en putts-only-hull re-hydrerer korrekt.
- historikk-`page.tsx:172` SELECT inkluderer `putts`.
`tsc` grønn.

### K5 — Format-gate: PASS
`types.ts:317-348` `formatCapturesPutts` er en eksplisitt switch med `never`-uttømming. Returnerer `true` KUN for `solo_strokeplay | stableford | modified_stableford`; alle 19 andre moduser (best_ball, hele matchplay-/scramble-/pott-familien) → `false`. Ingen lekkasje til team/matchplay/pott. `formatCapturesPutts.test.ts` (28 cases: 3 true, 19 false, exhaustive, «exactly three») grønn.

### K6 — Opt-in UI: PASS (kode + automatiske porter; live-klikkrunde er builderens evidens, ikke re-verifisert av meg)
- Toggle (`HoleClient.tsx:852-907`) rendres KUN når `capturesPutts`; `role="switch"`, `aria-checked={puttsTracking}`, default av.
- Persistens: `torny:putts:${gameId}` i localStorage (`HoleClient.tsx:541-560`), SSR-trygg lazy-init (try/catch, samme dokumenterte hydration-trade-off som eksisterende onboarding-banner).
- `PuttsField` rendres kun når `capturesPutts && puttsTracking` (`HoleClient.tsx:942`), skriver via `onSetPutts` → `writeScore({putts})` (`HoleClient.tsx:619-630`).
- Stepper-kant-logikk (`PuttsField.tsx:31-49`): «—»→1 ved første +, − ved 0 nullstiller til null, clamp ved 10 (matcher CHECK). `PuttsField.test.tsx` 6 interaksjons-cases grønne.
- Tap-targets: begge stepper-knapper 44×44px (`PuttsField.tsx:76-77`); toggle minHeight 48. Oppfyller ≥44px.
- `disabled`: PuttsField får `cardDisabled` (submitted/withdrawn/inactive) (`HoleClient.tsx:947`); toggle disables ved submitted; `onSetPutts` gater på `disabled` (`HoleClient.tsx:620`).

### K7 — Putte-snitt: PASS
`puttsStats.ts:29-44`: kvalifiserende runde = `recordedPutts.length === 18`; snitt = sum/antall; beste = min; tom → `{0, null, null}`. `puttsStats.test.ts` (6 cases: tom, ikke-18-ignoreres, single, snitt+beste, blandet, fraksjonelt snitt) grønn. `PuttsStatPanel.test.tsx` (2: populert + tom-tilstand) grønn — re-asserter ingen Type-A-tall. Panelet er montert i Statistikk-fanen (`historikk/page.tsx:409-418`); `recordedPutts` bygges ved å filtrere non-null putts per spill (`page.tsx:296-300`). Builderens K7-advarsel (ingen live populert skjermbilde — ingen staging-bruker har ferdig 18-hulls-runde) er rimelig; datalag + render-test er oracle.

### K8 — Ingen RLS-regresjon: PASS
`putts` er en kolonne på `scores`, ikke en egen tabell — arver eksisterende rad-policies (0002 INSERT/UPDATE gater på «player not submitted», ikke per-kolonne). RPC er security invoker (bekreftet `prosecdef=false` på staging) → RLS gjelder. Putts rir nøyaktig samme skrive-sti som strokes. Ingen ny authz-flate, ingen kolonne-policy nødvendig. Korrekt analyse.

### K9 — Bump/CHANGELOG: PASS
`package.json` = 1.158.0 (minor for feat — riktig). CHANGELOG-rad «1.158 · Tell puttene dine» med #939-lenke + Funksjon-tekst. Norsk copy («slag- og stablefordspill», «under Historikk») speiler eksisterende stemme.

### K10 — Prod-rollout: N/A (deferred, confirm-gated)
Migrasjonen er kun påført staging. Prod-apply venter eksplisitt eier-bekreftelse per contract. Riktig — ikke gjort, ikke et avvik.

## Funn (severity)

1. **nit — PuttsField.test.tsx har 6 `it`-blokker.** Contract sier «maks ett Type C render-test per komponent». Disse er imidlertid distinkte interaksjons-/kant-logikk-tester (ikke re-assertering av scoring-tall), og kant-logikken er det eneste ikke-trivielle i komponenten. Forsvarlig mot endringens scope; HoleClient-suiten la IKKE til et putts-render-test (lener seg på denne). Akseptabelt, men teknisk over det bokstavelige budsjettet.

2. **nit — `formatNumber` med 1 desimal fast.** historikk-`page.tsx:302-308` formaterer snittet med min/max 1 desimal. Et heltallssnitt vises da som «36,0». Stilistisk valg, ikke en bug.

3. **observasjon (ikke en bug) — putts-only-hull i `myCompletedHoles`.** `page.tsx:193` count-query gater fortsatt på `strokes is not null`, så et hull med kun putter teller ikke som «fullført». Dette er korrekt oppførsel (et hull er ikke spilt før slag er ført), og seed-query for `initialPutts` (page.tsx:181-187) har INGEN slik filter, så putts-only-data går ikke tapt ved re-hydrering.

Ingen blockers. Ingen should-fix. Ingen sikkerhets-hull (putts er en kolonne under eksisterende rad-RLS; RPC er invoker).

## Verdikt

**ACCEPT**

Alle fire automatiske porter grønne (tsc/eslint/vitest/build), staging-skjema verifisert direkte (kolonne + CHECK + nøyaktig én RPC-overload, security invoker), sync-merge bevarer begge felt med dekkende Type-A-tester, format-gate er uttømmende og lekker ikke, UI er opt-in/SSR-trygg/disabled-respekterende med 44px tap-targets, stats kvalifiserer kun komplette 18-hulls-runder, i18n har full no/en-paritet, og bump/CHANGELOG er på plass. K10 (prod) er korrekt confirm-gated. Kun nits — ingen blocker eller should-fix.
