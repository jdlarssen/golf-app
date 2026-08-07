# Evaluering: Cup-avslutning i ett trykk + «Scorekort levert» (#1501 + #1502)

**Verdikt: ACCEPT (runde 2)** — runde 1 ga NEEDS WORK (MAJOR-1); fiksen `c5745107` er
verifisert i runde 2, se «## Runde 2» nederst.

## Runde 1 (historikk)

**Verdikt runde 1: NEEDS WORK**

Ett MAJOR-funn: leverings-gaten og avslutnings-løpet ser kun på `active`
host-kamper. Host-kamper som fortsatt står i `scheduled` (aldri startet) er
usynlige for begge — cupen kan avsluttes i ett trykk uten advarsel mens
uspilte kamper blir stående, med vinner kåret på sidepoeng/delresultat.
Det er kontraktens eget problem-scenario («avsluttet cup med 0 av 4 kamper
spilt og vinner kåret på sidepoengene alene») gjenskapt for aldri-startede
kamper, og et direkte avvik fra Design steg 2 («**alle host-kamper** enten
finished eller alle ikke-trukne levert»). Alt annet i kontrakten er solid
bygget — se S1–S6 under. Gatene (build/vitest/lint) er grønne.

---

## Funn

### MAJOR-1 — `scheduled`-host-kamper passerer alle gater stille

- **Hvor:** `lib/cup/actions.ts:371-374` — `activeHostMatches = matches.filter(m => sourceGameId == null && m.status === 'active')`. Både leverings-gaten (steg 3) og endGameCore-løpet (steg 4) itererer KUN denne lista.
- **Reproduksjon (kode-verifisert kjede):**
  1. Genererte cup-kamper opprettes med `status: 'scheduled'` (`app/[locale]/admin/cup/[id]/generer/actions.ts:386`) og får kun `scheduled_tee_off_at` hvis planen har satt tee-tid (`:248`, `:410`) — uten tee-tid finnes ingen cron/auto-start-vei, kampen må startes manuelt.
  2. `startTournament` flipper kun `tournaments.status` — kampene røres ikke (`lib/cup/actions.ts:262-276`).
  3. `CupManagement` viser «Avslutt cupen» for enhver aktiv cup; `canFinish` sjekker kun sidepoeng-registrering (`CupManagement.tsx:241`), ikke kampstatus.
  4. `finishTournament`: sidepoeng registrert → gate grønn; `activeHostMatches = []` → leverings-gate trivielt grønn; løp over 0 kamper; cupen flippes `finished`.
- **Resultat:** cup `finished` med host-kamper (og deres derived) permanent i `scheduled` under en avsluttet cup, vinner regnet på sidepoengene alene — uten stopp-banner, uten «Avslutt likevel»-valg. Med kamper delvis startet (1 av 4 aktiv) er svikten delvis: den aktive gates, de tre `scheduled` ignoreres stille.
- **Kontrakts-brudd:** Design steg 2 sier «alle host-kamper enten finished eller alle ikke-trukne levert. Mangler noen → `?error=matches_not_submitted`». En scheduled kamp er ingen av delene (alle `submitted_at` er null) og skulle utløst stoppet.
- **Nyanse builderen bør få avklart:** kontrakt-designen gir en hard konsekvens for scheduled kamper — «Avslutt likevel» ville truffet `endGameCore → not_active → match_finish_failed`, dvs. cupen kan ALDRI avsluttes med en forlatt/aldri-startet kamp (mulig dødlås; per-kamp-sletting finnes ikke i styringsflaten). Builderens aktive-filter unngår dødlåsen, men stille. Minste kontrakts-tro fiks: inkluder scheduled/draft host-kamper i `matches_not_submitted`-stoppet (informert stopp + kampliste), og la likevel-varianten eksplisitt hoppe over aldri-startede kamper (dokumentert i banner-copyen) i stedet for å skjule dem. Om eieren heller vil ha dagens stille skip, er det et produktvalg som må opp — ikke en stille beslutning.

