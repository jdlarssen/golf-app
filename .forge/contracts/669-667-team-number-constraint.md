# Forge-kontrakt: #669 + #667 — Utvid team_number-constraint + stopp stille kaptein-tap

**Issues:** [#669](https://github.com/jdlarssen/golf-app/issues/669) (P1, Wolf-5/klubb-skala) + [#667](https://github.com/jdlarssen/golf-app/issues/667) (P1, kaptein mistes stille)
**Branch:** issue-669-667-team-number-constraint
**Type:** Bug-fix + prod-skjema-migrasjon (bruker-synlig → version-bump + CHANGELOG)
**Opprettet:** 2026-06-17 · eier har greenlightet prod-migrasjon

## Felles rot

`game_players_team_number_check` (0030) = `team_number is null or team_number between 1 and 4`. Den
ble aldri utvidet da 0095 utvidet `flight_number`. Følger:
- **#669:** 5-spiller Wolf emitter `team_number=5` (validateWolf tillater 5), men DB avviser → «Klarte
  ikke å lagre spillerne» (hard blindvei). Samme for klubb-skala scramble/Patsome med >4 lag (validatorene
  har ingen øvre grense).
- **#667:** offentlig lag-selvpåmelding (`submitTeamRegistration`) finner laveste ledige slot (`slot <= 50`),
  emitter `team_number=5`, insert feiler på constraint — men feilen **svelges** (`teamActions.ts:359-366`,
  «Ikke fatal … Returnerer suksess»). Kapteinen ser suksess-skjerm men har ingen `game_players`-rad =
  stille datatap.

## Beslutninger (scoping verifisert i kode)

1. **Utvid constraint** (speil 0095): `team_number is null or team_number >= 1`. `game_players_team_flight_consistency` (team_number null ⇒ flight_number not null) er fortsatt gyldig (slot=5 setter flight_number=5 ≥ 1). Validatorene som CAPper (bestBall >4, foursomes >2, roundRobin >4) er format-regler og rører IKKE — utvidelsen fjerner bare DB-en som flaskehals for format hvis validator allerede tillater mer (Wolf 5, scramble/Patsome).
2. **Slot-løkkene i `teamActions.ts` (334, 650)** er allerede `slot <= 50` — uendret (de emitter nå gyldige verdier etter utvidelsen).
3. **Admin-stien `signups/actions.ts:167`** capper på `slot <= 4` — utvides til `slot <= 50` for konsistens (ellers kan admin kun godkjenne 4 lag i en klubb-cup mens selvpåmelding tillater flere).
4. **`acceptTeamInvite` (686-688)** håndterer allerede playerError fatalt — uendret. Bare kaptein-svelget (359-366) fikses.
5. **`db_error`** er en eksisterende, UI-håndtert feilkode (TeamDashboardClient.tsx:130) — kapteinen får vennlig melding. Ingen ny kode trengs.

## Suksesskriterier

- [x] K1: `supabase/migrations/0101_widen_team_number.sql` lagt til. **Applisert til prod via MCP** (`apply_migration` → `{success:true}`). Verifisert: `pg_get_constraintdef` = `CHECK (((team_number IS NULL) OR (team_number >= 1)))`; transaksjonell test-insert med `team_number=5` ble akseptert (rullet tilbake).
- [x] K2: `signups/actions.ts:167` `slot <= 4` → `slot <= 50` (med kommentar om utvidet constraint).
- [x] K3: `teamActions.ts:368` returnerer `{ ok: false, error: 'db_error' }` på `captainPlayerError`. Kommentaren oppdatert (#667). `acceptTeamInvite` (686-688) var allerede fatal, urørt.
- [x] K4: `teamActions.test.ts` ny case — kaptein-upsert-feil → `{ ok:false, error:'db_error' }`; **bekreftet meningsfull** (feiler med `ok:true` mot pre-fiks-koden, passerer etter). `gamePayload.test.ts` ny case — 5-spiller Wolf, 5. spillers `team_number=5`. Begge grønne.
- [x] K5: `npm run typecheck` 0; `npm test` 282 filer / 3566 grønne; ingen av de endrede filene er blant repoets lint-feil.
- [x] K6: bump 1.132.6 → 1.132.7 + CHANGELOG-oppføring under åpen `1.132.y`-tema (commit `2c64d449`).

## Gates
- MCP: constraint-def før/etter + test-insert team_number=5.
- Ny teamActions-test feiler mot pre-fiks-koden (svelg → ok:true), passerer etter.
- `npm run typecheck` + `npm test`.
- commit-msg-hook (fix + bump + CHANGELOG).

## Risiko
- Prod-migrasjon: ren constraint-utvidelse (tillater mer, avviser ingenting som var lovlig før) → ingen eksisterende rad brytes, ingen data-migrering. Lav risiko.
- UI som hardkoder «maks 4 lag»: ikke funnet i auditen; scramble/Patsome rendrer N lag dynamisk (eksisterende klubb-skala-støtte). Hvis noe dukker opp → eget issue, ikke smugles inn.
