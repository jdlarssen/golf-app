# Evaluering: #331 — Greensome matchplay scores ikke i getCupSnapshot

**Verdikt:** ACCEPT
**Metode:** Fresh-context skeptisk sub-agent (sonnet), uavhengig verifisering + gates.

## Funn per kriterium

- `greensome_matchplay` er nå i `MATCHPLAY_CONFIG` (`computeCupMatchResult.ts:48`) med `defaultAllowance: 100`. Regresjons-test asserterer `winnerSide === 1` (ikke bare ikke-null).
- Allowance-defaults uendret mot pre-fix inline-grener (verifisert mot `git show HEAD~1`): fourball 100, foursomes 50, chapman 100, gruesome 50, greensome 100, singles uten allowance.
- Ingen inline-scoring-gren igjen i `getCupSnapshot.ts` — kun ett `computeCupMatchResult`-kall.
- Helper er ren (ingen `server-only`, ingen Supabase-import).
- `mode_config`-shape for singles (`team_size:1`, ingen allowance) matcher gammel gren; 2v2 injiserer `allowance_pct`.

## Gates

- `npx vitest run lib/cup/` → 23 passed (2 files)
- `npm run build` → clean
- `npx eslint` → clean på endrede filer

## Skeptiker-sjekker

Ingen gap. Fjerning av greensome fra mappet → `cfg` undefined → null → test feiler. Allowance-default-test (null/100/0 gir distinkte utfall) beviser plumbing er behavioral.
