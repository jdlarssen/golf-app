# Kontrakt: «Avsluttede spill» på hjem-siden sorteres nyeste først (#569)

**Issue:** [#569](https://github.com/jdlarssen/golf-app/issues/569)
**Branch:** `claude/fervent-aryabhata-973e15`
**Type:** Bug-fix (PATCH)

## Bakgrunn

Hjem-sidens «Avsluttede spill»-liste vises i tilfeldig (fysisk Postgres-) rekkefølge.
Rotårsaken er identifisert i issuet: `app/[locale]/page.tsx` bruker

```ts
.order('ended_at', { foreignTable: 'games', ascending: false })
```

på finished-spørringen mot `game_players` med `games!inner(...)`-embed. Per
supabase-js-dokumentasjonen sorterer `foreignTable`/`referencedTable`-varianten kun
radene *inne i* den embeddede ressursen — for en to-one-embed er det en no-op.
Topp-nivå-radene kommer derfor usortert.

## Valg gjort (gråsoner avgjort av issuet)

- **JS-sort etter fetch**, ikke PostgREST-syntaksen `.order('games(ended_at)')` —
  issuet anbefaler JS-sort som mest robust mot PostgREST-versjonsforskjeller, og
  `ended_at` er allerede i select.
- **Komparatoren ekstraheres til ren helper** i `lib/games/` med co-lokalisert
  Type A-test (test-disiplin: bug-fix krever test som reproduserer symptomet
  med fixtur-datoer fra prod-observasjonen i issuet).
- **No-op `.order(...)`-kallet fjernes** — det er misvisende å la stå.
- **Null-håndtering:** `ended_at` er `string | null` i typen; rader med `null`
  sorteres sist (defensive — finished-spill skal alltid ha `ended_at`).

## Suksesskriterier

- [x] **K1:** Pure komparator-helper i `lib/games/` som sorterer
  `{ ended_at: string | null }`-objekter synkende (nyeste først), `null` sist.
  _Evidens: `lib/games/finishedOrder.ts` — `byEndedAtDesc`, `(b ?? '').localeCompare(a ?? '')` gir null sist ved descending._
- [x] **K2:** Co-lokalisert Type A-test som reproduserer prod-symptomet: input i
  «fysisk» rekkefølge med datoene fra issuet (24. mai, 14. mai, 7./10./11./12. juni
  2026) → forventet output nyeste-først. Egen case for `null`-sist.
  _Evidens: `lib/games/finishedOrder.test.ts`, 3 tester. RED først (modul fantes ikke), så GREEN: `npx vitest run lib/games/finishedOrder.test.ts` → 3 passed._
- [x] **K3:** `app/[locale]/page.tsx`: finished-spørringens no-op
  `.order('ended_at', { foreignTable: 'games', ascending: false })` er fjernet, og
  `finishedGames` sorteres med helperen etter mapping.
  _Evidens: page.tsx:138 (select uten order-kall), page.tsx:174 (`.sort(byEndedAtDesc)`), import på linje 23._
- [x] **K4:** Sweep: ingen andre `foreignTable`/`referencedTable`-order-bruk i
  `app/`, `lib/`, `components/` som forventer topp-nivå-sortering.
  _Evidens: grep over app/, lib/, components/, e2e/ → kun 2 kommentar-omtaler (page.tsx:163, finishedOrder.ts:4), null API-bruk._
- [x] **K5:** PATCH-bump + CHANGELOG-oppføring nestet under åpen
  `1.117.y`-serie (patch-bugfix nestes under åpent tema), i samme commit som fixen.
  _Evidens: package.json 1.117.2; CHANGELOG `### [1.117.2] - 2026-06-13 · #569` under `## 1.117.y`-headingen; samme commit (se git log). Opprinnelig 1.117.1, renummerert til 1.117.2 under rebase fordi en parallell leaderboard-fix tok 1.117.1 på main._

## Gate-resultater (2026-06-13)

- `npx vitest run lib/games/finishedOrder.test.ts` → 1 fil / 3 tester grønne
- `npx tsc --noEmit` → exit 0
- `npm run build` → «✓ Compiled successfully», route-tabell generert
- Full suite `npx vitest run` → 264 filer / 3373 tester grønne
- Sweep-grep → kun kommentar-omtaler igjen

## Gates

| Gate | Kommando | Krav |
|---|---|---|
| Ny test | `npx vitest run lib/games/finishedOrder.test.ts` | grønn |
| Typer | `npx tsc --noEmit` | 0 feil |
| Build | `npm run build` | grønn (Vercel-paritet) |
| Sweep | `grep -rn "foreignTable\|referencedTable" app/ lib/ components/` | kun den fiksede forekomsten |

## Utenfor scope

- Sortering av aktive/planlagte spill (egen logikk, ikke rapportert som feil).
- Paginering/begrensning av finished-lista.
- E2E-test (Type D) — ren sorteringslogikk dekkes av Type A; ingen ny flyt.
