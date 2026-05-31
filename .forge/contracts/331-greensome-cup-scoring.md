# Kontrakt: #331 — Greensome matchplay scores ikke i getCupSnapshot

**Issue:** https://github.com/jdlarssen/golf-app/issues/331
**Type:** bug (area:scoring)
**Branch:** claude/beautiful-goldstine-ee8943
**Status:** under bygging

## Problem (rot-årsak verifisert)

`lib/cup/getCupSnapshot.ts` har én compute-gren per cup-matchplay-format: singles,
fourball, foursomes, chapman, gruesome — men **ingen gren for `greensome_matchplay`**,
og importerer ikke `computeGreensomeMatchplay`. Greensome (#289) ble lagt til i
`matchGameMode`-unionen + side-label-logikken, men aldri i selve scoringen.

Konsekvens: for en greensome-match forblir `result = null`, så `computeCupLeaderboard`
gir begge lag 0 poeng uansett hvem som vant. Bekreftet ved kode-lesing
([getCupSnapshot.ts](../../lib/cup/getCupSnapshot.ts) — fem `if (game.game_mode === …)`-grener,
ingen for greensome).

De fem eksisterende grenene er nær-identiske copy-paste (bygger `ScoringContext`,
kaller compute-fn, mapper `result.winner → winnerSide`). Greensome-gapet er en direkte
følge av at den sjette kopien aldri ble laget — duplikasjonen ER bug-årsaken.

## Tilnærming (besluttet — code-org-valg)

Ikke en sjette copy-paste-gren. I stedet:

1. Ekstraher per-match-scoringen til én ren, tabell-drevet helper
   `lib/cup/computeCupMatchResult.ts` som dekker alle seks matchplay-modi via et
   `{ mode → { compute, sideSize, defaultAllowance } }`-map. Ren funksjon (plain
   input → `CupMatchInput['result']`), ingen Supabase — derfor Type-A-testbar.
2. `getCupSnapshot.ts` kaller helperen per match i stedet for fem inline-grener.
3. Type-A unit-test dekker alle seks modi, med greensome som regresjons-case
   (klar vinner → ikke-null result, riktig `winnerSide`).

Allowance-defaults bevares eksakt som dagens grener:
- singles: ingen allowance (team_size 1)
- fourball: 100
- foursomes: 50
- greensome: **100** (WHS — bekreftet mot `cup.greensome_allowance_pct ?? 100`)
- chapman: 100
- gruesome: 50

## Suksesskriterier

- [x] `computeCupMatchResult` finnes som ren helper, dekker alle seks matchplay-modi, ingen Supabase-import — `lib/cup/computeCupMatchResult.ts` (kun scoring-modul-imports + `CupMatchInput`-type)
- [x] En ferdigspilt greensome-match med klar vinner gir ikke-null `result` med korrekt `winnerSide` (regresjons-case) — test «greensome … winnerSide 1 (#331)» grønn
- [x] De fem eksisterende modiene gir samme resultat som før (allowance-defaults uendret) — `MATCHPLAY_CONFIG` bevarer fourball/chapman/greensome 100, foursomes/gruesome 50, singles ingen; `it.each`-test grønn for alle seks
- [x] `getCupSnapshot.ts` bruker helperen — fem inline-grener + seks compute-imports + `ScoringContext`-import fjernet, erstattet med ett `computeCupMatchResult`-kall
- [x] Type-A unit-test grønn, dekker alle seks modi + tied + ufullført + ukjent-modus + feil side-størrelse — `npx vitest run lib/cup/` → 23 passed (2 files)
- [x] `mode_config`-bygging matcher dagens form per modus — `team_size: 1` uten allowance for singles, `team_size: 2` + `allowance_pct` for 2v2; allowance-default-100-test verifiserer plumbing

**Gates kjørt:** `npx vitest run lib/cup/` 23 grønne · `npm run build` OK (prod-build, ingen feil) · `npx eslint` ren på endrede filer. (tsc-feil i urelaterte `app/**/actions.test.ts` er pre-eksisterende, ikke i endrede filer, og fanges ikke av `next build`.)

## Gates

- `npx vitest run lib/cup/` — alle cup-tester grønne (inkl. ny helper-test + eksisterende computeCupLeaderboard)
- `npx tsc --noEmit` (eller `npm run build`) — ingen type-feil (ny GameMode-håndtering i exhaustive map)
- `npm run lint` — ren på endrede filer

## Versjonering

Bruker-synlig fix (greensome cup-matcher scorer nå riktig) → **PATCH**-bump +
CHANGELOG-oppføring i samme commit (commit-msg-hook håndhever).
