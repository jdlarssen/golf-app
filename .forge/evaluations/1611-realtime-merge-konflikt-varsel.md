# Evaluering: Konflikt-varsel også når begge enheter er på nett (#1611)

**Verdict: ACCEPT**

Evaluert 2026-08-18 mot `.forge/contracts/1611-realtime-merge-konflikt-varsel.md`,
branch `claude/forge-auto-1611-abdcec` (4 commits, `1d18720c..987f9d3a`). Hele
diffen lest linje for linje; alle porter kjørt på nytt av evaluator; staging-
kjøringen re-kjørt av evaluator (ikke bare godtatt fra byggerens rapport).

## Gate results (evaluatorens egne kjøringer)

| Gate | Resultat |
|---|---|
| `npx tsc --noEmit` | exit 0, ingen output |
| `npm run lint` | `✖ 56 problems (0 errors, 56 warnings)` — alle warnings pre-eksisterende (HoleClient-kompleksiteten var langt over grensa før; endringen FJERNET en gren) |
| `npx vitest run lib/sync components/sync` | `Test Files 11 passed (11)` / `Tests 145 passed (145)` |
| `npm run build` | exit 0 (full route-oversikt produsert) |
| `node scripts/weekly-release.mjs --dry-run` | 1611-notatet validerer og lander som linje i ukeblokka (fail-closed-porten passert) |

## Kriterium for kriterium

| # | Kriterium | Evaluatorens bevis |
|---|---|---|
| 1 | Pre-emption-test (kø-element venter, nyere rad, annet slag → record + overskriv + kø tømt) | `lib/sync/mergeServerScore.test.ts` «pre-emption: an incoming row that beats the drain still writes the notice» asserterer record-innhold, `strokes: 4`-overskriving OG `syncQueue.has(ID) === false`. Grønn i min kjøring. «Rød først» er verifisert strukturelt: gammel `mergeIncoming` (fjernet hunk i diffen) hadde null konflikt-logikk, så asserten kunne ikke passere mot gammel oppførsel. |
| 2 | Synket-så-overskrevet-test | Samme fil, «already synced, then overwritten from another phone: notice» — ingen kø seedet, record asserteres. Grønn. |
| 3 | Eldre/lik → ingen skriving | «an older-or-equal row (the echo of my own write) touches nothing» — asserterer rad uendret, `conflicts.size === 0` og at kø-elementet OVERLEVER. Grønn. |
| 4 | `scores.put` kun i writeScore + helper | Kjørt selv: `grep -rn "scores\.put(" app lib components` (ekskl. tester) → nøyaktig `lib/sync/writeScore.ts:64` og `lib/sync/mergeServerScore.ts:72`. Realtime.ts, RealtimeMount.tsx og HoleClient.tsx går alle via `mergeServerScore` (verifisert i diff + nåværende filinnhold). |
| 5 | Regelen på ETT sted; eksisterende suite grønn | `grep -rn "enteredBy ==="` → kun `lib/sync/conflict.ts:54–55`. `conflicts.put` kun i syncWorker.ts:145 og mergeServerScore.ts:70, begge matet av `conflictRecordFor`. SyncBanner LESER bare `forOwnScore` (visning) og er urørt. `syncWorker.ts` importerer regelen. 145/145 grønne. |
| 6 | Staging, begge på nett | **Re-kjørt av evaluator** med byggerens driver (`verify1611.mjs`, scratchpad) mot dev-serveren på :3141: rydding → markør (admin) fører 5 for medspiller, SQL bekrefter `strokes 5, entered_by = markør` → medspiller taster 4 fra egen kontekst, SQL flipper til `strokes 4, entered_by = medspiller` → markørens side viser `[data-testid=conflict-notice][data-conflict-variant=marker]` → Dexie-orakel: `{localStrokes: 5, serverStrokes: 4, forOwnScore: false}`, lokal rad = 4, kø tom → opprydding (1 rad slettet). Prod-vakt: eneste Supabase-host truffet var `snwmueecmfqqdurxedxv.supabase.co` (staging), null violations, null console-errors. `RESULTAT: ALLE STEG GRØNNE`. |
| 7 | `.changes`-notat, ingen bump | `.changes/1611-konfliktvarsel-pa-nett.md` med `type: fix` / `issue: 1611`, én linje, matcher malen i `.changes/README.md`. `git diff main...HEAD -- package.json` er tom. Notatet ligger i fix-committen (81ff4d1a), som har `Refs #1611`; alle 4 commits har Refs, test/refactor/chore-commitene korrekt uten notat. |

