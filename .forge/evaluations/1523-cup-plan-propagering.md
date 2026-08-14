# Evaluering: #1523 — Cup-plan propageres til genererte scheduled-matcher

**Verdikt: ACCEPT** (kode-porten). S6 (staging-klikkrunde + bevis-kommentar +
`staging-verified`-label) er en merge-port som gjenstår for hovedchatten —
kan ikke utføres i denne evalueringen og blokkerer merge, ikke aksepten av bygget.

Evaluert: 2026-08-14, branch `claude/1523-cup-plan-propagation`
(f7ab3696 test → c1818c8d fix → 3dd77279 refactor; kontrakt ec548a81).
Alle påstander under er verifisert uavhengig mot kildekoden og ved egne gate-kjøringer.

## Gate-resultater (kjørt selv, Node 22)

| Gate | Resultat |
|---|---|
| `npx vitest run lib/cup` | GRØNN — 26 filer, 451 tester |
| Nye testfiler isolert (`cupPlanPropagation.test.ts` + `planActions.test.ts`) | GRØNN — 2 filer, 22 tester |
| `npm run build` (pipefail) | GRØNN — exit 0 |

## Verifiserte kriterier (ingen blokkerende funn)

### D2 — flightIndex-rekonstruksjonen (den harde nøtta) — HOLDER

Verifisert mot genereringskoden selv, ikke builders påstand:

- `lib/cup/cupPairing.ts:216-293` (`generateSplitDayPlan`): per-format-telleren
  (`nextId`) inkrementerer greensome- og best_ball-hostene ÉN gang per
  flight-iterasjon (`flightIndex = i + 1`) → host-label-tallet == flightIndex,
  alltid. Singles-telleren går TO per flight («Singel 2f-1»/«Singel 2f») og
  radene bærer `sourceId` → propageringen bruker korrekt HOSTENS label, aldri
  den avlededes eget tall (`buildFlightIndex` i `lib/cup/cupPlanPropagation.ts`).
- Ikke-bunt (de tre eldre presetene, `generateCupPlan` i cupPairing.ts:150-191):
  `segment: 'full'`, ingen `flightIndex` → genereringen ga ren base-tid;
  propageringens `isBundleRow` = false → `undefined` → base-tid. Session-tellerne
  kan spenne flere sesjoner («Foursome 5»), men labels parses ALDRI for
  ikke-bunt-rader — ufarlig.
- Re-generering med eksisterende rader ER mulig (cap-tellingen mot
  `existingGames` i `generer/actions.ts:263-286` beviser det) — men både
  formatCounter og flightIndex restarter per kjøring, så label-tall ==
  flight-ved-generering holder per rad; propagert verdi == det genereringen
  selv ga raden. Ingen avviks-case funnet.
- `hole_segment`-skrivere: grep over hele lib/ + app/ + migrasjoner — ENESTE
  skriver er `generer/actions.ts:388` (`match.segment ?? 'full'`); DB-default
  `'full'` (0151). `isBundleRow`-diskriminatoren (`hole_segment != 'full' ||
  source_game_id != null`) er dermed trygg.
- Label-trunkering: `slice(0, MATCH_LABEL_MAX=80)` kan ikke kutte tallet —
  `cupMatchLabel` = `${FORMAT_LABEL[format]} ${n}`, maks ~13 tegn. Label uten
  slutt-tall → `undefined` → base-tid (defensivt, testet — «gjetter aldri»).

### S3 — active/finished røres aldri — HOLDER, tre lag

1. Ren funksjon filtrerer `status === 'scheduled'` (draft også ekskludert) —
   testet i `cupPlanPropagation.test.ts` («blandet status»-casen).
2. UPDATE-en gjentar `.eq('status','scheduled')` (cron-race-vernet) — assertet
   eksplisitt i `planActions.test.ts` (statusFilters-sjekken). Begge testet. ✓
3. `saveCupPlan` avviser ikke-draft-cuper (`not_draft`, planActions.ts) —
   propagering kjører kun i draft, som kontrakten beviste.

### NULL-plan-tid — HOLDER

`resolveScheduledTeeOffAt` (`lib/cup/splitDayLineup.ts:249-258`) returnerer
`null` (IKKE `undefined`) på tom base — kritisk, siden supabase-js DROPPER
undefined-felter fra payloaden. `scheduled_tee_off_at: null` skrives dermed
eksplisitt → auto-start av, speiler genereringen. Testet (8/8 rader → null).

### D3 — expectAffected-semantikken — HOLDER

- Ingen genererte matcher → `updates.length === 0` → `return true`, ingen
  UPDATE i det hele tatt (testet: «ingen genererte matcher»).
