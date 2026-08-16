# Evaluering: #1669 — Lag-tildeling etter publisering (alternativ B)

**Branch:** `claude/1669-lagtildeling-etter-publisering` (PR #1682, 6 commits over `origin/main`)
**Kontrakt:** `.forge/contracts/1669-lagtildeling-etter-publisering.md`
**Evaluator:** fersk kontekst, skeptisk. Statiske porter + staging klikk-runde.
**Dato:** 2026-08-16

## VERDICT: NEEDS WORK

Én blokkerende defekt: **«Foreslå laginndeling» virker ikke i det hele tatt** — den leser en
kolonne som ikke finnes (`game_players.created_at`), så handlingen ender alltid i
`?error=db_roster`. Det er hovedfeaturen i kontraktens success-kriterium 1. Alt annet i
kontrakten er verifisert grønt på staging.

---

## Kriterie-tabell

| # | Success Criterion (kontrakt) | Status | Bevis |
|---|---|---|---|
| S1a | Admin-siden viser «Uten lag (n)» for solo-påmeldte i best ball | ✅ | `[data-testid=team-section]` rendret, tekst «UTEN LAG (4)» (CSS-uppercase) |
| S1b | «Foreslå laginndeling» gir lag à `team_size` med flight satt | ❌ **BLOKKER** | Redirect `?error=db_roster`; 0 rader skrevet. Se F1 |
| S1c | «Flytt» flytter én spiller; SQL viser `team_number`/`flight_number` satt | ✅ | 4 flytt utført via UI; SQL `t1/f1, t1/f1, t2/f2, t2/f2` |
| S2a | Start med utildelte lag → `unassigned_teams` (admin-banner) | ✅ | `?error=unassigned_teams` + banner «Noen spillere står uten lag…»; status forble `scheduled` |
| S2b | Game-home-banner | ✅ | «4 spillere står uten lag ennå. Arrangøren setter opp lagene før start.» |
| S2c | Cron/auto-start logger strukturelt | ✅ | Server-logg `[auto-start] … could not flip to active: unassigned_teams`; `STRUCTURAL_BLOCK_REASONS` + `KNOWN_BLOCK_REASONS` utvidet (også drive-by `unassigned_flights`) |
| S2d | Etter tildeling starter spillet og tavla viser alle lag | ✅ | `status='active'`; tavla lister «Lag 1 · Test · Test» og «Lag 2 · Anders · TEST», «2 lag er på vei ut» — ingen spiller droppet |
| S3 | Solo-format og matchplay uberørt | ✅ | Enumerert alle 22 `GameMode` × 4 `mode_config`-former (probe). Ikke blokkert: solo-stableford (`team_size:1`), solo_strokeplay, alle 6 matchplay, wolf, round_robin, nassau, skins, bingo, nines, acey_deucey. Blokkert: best_ball, texas, ambrose, florida, shamble, patsome, par-stableford (`team_size` 2/4) |
| S4 | Ingen 4-hardkoding igjen; `grep [1, 2, 3, 4]` i page.tsx = 0 | ✅ | 0 treff i fila og i hele `admin/games/[id]/` |
| S5 | `.changes`-notat parser; build/lint/vitest grønt | ✅ | Se Porter |

## Porter

| Port | Kommando | Resultat |
|---|---|---|
| Målrettet vitest | `npx vitest run lib/games "app/[locale]/admin/games/[id]" lib/notifications "app/[locale]/games/[id]/(home)"` | ✅ 86 filer / 1558 tester |
| Full vitest | `npx vitest run` | ✅ 486 filer / 6379 tester, exit 0 |
| Typer | `npx tsc --noEmit -p .` | ✅ exit 0, 0 linjer |
| Lint | `npm run lint` | ✅ 0 errors (56 warnings, alle pre-eksisterende complexity i urørte filer; 0 i `teamScope.ts`/`LagSeksjon.tsx`/`flightActions.ts`) |
| Ukesslipp | `node scripts/weekly-release.mjs --dry-run` | ✅ exit 0; 66 notater; begge 1669-notatene parser (feat → Funksjon-blokk, fix → Feilrettings-linje) |
| JSON | `messages/no.json` + `messages/en.json` | ✅ parser, 48 topp-nøkler hver; alle nye `admin.game.teams.*`, `errors.*`, `banners.*`, `blockReasons.*` finnes i BEGGE |

### Mutasjonsprobe
Fjernet «fyll eksisterende delvise lag først»-grenen i `nextTeamWithSpace`
(`lib/games/teamScope.ts`) → **8 tester røde** i `teamScope.test.ts` + `flightActions.test.ts`.
Regelen er reelt testdekket, ikke dekorativ. Reverterte umiddelbart (`git checkout --`).

## Byggerens avvik — dom

1. **`startScheduledGame` bruker `teamSize = mode_config.team_size ?? 1`** (delt med
   matchplay-vakta) i stedet for `expectedTeamSize` (fallback 2). **RIKTIG, og strengt
   tryggere enn kontrakten.** Enumerering over alle 22 modi bekrefter at `?? 1` gir presis
   klassifisering; `expectedTeamSize` ville gjort et stableford uten `team_size` til et
   lagformat og blokkert helt normale solo-runder fra å starte. Uttrykket er dessuten bare
   heist ut av matchplay-blokka — identisk semantikk der. **Men** avviket skaper en
   divergens mot UI-/action-lane-en; se F3.
2. **Begge actionene gater på `modeRequiresTeamNumber` via `loadTeamGame`.** Riktig — wolf
   og round robin lagrer rotasjons-slots i `team_number`, og `isSoloFormat` returnerer
   `true` for begge, så actionene kan aldri skrive over en rotasjon. Bekreftet i proben.
3. **Kontraktfila feid inn i commit `960e34b1`.** Kosmetisk; ingen innvirkning på leveransen.
4. **`bucketPlayers`-helper i `page.tsx`.** Map-basert, null-sikker, `teamsMax` fra
   `mode_config.teams_count` med faktisk roster som gulv. Ryddigere enn kontraktens
   formulering. Ingen innvending.

---

## Staging-bevis

Rigg: `E2E-1669-BestBall` (`47028a18-…`), `game_mode='best_ball'`,
`mode_config={kind:best_ball,team_size:2,teams_count:2,allowance_pct:85}`,
`status='scheduled'`, `registration_mode='open'`, `registration_type='solo'`,
`scheduled_tee_off_at` 3 t tilbake, 4 `game_players` med `team_number=null, flight_number=null`.
Kjørt mot `npx next dev -p 3149` fra worktree-rota (cwd verifisert med `lsof`), `.env.staging.local`.

| Akseptansepunkt | Struktur-orakel | Feillogg | SQL-orakel |
|---|---|---|---|
| Lag-seksjon vises med «Uten lag (4)» | `[data-testid=team-section]` = 1; `team-suggest` = 1; `team-move-*` = 4; tekst matcher `/uten lag \(4\)/i` | rent | `status=scheduled`; 4 rader `t=null/f=null` |
| Start blokkert av utildelte lag | URL `?error=unassigned_teams`; banner «Noen spillere står uten lag. Fordel dem på lag før du starter runden.» | rent | `status` fortsatt `scheduled`; 4 rader uendret `t=null` |
| Game-home viser venter-banner | «4 spillere står uten lag ennå. Arrangøren setter opp lagene før start.» | strukturell auto-start-logg (forventet) | `status` fortsatt `scheduled` |
| **«Foreslå laginndeling»** | knapp klikket → URL `?error=db_roster` | `[fetchTeamPlayers] game_players read failed … 42703 column game_players.created_at does not exist` | **4 rader fortsatt `t=null/f=null` — 0 skrevet** ❌ |
| «Flytt» til ledig lag | `[data-testid=team-move-<uid>]` select+submit; ingen error-param | rent | rad → `t3` (flight beholdt `f2`, som spesifisert) |
| «Flytt» til fullt lag | URL `?error=team_full`; banner «Det laget er fullt. Velg et annet lag.» | rent | rad **uendret** (ingen skriving) |
| Start etter full tildeling | ingen error-param | rent | `status='active'`; `t1/f1, t1/f1, t2/f2, t2/f2` |
| Tavla viser alle lag | «2 lag er på vei ut»; startliste «Lag 1 · Test · Test», «Lag 2 · Anders · TEST» | rent | 4 av 4 spillere representert, ingen droppet |
| **Kontroll: solo-stableford (`mode_config {}`)** | `[data-testid=team-section]` = **1** (forventet 0) | rent | `game_mode=stableford, mode_config={}, status=scheduled` ❌ divergens |

**Prod-vakt:** alle observerte Supabase-verter = `snwmueecmfqqdurxedxv.supabase.co`.
`prodViolations` = **0** på tvers av alle tre drive-kjøringer. Ingen skriving mot prod;
ingen prod-spørring i det hele tatt.

**Feillogg-oraklene samlet:** `MISSING_MESSAGE` = 0. `requestfailed` (eks. `ERR_ABORTED`) = 0.
Console-errors = 1 totalt, og det er den tilsiktede strukturelle auto-start-loggen
(`[auto-start] … unassigned_teams`) — ikke en defekt.

**Opprydding:** `scores` (12), `game_players` (4) og `games` (1) slettet — verifisert 0 rader
igjen på alle tre, og `games?name=like.E2E-1669*` = tom. Ingen `notifications` refererte
rigg-spillet. Dev-serveren stoppet (0 lyttere på 3149). `git status` ren; eneste sporet etter
økta er denne fila under `.forge/`.

---

## Funn

### F1 — BLOKKER · `app/[locale]/admin/games/[id]/flightActions.ts:194` · kriterium S1b

`fetchTeamPlayers` sorterer på `created_at`:

```ts
.select('user_id, team_number, flight_number, withdrawn_at')
.eq('game_id', gameId)
.order('created_at', { ascending: true })   // ← kolonnen finnes ikke
```

`game_players` har **ingen** `created_at`-kolonne (PostgREST: `42703 column
game_players.created_at does not exist`, hint peker på `accepted_at`). Dermed returnerer
`fetchTeamPlayers` alltid `null`, og `suggestTeamAssignment` redirecter alltid til
`?error=db_roster`. **Hovedfeaturen i denne PR-en er 100 % ikke-funksjonell.**

Kontrakten foreskrev «i `created_at`-rekkefølge», så byggeren fulgte spec-en — men spec-en
var feil mot live-skjemaet (AGENTS.md felle 1: live DB er fasit, ikke hukommelse/kontrakt).

Enhetstestene fanget det ikke fordi `flightActions.test.ts` mocker Supabase-klienten;
mocken validerer ikke kolonnenavn. Dette er også en test-designsvakhet verdt å notere.

**Fix:** bytt sorteringen til en kolonne som finnes. `accepted_at` er den nærmeste
påmeldingsrekkefølgen (den er nullable, så `nullsFirst`/`nullsLast` bør velges bevisst);
`user_id`-sorteringen alene er et deterministisk minimum. Deretter må dette verifiseres
mot ekte DB, ikke bare mot mocken.

### F2 — HØY, pre-eksisterende · `app/[locale]/admin/games/[id]/flightActions.ts:50,52`

**Nøyaktig samme defekt finnes i flight-tvillingen på `origin/main`** — `fetchFlightPlayers`
både selecter og sorterer på `created_at`. Innført i `382597a6` («feat(admin):
flight-inndeling i Sekretariatet med auto-forslag (#543)»). Det betyr at «Foreslå
inndeling» for flighter etter alt å dømme har vært knekt i prod siden #543/#1441 og alltid
returnert `?error=db_roster`.

Byggeren speilet altså en allerede ødelagt tvilling — mønsteret var feilen (AGENTS.md:
«jeg fikset det rapporterte stedet» → søsken-modulen har samme feil).

Anbefaling: fiks begge i denne PR-en (én linje hver, samme fil, samme rotårsak) og nevn
flight-siden eksplisitt i commit-body + closing-kommentar. Skal den holdes utenfor scope,
MÅ den opprettes som eget issue med milestone før merge.

### F3 — MIDDELS · `lib/games/startScheduledGame.ts:131` vs `flightActions.ts:172` + `page.tsx:896` · kriterium S3

To lanes klassifiserer «er dette et lagformat?» med hver sin fallback:

* start-vakta: `mode_config?.team_size ?? 1`
* Lag-seksjonen og `loadTeamGame`: `expectedTeamSize(mode_config)` → fallback **2**

For `stableford`/`modified_stableford` der `mode_config` mangler `team_size` spriker de:
start-vakta leser solo (blokkerer ikke — riktig), mens UI-et og actionene leser lagformat.

**Ikke teoretisk:** staging har **4 `scheduled`/`active` stableford-spill med
`mode_config: {}`**, og det er verifisert live at Lag-seksjonen faktisk rendres på et av dem
(`91936001-…`, `E2E-1230-innboksgate`). En admin kan der trykke «Flytt» og skrive
`team_number` inn i et solo-spill. Konsekvensen er mild (solo-stableford ignorerer
`team_number`, spillet starter fortsatt), men den motsier `teamScope.ts` sin egen JSDoc
(«den ene sannhetskilden … så UI og guard ikke kan divergere») og AGENTS.md felle 4
(«en regel har ett hjem»).

På staging kommer de tomme configene fra e2e-generatorene; det ene veiviser-opprettede
stableford-spillet har korrekt `team_size: 1`. Prod er ikke undersøkt (utenfor mandatet
for denne økta) — bør sjekkes før man avgjør hvor hardt dette rammer.

**Fix (minste inngrep):** la begge lanes gå gjennom én helper med samme fallback — enten
løft `?? 1`-semantikken inn i `teamScope.ts` (f.eks. `teamSizeForGuard(modeConfig)`) og
bruk den i alle tre kallstedene, eller la `page.tsx`/`loadTeamGame` bruke den samme `?? 1`.

### Ikke-funn (vurdert og avvist)

* **Per-rad «Flytt»-form har ingen `action=`-prop** (kun `onSubmit`), altså JS-påkrevd.
  Identisk med `FlighterSeksjon.tsx:124–130` — etablert konvensjon i repoet, ikke en
  regresjon i denne PR-en.
* **`expectAffected` + try/catch/`failure`-mønsteret** i begge actionene er korrekt:
  `redirect()` kastes utenfor `try`, så NEXT_REDIRECT blir aldri slukt. 0-rads-skriving
  ville blitt fanget (AGENTS.md felle 2) — i motsetning til flight-actionens error-only-sjekk.
* **`teamsMax`/`teamSlots`-omskrivingen** i `page.tsx` er null-sikker og roster-avledet;
  best_ball beholder tomme slots opp til `teams_count`, de skalerende formatene viser kun
  lag med spillere. Ingen 4-hardkoding igjen.
* **i18n:** alle nye nøkler finnes i både `no.json` og `en.json`; 0 `MISSING_MESSAGE` under
  hele klikk-runden.
* **Drive-by `unassigned_flights`** lagt til i `STRUCTURAL_BLOCK_REASONS` og
  `KNOWN_BLOCK_REASONS` — reell forbedring, nevnt i commit-body som kontrakten ba om.

## Gjenstående verifisering (blokkert av F1)

Disse kan først bekreftes når F1 er fikset:

* «Foreslå laginndeling» fyller eksisterende delvise lag først, deretter nye fra laveste
  ledige nummer, i påmeldingsrekkefølge — mot ekte DB (enhetstestene dekker logikken, men
  ikke at spørringen i det hele tatt går).
* At `flight_number` settes sammen med `team_number` av forslaget (CHECK 0095) på ekte rader.
* Samme runde for flight-tvillingen hvis F2 fikses her.

---

# Runde 2

**Fikskommit:** `10a7941c` — «fix(admin): sort roster fetches on accepted_at
(created_at does not exist) and unify the team-size fallback»
**Evaluator:** fersk kontekst, skeptisk. Statiske porter + full staging-klikkrunde på nye rigger.
**Dato:** 2026-08-16

## VERDICT: ACCEPT

Alle tre funnene fra runde 1 er verifisert lukket mot ekte staging-DB: «Foreslå
laginndeling» skriver nå lag (F1), flight-tvillingen som har vært stille knekt siden
#543 virker igjen (F2), og Lag-seksjonen dukker ikke lenger opp på et solo-stableford
uten `team_size` (F3). Ett nytt, kosmetisk funn (F4 — etterlatt JSDoc-blokk som
motsier koden) bør ryddes i samme PR, men blokkerer ikke.

## Statiske porter

| Port | Kommando | Resultat |
|---|---|---|
| Målrettet vitest | `npx vitest run lib/games "app/[locale]/admin/games/[id]" lib/notifications "app/[locale]/games/[id]/(home)"` | ✅ 86 filer / 1558 tester, 0 røde |
| Typer | `npx tsc --noEmit -p .` | ✅ exit 0, 0 linjer output |
| Lint | `npm run lint` | ✅ exit 0 — 0 errors, 56 warnings (alle pre-eksisterende complexity i urørte filer) |
| Ukesslipp | `node scripts/weekly-release.mjs --dry-run` | ✅ exit 0; 67 notater; alle tre 1669-notatene parser (1 feat → Funksjon-blokk, 2 fix → Feilrettings-linjer) |
| Skjema-fasit | `lib/database.types.ts:461-480` | ✅ `game_players.accepted_at: string \| null` finnes; **ingen** `created_at`-kolonne på tabellen |

**Kolonne-fiksen er reell mot live-skjema,** ikke bare mot mocken: begge fetcherne
(`fetchFlightPlayers` og `fetchTeamPlayers`) sorterer nå `accepted_at ASC nullsLast`,
deretter `user_id`. `accepted_at` ligger ikke i `.select()`-lista på `fetchTeamPlayers`
— PostgREST tillater sortering på en ikke-selektert kolonne, bekreftet live (spørringen
gikk gjennom og ga riktig rekkefølge).

## Dom: er `DEFAULT_TEAM_SIZE = 1` trygt for kapasitetssjekken i `setPlayerTeam`?

**Ja.** Tre uavhengige belegg:

1. **Typeunionen** (`lib/scoring/modes/types.ts:444-720`): hvert eneste lag-format bærer
   `team_size` i configen — `best_ball: 2`, `texas_scramble: 2|4`, `ambrose: 2|4`,
   `florida_scramble: 3|4`, `shamble: 3|4`, `patsome: 2`, `stableford/modified_stableford: 1|2`.
   Fallbacken kan derfor per konstruksjon aldri gjelde et ekte lag-format.
2. **Validatoren** (`lib/games/gamePayload.ts`): alle mode_config-utganger skriver
   `team_size` eksplisitt. Veiviser-opprettede spill har det alltid.
3. **Staging-fasit:** 23 spill i lag-kapable modi, 11 mangler `team_size` — **alle 11 er
   `stableford` fra e2e-generatorene**. Strikte lag-formater uten `team_size`: **0**.

Restrisiko (navngitt, ikke blokkerende): skulle en rad med strikt lag-format en gang
mangle `team_size`, gir fallback 1 «lag fullt» ved én spiller og ett lag per spiller i
forslaget — synlig degradering, men ikke-destruktiv og selvforklarende. Den gamle
fallbacken (2) hadde motsatt og verre feilmodus: den rendret Lag-seksjonen på solo-
stableford og lot admin skrive `team_number` inn i et solo-spill (runde 1 F3, bekreftet
live). 1 er strengt bedre.

## Per-punkt-dom

| # | Akseptansepunkt | Dom |
|---|---|---|
| 1 | «Uten lag (4)» + start blokkert `unassigned_teams` | ✅ PASS |
| 2 | «Foreslå laginndeling» → `?status=team_suggested`, 4 rader lag ∈ {1,2} to og to, flight satt | ✅ PASS |
| 3 | «Flytt» til lag 3 OK; flytt inn i fullt lag → `team_full`, rad uendret | ✅ PASS |
| 4 | Start → `active`; tavla viser 2 lag, 4/4 spillere | ✅ PASS |
| 5 | Flight-tvilling: «Foreslå inndeling» → `?status=flight_suggested`, flight satt | ✅ PASS (pre-eksisterende prod-bug F2 lukket) |
| 6 | Kontroll: solo-stableford uten `team_size` → ingen Lag-seksjon, ikke blokkert av `unassigned_teams` | ✅ PASS (F3 lukket) |

## Staging-bevis

Rigger (opprettet og slettet i denne økta, alle på ref `snwmueecmfqqdurxedxv`):
`E2E-1669-R2-BestBall` (`573ae121-…`, best_ball, `team_size:2, teams_count:2`, 4 solo-
påmeldte, `team_number`/`flight_number` = null), `E2E-1669-R2-Flights` (`331aaeea-…`,
solo_strokeplay, 5 spillere, flight null) og `E2E-1669-R2-Control` (`61d9fd30-…`,
stableford, `mode_config {}`, 4 spillere). Alle `scheduled`, tee-off 3 t tilbake, kjørt
mot `npx next dev -p 3150` startet fra worktree-rota med `.env.staging.local` (cwd
verifisert med `lsof`: `…/worktrees/forge-auto-issue-0715fa`), `rm -rf .next` før boot.
Drevet med Playwright via Bash, OTP-mintet admin-innlogging.

| Akseptansepunkt | Struktur-orakel | Feillogg | SQL-orakel |
|---|---|---|---|
| Lag-seksjon med «Uten lag (4)» | `[data-testid=team-section]` = 1; `team-suggest` = 1; `team-move-*` = 4; tekst matcher `/uten lag \(4\)/i` | rent | 4 rader `t=null/f=null`, `status=scheduled` |
| Start blokkert av utildelte lag | `?error=unassigned_teams`; banner «Noen spillere står uten lag …» | rent | `status` fortsatt `scheduled`; 4 rader uendret `t=null` |
| **«Foreslå laginndeling»** | `?status=team_suggested` (ren URL før klikk, ingen restparam) | rent | `t1/f1, t1/f1, t2/f2, t2/f2` — to per lag, **alle flights satt**, rekkefølgen følger `accepted_at` ✅ |
| «Flytt» til ledig lag 3 | `?status=team_updated` | rent | rad → `t3`, flight beholdt `f2` |
| «Flytt» inn i fullt lag 1 | `?error=team_full`; banner «Det laget er fullt …» | rent | rad **uendret** på `t3` (0 skrevet) |
| Start etter full tildeling | `?status=started` | rent | `status='active'`; `t1/f1, t1/f1, t2/f2, t2/f2` |
| Tavla viser alle lag | «2 lag er på vei ut»; startliste «1 Lag 1 · Test · Test» + «2 Lag 2 · Anders · TEST» | rent | 4 av 4 spillere representert, ingen droppet |
| **Flight-tvilling: start blokkert** | `?error=unassigned_flights` | rent | 5 rader `f=null`, `status=scheduled` |
| **Flight-tvilling: «Foreslå inndeling»** | `?status=flight_suggested`; seksjonen viser Flight 1 og Flight 2 | rent | `f1,f1,f1,f1,f2` — **alle satt** ✅ (var alltid `?error=db_roster` før fiksen) |
| Nulls-last-probe (`accepted_at = null`) | `?status=flight_suggested` | rent | den NULL-aksepterte havnet **sist** (flight 2), de fire med tidsstempel i flight 1 ✅ |
| **Kontroll: stableford `mode_config {}`** | `[data-testid=team-section]` = **0** (forventet 0) | rent | `game_mode=stableford, mode_config={}` |
| Kontroll: start ikke blokkert av lag | `?status=started`, ingen `error`-param | rent | `status='active'` med `t=null` på alle 4 — solo starter fritt ✅ |

**Prod-vakt:** alle observerte Supabase-verter over alle fire drive-kjøringene =
`snwmueecmfqqdurxedxv.supabase.co`. `prodViolations` = **0**. Ingen spørring eller
skriving mot prod i det hele tatt.

**Feillogg-orakler samlet:** console-errors = **0**, `MISSING_MESSAGE` = **0**,
`requestfailed` (eks. `ERR_ABORTED`) = **0**, `pageerror` = 0.

**Opprydding:** `game_players` (13), `games` (3) og 8 `game_started`-notifikasjoner som
refererte riggene er slettet. Verifisert 0 rader igjen på `scores`, `game_players`,
`games` og notifikasjons-payloads; `games?name=like.E2E-1669*` = tom. Dev-serveren
stoppet (0 lyttere på 3150). `git status` ren — eneste sporet etter økta er denne fila
under `.forge/`.

## Funn

### F1 (runde 1) — LUKKET
`fetchTeamPlayers` sorterer nå på `accepted_at`. «Foreslå laginndeling» skrev
`t1/f1, t1/f1, t2/f2, t2/f2` mot ekte DB og redirectet til `?status=team_suggested`.
Regelen «fyll eksisterende delvise lag først» og CHECK-kravet om flight sammen med lag
er begge bekreftet på ekte rader.

### F2 (runde 1) — LUKKET
Flight-tvillingen er fikset i samme fil og samme commit, og verifisert på egen rigg:
«Foreslå inndeling» for flighter går fra alltid-`?error=db_roster` til
`?status=flight_suggested` med `f1,f1,f1,f1,f2`. Notatfila
`.changes/1669-flightforslag-kolonne.md` beskriver det i eierens språk. Ingen eget issue
nødvendig.

### F3 (runde 1) — LUKKET
`DEFAULT_TEAM_SIZE = 1` og `startScheduledGame` som bruker `expectedTeamSize()` gir én
felles klassifisering. Kontrollen live: et stableford med `mode_config {}` viser **ingen**
Lag-seksjon og starter uten `unassigned_teams`. Divergensen mellom UI-lane og start-vakt
er borte.

### F4 — LAV (kosmetisk) · `lib/games/teamScope.ts:24-27`

Den gamle JSDoc-blokken over `DEFAULT_TEAM_SIZE` ble ikke fjernet da den nye ble lagt
til. Konstanten har nå to stablede doc-blokker, og den øverste sier det motsatte av
koden:

```ts
/**
 * Fallback-lagstørrelse når `mode_config.team_size` mangler. Par (2) er den
 * vanligste lag-formen (best ball, patsome, par-stableford, shamble-preset).
 */
/**
 * Fallback når `mode_config.team_size` mangler: 1 (solo). …
 */
export const DEFAULT_TEAM_SIZE = 1;
```

Ingen funksjonell effekt, men det er nøyaktig den typen etterlatt kommentar som sender
neste bygger feil vei — og commit-en her ble skrevet for å fjerne akkurat den slags
drift. Fjern de fire linjene før merge.

### Gjenstående svakhet (ikke blokkerende, arvet fra runde 1)

`flightActions.test.ts` mocker Supabase-klienten, så mocken validerer hverken
kolonnenavn eller sorteringsuttrykk. Kolonnefeilen som knakk begge knappene ville
fortsatt gått grønt gjennom hele unit-suiten — bare staging-runden fanger den. Verdt et
eget issue om test-riggen skal kunne fange skjema-drift, men det er ikke noe denne PR-en
skylder.

### Ikke-funn (vurdert og avvist)

* **`accepted_at` mangler i `.select()`-lista** på `fetchTeamPlayers` — PostgREST
  tillater sortering på ikke-selekterte kolonner; verifisert live.
* **`nullsFirst: false`** — påstanden er ikke bare deklarativ: en NULL-`accepted_at`-rad
  havnet sist i fordelingen på ekte data.
* **`suggestTeamSplit(players, 0)` gir nå ett lag per spiller** i stedet for par. Riktig
  konsekvens av fallback 1, og bare nåbar via en ugyldig `team_size` som validatoren
  aldri skriver.
* **Test-justeringene** i `teamScope.test.ts` og `flightActions.test.ts` speiler
  oppførselsendringen; ingen assertion er svekket, bare snudd til den nye fasiten.
