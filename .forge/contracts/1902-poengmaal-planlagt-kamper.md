# Forge-kontrakt: Poengmålet følger planlagt antall kamper — #1902

**Branch:** `claude/poengmaal-1902-4f6cb7` (ny fra `origin/main` @ f7584764, 2026-09-02)
**Issue:** [#1902](https://github.com/jdlarssen/golf-app/issues/1902)
**Type:** enhancement · area: admin (cup) · størrelse: medium (én kolonne, én ny action, tre synk-punkter, én liten flate)
**Forgjengere:** #1883 (tak + matchantall per økt) og #1884 (kaptein-uttak, migrasjon 0172) er MERGET og i prod.
**Eierbeslutning (issue-kommentar 2026-09-02):** alternativ C — arrangøren oppgir planlagt antall kamper totalt, poengmålet settes fra det — med sikkerhetsnett fra A: avdekkes flere kamper enn planlagt, regnes målet om fra faktisk total. Produktvalget er tatt; denne kontrakten har ingen produktvalg-heading.

```json
{ "kontraktKlasse": "bruker-synlig", "funksjonell": "Arrangøren oppgir hvor mange kamper cupen skal ha før første uttaks-økt, så poengmålet er kjent fra start og ingen kan krone en vinner etter dag 1.", "produktvalg": false }
```

## Problem

`tournaments.points_to_win` settes én gang, i `startTournament` (`lib/cup/actions.ts:177`), fra antall `games`-rader som finnes akkurat da (`derivePointsToWinWeighted(count, …)`). Kaptein-uttaket (#1884) åpner økt 2 og 3 MENS cupen er aktiv, og hver avdekking (`revealCupLineupSession`, `lib/cup/lineupActions.ts:616`) setter inn nye kamper uten å røre målet. Innsenderens Ryder Cup (8 foursomes + 8 four-ball + 12 singler over flere dager) starter med 8 kamper → mål 4,5 — og `computeCupLeaderboard` (`lib/cup/computeCupLeaderboard.ts:216`) kårer vinneren så snart et lag når 4,5 av det som til slutt blir 28. Cupen kan altså være «vunnet» etter dag 1.

Målet skal være kjent fra start, som i ekte Ryder Cup (14,5 av 28), og det skal ikke kunne bli stående for lavt hvis det blir flere kamper enn planlagt.

## Research-funn

- **PostgREST videresender Postgres-feil med SQLSTATE i `code`; ukjent kolonne (42703) gir HTTP 400** ([docs.postgrest.org → Errors](https://docs.postgrest.org/en/latest/references/errors.html), lest 2026-09-02). supabase-js gir det som `{ data: null, error }`, og `startTournament` leser `const { data: current }` uten å se på `error` → `current` er null → redirect `not_found` for HVER cup-start. Samme fail-lukket-mønster som 0172 dokumenterte for Spillere-rommet. **Konsekvens: migrasjonen må på prod FØR koden deployes** (se PR-regler).
- Ingen ny bibliotek-flate ellers: server-actions, admin-klient og `expectAffected` er husets egne mønstre, lest fra `main` i denne økta. (Context7 var utilgjengelig — ugyldig API-nøkkel; DeepWiki finnes ikke i denne økta.)

## Tidligere beslutninger som binder

- **#1142 (0144):** `points_to_win` er NULL i draft og utledes ved start — ikke gjettet ved opprettelse. Gjelder fortsatt: planlagt antall lagres i draft, men målet skrives først ved start.
- **#1441 D8 (0153):** vektede cuper (win/tie ≠ 1/0,5) har INGEN «først til X» — `derivePointsToWinWeighted` → NULL, vinner ved avslutning. Gjelder fortsatt: vektede cuper får ikke spørsmålet, og målet forblir NULL uansett planlagt antall.
- **#1884:** uttaks-tabellene er deny-by-default; alt gates i `loadCupLineupAccess`, all skriving via admin-klient. Ny action følger samme mønster og samme feilkode-kontrakt (`{ error: kode }`, aldri redirect).
- **#1883/#1884:** match-taket har ETT hjem (`exceedsPersonalMatchCap` + `countPendingLineupSlots`); klubb-cup og global admin er uncapped.
- **AGENTS.md-felle 4:** regelen «effektiv total = max(faktisk, planlagt)» får ÉN ren funksjon; alle tre skrivepunktene kaller den.

## Design

### Datamodell (migrasjon 0173 — nummer sjekkes mot `origin/main` ved bygging)

- `alter table public.tournaments add column if not exists planned_match_count integer;` — nullable. `NULL` = ikke oppgitt → dagens oppførsel (målet utledes av faktisk antall). Gjelder alle cuper fra før fiksen og alle cuper uten kapteiner.
- CHECK: `planned_match_count is null or planned_match_count between 2 and <ytre grense>` — nedre grense 2 fordi `startTournament` krever ≥ 2 kamper; ytre grense er en tullverdi-vakt (≥ `MAX_PERSONAL_CUP_MATCHES`, f.eks. 400 — klubb/admin er uncapped). Det EKTE taket bor i `lib/cup/limits.ts`, som i dag; kommentaren i migrasjonen sier det.
- `comment on column`: «Planlagt antall kamper totalt i cupen, oppgitt av arrangøren i uttaks-rommet (#1902). NULL = ikke oppgitt. Poengmålet regnes av max(faktisk antall kamper, planlagt).»
- Ingen ny RLS/trigger: kolonnen skrives kun via admin-klienten bak organizer-gaten, og de eksisterende `tournaments`-update-policyene (0090/0092: creator, admin, klubb-admin) holder kapteiner og deltakere ute fra en direkte PATCH. Hostile PATCH som kaptein verifiseres på staging (SK9).
- Header-blokk i migrasjonen som i 0172: **⚠⚠ MÅ PÅ PROD FØR KODEN DEPLOYES.** Nevn de fire flatene som leser kolonnen med eksplisitt kolonneliste og feiler lukket (42703): `startTournament` (alle cuper!), `loadCupLineupBoard`, `openCupLineupSession`, synk-helperen. Additiv og trygg under gammel kode. Ledger-slug: `tournaments_planned_match_count`.
- Typer: påfør staging via Supabase MCP → regenerer `lib/database.types.ts` mot staging-ref (bindings §T3); PR-ens drift-sjekk diffes mot staging.

### Regelen har ett hjem (`lib/cup/pointsToWin.ts`)

```ts
/** Effektiv total kamper for poengmålet (#1902): planlagt er et gulv, aldri et tak. */
export function resolveCupMatchTotal(actualMatches: number, plannedMatchCount: number | null): number {
  return Math.max(actualMatches, plannedMatchCount ?? 0);
}
// Målet: derivePointsToWinWeighted(resolveCupMatchTotal(actual, planned), winPoints, tiePoints)
// → 28 planlagt, 8 faktiske → 14,5 · 28 planlagt, 30 faktiske → 15,5 · NULL planlagt → som i dag · vektet → null
```

Byggeren kan i tillegg trekke ut `hasDefaultCupWeights(win, tie)` (brukes av `derivePointsToWinWeighted` og av «skal spørsmålet stilles»-gaten) — navn og plassering er byggerens.

### Tre skrivepunkter, én synk-helper

`lib/cup/pointsToWinSync.ts` (`server-only`): `syncCupPointsToWin(admin, tournamentId)` leser `status, planned_match_count, win_points, tie_points` + `count(games)`, og **skriver `points_to_win` kun når `status = 'active'`** (draft beholder NULL per #1142; finished røres aldri). `expectAffected` på skrivet. Idempotent — kan kalles så ofte man vil.

1. **`startTournament`:** selecten får `planned_match_count`; `count ?? 0` byttes med `resolveCupMatchTotal(count ?? 0, current.planned_match_count)`. Start-mailen (`sendCupStartedNotification`) får den samme, oppløste verdien. Planlagt NULL → bit for bit som i dag.
2. **Ny action `setCupPlannedMatchCount(formData)`** (`lib/cup/lineupActions.ts`): felt `id` + `planned_match_count`. Gate: `loadCupLineupAccess` → kun `organizer`; `status = 'finished'` → `cup_finished`. Validering: heltall; gulv = `max(2, eksisterende games + ventende slots i ikke-avdekkede økter)` — under gulvet → `lineup_planned_total`; over personlig tak (`exceedsPersonalMatchCap(planned, uncapped)`) → `too_many_matches`. Skriv med admin-klient + `expectAffected` → ellers `save_failed`. Deretter `syncCupPointsToWin` (aktiv cup får nytt mål med én gang — dette ER fiksen for en cup som alt har startet), så `revalidateCup`. Kan kalles igjen når som helst før avslutning (retter skrivefeil og for høye tall).
3. **`openCupLineupSession`:** etter status-sjekken: les `planned_match_count, win_points, tie_points`; er planlagt NULL **og** vektene er default → `lineup_planned_total_missing` (feiler lukket — UI-et speiler det, men gaten er server-side). Vektet cup → ingen krav, som i dag. Planlagt er et gulv, aldri et tak: å åpne økter ut over planlagt antall er lov (sikkerhetsnettet tar det ved avdekking).
4. **`revealCupLineupSession`:** etter vellykket `insertCupMatches`, før varselet: `syncCupPointsToWin`. Sikkerhetsnettet: faktisk > planlagt → nytt mål; faktisk ≤ planlagt → skrivet er en no-op i verdi. Feiler synken: `console.error('[cup] revealCupLineupSession points sync failed', …)`, kampene rulles IKKE tilbake, avdekkingen returnerer OK — neste avdekking eller lagring av planlagt antall synker på nytt. (Det er den ene bevisste «best effort»-lomma; kampene er viktigere enn tallet, og synken er idempotent.)

### Flaten (uttaks-rommet, `CupLineupBoard.tsx`)

- **Nytt kort «Planlagt antall kamper»** over «Åpne en økt», vist for arrangør når begge kapteiner finnes og cupen har default-vekter. Ett tallfelt (`inputMode="numeric"`, forhåndsfylt med lagret verdi, tomt når NULL), en linje som viser konsekvensen live via `derivePointsToWin` («28 kamper gir et poengmål på 14,5»), og en Lagre-knapp. Testid-kontrakt: `cup-lineup-planned-input`, `cup-lineup-planned-save`, `cup-lineup-planned-target`.
- **«Åpne en økt» er sperret til planlagt er lagret** (default-vektet cup): submit disabled + hjelpetekst med testid `cup-lineup-needs-planned`. Samme mønster som `needsCaptains`-banneret.
- Aktiv cup: kortet viser også dagens mål fra DB (`board.pointsToWin`) — så arrangøren ser at «planlagt 20, satt opp 24 → først til 12,5» stemmer med tavla. Utforming er byggerens.
- `loadCupLineupBoard` utvides med `plannedMatchCount`, `pointsToWin`, `hasDefaultWeights`, `matchCount` og `pendingSlotCount` (gulvet, så feltet kan vise `min`).
- Manage-siden og den offentlige cup-siden er UENDRET: de leser `points_to_win` som før, og draft-copyen «poengmål klart ved start» er fortsatt sann.
- Ingen flyt-diagram-endring: uttaket står ikke i `docs/flows/` (#1884 la det ikke inn), og dette er et felt i et eksisterende rom.

### Copy (norsk, forslag — byggeren kjører `humanizer:humanizer`; alle nøkler i BÅDE `no.json` og `en.json`)

- `cup.lineup.plannedHeading`: «Planlagt antall kamper»
- `cup.lineup.plannedHelper`: «Tell alle kampene i hele cupen, også dem som alt er satt opp. Poengmålet regnes ut fra dette tallet, så det er kjent fra start. Blir det flere kamper enn planlagt, flytter målet seg.»
- `cup.lineup.plannedLabel`: «Kamper totalt» · `cup.lineup.plannedSave`: «Lagre»
- `cup.lineup.plannedTarget`: «{count, plural, one {# kamp} other {# kamper}} gir et poengmål på {points}»
- `cup.lineup.needsPlanned`: «Oppgi planlagt antall kamper før du åpner den første økten.»
- `cup.lineup.errors.lineup_planned_total`: «Planlagt antall må være et helt tall som minst dekker kampene som alt er satt opp eller åpnet.»
- `cup.lineup.errors.lineup_planned_total_missing`: «Oppgi planlagt antall kamper først.»

## Kant-tilfeller

| Situasjon | Forventet |
|---|---|
| Cup uten kapteiner | Ingen økter, ingen spørsmål, planlagt NULL → `startTournament` som i dag. Full suite grønn uten endrede cup-tester. |
| Vektet cup (#1441) | Ingen planlagt-kort, ingen sperre på «Åpne en økt»; målet forblir NULL som før. |
| Arrangøren oppgir for LAVT tall (20, det blir 28) | Avdekkingen som gjør faktisk > 20 synker målet fra faktisk antall (24 kamper → 12,5, 28 → 14,5). Ingen varsel; tavla og cup-siden viser det nye målet. |
| Arrangøren oppgir for HØYT tall (28, det blir 20) | Målet 14,5 nås ikke; ingen krones underveis; `finishTournament` kårer på poeng (som i dag). Arrangøren kan rette tallet i uttaks-rommet når som helst før avslutning. |
| Tall under gulvet (færre enn kamper som alt finnes + åpnede plasser, eller < 2) | `lineup_planned_total`, ingen skriving. |
| Personlig cup, tall over 36 | `too_many_matches` (samme hjem som i dag). Klubb-cup/admin: ingen tak. |
| Økt slettes etter åpning | Planlagt står (det er arrangørens utsagn, ikke utledet av økta); gulvet for en senere retting synker. Målet røres ikke. |
| Cup startet FØR første økt (veiviser-kamper → start → mål 4,5) | Når arrangøren lagrer planlagt 28 → målet blir 14,5 med én gang. Start-mailen som alt gikk ut sa 4,5 — akseptert, ingen ny mail. |
| Cup fra før fiksen som alt har økter | Planlagt NULL → «Åpne en økt» sperret til arrangøren oppgir tallet; dagens mål står inntil da. Cuper som aldri åpner en ny økt: uendret. |
| Avdekking mens cupen er draft | Ingen skriving av mål (start tar det, fra max(faktisk, planlagt)). |
| To avdekkinger samtidig | Claim-en er atomisk som før; begge synker fra dagens `count` → samme verdi, siste skriv vinner harmløst. |
| Synk-skrivet treffer 0 rader | `expectAffected` kaster → logges; avdekkingen står. |
| Kode deployet før kolonnen finnes | Hver cup-start → `not_found`; uttaks-rommet → feilside. **Derfor prod først.** |
| Kaptein PATCH-er `planned_match_count` direkte mot REST | Avvist av eksisterende `tournaments`-update-policy (0 rader / 42501). Bevises på staging. |

## Beslutninger

- **Spørres når planlagt er NULL, ikke bare «ved første økt»:** de to er samme sak for en ny cup, men regelen på kolonnen fanger også innsenderens cup som kan ha åpnet økt 1 før denne fiksen. `ASSUMPTION:` det er ønsket — kontekst-notatet sa «kun ved åpning av første økt», og dette er den lesningen som dekker prod-cupen som er grunnen til issuet.
- **Eget kort + egen action, ikke et felt inne i «Åpne en økt»:** tallet kan rettes uten å åpne en økt (skrivefeil, for høyt tall), og `openCupLineupSession` slipper en to-skrivs kompensasjon. Sperren på «Åpne en økt» gir samme opplevelse: du må svare før første økt.
- **Planlagt er et gulv for målet, aldri et tak for øktene** (sikkerhetsnettet fra A). Planlagt antall skrives ALDRI om automatisk — det forblir arrangørens utsagn; effektiv total er `max`.
- **Draft skriver ikke målet** (#1142 står). Aktiv cup synker med én gang.
- **Vektede cuper får ikke spørsmålet** — svaret ville ikke endret noe (#1441 D8), og et spørsmål uten virkning forvirrer.
- **Ingen varsel når målet flytter seg** — tavla er sannheten; et varsel om et tall spillerne ikke bad om er støy. Kan vekkes ved behov.

**Claude's Discretion:** navn/plassering av `hasDefaultCupWeights`; om synk-helperen bor i egen fil eller i `lineupActions.ts` (regelen bor uansett i `pointsToWin.ts`); kortets utforming innen husets `Card`/`Button`-primitiver (≥ 44 px tap-targets, `tabular-nums` på tallene); om det finnes én Type C-interaksjonstest for kortet (maks én, kun FormData-wiring — aldri re-assert av Type A-tall); ytre CHECK-grense.

## Suksesskriterier

- [ ] **SK1 — Regelen (Type A):** `resolveCupMatchTotal` i `lib/cup/pointsToWin.ts` med `it.each`-tabell i `pointsToWin.test.ts`: (8, null)→8 · (8, 28)→28 · (30, 28)→30 · (0, 28)→28; komposisjon med vektede vekter → null. Eksisterende `derivePointsToWin*`-tester uendret.
- [ ] **SK2 — Migrasjon:** `supabase/migrations/0173_tournaments_planned_match_count.sql` (nummer verifisert mot `origin/main`): nullable kolonne + CHECK + kommentar + ⚠⚠-header med prod-FØRST-begrunnelsen. Påført staging via MCP; `lib/database.types.ts` regenerert fra staging; drift-sjekken grønn. Prod-status står ærlig i PR-en («IKKE påført» til eieren har åpnet luka).
- [ ] **SK3 — Planlagt-action:** `setCupPlannedMatchCount` med gate-tester i `lineupActions.test.ts` (samme mock-oppsett som i dag): kaptein → `not_allowed` + 0 skriv · arrangør under gulvet → `lineup_planned_total` + 0 skriv · over personlig tak → `too_many_matches` · aktiv cup → planlagt skrevet OG `points_to_win` synket · draft → planlagt skrevet, `points_to_win` urørt · finished → `cup_finished`.
- [ ] **SK4 — Første økt krever tallet:** `openCupLineupSession` returnerer `lineup_planned_total_missing` når planlagt er NULL på default-vektet cup (test), og går som før på vektet cup (test). UI: `cup-lineup-open` disabled + `cup-lineup-needs-planned` synlig til tallet er lagret.
- [ ] **SK5 — Start:** `actions.test.ts`: 8 kamper + planlagt 28 → `points_to_win` 14,5 i update-en OG i `sendCupStartedNotification`-kallet; planlagt NULL → 4,5 (dagens tester grønne uendret).
- [ ] **SK6 — Sikkerhetsnettet:** `lineupActions.test.ts`: avdekking i aktiv cup der faktisk antall passerer planlagt → `tournaments.update({ points_to_win })` med verdien fra faktisk antall; faktisk ≤ planlagt → verdien fra planlagt (uendret tall). Synk-feil → logget, avdekkingen returnerer OK og kampene står.
- [ ] **SK7 — Uendret uten kapteiner/planlagt:** `npx vitest run` grønn (hele suiten, exit 0 — ikke bare pass-tallene, jf. unhandled-rejection-fella); ingen eksisterende cup-test endret oppførsel.
- [ ] **SK8 — i18n + notat + copy:** nye nøkler i begge kataloger, `npx vitest run messages` grønn; `.changes/1902-poengmaal-planlagt.md` (`type: feat`, `link: /admin/cup`, cta ≤ 40 tegn) godtatt av `node scripts/weekly-release.mjs --dry-run`; `humanizer:humanizer` kjørt på de norske strengene før commit.
- [ ] **SK9 — Staging-bevis (FØR merge, prod-server-modus):** kaptein-cup på torny-staging (fikstur `de77c617` 3 mot 3, eller ny): planlagt = 4 → økt 1 singel 3 kamper → begge leverer → avdekket (3 kamper) → start → cup-siden sier «Først til 2,5 poeng» → økt 2 singel 3 → avdekket → 6 > 4 → «Først til 3,5 poeng». Pluss: hostile REST-PATCH av `planned_match_count` med kaptein-JWT → 0 rader/42501. Bevis-kommentar + `staging-verified`-label på PR-en.

## Gates (per chunk)

- `npx tsc --noEmit` · `npx eslint <endrede filer>` · `npx vitest run lib/cup "app/[locale]/admin/cup" messages` · `npm run build` (ingen «pre-existing»-unnskyldning) — alle grønne
- `node scripts/weekly-release.mjs --dry-run` — 1902-notatet gyldig

## Filer som trolig røres

- `supabase/migrations/0173_tournaments_planned_match_count.sql` — ny kolonne (ny fil)
- `lib/database.types.ts` — regenerert fra staging
- `lib/cup/pointsToWin.ts` + `.test.ts` — `resolveCupMatchTotal` (+ evt. `hasDefaultCupWeights`)
- `lib/cup/pointsToWinSync.ts` — synk-helper (ny, `server-only`) — eller inne i `lineupActions.ts`
- `lib/cup/lineupActions.ts` + `.test.ts` — `setCupPlannedMatchCount`, gaten i `openCupLineupSession`, synk i `revealCupLineupSession`
- `lib/cup/lineupData.ts` — tavla får planlagt/mål/vekter/gulv
- `lib/cup/actions.ts` + `.test.ts` — `startTournament` bruker `resolveCupMatchTotal`
- `app/[locale]/admin/cup/[id]/uttak/CupLineupBoard.tsx` — planlagt-kortet + sperren
- `messages/no.json`, `messages/en.json` — nye `cup.lineup.*`-nøkler
- `.changes/1902-poengmaal-planlagt.md` — versjonsnotat

## Byggerekkefølge (forslag, 3 chunks)

1. **Regel + datalag:** `resolveCupMatchTotal` (TDD) → migrasjon på staging → typer → `startTournament`. Type A + `actions.test.ts`.
2. **Action + synk + gate:** `setCupPlannedMatchCount`, synk-helper, gaten i open, synk i reveal. `lineupActions.test.ts`.
3. **Flate + copy + bevis:** kortet, sperren, i18n, humanizer, notat, staging-runde, PR-bokføring.

## PR-regler for denne kontrakten

- **ALDRI auto-merge — DB-migrasjon.** `gh pr create --draft` (#1516); PR-en blir stående til eieren merger selv. Ingen produktvalg-heading (valget er tatt), men Fordeler/ulemper-blokk i body-en. Forslag:
  - *Fordeler:* poengmålet er kjent fra start, som i ekte Ryder Cup · ingen kan bli kronet etter dag 1 · blir det flere kamper enn planlagt, flytter målet seg av seg selv · cuper uten kapteiner merker ingenting.
  - *Ulemper:* ett ekstra spørsmål før første økt · et for høyt tall gir et mål som ikke nås (cupen avgjøres da ved avslutning — tallet kan rettes i uttaks-rommet) · oppgis tallet etter at cupen har startet, viste start-mailen det gamle målet.
- **Migrasjonsrekkefølge: staging → verifiser → PROD (bak eier-luka, `touch .claude/approve-prod` er eierens handling — fra worktree-stien) → merge → deploy.** Samme som 0172, av samme grunn (`startTournament` feiler lukket på ukjent kolonne). Skriv rekkefølgen og prod-status ærlig i PR-body-en; en «Prod: IKKE påført»-linje sjekkes mot prod-DB før den oppdateres.
- Bruker-synlig → staging-klikkrunde (SK9) + bevis-kommentar + `staging-verified`-label FØR `gh pr ready`. `gh pr ready` er øktas siste handling etter at `ls-remote` == lokal HEAD.
- `Closes #1902` i body. **Én closing-kommentar:** sjekk tråden først (`gh api repos/jdlarssen/golf-app/issues/1902/comments`); finnes en leveranse-kommentar fra byggeøkta, PATCH den — aldri en dublett (CLAUDE.md §Closing-kommentar).
- Reviewer-funn som ikke fikses i PR-en → egne issues med milestone før merge.

## Ikke i scope

- Varsel til spillerne når målet flytter seg; ny start-mail når tallet oppgis etter start.
- Planlagt antall i Generer-veiviseren, på manage-siden eller på den offentlige cup-siden («8 av 28 kamper» — idé, eget issue ved behov).
- Splittet-cup-dag-preset, klubb-cup-regler, native-appen (#1816 — leser ikke `points_to_win`).
- #1901 (avdekking som feiler har ingen «prøv igjen»-vei) — eget issue.
- Automatisk omskriving av planlagt antall ut fra åpnede økter (planlagt er arrangørens utsagn).
