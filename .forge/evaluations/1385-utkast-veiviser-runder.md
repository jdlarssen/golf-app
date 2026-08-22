# Evaluation: #1385 — Utkast gjenopptas i veiviseren det ble laget i

**Builder:** Nattkjøreren (#1079), Opus-bygg
**Evaluator:** Fersk-kontekst Opus (separat agent)
**Contract:** issue-kommentar på #1385 (kontrakt-smeden 2026-08-21), Alternativ A
**Branch:** `claude/natt-1385-utkast-veiviser` fra `origin/main@db9eb5c`

## Runde 1 — implement → gates → evaluate → NEEDS WORK

Bygget Design 1–6 i kontraktens rekkefølge (3 commits: `b51caee` delt
mount-data-assembly, `329efd9` valgfrie link-kolonner på `EditGameRow`,
`99041d7` draft-gren → GameWizard + `?step=5` + seed-skip). Alle gates grønne
(tsc, lint 0/56-baseline, vitest 6567, build, weekly-release dry-run).

Fersk-kontekst-evalueringen fant **ett blokkerende funn**:

| # | Sev | Funn |
|---|-----|------|
| 1 | blocking | `expectedPlayerCount` seedes aldri ved gjenopptak → steg 2-grid filtreres på default 4 og kan SKJULE utkastets eget format (singles_matchplay/nines/florida/shamble); et klikk på et annet kort endrer `game_mode` stille. Steg 4-hintet lyver («Dere er 4 spillere») for roster ≠ 4. |
| 2 | minor | Valideringsfeil-redirect remounter fra DB-raden — ulagrede in-form-endringer tapes (SC2 som skrevet er likevel oppfylt: banner + steg bevares). |
| 3 | minor | `getOptions()` mistet parallellitet for scheduled-grenen. |
| 4–7 | nit | Inert `?step=5` på GameForm-fallback-drafts; dobbel fetch i fallback; døde sessionStorage-writes (kontrakt-tillatt); `deriveIntent` kun solo_strokeplay → 'solo' (kontrakt-konformt). |

## Runde 2 — fiks → re-evaluate → ACCEPT

Fix-commit `0d5cdeb`: ren helper `resumeExpectedPlayerCount(gameMode, rosterSize)`
(roster når `fitsPlayerCount` sier den passer, ellers `null` = «Vis alle» som slår
av grid-filteret helt), tredd som valgfri `initialExpectedPlayerCount`-prop
(ternary, ikke `??`, så en lokal drafts `null` ikke faller gjennom). Create-ruta
urørt. +4 Type A-tester (inkl. brute-force-invariant 8 formater × roster 0–8:
en ikke-null seed kan aldri filtrere bort sitt eget format); den ENE render-testen
utvidet med 2-spiller singles_matchplay-fikstur som asserterer valgt kort på steg 2
(negativ kontroll kjørt: testen feiler uten prop-tredingen). `getOptions()`-
parallellitet gjenopprettet. `[no-changelog]` på fix-commiten (defekten var aldri
shippet — unngår duplikat ukelinje).

Re-evaluering verifiserte claim-for-claim med file:line-bevis: **ACCEPT**, ingen
nye defekter. Én ny nit (roster > 24 seeder telleren forbi picker-taket —
kosmetisk; invariant-testen garanterer formatet består).

### Gates på `0d5cdeb`

| Gate | Resultat |
|------|----------|
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | 0 errors, 56 advarsler (identisk baseline, 0 nye) |
| `npx vitest run` (full) | 494 filer, **6571 passed** |
| `npx vitest run lib/wizard 'app/[locale]/admin/games'` | 32 filer, 534 passed |
| `npm run build` | exit 0 |
| `node scripts/weekly-release.mjs --dry-run` | én #1385-linje, gyldig |

## Verdict

**ACCEPT** etter 2 runder. Gjenstår: obligatorisk staging-klikkrunde
(kontraktens Gates) — inkl. nytt tilfelle: gjenoppta en 2-spiller
singles_matchplay-draft og se formatet valgt på steg 2 med teller 2.
Kryss-modell-gate (Steg 4.5) kjøres separat før levering.
