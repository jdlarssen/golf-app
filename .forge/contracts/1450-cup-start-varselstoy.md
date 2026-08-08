# Kontrakt: #1450 — ett start-varsel per spiller ved cup-start

**Issue:** [#1450](https://github.com/jdlarssen/golf-app/issues/1450)
**Branch:** `claude/forge-auto-1450-713f69`
**Type:** refactor + fix (bruker-synlig: færre varsler)

---

## Problemet

Splittet cup-dag (#1441) lager fire spill per flight, alle med samme
`scheduled_tee_off_at` (`resolveScheduledTeeOffAt`, `lib/cup/splitDayLineup.ts:249`):

| # | Format | Segment | Host/avledet |
|---|---|---|---|
| 1 | `greensome_matchplay` | front9 | host |
| 2 | `best_ball` | back9 | host |
| 3–4 | `singles_matchplay` × 2 | back9 | avledet (`source_game_id` → best_ball) |

Hver spiller står i tre av dem (greensome, best ball, én singles).

Cron-sweepen (`app/api/cron/start-scheduled-games/route.ts`) behandler hvert due
spill uavhengig og fyrer `game_started` per spill den selv vinner flippen på.
`startDerivedGames` fyrer ingen. Antall varsler per spiller blir derfor 2–3,
avhengig av hvilken rekkefølge `due`-spørringen tilfeldigvis returnerer radene i
(ingen `ORDER BY`):

- Sweepen tar best_ball først → `startDerivedGames` starter begge singles stille →
  singles taper sin egen flipp senere i samme sweep → **2 varsler** (greensome + best ball).
- Sweepen tar en singles først → den vinner sin egen flipp og varsler → **3 varsler**
  for de to spillerne i den matchen.

Ikke en funksjonsfeil, men udeterministisk støy. I tillegg gjenstår to kommentarer
som beskriver verden før F3d og vil sende neste agent feil vei (I1-felle).

---

## Ønsket adferd

Ett `game_started`-varsel per spiller per cup-start, og det peker på greensome-
matchen — det fysiske spillet spilleren faktisk åpner først (front9).

---

## Design

### Regel 1 — avledede spill annonserer aldri seg selv

Et spill med `source_game_id != null` fyrer aldri `game_started`. Verten eier
varselet: en avledet singles har alltid et delsett av vertens tropp, og alle tre
start-veiene (cron-sweep, E1-sidebesøk, admin-knapp) fanner allerede ut til de
avledede spillene via `startDerivedGames`.

Regelen får **ett hjem**: `notifyPlayersGameStarted` i `lib/notifications/events.ts`.
`game`-argumentet utvides fra `{ id, name }` til `{ id, name, sourceGameId }`, og
helperen returnerer tidlig når `sourceGameId != null`. Feltet er påkrevd (ikke
valgfritt) med vilje — da tvinger typesjekken hver av de tre kall-stedene til å
svare på spørsmålet, i stedet for å miste vakten i stillhet (trap 4:
«a rule has one home»).

### Regel 2 — maks ett varsel per (spiller, cup) per sweep

Cron-ruta bygges om til to faser:

1. **Flipp-fasen** — uendret løkke over `due`; samler de spillene som faktisk ble
   startet (`result.started === true`) med `id, name, tournament_id, hole_segment,
   source_game_id`.
2. **Varsel-fasen** — henter tropp for de startede spillene, velger én
   (spiller → spill)-binding per spiller, og kaller `notifyPlayersGameStarted` én
   gang per spill med kun de spillerne det spillet «vant».

Valget er ren logikk i en ny, testbar modul
`lib/notifications/startNotificationTargets.ts`. Sorteringsnøkkel per spill:

1. `hole_segment`-rang: `front9` (0) → `full` (1) → `back9` (2) — front9 spilles først.
2. `id` stigende — deterministisk tie-break, aldri spørrings-rekkefølgen.

Dedup-nøkkelen er `(user_id, tournament_id)`. Spill uten `tournament_id` dedupes
**aldri** — to urelaterte spill som tilfeldigvis starter samme minutt skal fortsatt
gi hvert sitt varsel. Støyen er et cup-bunt-artefakt, og fiksen holder seg der.

### Regel 3 — kommentar-oppretting

- `lib/games/syncDerivedGamesStatus.ts` (`startDerivedGames`s docstring): påstanden
  «cup-generated matches never get a `scheduled_tee_off_at`» er usann etter F3d —
  `app/[locale]/admin/cup/[id]/generer/actions.ts:410` setter feltet på **begge** pass.
- `app/[locale]/games/[id]/(home)/page.tsx` (E1-grenen): «this branch doesn't fire
  for them today» er misvisende av samme grunn.

Begge skrives om til å beskrive dagens virkelighet, inkludert hvorfor
`startDerivedGames` fortsatt trengs (avledede spill må gjennom den ekte
`startScheduledGame`-flyten for å fryse `course_handicap`).

---

## Produktvalg (til eier)

Ett reelt valg, merkbart for spillerne — bygget som **A**, **B** beskrevet:

- **A (bygget): varselet peker på greensome-matchen.** Spilleren trykker på varselet
  og lander rett på spillet de skal føre først.
- **B: varselet peker på cup-siden.** Spilleren lander i cup-rommet og velger selv
  hvilken match de vil åpne.

Ombyggingskostnad B: liten — samme varsel, annen deeplink (`cup_started`-kinden
finnes allerede og peker dit). Reversibelt uten datatap.

---

## Suksesskriterier

- [ ] **K1** — En sweep med alle fire bunt-spillene fra én flight gir nøyaktig ett
      `game_started` per spiller, uavhengig av rekkefølgen på `due`-radene.
      *Evidens:* Type A-test som kjører selektoren med begge rekkefølgene (host
      først, avledet først) og får identisk resultat.
- [ ] **K2** — Det ene varselet peker på greensome-spillet (front9-verten).
      *Evidens:* samme test asserter valgt `gameId`.
- [ ] **K3** — `notifyPlayersGameStarted` returnerer uten å skrive noe når
      `sourceGameId != null`. *Evidens:* test i `lib/notifications/events.test.ts`
      som asserter 0 `notify`-kall.
- [ ] **K4** — Alle tre start-veiene sender `sourceGameId` (typesjekken tvinger det).
      *Evidens:* `npm run build` grønn + `file:line` per kall-sted.
- [ ] **K5** — Spill uten `tournament_id` dedupes aldri.
      *Evidens:* Type A-test med to samtidige, urelaterte spill → to bindinger.
- [ ] **K6** — Ingen avledede spill i varsel-fasen: en sweep der kun avledede spill
      startet gir null varsler. *Evidens:* Type A-test.
- [ ] **K7** — De to utdaterte kommentarene beskriver F3d-virkeligheten.
      *Evidens:* `file:line` på begge.

---

## Gates

```bash
npx vitest run lib/notifications/startNotificationTargets.test.ts lib/notifications/events.test.ts lib/games/syncDerivedGamesStatus.test.ts
npm run build
npm run lint
```

`npm run build` (ikke bare `tsc`) fordi cacheComponents-feil kun dukker opp der
(bindings §T2).

---

## Avgrensninger

- **Ingen ny notification-kind.** `cup_started` finnes og fyres allerede av
  `startTournament` når arrangøren starter cupen; denne runden rører den ikke.
- **Kryss-vei-kappløp består.** Vinner et E1-sidebesøk flippen på greensome mens
  cron tar best ball, kan en spiller fortsatt få to varsler. Det krever en
  persistent dedup-nøkkel (lesing av `notifications`-tabellen per fan-out) og er
  utenfor scope — sweepen er kilden til den udeterministiske støyen issuet gjelder.
- **Ingen migrasjon, ingen RLS-endring.** Ren applikasjonslogikk.

---

## Antakelser

- ASSUMPTION: «per fysisk runde» i issue-teksten leses som det svakere alternativet;
  eieren ba primært om «ett varsel per spiller per cup-start», og siden greensome
  (front9) og best ball (back9) deler tee-off-tidspunkt ville «per fysisk runde»
  uansett gitt to samtidige varsler. Bygget mot ett.
