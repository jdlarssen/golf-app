# Evaluering — #1508 Cup MVP + «dro ned mest» (PR #1521)

**Verdict: ACCEPT** — alle syv suksesskriterier er uavhengig re-derivert mot koden og holder; fire gates kjørt på nytt og grønne. Ett bokførings-funn (should-fix) og fire nits, ingen blockers.

Evaluator: fresh-context skeptiker, branch `claude/auto-1508-050473`, Node v22 (`nvm use 22`).

## Per kriterium

| # | Kriterium | Verdict | Bevis jeg selv verifiserte |
|---|---|---|---|
| 1 | MVP: topp på tvers av lag, delt ved likhet, `null` ved toppsum 0 | ✅ | `lib/cup/computeCupAwards.ts:75-89` — `rows = [...team1, ...team2]`, `Math.max` over `points`, `filter(points === top)`, `.sort(byName)` (nb-collator, `:66-68`). `null`-vei: `rows.length === 0` (`:77`) og `top <= 0` (`:80`). Tester: `computeCupAwards.test.ts:81-135`, vinner ligger på lag 2 (`:97`), Å-sortering (`:115`). Kjørt: 19/19 grønn. |
| 2 | «Dro ned mest»: netto-mot-par, ≥ 9 hull, delt ved likhet, `null` ved ingen kvalifiserte / toppdiff ≤ 0 | ✅ | `computeCupAwards.ts:140-141` — `net = strokes − strokesForHole(courseHandicap, hole.strokeIndex)`, `diff += net − hole.par`. `courseHandicap` kommer fra `game.players[].courseHandicap` som snapshotten fyller fra `game_players.course_handicap` (`getCupSnapshot.ts:377`) — **fullt CH, ingen allowance-multiplikator noe sted i stien** (gikk gjennom diffen: `allowance_pct` røres ikke). Par = `par_mens` (`getCupSnapshot.ts:285`). Hull segment-filtrert via `holesForSegment` (`getCupSnapshot.ts:334`). Grense: `>= MIN_HOLES_FOR_UNDERPERFORMER` = 9 (`:37`, `:147`) — inklusiv, låst av testpar 8-hull→null (`test:185-192`) / 9-hull→kåring (`test:194-199`). `strokes == null` → `continue` FØR både diff og hulltelling (`:129` før `:141-142`), låst av `test:251-267`. |
| 3 | Dobbelttellings-vernet (#1441) | ✅ | `getCupSnapshot.ts:368-371`: `game.source_game_id == null && PERSONALLY_SCORED_CUP_GAME_MODES.includes(game_mode)`. Verifisert at dette faktisk er nødvendig og ikke taper data: på splittet cup-dag er **begge halvdeler HOSTs** (`lib/games/splitDayPairing.ts:8-14`), back9-hosten er selv `best_ball` (som står i allowlisten, `lib/scoring/modes/types.ts:140-146`), og de avledede singles-kampene leser host-ens HELE score-sett (`getCupSnapshot.ts:329`). Å slippe dem inn ville telt samme rader én gang per avledet kamp. Byggerens resonnement om at dedup i aggregatoren ville vært feil er **sunt**: aggregatoren får `gameId`, ikke `sourceId`, og en to-dagers cup gjenspiller hullnumre lovlig (`test:330-345`). Vernet er testet: `getCupSnapshot.test.ts:283` asserter `performanceInputs.map(gameId) === ['g1']` på nettopp host+avledet-fixturen. |
| 4 | Snapshot-utvidelsen additiv, ingen nye DB-lesinger | ✅ | `git diff origin/main...HEAD \| grep '^\+.*\.from('` → **null treff** i produktkode (kun `Array.from` i tester/aggregator og én kommentar). Push-en (`getCupSnapshot.ts:372-383`) bruker `holes`/`gPlayers`/`gScores` fra den eksisterende loopen. Tabell-settet låst av `getCupSnapshot.test.ts:297-299` (6 tabeller, uendret). `npm run build` grønn ⇒ ingen call-site brøt på det nye påkrevde feltet. |
| 5 | Rendret KUN i finished-grenen; låst side urørt | ✅ | `resultater/page.tsx:58-73` er en tidlig `return` for `status !== 'finished'` — `CupAwards` (`:163`) og selve utregningen (`:95-99`) ligger etter den. Diffen på låst-grenen: 0 linjer. Plassering: etter lagtotal-`</section>` (`:160`), før `CupPlayerPoints` (`:166`). |
| 6 | Skjuling ved manglende datagrunnlag | ✅ | `CupAwards.tsx:34` (`!mvp && !underperformer → null`), `:48` og `:63` conditional render. Testbevis `CupAwards.test.tsx:33-43`. Aggregator-siden: `computeCupAwards.ts:77,80,149,152`. Staging-bevis lest på PR (cup med 0 poeng + 3 førte hull → begge testid = 0) — ikke re-drevet av meg. |
| 7 | Begge locales, matchende placeholders | ✅ | Kjørte node over begge filene: `cup.results.awardsHeading/mvpLabel/mvpValue/underperformerLabel/underperformerValue` finnes i begge. Placeholders identiske: `{points}` i mvpValue (no+en), `{strokes}` i underperformerValue (no+en). Ingen krasj-risiko fra placeholder-drift. |
| 8 | Maks én Type C-test, ingen re-assertering av Type A-tall | ✅ | `CupAwards.test.tsx` har nøyaktig én `it` (`:12`). Den asserter struktur + at props rendres — den regner ikke ut hvem som vinner. Se nit 3 om copy-strengene. |
| — | Out of Scope | ✅ | Ingen arrangør-bryter, ingen migrasjon, ingen per-kjønn-par, ingen «best mot handicap», ingen endring i #1497-regnskapet (eneste berøring: `preferredName` gjort `export`, `computeCupPlayerPoints.ts:53` — ren synlighetsendring, ingen atferdsendring). Filsettet matcher «Files Likely Touched». |

## Gates — mine egne tall

| Gate | Kommando | Resultat |
|---|---|---|
| lib/cup | `npx vitest run lib/cup` | **22 filer, 384 tester, alle grønne**, exit 0 |
| awards-suiten alene | `npx vitest run lib/cup/computeCupAwards.test.ts` | **1 fil, 19 tester grønne** |
| resultater | `npx vitest run "app/[locale]/cup/[id]/resultater"` | **2 filer, 2 tester grønne**, exit 0 |
| build (typecheck) | `npm run build` | `Compiled successfully in 6.2s`, TypeScript grønn, **BUILD_EXIT=0** — ingen filtrering |
| lint | `npm run lint` | **LINT_EXIT=0**, `✖ 56 problems (0 errors, 56 warnings)` |

Node: `v22` via `source ~/.nvm/nvm.sh && nvm use 22`.

## Funn

1. **[should-fix] Kompleksitets-funnet er ikke filt som issue.** `lint.log` gir
   `lib/cup/getCupSnapshot.ts:186 — Async function 'getCupSnapshot' has a complexity of 66. Maximum allowed is 25`.
   Kontraktens Gates-linje påstår at dette ble «filt som eget issue framfor å utvide dette
   PR-ets scope», men `gh issue list --state open` (søk «getCupSnapshot» + de 8 nyeste)
   viser ingen slik sak — høyeste åpne issue er #1520, opprettet før dette arbeidet.
   CLAUDE.md «Reviewer-funn (mandatory)» krever issue FØR merge. Warning-only, blokkerer
   ikke koden, men påstanden i kontrakten er ikke dekket.
2. **[nit] Ingen tak på antall navn i en delt kåring.** `computeCupAwards.ts:83-86` +
   `CupAwards.tsx:56`: i en cup der alle kamper deles ender alle spillere på samme
   poengsum, og MVP-kortet lister hvert eneste navn i én `Intl.ListFormat`-setning.
   Eier valgte delt kåring bevisst, så dette er innenfor kontrakten — men den degenererte
   flaten er ikke vurdert noe sted.
3. **[nit] Type C-testen låser norsk copy.** `CupAwards.test.tsx:25` og `:29` asserter
   `'3 poeng · flest i cupen'` / `'12 slag over eget handicap'` ordrett. En ren
   copy-justering i `messages/no.json` knekker dermed en render-test, stikk i strid med
   «Copy-endring: endre source-streng → review diff» i docs/test-discipline.md. Testens
   strukturelle del (testid + navnejoin + skjuling) hadde holdt alene.
4. **[nit] `top <= 0` vs. kontraktens «toppsum 0».** `computeCupAwards.ts:80` er et
   supersett av kravet. Ufarlig (poeng kan ikke bli negative), men koden og kontrakten
   sier ikke helt det samme.
5. **[nit] `course_handicap ?? 0`.** `getCupSnapshot.ts:377` gjør en spiller uten
   registrert banehandicap til scratch, noe som gjør nettopp den spilleren mest utsatt for
   å «vinne» underpresterer-kåringen. Dette er husets mønster (samme `?? 0` i 20+ call-sites,
   bl.a. `lib/scoring/buildModeResultForGame.ts:320`), så konsistens taler for å la det stå
   — men effekten er skjevere her enn i scoring-stiene.

## Hva jeg IKKE kunne verifisere

- **Kompleksitets-baselinen 64 på `origin/main`.** Å måle den krever å legge den gamle fila
  inn i treet og kjøre eslint på nytt; jeg fikk ikke endre produktkode. Målt nå: 66,
  warning-only, lint exit 0. At verdien var langt over grensen 25 fra før er uansett åpenbart.
- **Staging-klikkrunden.** Jeg leste bevis-kommentaren på PR #1521 (fem akseptansepunkter,
  struktur-orakel + uavhengig SQL-orakel, prod-vakt dokumentert) og bekreftet at labelen
  `staging-verified` står — men jeg drev ikke staging på nytt. Tallet «Bjørn Dahl · 14 slag»
  er dermed byggerens SQL-orakel, ikke mitt.
- **Om `par_mens` er riktig par for de faktiske spillerne** — kjent, bevisst begrensning i
  cup-laget per kontrakten; ikke re-vurdert her.