## Edge-case-tabellen, rad for rad

| Rad | Dekning |
|---|---|
| Eldre/lik (ekko) | mergeServerScore.test «older-or-equal … touches nothing» ✓ |
| Ingen lokal rad | «no local row: store it, no notice» ✓ |
| Tastet her + kø-element (pre-emption) | «pre-emption …» ✓ |
| Tastet her, alt synket | «already synced …» ✓ |
| Likt slag, ulik putts | «same strokes, new putts» ✓ |
| Tastet av andre / `''` fra seed | merge-test «a row someone else typed here …» (medspiller) + conflict.test «the row came from the hole seed (no known author)» (`''`) ✓ |
| `currentUserId == null` | conflict.test «falls back to the own-row proxy …» + «without a session, a marker-kept row cannot be attributed» ✓ |
| Markør-rad → `forOwnScore: false` | merge-test «a number I kept for a flight-mate …» + conflict.test ✓ — og bevist ende-til-ende på staging |
| `5 → null` / `null → 5` | conflict.test `it.each` begge retninger ✓ |
| Kø-element med `abandonedAt` | merge-test «clears a quarantined queue item too» ✓ |
| Samme bruker fra to enheter | Ingen dedikert test — men regelen leser aldri `incoming.enteredBy`, så stien er bit-for-bit identisk med «already synced»-testen. Strukturelt dekket (se funn 1). |
| Klokkeskjevhet / maks én record | Ingen dedikert test — men `conflicts`-tabellen er primærnøklet på `id` (`db.ts` v2-skjema), så `put` er upsert; LWW-vakta er uendret. Strukturelt dekket (se funn 1). |

## Defekt-jakt (prompt-punktene)

- **Kan kø-slettingen ødelegge et slag som aldri nådde serveren?** Nei.
  Slettingen skjer kun når innkommende er strikt nyere enn lokal rad, og
  `writeScore` holder rad + kø-element i lås i én transaksjon over
  `scores`+`syncQueue` — som overlapper merge-transaksjonens skop
  (`scores`+`syncQueue`+`conflicts`), så IndexedDB serialiserer dem. Enten
  lander tastingen etter (kø-elementet gjenskapes for den nyere verdien),
  eller før (merge ser nyere lokal rad → `kept-local`, køen overlever —
  eksplisitt assertert i ekko-testen). Kø-elementet beskriver alltid
  scores-radens verdi, så en slettet kø-post var alltid en verdi som tapte
  LWW — å beholde den ga bare en bortkastet RPC → `'equal'` → dequeue.
  #1457-samspillet holder: lander realtime-raden mens drain-RPC-en er i lufta,
  ser drain-transaksjonens ferskhets-sjekk avviket og returnerer
  `'edited-mid-flight'` uten å røre noe — én record (samme id, `put`), aldri to.
- **Kan seed-en gi falsk positiv?** Nei. Egen synket skriving kommer tilbake
  med LIK `clientUpdatedAt` → `>=`-vakta → `kept-local`, ingen record (bekreftet
  på staging: ingen notice før medspillerens 4). Seed-en skriver `enteredBy: ''`
  kun når innkommende VINNER — dvs. i samme øyeblikk som tallet faktisk byttes
  (og record skrives om regelen sier det). `''` matcher aldri en bruker-id, så
  en seedet rad utløser aldri selv «tastet her» senere.
