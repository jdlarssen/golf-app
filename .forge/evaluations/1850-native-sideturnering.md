# Evaluering: #1850 — native sideturnering (LD/CTP + poengjakt)

**Verdikt: ACCEPT**

Evaluator-økt 2026-08-31, fersk kontekst, branch `claude/native-sideturnering-1850`
(7 commits over `origin/main` = `38cd745d`). Alle kommandoer kjørt av meg i denne økta.
Ingen av byggerens tall er overtatt på tro — de to som betyr mest (poengsummene og
vitest-baselinen) er reprodusert uavhengig.

---

## Per kriterium

### 1. Jest-låst logikk — HOLDER

`npx jest` i `native/app/`: **exit 0, 27 suiter, 346 tester**.

Testinnholdet dekker det kontrakten krever, og jeg har verifisert at det ikke er
false-green (se Mutasjonsprober). `sideTournament.test.ts` (604 linjer) har egne
describe-blokker for LD-slots, withdrawn players, byTeamNumber-grouping, solo-grouping,
`resolveTeamGrouping` og netto-per-hole. Bundle-v3-mappingen er dekket i
`gameBundle.test.ts` (+24 linjer). Copy-paritetstesten leser faktisk `messages/no.json`
og bruker `toStrictEqual` — ikke en attrapp.

### 2. Ende-til-ende på staging (score-format) — HOLDER, uavhengig reprodusert

Appen (simulator, spill A) viser:

| | App | Min uavhengige rekjøring |
|---|---|---|
| 🥇 Anders Berg | 66p | **66p** |
| 🥈 Test Spiller | 34p | **34p** |
| 🥉 Christian Eide | 10p | **10p** |
| · Bjørn Dahl | 4p | **4p** |

Jeg stolte ikke på byggerens kryssjekk. I stedet hentet jeg spill A rått fra
staging med service-role og **reimplementerte webbens `computeSideTournament`-oppskrift
selv** (inkludert webbens `users != null`-filter, som appen bevisst dropper) og kjørte
den gjennom den delte `calculateSideTournament`. Resultatet er identisk med appens.

Motoren emitterer for Test Spiller:

```
longest_drive 2p Slot 1
longest_drive 2p Slot 2      ← samme spiller, begge slots, 4p
hole_win 2p × 5 (hull 4, 10, 14, 16, 17)
snowman -2p
```

De 20 award-linjene summerer til nøyaktig 34p, og appens ekspanderte kort viser de
samme linjene.

Hovedtabellen (46/41/37/28) leste jeg fra webbens faktisk rendrede podium på
`localhost:3100` — identisk med appens.

