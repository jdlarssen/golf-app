# Spec: Per-spiller-par på de tre gjenstående display-flatene (#252)

## Problem

Den skeptiske evalueringen av #240 ([rapport](https://github.com/jdlarssen/golf-app/blob/main/.forge/evaluations/240-per-kjonn-hull-par.md)) fant tre display-flater som fortsatt bruker `par_mens` (eller lagets representant-par) i stedet for spillerens egen `parFor(parByGender, teeGender)`. På avvikshull (der dame/junior-par skiller seg fra herre-par) gir det feil par-referanse: en damespiller med `par_ladies=5` ser «Par 4» og hennes 5-slag rendres som bogey i stedet for par. Hver flate var utenfor #240s eksplisitte scope, men må fikses før klubb-skala-test med faktiske avviksbaner.

Mønsteret er allerede etablert og kanonisert i `app/games/[id]/scorecard/page.tsx` (#240) — denne kontrakten propagerer det til de tre siste flatene.

## Prior Decisions

- **#240 — par-resolver-mønster:** Per-spiller-par leses via `parForPlayer(parByGender, teeGender)` fra `lib/games/parDisplay.ts` (UI-laget) og `parFor(hole, gender)` fra `lib/scoring/modes/parResolver.ts` (scoring-laget). Begge defaulter til `'mens'` når gender er undefined. Denne kontrakten gjenbruker `parForPlayer`.
- **#240 — avvik-indikator:** En liten `<sup>`-asterisk (`data-testid="par-aside-marker"`) vises etter par-tallet kun når `hasParDifference(parByGender)` er sant. Tooltip/aria-label kommer fra `formatOtherGendersPar(parByGender, playerGender)`, som ekskluderer seerens/eierens eget kjønn. Kanonisk referanse: `ParAsideInline` i `scorecard/page.tsx:689`.
- **#240 — `PlayerHoleCell.par`:** Leaderboard-datamodellen bærer allerede per-spiller-par per celle (`lib/leaderboard.ts:144`, satt via `parFor(hole, p.teeGender)`). Den er kun brukt til vsPar-beregning i dag, ikke til celle-tone.

## Design

Tre uavhengige flater, samme prinsipp: **bruk spillerens (eller scorekort-eierens) egen par, ikke herre-par eller lagets representant-par.**

### 1. Submit-page (`app/games/[id]/submit/page.tsx`)

«DITT KORT»-preview før innlevering. I dag mapper `ReviewBody` hver rad til `par: h.par_mens` (linje 230) uavhengig av `me.tee_gender`.

- Send `me.tee_gender` inn i `ReviewBody` (ny prop, lik `currentUserId`-mønsteret).
- I rad-mappingen: bygg `parByGender` fra `h.par_mens/par_ladies/par_juniors` og sett `par: parForPlayer(parByGender, meTeeGender)`. Behold `parByGender` på raden for asterisk-rendering.
- Par-kolonnen får en `ParAside`-asterisk (samme komponent-mønster som scorecard) med `playerGender = me.tee_gender`.
- `scoreShape`/`scoreTone` på slag-cellen leser allerede `r.par` → blir automatisk korrekt når `r.par` er per-spiller.

### 2. Approve-page (`app/games/[id]/approve/page.tsx`)

Admin/flight-mate godkjenner et annet kort. I dag bruker `details`-tabellen `h.par_mens` i både par-kolonnen og `scoreShape`/`scoreTone` (linje 280, 287–288). Eieren her er `p` (den pending spilleren), **ikke** seeren — så `p.tee_gender` driver par-valget.

- Bygg `parByGender` per hull og bruk `parForPlayer(parByGender, p.tee_gender)` for par-tall + `scoreShape`/`scoreTone`.
- Asterisk med `playerGender = p.tee_gender` (eierens kjønn ekskluderes fra «andre kjønn»-tooltipen — konsistent med scorecard, der eier = seer).
- Hvert pending-kort har sin egen eier-`tee_gender` — mappingen skjer inne i `pending.map(...)`-løkka, ikke globalt.

### 3. Leaderboard hull-fane (`app/games/[id]/leaderboard/holes/page.tsx`)

Per-spiller-rad i best-ball-hull-drilldown. I dag bruker både brutto-fargen (`scoreShape(pc.gross, row.par)`, linje 607–608) og «+/− mot par»-merket (`pc.net - row.par`, linje 586) lagets par (`row.par` = kapteinens/første medlems teeGender).

- Bytt `row.par` → `pc.par` på **begge**: brutto-shape/tone (607–608) OG netto-vs-par-merket (586). `pc.par` finnes allerede per spiller.
- **Beslutning fra diskusjon:** begge fikses, ikke bare brutto-fargen. Samme rot-årsak — å fikse halvparten etterlater feil «+/− mot par»-tall for medspiller av annet kjønn på avvikshull.
- Asterisk på hull-raden finnes allerede (`row.parByGender` + `hasParDifference`, linje 565) — uendret.

## Edge Cases & Guardrails

- **`parByGender` fraværende / alle kjønn like:** `parForPlayer` returnerer da herre-par (uendret oppførsel), og `hasParDifference` er `false` → ingen asterisk. Baner uten per-kjønn-avvik ser identisk ut som før. Dette er den vanlige casen og må forbli regresjonsfri.
- **`tee_gender` undefined:** `parForPlayer`/`parFor` defaulter til `'mens'`. `PlayerForHole.tee_gender` er ikke-nullbar per typen, så submit/approve er trygge.
- **Solo stableford (submit):** har fortsatt `me.tee_gender` — samme kodebane, ingen team. Ingen spesialhåndtering nødvendig.
- **Approve med flere pending-kort av ulikt kjønn:** hver eier får sin egen par via `p.tee_gender` inne i løkka — ikke del én `playerGender` på tvers av kort.
- **Ikke rør** par-totalen i topp-kortet på submit (`playerRating.par`) — den er allerede per-kjønn via `getRatingForGender(me.tee_gender)`.

## Key Decisions

- **Leaderboard: fiks både brutto-shape OG netto-vs-par-merke** — bruker bekreftet (samme rot-årsak, halv fiks = fortsatt feil tall).
- **Asterisk på submit + approve: ja** (akseptkriterium 4). Gjenbruk `ParAside`-mønsteret fra scorecard, ikke ny abstraksjon.

**Claude's Discretion:**
- Om `ParAside`-asterisken implementeres som lokal helper-komponent per fil (som scorecard gjør) eller løftes til delt komponent. Default: lokal per fil for å matche eksisterende stil; vurder kun løft hvis det er trivielt og reduserer duplisering uten å utvide scope.
- Eksakt prop-navn (`meTeeGender` vs `ownerGender` etc.) — match nærmeste lokale konvensjon.

## Success Criteria

- [x] Submit-page: rad-par bruker `parForPlayer(parByGender, me.tee_gender)`, ikke `h.par_mens` — `submit/page.tsx` ReviewBody får `meTeeGender`, rad-mapping bygger `parByGender` + `parForPlayer`
- [x] Submit-page: avvik-asterisk (`data-testid="par-aside-marker"`) rendres i par-kolonnen — `ParAsideInline` lagt til, kalt med `playerGender={meTeeGender}`
- [x] Approve-page: par-tall + `scoreShape`/`scoreTone` bruker scorekort-eierens (`p.tee_gender`) par — `ownerPar` beregnet per pending-kort inne i løkka
- [x] Approve-page: avvik-asterisk rendres med `playerGender = p.tee_gender` — `ParAsideInline` lagt til
- [x] Leaderboard hull-fane: både `scoreShape`/`scoreTone` OG netto-vs-par-merket bruker `pc.par` — begge endret; team-summary-raden beholder korrekt `row.par`
- [x] Ingen regresjon på baner uten avvik: `parForPlayer` defaulter til mens, `hasParDifference` false → ingen asterisk (verifisert via kodelesing + 1765 tester grønne)

**Evaluering:** VERDICT ACCEPT (6/6) — `.forge/evaluations/252-per-spiller-par-display-flater.md`

## Gates

- [ ] `npm run typecheck` passes
- [ ] `npx vitest run` passes (hele suiten grønn — ingen eksisterende test brytes)
- [ ] `npm run lint` passes (scoped til endrede filer)
- [ ] Playwright/visuell spot-sjekk: ikke påkrevd for ren par-referanse-fiks med mindre evaluator ber om det; primær verifikasjon er kodelesing + typecheck + suite

## Files Likely Touched

- `app/games/[id]/submit/page.tsx` — `ReviewBody` får `meTeeGender`-prop; rad-mapping bygger `parByGender` + `parForPlayer`; ParAside i par-kolonne
- `app/games/[id]/approve/page.tsx` — `parByGender` + `parForPlayer(.., p.tee_gender)` i pending-kort-tabell; ParAside
- `app/games/[id]/leaderboard/holes/page.tsx` — `row.par` → `pc.par` på linje ~586 og ~607–608

## Out of Scope

- Endring av `lib/scoring/`, `lib/leaderboard.ts` eller `lib/games/parDisplay.ts` — helperne finnes allerede og er testet (#240). Kun konsumentene endres.
- Reveal-/podium-/mail-flater — dekket av #240.
- Nye Type C render-tester for server-komponentene (submit/approve fetcher fra Supabase; pure-logic `parForPlayer` er allerede dekket). Per test-disiplin: ikke legg til redundante render-tester. Asterisk-logikken er testet i `HoleClient.test.tsx`.
