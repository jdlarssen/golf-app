# Evaluering: #1367 SyncBoot

**Verdikt: ACCEPT**

## Kriterier

- **K1 (grep-bevis): PASS** — Egen grep i `app/ components/ lib/`: `startSyncListener` har nøyaktig ett produksjons-call-site (`components/sync/SyncBoot.tsx:22`) pluss definisjonen (`lib/sync/syncWorker.ts:180`); øvrige treff er kun kommentarer i den urørte e2e-specen. HoleClient-effekten og import-spesifikatoren er fjernet (diff bekreftet), mock-nøkkelen i `HoleClient.test.tsx` er fjernet, og `drainQueue` er fortsatt importert (`HoleClient.tsx:20`) og brukt (`:753`, `:774`, `:794`).
- **K2 (staging-klikkrunde): DEFERRED** — gjøres i PR-fasen (staging-verify før merge), utenfor denne evalueringens scope.
- **K3 (tester): PASS** — Kjørt selv på Node 22: `npx vitest run lib/sync components/sync HoleClient.test.tsx` → 8 filer, 124 tester grønne.

## Guardrails (verifisert)

- SyncBoot er KUN montert i `app/[locale]/games/[id]/layout.tsx` (repo-wide grep); `app/[locale]/layout.tsx` er urørt. `/demo` og `/embed` ligger under `app/[locale]/` utenfor games-layouten, `/login` likeså — alle forblir motor-frie.
- `lib/sync/syncWorker.ts` er urørt av diffen (tom diff) — drainQueue/karantene/LWW intakt.
- `e2e/sync/offline-sync.spec.ts` er urørt av diffen (tom diff).
- Diff-omfang: 6 filer, alle innenfor kontraktens Files Likely Touched (+ `.forge`-kontrakt og `.changes`-notat).

## Commit-hygiene

- Én commit (`3637e821`): `fix(sync): start sync engine from game layout, not just hole page`, `Refs #1367` i body.
- `.changes/1367-syncboot-alle-spillsider.md` finnes med korrekt frontmatter (`type: fix`, `issue: 1367`) — erstatter kontraktens utdaterte «patch-bump + CHANGELOG»-gate (regimebyttet #1562, ikke et funn).

## Funn

Ingen.
