# Kontrakt: best ball-allowance skal ha ett hjem (#1539 + #1551)

**Issues:** [#1539](https://github.com/jdlarssen/golf-app/issues/1539), [#1551](https://github.com/jdlarssen/golf-app/issues/1551)
**Branch:** `claude/kjoer-auto-neste-010b4f`
**Status:** aktiv

## Problemet, i én setning

I en cup-best-ball er 85 %-allowancen lagret to steder, og de to flatene som viser
resultatet leser hvert sitt sted — så kampens egen tavle og cup-poenget gir spillerne
ulikt antall slag på samme kamp.

## Bekreftet i prod (read-only SELECT, 2026-08-11)

| Spill | `games.hcp_allowance_pct` | `mode_config.allowance_pct` | Frosset banehcp | Effekt |
|---|---|---|---|---|
| TestCup – Best ball 1 (laget av koden) | 100 | 85 | 67 / 29 / 28 / −9 (rått) | tavle 100 %, cup-poeng 85 % → **#1539** |
| Ryder Cup 2026 – Best ball 1–3 (rettet for hånd) | 85 | 85 | 37 (= 85 % av 44) | tavle 85 %, cup-poeng ~72 % → **#1551** |
| SICKlestad (frittstående) | 100 | – | – | konsistent |

Den manuelle prod-rettingen for #1539 flyttet feilen fra tavla til cup-poenget. Det er
samme rot-årsak: **allowancen har to hjem** (AGENTS.md-felle #4).

## Beslutning: ett hjem = `games.hcp_allowance_pct` (anvendt ved frysing)

Cup-best-ball skal oppføre seg som frittstående best ball: allowancen anvendes én gang,
ved frysing av `game_players.course_handicap`, og alle flater leser den frosne verdien rått.

**Forkastet alternativ:** gi `best_ball` en levende `allowance_pct` i `GameModeConfig`
som anvendes ved beregning (matchplay-familiens mønster). Grunner:

- frittstående best ball bor allerede i frysings-hjemmet — matchplay-mønsteret ville gitt
  frittstående spill **to** levende hjem, altså nøyaktig driften vi fjerner;
- det krever endring i `lib/scoring/modes/bestBall.ts` + `GameModeConfig`-unionen
  (beskyttet område, bred T2-spredning) uten noen spiller-synlig gevinst;
- Ryder Cup 2026 står allerede i mål-formen, så ingen ferdigspilte kamper må fryses om.

`best_ball` er ikke matchplay (den har ingen `MATCHPLAY_CONFIG`-rad — den poengsettes som
slagspill), så den skylder ikke matchplay-familien konsistens; den skylder frittstående
best ball konsistens.

**Ikke et produktvalg:** begge alternativer gir identisk spiller-synlig resultat (85 %
anvendt nøyaktig én gang). Forskjellen er ren intern rørlegging.

## Suksesskriterier

- [x] **K1.** `lib/cup/cupMatchAllowance.ts` finnes: ren funksjon som for hvert cup-format
      returnerer `{ hcpAllowancePct, modeConfigAllowancePct }`, og `best_ball` får
      allowancen i `hcpAllowancePct` (ikke i mode_config).
      **Evidens:** `lib/cup/cupMatchAllowance.ts:82-104`;
      `cupMatchAllowance('best_ball', …)` → `{ hcpAllowancePct: 85, modeConfigAllowancePct: null }`.
- [x] **K2.** Invariant-test: for hvert av de sju cup-formatene bærer **høyst ett** av de
      to lagene en verdi ≠ 100. Testen feiler hvis en framtidig endring gir begge en verdi.
      (Mønster: `lib/courses/teeRatingDbCheck.test.ts`.)
      **Evidens:** `lib/cup/cupMatchAllowance.test.ts` «invariant: allowancen har ett hjem»
      — kjører over `ALL_CUP_MATCH_FORMATS` både med WHS-defaults og med
      arrangør-verdier der hvert format avviker fra 100. `24 passed`.
- [x] **K3.** `createCupMatchesFromPlan` setter `hcp_allowance_pct` eksplisitt på hver
      match-rad fra helperen — ingen match arver DB-defaulten stilltiende lenger.
      **Evidens:** `app/[locale]/admin/cup/[id]/generer/actions.ts` — `hcp_allowance_pct:
      cupMatchAllowance(match.format, allowances).hcpAllowancePct` i `insertMatch`.
- [x] **K4.** `computeCupBestBallAward` anvender ingen allowance selv; `allowancePct`-
      parameteren er borte fra signaturen og fra `getCupSnapshot`s kall.
      **Evidens:** `lib/cup/computeCupBestBallAward.ts` — `applyAllowance`-importen er
      fjernet, `strokesForHole(p.courseHandicap, …)` leser frosset verdi rått;
      `lib/cup/getCupSnapshot.ts` sender ikke lenger `allowancePct`.
- [x] **K5.** En ny cup-best-ball-match gir samme effektive banehandicap på kampens egen
      tavle (`bestBall.compute()`) som i cup-poenget — verifisert med en test som regner
      begge veier på samme input.
      **Evidens (test):** `computeCupBestBallAward.test.ts` → «lagtotalene fra
      bestBall.compute() er identiske med cup-poengets».
      **Evidens (staging, ekte prod-data):** Ryder Cup 2026 klonet til `torny-staging`
      med dobbelt-trekk-dataen intakt (`hcp_allowance_pct = 85` OG
      `mode_config.allowance_pct = 85`). Kampens tavle: Lag 1 **32**, Lag 2 **33**.
      Cup-resultatsiden: «BEST BALL 1 … **32–33** til Team Trøndelag». Samme tall.
      De tre best-ball-kampene gir nå 32–33, Delt (31–31) og 37–33 — nøyaktig verdiene
      #1551 forutsa for enkel allowance.
- [x] **K6.** Frittstående best ball er uendret: `hcp_allowance_pct` fra veiviseren,
      anvendt ved frysing, én gang.
      **Evidens:** ingen endring i `useGameFormState.ts`/`gamePayload.ts`; begge
      best_ball-konstruktørene der (`gamePayload.ts:572` og `:2156`) bygde allerede
      `mode_config` uten `allowance_pct`, i tråd med `types.ts:408`. Cup-stien var den
      eneste som la feltet på, via en `as GameModeConfig`-cast forbi typen.

## Porter

| Port | Kommando | Krav | Resultat |
|---|---|---|---|
| Enhetstester | `npx vitest run lib/cup` | grønn | ✅ 24 filer, 417 tester |
| Scoring-suiten | `npx vitest run lib/scoring` | grønn (skal være urørt) | ✅ 46 filer, 1130 tester |
| Full build | `npm run build` | grønn (§T2 — tsc alene er ikke nok) | ✅ |
| Staging | klikk-gjennom av en cup-best-ball-kamp | tavle og cup-poeng viser samme slag | ✅ 32–33 begge steder |

## Avgrensning

- **Ingen prod-migrasjon.** Ferdigspilte kamper fryses ikke om.
- **#1537 (greensome `team_strokes_override`) er ikke med.** Den har en egen ubesluttet
  gråsone (auto-foreslått vs. hand-redigert verdi) og trenger sin egen runde.
- Frittstående best ball røres ikke.

## Konsekvens for eksisterende data: ingen

Kontrakten antok først at TestCup – Best ball 1 ville miste sin 85 % i cup-poenget.
Den antakelsen var feil, og evalueringen fanget den. Read-only SELECT mot prod:

| Spill | `tournament_id` | `hcp_allowance_pct` |
|---|---|---|
| SICKlestad | NULL | 100 |
| TestCup – Best ball 1 | **NULL** | 100 |
| Ryder Cup 2026 – Best ball 1–3 | 7fb3caab… | 85 |

TestCup-spillet henger ikke på noen cup, så `getCupSnapshot` har aldri regnet et cup-poeng
for det — det finnes ingen verdi å miste. De eneste best-ball-spillene som faktisk ligger i
en cup er de tre Ryder Cup-kampene, og de står allerede i mål-formen (frosset på 85 %).

Endringen rører altså **ingen eksisterende prod-resultater**. Den fjerner dobbelttrekket i
cup-poenget for de tre kampene — som var feilen — og sikrer at nye cup-best-ball-matcher
får riktig hjem fra starten.

## Funksjonelt (for eieren)

Spillere med høyt handicap får de slagene de skal ha i best ball-kampene i en cup — og
kampens egen tavle og cup-stillingen er endelig enige om hvor mange det er. I dag viser de
to flatene ulike tall for samme kamp.