### Minor-funn (velter ikke verdiktet alene)

1. **`?error=side_awards_missing` svelges stille i UI.** Serveren redirecter med koden (`lib/cup/actions.ts:364`), men `errorMessageMap` i `CupManagement.tsx:215-219` mangler entry, og ingen custom-banner matcher den. Funksjonelt reddet av at gate-hint-banneret (`cup-finish-gate-hint`) uansett vises når noe er uregistrert — men error-parameteren gjør ingenting.
2. **Committet e2e dekker ikke S1-scenarioet.** `e2e/cup/cup-lifecycle.spec.ts` («Cup one-tap finish») seeder 1 host-kamp, 0 derived, 0 sidepoeng. Kontraktens S1 spesifiserer split-dag med 2 host + 2 derived. Evidensen hevder et staging-driver-skript dekket dette, men det er ikke committet — regresjonsvernet for derived-fanouten i ett-trykks-løpet finnes ikke i suiten.
3. **`match_finish_failed`-banneret lister alle gjenværende aktive kamper, ikke de som faktisk feilet** (`CupManagement.tsx:249-251` — `failedMatchesList` = alle aktive host). Etter redirect er «gjenværende aktive» ≈ «feilede», så listen er riktig i praksis rett etter feilen, men den er en approksimasjon, og `'Match'`-fallbacken i listene er hardkodet engelsk/unøytral (ikke i18n).
4. **Logg-prefiks endret:** db-feil i core logger `[endGameCore]` (`endGameCore.ts:160`), mens mail-feilen fortsatt logger `[endGame]` (`:252`). CLAUDE.md-mail-debuggen grep-er på `[endGame]` — kosmetisk drift i observability.
5. **Asymmetri for helt-withdrawn kamp:** `getCupSnapshot` setter `allScorecardsSubmitted=false` når 0 ikke-trukne spillere (`getCupSnapshot.ts:322-325`), så cup-gaten blokkerer en kamp vanlig `endGame` ville avsluttet rett frem (withdrawn blokkerer aldri der). «Avslutt likevel» løser den opp — kun et skjønnhetsavvik.

---

## Per kriterium