**Hva jeg IKKE fikk verifisert:** webbens «Sideturnering»-FANE. React hydrerte aldri i
nettleser-panelet (tab-knappen fikk ingen `__reactFiber$`-nøkkel, konsollen full av
«unknown error occurred when fetching the script»; kjent begrensning per #1219), så
`.click()` byttet aldri panel. Jeg erstattet den visuelle web-sammenligningen med den
uavhengige rekjøringen over. Den er sterkere for TALLENE, men den beviser ikke webbens
RENDRING av sideturnerings-fanen. Byggerens påstand om at Test Spillers kort er «tegn
for tegn identisk» på tvers av flatene er derfor **ikke etterprøvd av meg**.

### 3. Matchplay + aktiv runde — HOLDER

**Spill B** (finished singles matchplay), simulator: duellkortet «Test Spiller mot
Anders Berg / AS», hull-for-hull-stripa, og under dem seksjonen «SIDETURNERING» med
«Lengste drive #1: Anders» + «Nærmest pinnen #1: Test», så 🥇 Anders Berg 66p /
🥈 Test Spiller 32p. Radene viser spillernavn fordi hvert lag har ett medlem —
`byTeamNumber`-grupperingen bekreftes av spill-hjemmesiden, som merker de to med
«Lag 1» / «Lag 2».

**Spill C** (aktiv, side på), simulator: «Pågående · 5 av 18 hull ført». Resultatskjermen
viser hovedtabellen (16/10/10) og **ingenting** side-relatert — ingen overskrift, ingen
LD/CTP-linjer, ingen poengjakt.

At hentingen ikke fyres er verifisert i koden, ikke bare på skjermen:
`Leaderboard.tsx:~95` kaller `useSideWinners(gameId, sideTournamentVisible(bundle))`,
`sideTournamentVisible` krever `status === 'finished'`, og
`useSideWinners.ts:59` (`if (!enabled) return;`) returnerer før `fetchSideWinners`.

### 4. Guardrail (ærlig note) — HOLDER, mutasjonsbevist

`SideTournamentSection.tsx:254`:
`const winnersMissing = sideWinnersUnavailable && ldCount + ctpCount > 0;`

Grenen er ekte testet — se Mutasjonsprober. Ved 0 slots rendres tabellen selv om
hentingen aldri lyktes, som kontrakten foreskriver (ingen rader å miste).

### 5. Web uendret — HOLDER

`git diff --name-only origin/main...HEAD | grep -v -E '^(native/|docs/|\.forge/)'` →
**0 filer**.

`npx vitest run` (rot): **exit 0, 522 filer / 7028 tester** — nøyaktig baselinen
byggeren oppga. Tallet er verifisert, ikke antatt.

### 6. Porter + runbook — runbook HOLDER, eier-tapptest står korrekt åpen

`docs/native/app-spike.md` +79 linjer med seksjonen «Sideturnering — LD/CTP + poengjakt
(#1850)». Den dekker alle fire punktene kontrakten ber om: finished-gaten,
slot-semantikken (`position` er hull-slot, samme spiller kan ta begge og få 2p × 2),
copy-paritetsmønsteret, og seed-oppskriften — inkludert de to fellene
(`scores.entered_by` NOT NULL, `mode_config` må ha `kind`).

Kriterium 6 er korrekt latt stå ukrysset i kontrakten. Eier-tapptesten på fysisk iPhone
er ikke utført og kan ikke utføres av meg.

---

## Porter — mine egne exit-koder

| Port | Exit | Detalj |
|---|---|---|
| `npx jest` (native/app) | **0** | 27 suiter, 346 tester |
| `npx tsc --noEmit` (native/app) | **0** | ingen utskrift |
| `npm run typecheck` (rot) | **0** | ingen utskrift |
| `npx vitest run` (rot) | **0** | 522 filer / 7028 tester |
| `npx eslint native/app` | **0** | ingen utskrift |
| `npx expo export --platform ios` | **HOPPET OVER** | per instruks, de øvrige var grønne |
| `npm run build` (rot) | **HOPPET OVER** | per instruks, de øvrige var grønne |

---

## Mutasjonsprober

Alle reverterte; `git status --porcelain` var tom etter hver, og full suite grønn igjen.

| # | Hva jeg brøt | Rød? | Revertert + grønt? |
|---|---|---|---|
| 1 | `SideTournamentSection.tsx:254` → `const winnersMissing = false;` | **JA** — render-testen feilet på `getByTestId('side-tournament-unavailable')` | JA, 1/1 |
| 2a | `sideTournamentCopy.ts:120` «Lengste drive» → «Lengste utslag» | **JA** — `matchplaySide er identisk med kilden` | JA, 8/8 |
| 2b | `sideTournamentCopy.ts:67` «Longest drive» → «Longest drivez» | **JA** — `awards er identisk med kilden` | JA, 8/8 |
| 3 | `sideTournament.ts:178` → `return 'solo';` | **JA** — 17 av 43 tester feilet | JA, 346/346 |

Copy-paritetstesten er altså ekte i begge retninger (både `awards`- og
`matchplaySide`-noden), og grouping-tabellen er en reell fasit, ikke dekorasjon.

**Bonusbekreftelse på copy:** jeg leste webbens faktisk utsendte i18n-payload i
nettleseren og fant `"longestDrive":"Longest drive #{pos} ({name}):"` og
`"holeWinsOn":"på {count} hull ({holes})"` — tegn for tegn likt appens copy-modul,
uavhengig av jest-testen.

---

## Svar på de åtte gravespørsmålene

1. **Slot-semantikken** — JA, bekreftet tre uavhengige veier: (a) skjermbilde av spill A
   viser «Lengste drive #1: Test» OG «Lengste drive #2: Test» som to linjer;
   (b) motoren emitterer `longest_drive 2p Slot 1` + `longest_drive 2p Slot 2`;
   (c) koden løkker `for (let pos = 1; pos <= count; pos++)` og slår opp per
   `position` (`SideTournamentSection.tsx:~509` og `:~895`). Staging-dataene har
   faktisk samme `winner_user_id` på begge LD-radene — fixturen er ekte.

2. **Aktiv runde** — JA. Ingenting rendres (skjermbilde spill C), og hentingen fyres
   ikke: `useSideWinners.ts:59` returnerer på `!enabled`, og `enabled` krever
   `status === 'finished'`. Lest i koden, ikke gjettet fra skjermbildet.

3. **Ærlig-note-grenen** — EKTE. Mutasjonsprobe 1 gjorde testen rød.

4. **teamGrouping** — 22/22 bekreftet. Stikkprøver utover de fem bestilte:
   - `best_ball`: går en HELT ANNEN vei enn `computeSideTournament` — via
     `buildSideTournamentInput` på lag-netto-linjer (`leaderboardContent.tsx:625`).
     Grupperingen er likevel lag-basert. `isSoloFormat('best_ball',1)=false` ✓
   - `modified_stableford`: har ingen egen renderer, rutes via
     `isStablefordFamily` (`leaderboardContent.tsx:255`) til `stableford.tsx`, som
     velger `byTeamNumber` (`:247`) eller `solo` (`:357`) på `result.variant`.
     Appen speiler nøyaktig dette. ✓
   - `gruesome_matchplay`: fanges av `isAlternateShotMatchplay` → `foursomesMatchplay.tsx`
     → `renderMatchplaySideSection`, som hardkoder `byTeamNumber` (`sideTournament.tsx:266`).
     `isSoloFormat=false` ✓ (dette var den mest sannsynlige lekkasjen — den holder)
   - `skins`/`wolf`/`nassau`/`nines`/`round_robin`/`acey_deucey`/`solo_strokeplay`/
     `bingo_bango_bongo` → `solo` i webbens renderere ✓
   - `texas_scramble`/`shamble`/`patsome` → `byTeamNumber` ✓

5. **Copy-paritetstesten** — EKTE. To mutasjoner, begge røde, begge revertert grønt.

6. **Web-fredningen** — 0 filer utenfor `native/`, `docs/`, `.forge/`.

7. **Avviket (navne-filteret)** — begrunnelsen er **SANN på alle fire punkter**:
   - `gameBundle.ts:211` — `name: row.users?.name ?? null` kollapser «ingen users-rad»
     og «users-rad uten navn» til samme `null`. ✓
   - `handle_new_auth_user` (`0016_harden_pending_users_trigger.sql:16`) —
     `insert into public.users (id, email, hcp_index)`. Navn settes ikke, og
     `users.name` er `string | null` (`lib/database.types.ts:1980`). En fersk
     selvregistrert spiller står altså med `name = null`. ✓
   - `anonymize_user` (`0131_user_soft_delete.sql`) — `name = 'Slettet bruker'`,
     ikke null. Et navne-filter ville derfor ikke fanget én eneste slettet bruker. ✓
   - Konsistent med `scoringContext.ts:188`, som filtrerer på nøyaktig
     `player.withdrawnAt == null` og ingenting mer. De to modulene deler skjerm og er
     enige. ✓

8. **Test-disiplinen** — HOLDER. Nøyaktig ÉN render-test i
   `SideTournamentSection.test.tsx` (ett `it`). Den asserter på rendring mot et
   håndlaget `result`-literal — den re-asserter ikke motor-tall. De fire endringene i
   eksisterende testfiler er rene type-fixture-tillegg (fire nye felter på
   `BundleGame`), påkrevd av `tsc`, ikke «mens jeg var her»-tester. Ingen `.changes/`-
   notat (korrekt — native bruker `[no-changelog]`), og alle commits har `Refs #1850`.

---

## Funn

### F1 — Den ærlige noten fungerer også som laste-tilstand (dette er feil, moderat)

`useSideWinners.ts:43-46` starter med `{ rows: [], neverLoaded: true }`, og det finnes
ingen tredje «laster»-tilstand. `SideTournamentSection.tsx:254` leser `neverLoaded`
direkte som «hentingen mislyktes». Konsekvensen: **hver gang** en spiller åpner
resultatskjermen for et avsluttet spill med sideturnering, rendres først

> «Fikk ikke tak i hvem som vant lengste drive og nærmest pinnen. Poengtavla kommer når
> nettet er tilbake.»

— og poengtavla erstatter den først når fetchen lander. På et tregt nett er det en
feilmelding som lyver om en helt frisk lasting. Fiksen er en `loading`-tilstand adskilt
fra `neverLoaded`.

**Ærlighet om evidensen:** dette er utledet fra koden, ikke observert. Jeg forsøkte å
fange glimtet med skjermbilde rett etter trykket, men verktøy-rundturen (~1 s) er
tregere enn fetchen på dette nettet, så tabellen var allerede på plass. Jeg har altså
ikke sett det med egne øyne.

### F2 — `useSideWinners` har ingen test (hull, lite/moderat)

Det finnes ingen `useSideWinners.test.ts`. Dermed er «ingen henting fyres på et aktivt
spill» — en edge case kontrakten navngir eksplisitt — ikke låst av noen test, og heller
ikke `neverLoaded`-tilstandsmaskinen (feilet fetch → blir stående true; vellykket tom
liste → false). Begge ender er testet hver for seg (`fetchSideWinners` kaster-kontrakten
i `sideWinners.test.ts`, noten i render-testen), men ledningen mellom dem er det ikke.
Koden er kort og åpenbar, så dette er et hull, ikke en feil.

### F3 — Restrisiko i det dokumenterte avviket (note, lite)

Avviket er godt begrunnet og konsistent (se spørsmål 7), men det ER en reell
oppførselsforskjell: skulle en `users`-rad noen gang mangle eller være usynlig for en
deltaker, ville webben ekskludert spilleren fra sideturneringen mens appen tar ham med
som «(ukjent)» — noe som endrer lagets best-ball og dermed sidepoengene. FK-en gjør det
utilgjengelig i praksis. Verdt en linje i issuet, ikke en blokker.

### F4 — Noten skjuler også LD/CTP-linjene (smakssak)

Når `winnersMissing` slår til, forsvinner headline-linjene sammen med tabellen. Det er
konsistent (det er nettopp de radene som mangler), men spilleren får da ingenting i det
hele tatt i stedet for delvis sannhet. Forsvarlig begge veier — ren smakssak.

### F5 — Appen arver en kjent web-copy-bug med vilje (note)

`#1852` («18 hull hull 1–18») speiles inn i appen for paritetens skyld. Det er riktig
valg gitt paritetsmandatet, og det er korrekt filet som eget issue — nevnes bare så det
ikke oppdages som «ny» feil i appen senere.

---

## Oppsummering

Arbeidet er solid. Beslutningslogikken ligger i den delte motoren, monteringen er en
tro speiling av webbens oppskrift (jeg diffet den linje for linje mot
`sideTournament.tsx:31-210` — eneste bevisste avvik er navne-filteret, og begrunnelsen
for det er verifisert sann mot migrasjonene), grupperingsregelen er utledet i stedet for
hardkodet og treffer webbens valg på alle 22 modiene, testene er mutasjonsbevist ekte,
og webben er urørt. De tre avvikene fra kontrakten er bokført åpent, ikke skjult.

Funnene over er ingen av dem blokkere. **F1** bør bli et eget issue før appen når
brukere — den viser en feilmelding under normal lasting.

**Ikke verifisert av meg:** webbens sideturnerings-fane visuelt (React hydrerte ikke i
nettleser-panelet), `npm run build`, `npx expo export`, og eier-tapptesten på fysisk
iPhone (kriterium 6, korrekt fortsatt åpen).