- Scheduled-matcher finnes men UPDATE treffer 0 → `NoRowsAffectedError`
  (helper krever ≥1, `lib/supabase/affectedRows.ts:53-65`) → wrapper fanger →
  `plan_matches_not_updated`, ingen redirect (testet).
- Feilkoden finnes i BEGGE locales (`messages/no.json` + `messages/en.json`,
  `cup.plan.errors`), surfaces via eksisterende `t.has('errors.X')`-mapping i
  CupPlanForm.tsx:102-104. Semantikken er ærlig: «Oppsettet er lagret, men
  matchene fikk det ikke med seg. Prøv igjen.» — planen ER upsertet på det
  punktet, og skrivingen er idempotent (testet), så «prøv igjen» er korrekt.

### S4 — UI-varselet — HOLDER

- Vises kun når `scheduledMatchCount > 0` (CupPlanForm.tsx).
- Tallet == radene som oppdateres: verifisert at `getCupSnapshot` bygger ÉN
  `CupMatchSummary` per games-rad (avledede inkludert, ingen `continue` i
  løkka; `computeCupLeaderboard.ts:186` mapper 1:1) fra SAMME
  `.eq('tournament_id', …)`-query som skrivestien bruker → identisk sett.
- Begge ruter dekket: `admin/cup/[id]/oppsett/page.tsx` og
  `klubber/[id]/cup/[cupId]/oppsett/page.tsx` renderer delt `CupPlanSetup`.
- i18n-paritet no/en med ICU-plural (`{count, plural, one{…} other{…}}`).
- React 19-fellen: ingen endring i form-oppsettet — varselet er en statisk
  `<p>`; eksisterende preventDefault+startTransition urørt.

### D5 — cache — HOLDER

`revalidateTag(\`game-${id}\`, 'max')` per oppdatert kamp (to-arg-formen) i
skrivestien; `revalidateCup` kjører på BÅDE suksess- og feilsti (planen er
lagret uansett).

### Scope + refactor-commiten — REN

- 0 filer under cron/ eller generer/ i diffen — genereringsflyten og
  auto-start-sveipet urørt.
- 3dd77279 er oppførselsbevarende flytting (eslint-kompleksitetstak):
  revalidateTag flyttet inn i skrivestien — ekvivalent på suksess-stien, og på
  delvis feil revaliderte HELLER IKKE før-versjonen de allerede skrevne id-ene
  (throw skjedde før løkka). Verifisert linje for linje mot c1818c8d.

### Commit-disiplin — HOLDER

Test-commit (f7ab3696) FØR fix-commit (c1818c8d); alle har `Refs #1523`;
`.changes/1523-cup-plan-til-matcher.md` med `type: fix` finnes.

## Ikke-blokkerende funn

- **N1 — `lib/cup/planActions.ts` (writePlanToScheduledMatches) + D5:** ved
  delvis feil (flight-gruppe 2 kaster etter at gruppe 1 er skrevet) revalideres
  IKKE gruppe 1s `game-${id}`-tags (løkka kjører kun ved full suksess) — DB
  oppdatert, cache stale til retry. Brukeren bes prøve igjen, og retry skriver
  + revaliderer alt. Samme hull fantes i før-refactor-formen. Marginal.
- **N2 — `lib/cup/planActions.ts` + D3:** race-hjørne: blir ALLE id-ene i én
  tee-off-gruppe startet av cron mellom les og skriv, kaster expectAffected og
  brukeren ser `plan_matches_not_updated` selv om hoppingen var korrekt
  oppførsel. Selv-helende: retry finner radene som ikke-scheduled → ren no-op
  → suksess. Følger kontraktens D3-bokstav; ekstremt smalt vindu.
- **N3 — `lib/cup/planActions.ts` + D1:** propageringen treffer ALLE
  `tournament_id`-rader, også evt. manuelt opprettede cup-matcher (ikke bare
  batch-genererte). De er ikke-bunt → base-tid, UI-tellingen inkluderer dem
  (varselet lyver ikke), og issue-teksten sier «matchene som ennå ikke er
  startet» — rimelig tolkning, men verdt å vite.
- **S4-evidens delvis:** humanizer-kjøring kan ikke verifiseres retroaktivt;
  copyen leser idiomatisk («fikk det ikke med seg», «får ny bane, tee og
  starttid»). Staging-skjermbilde inngår i S6-porten.

## Gjenstående før merge (hovedchattens ansvar)

- **S6:** staging-klikkrunde (cup uten starttid → generer → sett starttid →
  SQL-verifiser + auto-start), bevis-kommentar på PR, `staging-verified`-label.
- PR-opprettelse (draft-først per #1516) — branchen er lokal per evaluering.
