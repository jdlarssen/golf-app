# Forge-evaluering: #651 — Saksnummer-året i Oslo-tid

## Verdict: **ACCEPT**

Independently verified by reading the diff, re-deriving the boundary math in `node`, and running all three gates. Every criterion passes. No bugs or off-by-ones found.

## Per-kriterium

| K | Krav | Verdict | Evidens (selv-innsamlet) |
|---|------|---------|--------------------------|
| **K1** | Oslo-år, inkl. straddle → 2027 | **PASS** | `osloCalendar.ts:56` leser `osloParts(date).year`. Mitt `node`-kjør: `2026-12-31T23:30:00Z` → Oslo `2027-01-01, 24:30` (= 00:30 neste døgn) → year 2027, ikke 2026. Test `osloCalendar.test.ts:46-50` grønn. Negativ-case `2025-12-31T22:30:00Z` → Oslo `2025-12-31 23:30` → 2025 (test:52-55 grønn). |
| **K2** | Oslo-midnatt-grenser som UTC-instant | **PASS** | `osloCalendar.ts:57-58` `new Date(\`${y}-01-01T00:00:00+01:00\`).toISOString()`. Mitt `node`-kjør: startIso(2026)=`2025-12-31T23:00:00.000Z`, endIso=`2026-12-31T23:00:00.000Z` — byte-identisk med test-assertene `osloCalendar.test.ts:42-43`. +01:00-antakelsen holder: 1. jan er alltid CET (DST mars–okt). |
| **K3** | Vindu-kjeding + inneslutning (half-open, gap-fri) | **PASS** | Mitt `node`-kjør: `endIso(2026) === startIso(2027)` → `true` (kjeding, test:57-61). Straddle `2026-12-31T23:30Z` i `[2026-12-31T23:00Z, 2027-12-31T23:00Z)` → `true` (inneslutning, test:63-69). Half-open `[gte, lt)`: grense-spill ved `startIso` inkluderes, ved `endIso` ekskluderes men hører til neste vindu → ingen dobbelt-telling/drop. |
| **K4** | `getSakNumber` bruker helperen; ingen rester | **PASS** | `page.tsx:148` `const { year, startIso, endIso } = osloYearWindow(new Date(createdAt));`; query `.gte('created_at', startIso).lt('created_at', endIso).lte('created_at', createdAt)` (linje 152-154). Grep over funksjonen: ingen `getFullYear` / `T00:00:00Z`. Returtype `{ year, positionInYear }` uendret — begge render-steder destrukturerer den uendret: `SakNumber` (page.tsx:319), `CreatedAtFooter` (page.tsx:332). |
| **K5** | Gates grønne + bump + CHANGELOG + hook | **PASS** | vitest 18/18 passed; `tsc --noEmit` exit 0; `npm run build` exit 0 (route-tre + PPR-legende, ingen error-linjer). package.json 1.130.8→1.130.9; CHANGELOG `[1.130.9]`-oppføring m/tagline + Teknisk-details. `fix(admin)`-commit `89ea90a8` stager package.json+CHANGELOG → commit-msg-hook tilfredsstilt. |

## Rå gate-resultater

```
npx vitest run lib/format/osloCalendar.test.ts
  Test Files  1 passed (1)
       Tests  18 passed (18)

npx tsc --noEmit          → TSC_EXIT=0
npm run build             → BUILD_EXIT=0 (route-tre printet, ingen error/failed/cannot-find linjer)
```

## Selv-verifisert grense-matematikk (node -e)

```
startIso 2026:   2025-12-31T23:00:00.000Z   ✓ matcher test
endIso (2027):   2026-12-31T23:00:00.000Z   ✓ matcher test
straddle in Oslo: 2027-01-01, 24:30          → year 2027 ✓
just-before (2025-12-31T22:30Z) Oslo: 2025-12-31, 23:30 → 2025 ✓
straddle in [start,end) for 2027 window?     true ✓
chaining endIso(2026)===startIso(2027)?      true ✓
```

## Regresjons-sjekk på øvrige consumers

- `osloIsoWeek` og `osloTimeOfDayBucket` urørt; deres tester (inkl. nyttårs-uke 53 + it.each bucket-grenser) kjører i samme fil og er grønne (del av 18/18). `osloParts`-importen uendret (eksportert `lib/format/teeOff.ts:34`).
- Ingen andre filer enn de fire kontrakt-listede er endret (diff-stat bekreftet).

## DB-query-semantikk (skeptisk gjennomgang)

`.gte(startIso).lt(endIso).lte(created_at, createdAt)` teller spill i samme Oslo-år opprettet på-eller-før dette spillet → korrekt løpenummer-posisjon. Spillets eget `created_at` ligger garantert `>= startIso` fordi vinduet er avledet fra nettopp den instanten (inneslutning bekreftet). `count ?? 1`-fallback bevarer minimum 1. Ingen off-by-one.

## UI-verifisering

Den synlige effekten (saksnummeret) manifesterer seg **kun** i ~1-times nyttårs-straddle-vinduet, som ikke kan reproduseres i en live nettleser nå. Playwright/preview-verifisering er derfor ikke meningsfull her — korrektheten er verifisert via kode-lesing, enhets-testene og de tre gatene, som dekker grense-matematikken eksakt.

## Bugs / gaps funnet

Ingen.
