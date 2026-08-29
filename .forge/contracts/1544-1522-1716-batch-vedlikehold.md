# Spec: Batch-vedlikehold — bounded fan-out (#1544), getCupSnapshot-refactor (#1522), hull-dekomponering (#1716)

Eierbestilling 2026-08-29: «fiks mange issues» (batch-mønsteret fra 2026-08-15, jf.
CLAUDE.md §Branch + PR-flyt). Én PR, én commit per issue, `Refs #N` i hver commit-body.
Branch: `claude/mange-issues-a70214` (fra origin/main `a7a7f5a0`).

I samme økt lukkes #1759, #1572 og #1469 med bevis uten kode (dokumentert her for
sporbarhet; de inngår ikke i bygge-løkken).

## Problem

Tre vedlikeholds-issues uten produktvalg:

1. **#1544:** `startTournament`/`finishTournament` i `lib/cup/actions.ts` gjør ubegrenset
   `Promise.allSettled` over alle deltakere — først ett `notify()`-kall per deltaker (via
   `notifyParticipantsCupStarted/Finished` i `lib/notifications/events.ts:211–278`), så
   én Resend-mail per off-app-deltaker (`actions.ts:278–302` og tilsvarende i finish,
   ~447–466). Ved klubb-skala (~150) er det ~300 samtidige DB-operasjoner + ~150 mailer i
   én burst; Vercel-timeout midt i gir delvis varslet felt.
2. **#1522:** `getCupSnapshot` (`lib/cup/getCupSnapshot.ts:200`) har syklomatisk
   kompleksitet 66 (grense 25, warning-only). Verifisert på HEAD 2026-08-29 med
   `npx eslint`.
3. **#1716:** `HoleClient.tsx` (kompleksitet 123, 1374 linjer) og `page.tsx` (114, 1062
   linjer) i `app/[locale]/games/[id]/holes/[holeNumber]/` er appens mest sentrale flate
   og vokser per feature. Verifisert på HEAD 2026-08-29.

## Research Findings

- Ingen eksisterende concurrency-/pulje-helper i `lib/` (grep `pLimit|p-limit|
  mapWithConcurrency|inBatches|chunked` → 0 treff). Helper må lages.
- `notify()` (lib/notifications) inserter in-app-varsel og returnerer
  `shouldAlsoSendMail` — callerne filtrerer mail-mottakere på den. Mønsteret beholdes.