- **Ikke-Dexie-await i transaksjonen?** Nei. Inne i transaksjonen: `scores.get`,
  `conflicts.put`, `scores.put`, `syncQueue.delete` — alle Dexie.
  `conflictRecordFor` og `new Date()` er synkrone. Alle tre kallere løser
  `currentDeviceUserId()` FØR merge-kallet (per event i realtime — tillatt av
  kontraktens discretion; én gang per catch-up-kjøring; én gang per seed-kjøring).
- **`>=`-ekkovakta i alle stier?** Ja — vakta er flyttet ordrett inn i
  helperen (`existing.clientUpdatedAt >= incoming.clientUpdatedAt` → `kept-local`)
  og alle tre stiene går gjennom den; drain-ens egen sti er urørt.
- **Endrer `conflictRecordFor` drain-oppførselen?** Nei. Record-id:
  `existing.id` ≡ gammel `item.scoreId` (raden hentes med
  `scores.get(item.scoreId)`). `forOwnScore`-formelen, null-sesjons-fallbacken
  og `strokesChanged`-gaten er tegn-for-tegn like den fjernede koden; alle 8
  syncWorker-tester består uendret i semantikk (kun mock-separator `#`→`:`).
- **Guardrails:** `resolveConflict` uendret (kun tillegg i samme fil), ingen
  RPC-/migrasjonsendring (fil-lista bekrefter), `>=`-vakta bevart,
  `classifyError`/karantene urørt, SyncBanner urørt, ingen Dexie-versjonsbump,
  db-navnet `'golf-app'` urørt, kø-sletting i SAMME transaksjon som `scores.put`.

## Funn

1. **Nit** — `lib/sync/mergeServerScore.test.ts` / kontraktens edge-tabell:
   radene «samme bruker fra to enheter» og «klokkeskjevhet / maks én record per
   nøkkel» har ingen dedikert test, tross kontraktens «hver ikke-N/A-rad blir en
   test». Ingen plausibel feilscenario: regelen leser aldri `incoming.enteredBy`
   (raden er identisk med en testet sti), og `conflicts` er primærnøklet på `id`
   så `put` kan ikke duplisere. Ikke blokkerende.
2. **Nit** — prosess, ikke kode: kontraktens verifikasjonstabell peker på
   «PR-kommentaren» for staging-beviset, men ingen PR eksisterer ennå
   (`gh pr list` tom). Porten «staging-bevis + `staging-verified`-label FØR
   merge» står altså igjen for økta som åpner PR-en. Evaluators egen re-kjøring
   (dette dokumentet) er nå et uavhengig bevis; driveren ligger i scratchpad
   (`verify1611.mjs`).

## Hva staging-kjøringen beviser — og ikke

Beviser: det dominerende på-nett-tilfellet ende-til-ende med ekte realtime,
ekte RPC, ekte SyncBanner-rendering og markør-varianten av copyen; at ekkoet av
egen skriving IKKE varsler (markøren så ingen notice etter sin egen 5); at
Dexie-, kø- og SQL-tilstanden konvergerer; at kun staging ble truffet.
Beviser ikke: pre-emption-vinduet (kø-element som taper mot realtime) ende-til-
ende, egen-score-varianten (`forOwnScore: true`) i UI, og catch-up-/seed-stiene
isolert (varselet kan ha kommet via realtime eller focus-catch-up — begge er
kontraktens stier). Alle disse er dekket av unit-testene på delt kode.

## Hva jeg ikke kunne verifisere

- «Rød først»-påstanden for kriterium 1–2 historisk (modulen er ny; byggeren
  demonstrerte rødt mot en stub). Strukturelt utvilsomt rødt: gammel
  `mergeIncoming` skrev aldri en record.
- Lint-tallet 56 på main (ikke re-kjørt der); ingen av de 56 ligger i endrede
  lib/sync-filer, og HoleClient-kompleksitets-warningen kan bare ha sunket.
