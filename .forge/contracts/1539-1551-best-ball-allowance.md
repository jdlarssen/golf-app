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

- [ ] **K1.** `lib/cup/cupMatchAllowance.ts` finnes: ren funksjon som for hvert cup-format
      returnerer `{ hcpAllowancePct, modeConfigAllowancePct }`, og `best_ball` får
      allowancen i `hcpAllowancePct` (ikke i mode_config).
- [ ] **K2.** Invariant-test: for hvert av de sju cup-formatene bærer **høyst ett** av de
      to lagene en verdi ≠ 100. Testen feiler hvis en framtidig endring gir begge en verdi.
      (Mønster: `lib/courses/teeRatingDbCheck.test.ts`.)
- [ ] **K3.** `createCupMatchesFromPlan` setter `hcp_allowance_pct` eksplisitt på hver
      match-rad fra helperen — ingen match arver DB-defaulten stilltiende lenger.
- [ ] **K4.** `computeCupBestBallAward` anvender ingen allowance selv; `allowancePct`-
      parameteren er borte fra signaturen og fra `getCupSnapshot`s kall.
- [ ] **K5.** En ny cup-best-ball-match gir samme effektive banehandicap på kampens egen
      tavle (`bestBall.compute()`) som i cup-poenget — verifisert med en test som regner
      begge veier på samme input.
- [ ] **K6.** Frittstående best ball er uendret: `hcp_allowance_pct` fra veiviseren,
      anvendt ved frysing, én gang.

## Porter

| Port | Kommando | Krav |
|---|---|---|
| Enhetstester | `npx vitest run lib/cup` | grønn |
| Scoring-suiten | `npx vitest run lib/scoring` | grønn (skal være urørt) |
| Full build | `npm run build` | grønn (§T2 — tsc alene er ikke nok) |
| Staging | klikk-gjennom av en cup-best-ball-kamp | tavle og cup-poeng viser samme slag |

## Avgrensning

- **Ingen prod-migrasjon.** Ferdigspilte kamper fryses ikke om.
- **#1537 (greensome `team_strokes_override`) er ikke med.** Den har en egen ubesluttet
  gråsone (auto-foreslått vs. hand-redigert verdi) og trenger sin egen runde.
- Frittstående best ball røres ikke.

## Kjent konsekvens (akseptert)

TestCup – Best ball 1 sitt cup-poeng går fra 85 % til 100 %, fordi dens frosne banehandicap
er rått og `hcp_allowance_pct` står på 100. Spillet blir dermed **selv-konsistent** på
100 % i stedet for å sprike mellom to flater. Det er testdata uten levende stilling, og å
reparere frosne handicap på et ferdigspilt spill ville skrevet om et spilt resultat.

## Funksjonelt (for eieren)

Spillere med høyt handicap får de slagene de skal ha i best ball-kampene i en cup — og
kampens egen tavle og cup-stillingen er endelig enige om hvor mange det er. I dag viser de
to flatene ulike tall for samme kamp.
