# Spec: Type `__torny_dexie` window stash i `offline-sync.spec.ts`

**Issue:** [#231](https://github.com/jdlarssen/golf-app/issues/231)

## Problem

`npm run lint` rapporterer 5 `@typescript-eslint/no-explicit-any`-errors i [`e2e/sync/offline-sync.spec.ts`](e2e/sync/offline-sync.spec.ts) — alle på samme mønster: `window as unknown as { __torny_dexie?: any }`. Errorene støyer i CI-output og lokal lint-kjøring, og gjør det vanskeligere å fange nye lint-feil under utvikling. Verifisert som pre-existing baseline (ikke introdusert av nyere arbeid).

## Prior Decisions

- Ingen relevante tidligere kontrakts-beslutninger om typings i e2e-mapper.
- Dexie holdes som underlag for offline-sync per [#35 keep-dexie-decision](.forge/contracts/35-keep-dexie-decision.md) — typene `LocalScore`/`SyncQueueItem` er stabile.

## Design

Erstatt de 5 `any`-callsitene med en proper Dexie-subtype som speiler den faktiske DB-bruken i testen.

**Approach:**

1. **Type-only import** av eksisterende interfaces fra produksjonskoden:
   ```ts
   import type { LocalScore, SyncQueueItem } from '@/lib/sync/db';
   ```
   Importen er ren type-erasure (ingen runtime-kobling), så testens self-contained ethos (kommentar linje 25-26 om byte-for-byte-mirroring av `writeScore`/`drainQueue`) brytes ikke — den ethos gjelder runtime-koden, ikke statiske typer. Bonus: schema-drift fanges av TypeScript ved lint-tid.

2. **Inline `TornyDexie`-interface** på toppen av fila:
   ```ts
   import Dexie, { type Table } from 'dexie';

   interface TornyDexie extends Dexie {
     scores: Table<LocalScore, string>;
     syncQueue: Table<SyncQueueItem, string>;
   }
   ```
   Brukes kun her (5 callsites i samme fil) → ingen helper-fil eller produksjons-export trengs.

3. **Erstatt 5 callsites** (linje 80, 91, 101, 126, 158):
   ```ts
   // Før:
   const db = (window as unknown as { __torny_dexie?: any }).__torny_dexie;
   // Etter:
   const db = (window as unknown as { __torny_dexie?: TornyDexie }).__torny_dexie;
   ```

## Edge Cases & Guardrails

- **Dexie CDN-loaded vs bundlet:** Testen loader Dexie dynamisk fra CDN (`import('https://cdn.jsdelivr.net/...')`), men TypeScript ser bare statiske typer — typings fra `dexie`-pakka i node_modules brukes uansett. Ingen runtime-konflikt.
- **`Dexie` brukt som type, ikke ny-instansiert:** I testen står `new Dexie('golf-app')`-kallet inne i en `page.evaluate`-streng (ikke statisk TS-kode), så `Dexie`-importen brukes kun som typeanker. Det er OK — tree-shaking fjerner unbenyttet runtime, og typen kompiler-sjekker.
- **`@/`-alias virker i e2e:** tsconfig.json definerer `"@/*": ["./*"]`, og e2e-mappen ligger under prosjektroten. Playwright bruker samme tsconfig.

## Key Decisions

- **Importer types fra `lib/sync/db.ts`:** Self-contained ethos gjelder runtime-koden, ikke typene. Catcher schema-drift gratis.
- **Inline `TornyDexie`-interface:** 5 callsites i én fil → ingen abstraksjon trengs. Ingen produksjons-eksport (forkaster encapsulation).
- **Fiks typene, ikke disable rule:** Issue-en sier eksplisitt fiks types.

**Claude's Discretion:**
- Eksakt formulering av `TornyDexie`-kommentaren (om den trengs) — typenavn er selvforklarende.

## Success Criteria

- [x] `npx eslint e2e/sync/offline-sync.spec.ts` returnerer 0 errors — verifisert: tom stdout, exit-code 0
- [x] `npm run lint` rapporterer ingen nye errors i andre filer — `✖ 8 problems (0 errors, 8 warnings)`, alle warnings pre-existing om `_gameId` i Team/Texas-Stableford-views
- [x] `npx tsc --noEmit` passerer — tom stdout, exit-code 0
- [x] Ingen runtime-endring i testens oppførsel — kun type-only imports og type-cast endret; ingen executable kode endret
- [x] `TornyDexie`-interface er definert inline i `offline-sync.spec.ts:6-9` og bruker `LocalScore`/`SyncQueueItem`-imports fra `@/lib/sync/db`

## Gates

- [x] `npx eslint e2e/sync/offline-sync.spec.ts` — 0 errors (var 5 før)
- [x] `npm run lint` — 0 errors (8 pre-existing warnings urørt)
- [x] `npx tsc --noEmit` — passerer

## Files Likely Touched

- `e2e/sync/offline-sync.spec.ts` — type-only import, ny `TornyDexie`-interface, 5 callsites oppdatert

## Out of Scope

- Bredere e2e-typings-rydding (andre filer)
- Endre selve test-oppførselen (testen virker, vi rører ikke logikken)
- Eksport av `GolfDb`-klassen fra produksjonskoden
- Helper-fil i `e2e/helpers/` (ingen andre e2e-tester bruker Dexie i dag)
- Versjons-bump (refactor uten bruker-synlig oppførselsendring — bump-hooken slipper `refactor:`/`chore:`-commits)
