# Forge-evaluering #736 — e2e cup/liga-livssyklus via ekte generatorer + per-modus finish-and-validate

**VERDICT: ACCEPT**
**Kontrakt:** `.forge/contracts/736-e2e-lifecycle-generators-per-mode.md`
**Metode:** Multi-agent skeptisk evaluering — 5 uavhengige dimensjons-reviewere (compliance, false-green, oracle-math, robustness, scope) → adversarial verifisering av blocker/major-funn → syntese. 6 agenter, 0 bekreftede blocker/major-funn.

## Sammendrag

#736 legger til ekte ende-til-ende-dekning som driver de ekte cup- og liga-match-generatorene gjennom UI-et (ikke seedede rader), pluss fire per-modus finish-and-validate-baner med hardkodede orakler. Alle 9 kriterier (C1–C9) holder.

## Kriterie-tabell (uavhengig verifisert)

| ID | Holder | Grunnlag |
|----|--------|----------|
| C1 | ✅ | `GenerateMatchesWizard.tsx`: 14 `data-testid` over alle 5 steg + roster/course/tee/preset/strategy/nav/generate. Ren oppførsel uendret. |
| C2 | ✅ | `cup-lifecycle.spec.ts:208` (@lifecycle) driver den ekte `createCupMatchesFromPlan` via wizard-UI, asserter 2 `singles_matchplay`-games + 4 `game_players` (flight_number=1, team∈{1,2}, accepted_at) — #641-orphan-fellen. Ingen mockede rader. |
| C3 | ✅ | `RoundStartClient.tsx`: `liga-round-start-player-{userId}` + `liga-round-start-submit`. |
| C4 | ✅ | `liga.spec.ts:324` (@gate) driver ekte `startLeagueRoundFlight`, asserter `solo_strokeplay`-flight + `league_round_id` + `team_number` null (#647-CHECK), så standings. Venter på redirect før DB-les (ingen race). |
| C5 | ✅ | `seedFinishedModeGame` + `seedEphemeralPlayers`/`deleteEphemeralPlayers` finnes; insert uten phantom `status`-kolonne (#641-trygg), filtrerer scores til `validHoles` (#642-trygg); self-clean ved delfeil. |
| C6 | ✅ | 4 baner asserter HARDKODEDE orakler (ingen lib/scoring-import): solo 54/36 (+ B 72), matchplay 10&8, skins 6/0, nassau 3/0. hcp-likhet gjør netto==brutto (SI-uavhengig). Alle re-derivert korrekt. |
| C7 | ✅ | cup=@lifecycle, liga+4 per-modus=@gate; `--grep`-substrings overlapper ikke; `e2e:lifecycle`-script + `ci.yml` blocking `e2e:gate` + non-blocking `continue-on-error` `e2e:lifecycle`. Full @gate (14 tester, CI-likt) grønn. |
| C8 | ✅ | `tsc --noEmit` exit 0; `vitest run` 3873 tester / 295 filer grønn; eslint ren. |
| C9 | ✅ | #848 (≥3-spiller finish-and-validate) + #849 (adversarial rolle-replay) ÅPNE, milestone Backlog, `tests`-label. |

## False-green-vurdering (tyngst vektet)

Verifisert direkte. Cup- og liga-banene driver de EKTE server-actionene gjennom UI og asserter faktiske DB-rader mot de eksakte #641/#647-skjemakolonnene — en regresjon som gjeninnfører phantom-`status`-kolonnen eller non-null `team_number` vil FEILE disse, ikke stille passere. Tre av fire per-modus-orakler er hardkodede literaler uten lib/scoring-import, så en scoring-regresjon kan ikke selv-maskere; hver re-derivert mot motor-kilden + 55 backing unit-tester grønne. hcp-lik SI-uavhengighet er matematisk sunn.

**Eneste konvergente funn (alle 4 reviewere, klassifisert MINOR):** nassau-banen asserte opprinnelig kun vinner-navn uten et tall-orakel — en units-aggregerings-regresjon som fortsatt navngir A kunne passert grønt.

## Adressert etter evaluering (commit `9b2e0ca1`)

- **Nassau tall-orakel:** la til `verdict` «3–0» (units=3 sweep, matcher `formats/nassau.tsx` `score=units`) + taper «0». Fanger nå units-aggregerings-regresjon.
- **Ubetingede vinner-navn-asserts:** `adminName` asserteres én gang i `beforeAll`; `if (adminName)`-vaktene fjernet i alle 4 baner.
- **Komponert score-assert:** solo asserterer begge netto-scorene (36 + 72), skins begge (6 + 0) — ikke bare vinnerens — så et galt aggregat ikke kan tilfeldig-matche.
- **Stale doc-comment:** `e2e/_helpers/games.ts` «Production-only testing» → staging (opphevet 2026-06-20).
- 4/4 grønn mot staging etter stramming (22.3s).

## Gjenstående valgfrie oppfølginger (ikke-blokkerende)

- Liga standings-assert kunne fått et tall-orakel (nå kun «rad synlig» — innenfor C4s «render numbers»-ordlyd).
- Solo brutto-«54»-sjekk er container-scoped (`head-to-head`) — lav koincidensrisiko.

## Konklusjon

ACCEPT. Ekte generatorer drevet ende-til-ende, fire uavhengige tall-orakler, gate beskyttet (cup-flak isolert til non-blocking lane). Det ene konvergente minor-funnet ble lukket post-evaluering. Klar for PR.
