# Forge-kontrakt: Wolf støtter 3–5 spillere (#465)

**Issue:** [#465](https://github.com/jdlarssen/golf-app/issues/465)
**Branch:** `claude/eager-ptolemy-2f8319`
**Type:** feat (område: scoring + admin/wizard + in-round UI)
**Versjon:** patch → `1.83.15` (følger søsken-presedensen #460: format-cap-løsning som patch under åpen `1.83.y`-serie)

## Sammendrag

Wolf er i dag låst til **nøyaktig 4 spillere**. Per-format-gjennomgangen (2026-06-06) konkluderte at Wolf er det eneste «eksakt antall»-formatet med ekte 3- og 5-spiller-varianter i golf-kulturen. Eier besluttet å løsne til **3–5 spillere**. Ikke 6+ (= flere separate Wolf-spill, bevisst utenfor scope).

For `n=4` er dette en ren refaktor: byte-identisk resultat. Endring i `lib/scoring/` → **TDD obligatorisk** (test først).

## Beslutninger (avklart i kontrakt-diskusjon 2026-06-07)

1. **Scoring-økonomi:** lone-wolf-gevinst = `n`, blind = `n+2`. Partner (2 hver) og motstander-utdeling (1, eller 2 for blind) er per-person-faste og uendret. Bevarer n=4 (lone=4, blind=6). Eier bekreftet; tunables senere ved play-test-ubalanse.
2. **In-round reward-copy:** lone/blind-knappene og Wolf-badgen viser **faktisk poengsum utledet fra spillerantallet** (n / n+2), og dropper den nå-unøyaktige «2x/3x»-rammingen. Eier bekreftet.

## Generalisering — kun to ting avhenger reelt av antallet

### A) Rotasjon (hvem er «ulven» per hull)

La `R = floor(18 / n) * n` (største multiplum av `n` ≤ 18).
- **Hull 1..R:** ulv = spiller med `teamNumber === ((hull-1) % n) + 1`.
- **Hull R+1..18:** trailing-wolf (lavest `totalPoints`, tiebreak `teamNumber` ASC — uendret).

| n | R | Trailing-hull |
|---|---|---|
| 3 | 18 | ingen |
| 4 | 16 | 17, 18 (= dagens) |
| 5 | 15 | 16, 17, 18 |

`n=4` → R=16, trailing 17–18 → identisk med dagens. ✅

### B) Scoring-økonomi (kun to konstanter skalerer)

| Utfall | n=4 i dag | Generalisert |
|---|---|---|
| Wolf-side vinner, partner | 2 til hver | **2** (uendret) |
| Wolf-side vinner, lone | 4 til wolf | **n** |
| Wolf-side vinner, blind | 6 til wolf | **n+2** |
| Motstander vinner (partner/lone) | 1 til hver | **1** (uendret) |
| Motstander vinner (blind) | 2 til hver | **2** (uendret) |
| Uavgjort | 0, stake +1 | uendret |

Kun `wolf.ts` linje ~259 (`4`→`n`) og ~261 (`6`→`n+2`) + `n = players.length`.

## Touch-points (verifisert i kode 2026-06-07)

**Core scoring (TDD — test først):**
1. `lib/scoring/modes/wolf.ts` — `determineWolf()` (`% 4` → R-basert `% n`); lone `4`→`n`, blind `6`→`n+2`. Utled `n = players.length`.
2. `app/games/[id]/holes/[holeNumber]/wolfRotation.ts` — `determineWolfForHole()` (`% 4` → R-basert `% n`). Klient-speil, identisk endring.

**Validering:**
3. `lib/games/gamePayload.ts` `validateWolf()` — slot-grense `> 4` → `> n` (les opptil 6 slots, én over cap for å fange 6.); publish `< 4`→`< 3`, `> 4`→`> 5`; unike team_numbers `!== 4` → `!== players.length`; `teams_count: 4` → `players.length`.
4. `app/admin/games/new/useGameFormState.ts` — `wolfPlayersValid` (`=== 4` → `>= 3 && <= 5`); `wolfOrder` memo (`< 4`→`< 3`, `slice(0, 4)` → `slice(0, min(selected, 5))`); `orderedPayload` Wolf-gren (`< 4`→`< 3`); publish-feilmeldinger («3–5»-ordlyd).

**Wizard:**
5. `lib/wizard/fitsPlayerCount.ts` — flytt `wolf` ut av `=== 4`-blokken til `case 'wolf': return n >= 3 && n <= 5;`.
6. `app/admin/games/new/sections/WolfSetup.tsx` — `slots`/`SLOT_HOLES` dynamisk fra antall (beregn fra R-regelen); trailing-hull-note vises kun når R<18; `canShuffle` (`=== 4` → `>= 3 && <= 5`); helper-tekst antalls-aware.

**In-round UI (copy):**
7. `app/games/[id]/holes/[holeNumber]/WolfChoiceModal.tsx` — utled `n = otherPlayers.length + 1`; partner-subtitle (drop «2v2»), lone-subtitle (`vinner får {n}`), blind-subtitle (`vinner får {n+2}`). Drop «2x/3x».
8. `app/games/[id]/holes/[holeNumber]/HoleClient.tsx` — Wolf-badge «(Lone Wolf — 2x)» / «(Blind Wolf — 3x)» → antalls-aware eller drop multiplier.

**Player-facing guide (issue MISSET dette):**
9. `lib/formats/modeGuide.ts` linje ~144 — Wolf-summary «Fire spillere bytter på å være «ulv»» → «Tre til fem spillere …». Vises på spillerens game-side + `/spillformer`.

**Ingen endring nødvendig (verifisert):** `WolfView.tsx`/`WolfPodium.tsx` (itererer generisk), `page.tsx` `wolfPlayersForClient` (mapper alle med team_number), `mode_config` JSONB (`teams_count: n`, ingen DB-migrasjon).

## Gates (kjøres scoped til endrede filer)

- `npx vitest run lib/scoring/modes/wolf.test.ts app/games/[id]/holes/[holeNumber]/wolfRotation.test.ts lib/games/gamePayload.test.ts lib/wizard/fitsPlayerCount.test.ts`
- `npx tsc --noEmit` (full — nye exhaustive switch/Record-medlemmer fanges kun av full build)
- `npm run build` (Vercel-paritet)
- Co-located tester for hver endret fil med egen `*.test`

## Akseptkriterier

- [ ] Wolf kan opprettes og publiseres med 3, 4 og 5 spillere via veiviseren.
- [ ] Rotasjonen følger R-tabellen for hver n; trailing-wolf gjelder bare hull R+1..18 (n=3 → ingen trailing).
- [ ] Lone-gevinst = `n`, blind = `n+2`; partner og motstander uendret.
- [ ] Alle eksisterende n=4-tester passerer uendret (byte-identisk for n=4).
- [ ] WolfSetup viser riktig antall slots + hull-fordeling for valgt antall (3/4/5).
- [ ] In-round partner-valg viser n-1 alternativer; lone/blind-copy viser faktisk poengsum for n.
- [ ] `modeGuide.ts` Wolf-summary nevner ikke lenger «fire spillere».
- [ ] `npx tsc --noEmit` + `npm run build` grønt.
- [ ] Versjon bumpet til 1.83.15 + CHANGELOG-oppføring.

## Utenfor scope

- 6+ spillere (= flere separate Wolf-spill).
- Endring av øvrige eksakt-antall-formater (genuint låst).
- Kombinert tavle på tvers av flere Wolf-grupper.
- Tuning av multiplikatorene (kan gjøres senere ved play-test-ubalanse).
