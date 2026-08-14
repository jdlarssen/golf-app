# Kontrakt: Start sync-motoren globalt, ikke bare fra hull-siden (#1367)

## Problem

`startSyncListener()` (online-lytter + 30-sekunders intervall + bootstrap-
drain, `lib/sync/syncWorker.ts:153–167`) kalles i dag KUN fra
`HoleClient.tsx:341–344`. Åpner spilleren appen på spill-hjem eller leaderboard
etter at iOS drepte prosessen, drainer ingenting køen — selv med fullt nett.
Background Sync-broen i SW (`PwaBoot.tsx`) dekker ikke iOS Safari.
`SyncBanner` viser «N slag venter på lagring», men forsøker aldri selv (kun
manuell «Prøv igjen», `SyncBanner.tsx:119–127`). Systemet sier «venter» mens
ingen sending er planlagt; medspillere og admin ser stale scorer imens.

## Design

1. Ny `components/sync/SyncBoot.tsx`: `'use client'`-komponent som i en
   `useEffect` lazy-importerer sync-motoren og starter den:
   `import('@/lib/sync/syncWorker').then((m) => m.startSyncListener()).catch(() => {})`
   (samme lazy-mønster som PwaBoot-broen). Returnerer `null`.
2. Monter `<SyncBoot />` i `app/[locale]/games/[id]/layout.tsx` ved siden av
   `<SyncBanner />` (`:30`) — da drainer køen automatisk på ALLE spillsider
   (spill-hjem, leaderboard, approve, submit), som er nøyaktig scenarioet i
   issuet («åpner appen på spill-hjem eller leaderboard»). Køen er global
   (leses uten gameId-filter), så et besøk i ett spill drainer også slag fra
   andre spill.
3. Fjern `startSyncListener`-effekten i `HoleClient.tsx:341–344` og
   `startSyncListener`-spesifikatoren fra den DELTE import-linjen
   (`HoleClient.tsx:20` — `drainQueue`-importen brukes fortsatt på `:687`,
   `:708`, `:728` og skal stå). Rydd også den foreldede
   `startSyncListener`-nøkkelen i vi.mock-fabrikken i `HoleClient.test.tsx:32`.

`startSyncListener` er allerede idempotent (`started`-flagg) og SSR-trygg
(`typeof window`-guard), så flytten er ren.

## Edge Cases & Guardrails

- Spillsidene åpner allerede Dexie i dag (SyncBanner/RealtimeMount) — SyncBoot
  introduserer ingen ny IndexedDB-avhengighet på flatene den monteres på.
- Dobbel-start umulig (`started`-flagget) — men fjern likevel HoleClient-kallet
  så regelen har ett hjem (AGENTS.md trap 4).
