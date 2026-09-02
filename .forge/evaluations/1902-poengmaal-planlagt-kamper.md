# Evaluering: #1902 — poengmålet følger planlagt antall kamper

**Kontrakt:** `.forge/contracts/1902-poengmaal-planlagt-kamper.md`
**Branch:** `claude/poengmaal-1902-bygg` · **PR:** #1913
**Evaluert:** 2026-09-02, fersk-kontekst subagent (opus), én runde
**Verdikt runde 1:** NEEDS WORK (6 funn) → alle adressert → **ACCEPT**

## Hva evaluatoren bekreftet selv

Alle porter kjørt på nytt av evaluatoren, med exit-koder sjekket (ikke bare
pass-tallene, jf. felle med falsk grønt fra unhandled rejections):

`npx vitest run` exit 0 · `npx tsc --noEmit` exit 0 · `npm run build` exit 0 ·
`npx eslint` exit 0 · `weekly-release --dry-run` exit 0.

Mutasjonstestet de nye testene i stedet for å ta dem for god fisk:

- `resolveCupMatchTotal` → `return actualMatches` gjorde **7 tester røde i 3 filer**.
- Gulvet uten `pendingSlots` → «åpnede plasser teller med i gulvet» ble rød.
- Gaten i `openCupLineupSession` fjernet → nøyaktig én test rød.
- `syncCupPointsToWin` som no-op → 3 tester røde.

Bekreftet også at de tre test-filene er **rent additive** (`git diff --numstat`:
148/0, 157/0, 459/0 — null slettede linjer), altså at ingen eksisterende
cup-test ble endret for å passe den nye oppførselen.

**Prod-først-påstanden holder:** alle fire lesere bruker eksplisitt kolonneliste
og feiler lukket på 42703. Prod-spørring bekreftet `has_col: 0` — «IKKE påført»
er ærlig.

## Funn og hva som ble gjort

| # | Funn | Utfall |
|---|---|---|
| 1 | `openCupLineupSession` defaultet NULL-vekter med bare `1`/`0.5`-litteraler, i strid med denne PR-ens egen JSDoc om at konstantene finnes nettopp for å unngå flere hjem | **Fikset** — bruker `DEFAULT_WIN_POINTS`/`DEFAULT_TIE_POINTS` |
| 2 | `setCupPlannedMatchCount` svarte `save_failed` når tallet FAKTISK var lagret og bare omregningen feilet; og hoppet over `revalidateCup`, så tavla og databasen var uenige til neste harde sidelast | **Fikset** — egen feilkode `planned_saved_target_failed` med ærlig tekst, og revalidering uansett utfall. Ny test, mutasjonssjekket rød på gammel oppførsel |
| 3 | Kontraktens kant-tilfelle-rad for cuper fra før fiksen stemte ikke med koden, og Bevis-seksjonen påsto «ett avvik» | **Dokumentert** — ingen kodeendring; oppførselen er riktig (sikkerhetsnettet), raden var upresis. Nå skrevet som avvik 2 |
| 4 | Nye messages-nøkler hadde to spaces for lite innrykk i begge kataloger | **Fikset** |
| 5 | Null automatisk dekning for UI-halvdelen av SK4 — hele det nye kortet hvilte på én staging-klikkrunde | **Fikset** — én Type C-test (kun wiring, ingen Type A-tall re-assertert). Å skrive den avdekket at en ett-spillers stall trigger den eldre `squadTooSmall`-regelen |
| 6 | `resolveCupMatchTotal` forplantet NaN: `Math.max(8, NaN)` → NaN → serialiseres som `null` → stilltiende slettet mål i aktiv cup. Ikke nåbart i dag (CHECK + parser stopper det) | **Fikset** — vakt + testrader |

Evaluatoren fant ingenting i diffen som ikke sporer til #1902, og verifiserte
selv at det droppede `countPendingLineupSlots`-importet virkelig var dødt på
`main`.

## Etter fiksene

Full suite kjørt om igjen: **532 filer, 7276 tester, exit 0**. Hele SK9-runden
kjørt om igjen på nullstilt fikstur mot endelig HEAD (`/api/health` sha =
commit-en), med samme resultat i hvert steg — inkludert den fiendtlige PATCH-en.

## Funn som ikke hørte hjemme i denne PR-en

Filet som #1915: `computeCupLeaderboard.ts` har fortsatt sin egen kopi av
1/0,5-defaultene, og `admin/cup/page.tsx` omgår `formatPoints` med en inline
`.replace('.', ',')` — samme duplikat som ga desimalpunktum-buggen her.