- Eksisterende `lib/cup/`-stil: rene funksjoner med Type A-tester (`it.each`), f.eks.
  `computeCupLeaderboard.ts`, `matchSubmissionStatus.ts` (utdrag #1488). Kopiér stilen.
- Next 16: middleware = `proxy.ts`; ingen nye Next-API-er trengs i noen av de tre —
  #1716 FLYTTER kode, innfører ikke nye rammeverks-mønstre. Ved tvil: les
  `node_modules/next/dist/docs/`.

## Design

### #1544 — pulje-kjørt fan-out (fix, `[no-changelog]`)

Ny helper `lib/async/allSettledInBatches.ts`:

```ts
export async function allSettledInBatches<T, R>(
  items: readonly T[],
  fn: (item: T) => Promise<R>,
  batchSize = 20,
): Promise<PromiseSettledResult<R>[]>
```

- Kjører `fn` over `items` i sekvensielle puljer på `batchSize` (Promise.allSettled per
  pulje), returnerer flat liste der `result[i]` svarer til `items[i]`.
- Kant-tabell (hver rad = Type A-test): tom liste → `[]` uten kall · ett element → én
  pulje · nøyaktig `batchSize` → én pulje · `batchSize+1` → to puljer (verifiser
  sekvensiell kjøring, f.eks. via teller for samtidige kall) · rejection i pulje 1
  stopper ikke pulje 2, og rejected-resultatet står på riktig indeks · rekkefølge bevart ·
  `batchSize < 1`/ikke-heltall → clamp til 1 (aldri throw — dette er best-effort-stier).
- Fire call-sites byttes fra `Promise.allSettled(map(...))` til helperen med default 20:
  1. `notifyParticipantsCupFinished` (`lib/notifications/events.ts:216`)
  2. `notifyParticipantsCupStarted` (`lib/notifications/events.ts:256`)
  3. mail-fan-outen i `startTournament` (`lib/cup/actions.ts:278`)
  4. mail-fan-outen i `finishTournament` (`lib/cup/actions.ts` ~447)
  Feilhåndteringen rundt (console.error per rejected, try/catch, best-effort) er uendret.
  Linjenumre er omtrentlige — grep, ikke tell.
- IKKE rør andre fan-outs (gameFinished etc.) — de er utenfor issuets scope.

### #1522 — getCupSnapshot-dekomponering (refactor)

Trekk per-ansvar-helpers ut av game-loopen, i samme ånd som
`computeSubmissionStatusByGame` (#1488) allerede er trukket ut. Issuets tre pekere:

- match-resultat-grenen (best_ball vs. matchplay-dispatch vs. reveal-gating)
- `matchGameMode`-nøstingen (lang ternær kjede) → oppslagskart/`Record`
- sidepoeng-utfoldingen (gir-folding + slotCount)

Krav: rene funksjoner (ingen IO) i egne filer under `lib/cup/`, hver med Type A-tester i
`lib/cup/`-stilen. `getCupSnapshot`s eksporterte signatur og returverdi er UENDRET —
dette er ren flytting. Funksjonen leser med service-role for breddeflater (#1542):
autz-modellen (gate på call-site) skal ikke røres. Kompleksitetsmål: `getCupSnapshot`
≤ 25 (ingen eslint-warning), og ingen NY funksjon over 25 (ikke flytt warningen).

### #1716 — hull-side-dekomponering (refactor)

`HoleClient.tsx` og `page.tsx` deles opp etter issuets pekere:

- søsken-logikken (søsken-union, den 4. `useLiveQuery`-en fra #1578) → egen hook/modul
  (f.eks. `useSiblingScores.ts` el.l. i samme katalog)
- server-fetchene i `page.tsx` → egen data-modul (f.eks. `holePageData.ts`)
- store JSX-grener → subkomponenter der det senker kompleksiteten reelt

Krav: INGEN oppførselsendring — ren flytting. Vokt disse fellene:
- Alltid-monterte hidden inputs i skjemaer MÅ forbli alltid-monterte (#1011; heed
  advarselen i `components/ui/Disclosure.tsx`).
- `'use client'`-grensen: ikke eksporter client-symboler inn i server-kode (Next 16
  wrapper dem som throw-fns). Nye client-moduler får egen `'use client'`.
- Dexie/`useLiveQuery`-hooks flyttes som de er — ingen endring i query-logikk.
- Ingen nye render-tester (Type C-regelen); eksisterende suite + e2e er nettet.
Kompleksitetsmål: ingen complexity-warning i `app/[locale]/games/[id]/holes/[holeNumber]/`
etter refactor (i dag 123 + 114), og ingen NY funksjon/modul over 25.

## Edge Cases & Guardrails

- #1544: en rejection i én pulje må ikke hindre senere puljer; resultat-indeksering må
  bevares (callerne matcher `results[i]` mot mottaker-lista implisitt via rekkefølge).
- #1522: reveal-gating (matchplay-familien har ingen podium/reveal — memory) må bevares
  bit for bit; test-fikstur fra eksisterende oppførsel FØR flytting ved tvil.
- #1716: FormData-stier (submit av score) er fredet — flytt aldri et input ut av
  DOM-treet betinget. `data-testid`-attributter beholdes (e2e asserter på dem).
- Generelt: ingen endring i noen `.sql`, `supabase/`, RLS eller mail-templates.

## Key Decisions

- Pulje-størrelse 20, sekvensielle puljer (issuets eget forslag; kø/cron-alternativet er
  avvist som overengineering nå — kan gjenåpnes hvis Resend-kvote faktisk treffes).
- #1544 er `fix` med `[no-changelog]`: ikke bruker-observerbart i dag (ingen klubb-cup
  > 24 deltakere finnes) → ingen `.changes/`-notat.
- #1522/#1716 er `refactor` → ingen `.changes/`-notat.
- Én PR for hele batchen, draft-først (#1516), `gh pr ready` sist.

**Claude's Discretion:** navn/plassering av nye moduler, testfil-struktur, subkomponent-
snitt i #1716 — så lenge kravene over holdes.

## Success Criteria

- [x] S1 (#1544): `lib/async/allSettledInBatches.ts` finnes; alle kant-tabell-rader har
      Type A-test; `npx vitest run lib/async` grønn.
      EVIDENS (hovedchat-verifisert 2026-08-29): 13/13 tester, exit 0. Commit 7c85b73c.
- [x] S2 (#1544): de fire fan-outene går via helperen; `grep -n "Promise.allSettled"
      lib/notifications/events.ts lib/cup/actions.ts` viser ingen ubegrenset deltaker-
      fan-out igjen i start/finish-stiene.
      EVIDENS: grep gir kun events.ts:50/133/181 (gameFinished/Started/Reopened — utenfor
      scope) og actions.ts:879 (swapCupMatchPlayer, fast 2-elements array). Commit 7c85b73c.
- [x] S3 (#1522): `npx eslint lib/cup/` → ingen complexity-warning for `getCupSnapshot`
      (og ingen ny funksjon over 25); `npx vitest run lib/cup` grønn; signatur uendret.
      EVIDENS: eneste warning igjen er pre-eksisterende createTournamentDraft 30
      (actions.ts:101, eget issue). getCupSnapshot 66→21, alle nye helpers ≤7.
      vitest lib/cup 36 filer/617 tester grønne, 0 eksisterende tester endret.
      Commit 7ccfd12b.
- [x] S4 (#1716): `npx eslint "app/[locale]/games/[id]/holes/[holeNumber]/"` → ingen
      complexity-warning; `npx vitest run` for katalogens co-located tester grønn.
      EVIDENS: eslint helt ren (hovedchat-verifisert). HoleClient 1374→545 linjer
      (123→6), HolePage 1062→328 (114→20), maks i katalogen nå 20. 93/93 co-located
      tester grønne uendret; data-testid-/rolle-sett diffet identisk mot HEAD.
      Commit 44f96ebb.
- [x] S5 (alle): `npx tsc --noEmit` og `npm run build` grønne; full `npx vitest run`
      grønn (exit 0, ingen unhandled errors — jf. falsk-grønn-fella).
      EVIDENS: tsc exit 0 (hovedchat-verifisert på 44f96ebb); `npm run build` exit 0 og
      full vitest 510 filer/6820 tester exit 0 (kjørt av bygger C på samme HEAD 44f96ebb;
      route-tabellen diffet identisk mot baseline — 124 ruter, hull-ruta fortsatt PPR).
- [ ] S6 (PR): CI på PR-en (verify + e2e @gate + scan) grønn — e2e-gaten mot staging ER
      staging-beviset for at hull-flyt og cup-flyt er uendret.
- [ ] S7 (bevislukkinger): #1759 og #1572 lukket med `## Teknisk`/`## Funksjonell`-
      kommentar; #1469 avgjort av denne PR-ens egen push (lukk hvis pull_request-
      workflows fyrer automatisk; ellers dokumentér og la stå).

## Gates

Per chunk (bygger kjører selv før commit):
- [ ] `npx tsc --noEmit`
- [ ] `npx vitest run <berørte mapper/filer>` (co-located tester for hver endret fil)
- [ ] `npx eslint <berørte filer>` — 0 errors, og complexity-målet for chunkens issue

Før PR (hovedchat):
- [ ] `npm run build` (full gate, §T2 — fanger cacheComponents-feil tsc ikke ser)
- [ ] `npx vitest run` full — exit 0

## Files Likely Touched

- `lib/async/allSettledInBatches.ts` + `.test.ts` — NY
- `lib/notifications/events.ts` — to fan-outs via helper
- `lib/cup/actions.ts` — to mail-fan-outs via helper
- `lib/cup/getCupSnapshot.ts` — slankes; NYE helper-filer + tester i `lib/cup/`
- `app/[locale]/games/[id]/holes/[holeNumber]/HoleClient.tsx`, `page.tsx` — slankes;
  NYE hook-/data-/subkomponent-filer i samme katalog

## Out of Scope

- `createTournamentDraft` kompleksitet 30 (`lib/cup/actions.ts:100`) — observert, eget
  funn; files som issue eller nevnes for eier, fikses IKKE her.
- gameFinished-/invitasjons-fan-outs (andre enn cup start/finish).
- Kø/cron-arkitektur for varsler (#1544s alternativ B).
- #1769 (loop-designbeslutning), #1378 (liga fryst), #1229/#1492/#1305 (parkert uten
  pull), #1303 (eierbeslutning) — bevisst IKKE med i batchen.
- Dead-man's-switch for GitHub-cron (#1759s oppfølgingsforslag — kun hvis mønsteret
  gjentar seg).