- IKKE rør `drainQueue`-logikken, karantene-håndteringen (#668) eller
  LWW/konflikt-grenen (#688) — dette er kun et monterings-flytt.
- Dexie-databasen heter `'golf-app'` — renames aldri.
- IKKE monter i `app/[locale]/layout.tsx` (se Key Decisions — tre konkrete
  brudd følger av global montering).
- `e2e/sync/offline-sync.spec.ts` booter på `/login` nettopp fordi ingen
  sync-motor kjører der (`:236–243`) — games-layout-plasseringen bevarer den
  forutsetningen; ikke flytt monteringen uten å oppdatere den specen.

## Key Decisions

- **Games-layout, IKKE locale-layout.** Global montering ble vurdert og
  forkastet av tre verifiserte grunner: (a) `/demo` har en hard invariant om å
  aldri starte sync-motoren eller åpne Dexie `'golf-app'`
  (.forge/contracts/1042-provespill-demo.md; grep-guarden fra #1173 fanger
  ikke layout-montering), (b) `/embed/*` serveres med `frame-ancestors *` og
  iframes på klubbsider der tredjeparts-IndexedDB blokkeres — `void
  drainQueue()`-kallene ville gitt gjentatte unhandled rejections hvert 30. s,
  (c) `e2e/sync/offline-sync.spec.ts` forutsetter at `/login` er motor-fri.
  Games-layouten dekker issue-scenarioet fullt uten noen av bruddene. At
  hjem/innboks/profil ikke drainer er en akseptert avgrensning (#1391 eier
  synligheten utenfor spillsidene).
- Egen komponent framfor å utvide PwaBoot: PwaBoot er gated på
  `NODE_ENV === 'production'` (SW + hot-reload-hensyn) — sync-motoren må også
  kjøre i dev/staging.

## Success Criteria

1. Grep-bevis i PR (scopet til `app/ components/ lib/`, ekskl. tester/docs):
   `startSyncListener` har nøyaktig ett produksjons-call-site (`SyncBoot.tsx`);
   HoleClient-effekten og den foreldede mock-nøkkelen er fjernet.
2. Staging-klikkrunde: legg et slag i køen offline (flymodus), drep
   PWA-prosessen, åpne appen rett på spill-hjem med nett → Dexie-køen tømmes og
   slaget blir synlig for medspiller/leaderboard uten å besøke hull-siden
   (banneret kan blinke kort eller aldri rekke å vise — køtømmingen er
   observabelen, ikke banneret).
3. Eksisterende sync-tester (`lib/sync/*.test.ts`) og `HoleClient.test.tsx`
   uendret grønne.

## Gates

- `tsc` + `lint` + `vitest` (pre-push + CI) grønne; e2e `@gate` mot staging.
- Bruker-synlig → staging-verifisering av flyten i punkt 2 før merge.
- Commit: `fix`-prefix, patch-bump + CHANGELOG-linje, `Refs #1367`.
- Ingen ny test kreves — ren monterings-flytt; motoren har ingen direkte
  unit-dekning i dag (kun de rene hjelperne `classifyError`/`conflict`), og en
  test på selve monteringen ville vært en «mens jeg var her»-test utenfor
  scope. Noteres i PR som bevisst valg jf. test-disiplinen.

## Files Likely Touched

- `components/sync/SyncBoot.tsx` (ny)
- `app/[locale]/games/[id]/layout.tsx`
- `app/[locale]/games/[id]/holes/[holeNumber]/HoleClient.tsx` (fjern effekt +
  import-spesifikator) + `HoleClient.test.tsx` (fjern mock-nøkkel)
- `package.json`/`package-lock.json` + `CHANGELOG.md` (patch-bump, hook-krav)

## Out of Scope

- SyncBanner-synlighet og kø-drain utenfor spill-sidene (#1391 — hvis den
  bygges, gjenbrukes SyncBoot der).
- Kø-telling på tvers av spill (#1370).
- «Innloggingen er utløpt»-blindveien (#1371).
- Background Sync-utvidelser i SW.


---

## Bygge-evidens (2026-08-14, denne branchen)

- [x] **K1 grep-bevis:** `grep -rn startSyncListener app components lib` (ekskl. tester) → nøyaktig to treff: definisjonen (`lib/sync/syncWorker.ts:180`) og call-sitet (`components/sync/SyncBoot.tsx:22`). HoleClient-effekten (:403–406) og import-spesifikatoren (:20) fjernet; mock-nøkkelen i `HoleClient.test.tsx` fjernet.
- [ ] **K2 staging-klikkrunde:** utestående — gjøres i PR-fasen (staging-verify før merge).
- [x] **K3 tester:** `npx vitest run lib/sync components/sync HoleClient.test.tsx` → 8 filer, 124 tester grønne. `npm run lint` 0 errors; `npm run build` exit 0.

**Avvik fra kontrakt:** «patch-bump + CHANGELOG-linje» erstattet av `.changes/1367-syncboot-alle-spillsider.md` — versjonsregimet byttet til ukesrutine (#1562) etter at kontrakten ble skrevet.
