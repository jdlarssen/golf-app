# Spec: #506 — Fjern ikke-deterministisk flake i GameForm/GameWizard (timeout under parallell full-suite)

**Issue:** [#506](https://github.com/jdlarssen/golf-app/issues/506)
**Branch:** `claude/fervent-elion-c7eb39`
**Type:** `test(...)` — test-infrastruktur, ingen bruker-synlig oppførsel → **ingen version-bump, ingen CHANGELOG** (commit-msg-hook gater kun feat/fix/perf).

## Problem

`GameForm.test.tsx` (44 tester) og `GameWizard.test.tsx` (17 tester) feiler **ikke-deterministisk** i full-suite-kjøring (`npx vitest run`, 248 filer parallelt) — 1–4 timer ut per kjøring, alltid i disse to filene. I isolasjon passerer begge 61/61 hver gang.

## Rotårsak (systematisk debugging — bevis innsamlet)

| Bevis | Verdi |
|---|---|
| Begge filer i **isolasjon** | 61/61 grønne, **2,82s totalt**, tregeste enkelt-test **122ms** |
| Full suite (denne maskinen, 10 kjerner) | 248 filer / 2966 tester grønne, 26,5s wall-clock |
| Kumulativ `environment`-tid full suite | **135s** (jsdom env-churn/GC er dominerende kostnad) |
| `testTimeout` i `vitest.config.ts` | **ikke satt → default 5000ms** |
| Begge testfiler bruker | ren synkron `fireEvent` (ingen `user-event`, ingen fake timers) |

**Konklusjon:** Flaken er **ren timeout**. Tester som tar ≤122ms isolert balonger til 5–7s under full-suite parallell-last (10 forks metter 10 kjerner + jsdom-minnetrykk/GC), og tipper sporadisk over default-grensen på 5000ms. Det er **ikke** en logikk-race, og testene er **ikke** iboende tunge. Issuets foreslåtte «splitt/skriv om de tunge testene» bygger på en feildiagnose — rewrite ville vært bortkastet og bryter «ikke skriv om eksisterende tester retroaktivt» (#263-scope).

## Prior Decisions

- **Eier (2026-06-08):** valgte **kun config-timeout**-tilnærmingen. Ingen endring i de 61 testene. Ingen fork-capping/parallell-demping i denne runden.
- **Test-disiplin:** denne fixen rører ingen testfiler → ingen Type C-vurdering nødvendig. `vitest.config.ts` er ikke en testfil.

## Design

Én endring i `vitest.config.ts` — hev `testTimeout` (og `hookTimeout` for konsistens) i `test`-blokken:

```ts
test: {
  environment: 'jsdom',
  setupFiles: ['./vitest.setup.ts'],
  globals: true,
  exclude: [...configDefaults.exclude, 'e2e/**'],
  // #506: default 5000ms er for stramt for en 248-fils parallell jsdom-suite.
  // Tunge render-tester (GameForm/GameWizard) tar ≤122ms isolert, men balonger
  // til 5–7s under full-suite CPU/minne-kontensjon og tipper sporadisk over 5s.
  // 20s gir ~3× headroom over verste observerte (7s) uten å maskere reelle heng.
  testTimeout: 20_000,
  hookTimeout: 20_000,
},
```

Verdi-begrunnelse: verste observerte under last = 7s; 20s = ~2,85× headroom. Default `hookTimeout` er allerede 10s, men settes eksplisitt likt for et selvdokumenterende lokk.

## Success Criteria

- [ ] **C1 — Rotårsak dokumentert med bevis.** Isolasjon 2,82s/122ms vs. kontensjon 5–7s; default 5000ms identifisert som lokk. (Denne kontrakten + evaluering.)
- [ ] **C2 — Config-endring på plass.** `vitest.config.ts` setter `testTimeout: 20000` + `hookTimeout: 20000` med forklarende #506-kommentar.
- [ ] **C3 — Mekanisme-bevis (deterministisk).** Tvungen repro: `npx vitest run <de to filene> --testTimeout=<lav>` under kunstig lav grense feiler/tar tiden ut → bekrefter at grensen er den kausale spaken (ikke logikk). Ved 20s passerer de.
- [ ] **C4 — Isolasjon fortsatt grønn.** `npx vitest run app/admin/games/new/GameForm.test.tsx app/admin/games/new/GameWizard.test.tsx` → 61/61.
- [ ] **C5 — Full-suite stabil over gjentatte kjøringer.** `npx vitest run` kjørt **5× på rad** → 0 feil i alle 5 (spesielt 0 feil i de to filene).
- [ ] **C6 — Ingen testfiler endret.** `git diff --name-only` viser kun `vitest.config.ts` (+ `.forge/`-artefakter). De 61 testene urørt.
- [ ] **C7 — Typer kompilerer.** `npx tsc --noEmit` grønn (config-fila er TS).

## Gates (kjøres etter endring)

```bash
# G1: typer
npx tsc --noEmit
# G2: isolasjon (C4)
npx vitest run app/admin/games/new/GameForm.test.tsx app/admin/games/new/GameWizard.test.tsx
# G3: mekanisme-bevis (C3) — kunstig lav grense skal trigge timeout-fail
npx vitest run app/admin/games/new/GameForm.test.tsx app/admin/games/new/GameWizard.test.tsx --testTimeout=1
# G4: full-suite stabilitet (C5) — 5× på rad, alle grønne
for i in 1 2 3 4 5; do npx vitest run --reporter=dot 2>&1 | tail -3; done
```

## Out of Scope

- **Skrive om / splitte de 61 testene** (eier valgte vekk; #263-familien).
- **Fjerne `"Not implemented: navigation to another Document"`-støyen** (manglende `preventDefault`/`onSubmit` på `<form>` i `GameForm.tsx:350`). Harmløs konsoll-støy, ikke flake-årsak. Egen sak hvis ønskelig.
- **Fork-capping / `maxWorkers`-tuning / isolering av tunge filer.** Bevart som fremtidig lever hvis 20s ikke holder.
