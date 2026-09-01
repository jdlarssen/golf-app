# #1855 — Native N6b, runde-logg

Kontrakt: `.forge/contracts/1855-native-n6b-roster-start.md` (adoptert fra
issue-kommentaren, drift-verifisert mot HEAD `ed954014` før første kodelinje).

## Runde 0 — drift-verifisering

Sju avvik mellom kontrakt og HEAD, to av dem endret byggeplanen:

- **D2 (nytt):** `autoRejectPendingSignups` gjør både DB-skriv og notify. Kjernen
  tar skrivet og returnerer søker-id-ene; wrapperen varsler.
- **D3 (kontrakten tok feil):** N6a rørte ikke `GameHome.tsx`. Ingen fildeling
  mellom slicene.
- **D4 (nytt):** `setPlayerTeam` må skrive `flight_number` samtidig (CHECK 0030/0095).
- **D5 (nytt):** #1866 oppsto etter kontrakten → bygg mot statisk `ui`/`COLORS`.

Fikstursikring: to wolf-spill på staging hadde tee-off i fortida, så
E1-fallbacken/cron ville startet dem via webbens vei ved første besøk. Dyttet
`scheduled_tee_off_at` fram til 08.09 før noe ble rørt.

## Runde 1 — bygging (3 parallelle/sekvensielle chunks)

| Chunk | Innhold | Porter ved levering |
|---|---|---|
| A | Delt start-kjerne + tynn web-wrapper | vitest 522/7028 = baseline |
| B | `rosterActions.ts` (7 RLS-skriv) + `gameBundle.acceptedAt` | jest 560, tsc/eslint 0 |
| C | `OrganiserSection`, `startGame.ts`, `rosterCopy.ts`, runbook | jest 623, alle porter 0 |

Funn fra byggerne, filet før merge: #1867, #1868, #1869.

## Runde 2 — staging-verifisering: tre feilsøkingsrunder

**Falsk start.** Første app-test kjørte mot GAMMEL binær: `expo run:ios` feilet på
CocoaPods (`Unicode Normalization ... ASCII-8BIT`), men `| tail` uten `pipefail`
ga exit 0. Fikset med `LANG=en_US.UTF-8` og logg til fil.

**Årsak 1 — 0147s egen-rad-vakt.** Wolf-start feilet med `db_game`. Isolert ved å
kjøre kjernen som brukeren: slot-skrivet på arrangørens EGEN rad ga 42501. Eier
godkjente å fjerne sperren → migrasjon 0168.

**Årsak 2 — Hermes mangler `crypto`.** Etter 0168 feilet appen fortsatt, med
samme tekst. Alle fem `db_game`/`db_players`-punkter fikk midlertidig hver sin
reason-kode — teksten endret seg ikke, altså kom den ikke fra kjernen.
`OrganiserSection.tsx:151` fanget en kastet exception og mappet den til `db_game`.
`assignRotationSlots` bruker `crypto.getRandomValues`; Expos winter-runtime gir
ikke WebCrypto. Bekreftet positivt med et midlertidig `Math.random`-bytte, så
reversert og løst med `react-native-get-random-values`.

Lærdom: én symptomtekst dekket to årsaker, og en `catch` gjorde en manglende
global om til en databasefeil-melding.

## Runde 3 — evaluator: NEEDS WORK → ACCEPT

**F1 (kritisk, berettiget):** 0168 var bygget på 0147, men 0159 er siste
create-or-replace. Førsteutkastet reverterte #1362s reopen-unntak stille, og
regresjonen var påført staging.

Fikset: 0168 bygget programmatisk fra 0159 (diff mot 0159 = én hunk, i vakt (b)),
re-påført ordrett fra fila (normalisert md5 fil = staging), pgTAP utvidet 7 → 9
asserts som dekker fjern-retningen, og runbooken rettet — den lærte fortsatt bort
modellen som skapte feilen.

F2 → #1871. F3 → #1872. F6 → kontraktfilene slått sammen.

Evaluatoren verifiserte fiksen på fil-, database- og testnivå: **ACCEPT**.