### S1 — ett trykk
**Kode-verifisert:** `finishTournament` (`lib/cup/actions.ts:341-449`) kjører `endGameCore` per aktiv host-kamp via admin-client, re-leser snapshotet og regner vinner på fersk stilling før flip; `endGameCore` kjører hele den ekte pipelinen (result summaries, differensialer, bragder, rundereferat, `finishDerivedGames`) — bekreftet identisk mot origin/main-kroppen linje for linje. Committet e2e («Cup one-tap finish (#1501)», SQL-orakler: kamp + cup `finished`, resultsdør synlig) dekker golden path med 1 host-kamp. **MEN:** kun for `active` kamper — se MAJOR-1; og committet e2e dekker ikke split-dag (minor 2). Delvis oppfylt.

### S2 — sidepoeng-gate
**Verifisert:** `allSideAwardsRegistered` (`lib/cup/sideAwardsRegistered.ts`) — ren helper, Type A-testet inkl. gir-0-gyldighet (`sideAwardsRegistered.test.ts`, 10 caser + kant). Server-side re-validering FØR alt annet i `finishTournament` (`:363-365`); UI-disable + hint deler samme helper (`CupManagement.tsx:236-241`, `cup-finish-gate-hint`). Hostile POST med `allow_missing=true` stoppes: `requireAdminOrClubAdminOfCup` kjører før noe skrives (`:353`), og `allowMissing` relaxer kun leverings-gaten — peer-approval-sjekken består i `endGameCore:148-150`. Oppfylt.

### S3 — uleverte kort
**Kode-verifisert:** leverings-gate på `allScorecardsSubmitted` (withdrawn ekskludert, `getCupSnapshot.ts:318-325`) → `?error=matches_not_submitted` + kampliste-banner + sekundær «Avslutt likevel»-form med `allow_missing=true` (`CupManagement.tsx:544-565`, aldri browser-confirm); likevel kjører `allowMissing` per kamp, `submitted_at` røres aldri (endGameCore setter den ikke). Staging-SQL-beviset i evidensen kunne ikke re-kjøres her, men koden implementerer semantikken. Oppfylt for aktive kamper — scheduled-hullet er MAJOR-1.

### S4 — varsler
**Kode-verifisert:** `suppressPerGameNotifications` gater NØYAKTIG de to reveal-signalene (`notifyPlayersGameFinished` + `sendGameFinishedNotification`-blokken, `endGameCore.ts:209-256`); bragder (`:189`), rundereferat (`:195`), sammendrag/differensialer (`:175-185`) og audit-logg (`:197`) kjører uansett. Cup-stien setter flagget (`lib/cup/actions.ts:401`); `sendCupFinishedNotification` sendes som før etter flippen. Vanlig `endGame` kaller core uten flagget → default `false`. Mail-snapshot-suiten grønn uendret (i full vitest-kjøring). Oppfylt.

### S5 — levert-status
**Kode-verifisert:** delt `cupMatchStatusKey` + `CUP_MATCH_STATUS_MESSAGE_KEY` (`lib/cup/cupMatchStatusLabel.ts`, Type A-testet) brukt av BEGGE flater (`CupManagement.tsx:464-472`, `app/[locale]/cup/[id]/page.tsx:122-130`) — duplikat-ternaryen fra #1468 er fjernet begge steder. finished→Spilt, active+levert→«Scorekort levert», active→Pågår, ellers dagens `matchDraft`-nøkkel. Resultatsiden er urørt (ikke i diffen). Withdrawn ekskludert i beregningen. i18n-paritet no/en for alle 6 nye nøkler; ingen foreldreløse. Oppfylt.

### S6 — regresjon
- `npm run build` → exit 0 (grønn).
- `npx vitest run` → **442 filer / 5664 tester passed** (inkl. endGame-co-located-testene i `app/[locale]/admin/games/[id]/actions.test.ts` — auth-gate, `not_all_submitted`, avslutt-likevel og mail-flyt kjører nå gjennom wrapper+core og er grønne uendret).
- `npm run lint` → **0 errors**, 58 pre-eksisterende warnings.
- Wrapper-ekvivalens: diffen mot origin/main gjennomgått linje for linje — samme gate-rekkefølge, samme feilkoder (`not_active`/`no_players`/`not_all_submitted`/`not_all_approved`/`db_finish`), samme redirects, request-klient + creator-RLS beholdt i wrapper-stien, revalidateTag/paths flyttet inn i core men kjører identisk før redirect. Eneste delta: logg-prefiks (minor 4).
- e2e mot staging: ikke re-kjørt av evaluator (staging-kjøring); committet spec er syntaktisk del av grønn vitest/build og bruker testid-er.
- Rebase-integritet: `git diff origin/main...HEAD -- SideAwardsPanel.tsx` er TOM — #1504 intakt. Versjon 1.226.3 (main) → 1.227.0 (minor, korrekt for feat), CHANGELOG har én Funksjon-oppføring, alle commits har `Refs #1501`/`#1502`.

## Gate-resultater

| Gate | Resultat |
|---|---|
| `npm run build` | exit 0 |
| `npx vitest run` | 442 filer / 5664 tester grønn |
| `npm run lint` | 0 errors (58 pre-eksisterende warnings) |
| `npx playwright test e2e/cup/` | ikke re-kjørt av evaluator (staging); evidens hevder 3/3 |

## Konklusjon

Håndverket er gjennomgående godt: ekstraksjonen er reelt byte-ekvivalent,
authz-laget er bevisst (gate før admin-client, allowMissing kan ikke
misbrukes), varsel-supresjonen er kirurgisk, og «ett hjem»-disiplinen er
fulgt for både gate-regel og status-label. Men leverings-gaten dekker ikke
«alle host-kamper» slik kontrakten krever — aldri-startede kamper glipper
stille gjennom, og det er nettopp formen på prod-feilen som utløste hele
kontrakten. Fiks MAJOR-1 (inkluder scheduled/draft host-kamper i
`matches_not_submitted`-stoppet, med et bevisst, synlig valg for hva
«Avslutt likevel» gjør med dem), så er dette en ACCEPT.

---

## Runde 2 (2026-08-07, siste — fiks `c5745107`)

**Verdikt: ACCEPT**

MAJOR-1 er reelt lukket, med samme «ett hjem»-disiplin som resten av bygget.
Ny delt helper `blockingHostMatches` (`lib/cup/cupFinishBlockers.ts`, Type
A-testet i `cupFinishBlockers.test.ts` — 9 caser inkl. scheduled/draft-blokk,
derived-eksklusjon i blokkerende tilstander, manglende-felt-default og tom
liste) driver BÅDE server-gaten (`lib/cup/actions.ts:384`) og stopp-bannerets
kampliste (`CupManagement.tsx:266`). Begge leser samme
`getCupSnapshot`-output (`CupMatchSummary.status/sourceGameId/
allScorecardsSubmitted` — alltid satt av snapshotet). Gatene grønne.

### Motbevis-forsøk (alle mislyktes — fiksen holder)

1. **Uspilt/ulevert host-kamp forbi uten stopp?** Nei, på alle stier:
   - *Vanlig trykk:* `scheduled`/`draft` og aktive-med-manglende-leveringer
     blokkerer → `?error=matches_not_submitted` → banner lister dem via SAMME
     helper. Semantikk-drift server/UI er umulig by construction.
   - *Likevel-formen:* renders KUN etter error-redirecten
     (`errorCode === 'matches_not_submitted'`, `CupManagement.tsx:547`) —
     via UI eksisterer ikke likevel-knappen før arrangøren har sett stopp-
     lista. Den er også disabled til sidepoengene er registrert.
   - *Hostile POST, ikke-arrangør:* `requireAdminOrClubAdminOfCup`
     (`actions.ts:352`) kjører før alt — uendret fra runde 1-verifiseringen.
   - *Hostile POST, arrangør med `allow_missing=true`:* hopper over klar-
     gaten — identisk semantikk som likevel-knappen (#375-mønsteret); en
     autorisert arrangør som håndsnekrer POST-en HAR tatt valget. Sidepoeng-
     gaten relaxes fortsatt ALDRI av `allowMissing` (steg 1 før steg 3,
     ubetinget), og peer-approval består i `endGameCore:148-150`.
2. **Likevel-skippet:** aldri startede kamper endes ikke (løpet itererer kun
   `active`), står igjen som `scheduled` under avsluttet cup, teller 0 —
   dokumentert i kontrakt-Revisjon 1 som vetobar `ASSUMPTION`, synlig i
   stopp-lista arrangøren valgte fra, og staging-verifisert i addendumet
   (SQL: aktiv kamp `finished`, scheduled urørt, cup `finished`).
3. **Withdrawn-kamp (alle trukket):** blokkerer fortsatt (runde 1-minor 5:
   `getCupSnapshot.ts:326` krever `nonWithdrawn.length > 0`) → står i
   stopp-lista; «Avslutt likevel» løser den opp uten å knekke — kampen er
   `active`, så løpet tar den, og `endGameCore` hopper over trukne spillere
   (`:138`) → avsluttes rent. Skjønnhetsavvik, uendret-akseptert.
4. **Andre stier til cup-`finished`:** grep over lib/cup + app viser at KUN
   `finishTournament` skriver `tournaments.status='finished'`. Manuell
   avslutning av én cup-kamp fra game-admin avslutter aldri cupen.

### Runde 1-funnenes status

| Funn | Status |
|---|---|
| MAJOR-1 (scheduled/draft forbi gatene) | **RETTET** — delt helper, begge gater, Type A-test, staging-addendum med SQL-orakler |
| Minor 1 (`side_awards_missing` uten banner) | **RETTET** — `errorMessageMap`-entry + nøkkel i begge kataloger (i18n-paritet: 0 foreldreløse begge veier) |
| Minor 2 (e2e dekker ikke split-dag-S1) | Uendret — fortsatt kun staging-driver-bevis (ikke committet); minor/#1488-kandidat |
| Minor 3 (feil-liste-approksimasjon) | **I praksis løst** av den nye gaten: etter delvis feil er gjenværende aktive host = nøyaktig de som feilet (vellykkede → finished, scheduled ble aldri forsøkt og hører ikke hjemme i feil-lista). `'Match'`-fallbacken fortsatt hardkodet — nit |
| Minor 4 (`[endGameCore]`-loggprefiks) | Uendret-akseptert (kosmetisk observability-drift) |
| Minor 5 (withdrawn-asymmetri) | Uendret-akseptert (se motbevis 3) |

### Nye funn (ingen velter verdiktet)

- **N1 (observasjon, out-of-scope):** `endGameWithSideWinners`
  (`app/[locale]/admin/games/[id]/avslutt/actions.ts:186`) er en
  pre-eksisterende TVILLING-finish-pipeline som ikke ble trukket inn i
  `endGameCore` — urørt av branchen (tom diff mot origin/main) og
  utenfor kontrakt-scope («utover wrapper-refactoren»). Cup-kamper er
  matchplay og har aldri sideturneringer (#585), så cup-stien ruter aldri
  dit. #1488-kandidat: konsolidere den over på core-en.
- **N2 (nit):** addendum-kjøringen asserterte at stopp-banneret VISES, ikke
  at scheduled-kampens label står i lista — lista er dog korrekt by
  construction (samme helper som gaten, Type A-testet).
- **N3 (regresjonssjekk, grønn):** e2e-lifecycle-testen avslutter aldri
  cupen (kun aktiverer + leser offentlig side), og one-tap-testen seeder
  aktiv+levert kamp — ingen committet e2e kolliderer med den nye gaten.

### Addendum-oraklene (PR #1505)

Dekker fiksen: fokusert staging-kjøring med 1 aktiv ferdig-levert + 1
`scheduled` aldri startet kamp — struktur-orakel (banner vises), SQL-orakler
(cup forble `active` etter stopp; etter likevel: aktiv → `finished`,
scheduled urørt, cup `finished` med `winner_team=1`), tom feillogg,
prod-vakt (alle Supabase-kall mot staging-ref), testdata slettet, gates
re-kjørt. Tilstrekkelig for fiksens to kanter (blokk + bevisst skip).

### Regresjon og disiplin

- Versjon 1.227.1 (patch-bump på fix, korrekt), `[no-changelog]` i
  commit-body (fix på uslippet feature på samme branch — riktig),
  `Refs #1501`. HEAD `c5745107` = pushet remote (PR-branchen er i sync).
- i18n: 0 foreldreløse nøkler begge veier (programmatisk sjekk).
- Stopp-copyen («Disse kampene er ikke klare … kamper og scorekort som
  mangler, teller ikke i resultatet») dekker begge tilfellene presist.

### Gate-resultater (runde 2, re-kjørt i denne økten)

| Gate | Resultat |
|---|---|
| `npm run build` | exit 0 |
| `npx vitest run` | 443 filer / 5673 tester grønn (+1 fil/+9 tester = `cupFinishBlockers.test.ts`) |
| `npm run lint` | 0 errors (58 pre-eksisterende warnings) |
| `npx playwright test e2e/cup/` | ikke re-kjørt av evaluator (staging); addendum hevder grønn fokusert kjøring |
