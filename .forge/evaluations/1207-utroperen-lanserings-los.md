# Evaluation: #1207 — Utroperen, ukentlig lanserings-los med 📣 Publiser-knapp

**Verdikt: ACCEPT**

Runde 2, fersk kontekst. Verifisert mot branch `claude/1207-utroperen-lanserings-los` i
worktree `affectionate-matsumoto-82f94e`, HEAD `bd044ed1` (4 commits siden `origin/main`:
`b46530bf` feat, `2bb2e1ca` docs, `e1cacbca` kontrakt, `bd044ed1` fix). Alt bevis under er
produsert i denne økten (egen `git show`, egne vitest/lint/build-kjøringer). Ingen
commits gjort, ingen produktkode endret av meg.

## Runde 1-funnet — lukket

**Opprinnelig funn:** `lib/loops/discordActions.ts:262-268` — markør-POST-en til
tavle-issuet, kjørt ETTER at `lansering.publish(...)` allerede hadde returnert
(lanseringen var altså allerede ute), var ikke beskyttet mot at `gh.rest()` kaster
(fetch-nettverksfeil/timeout). Et kast ville propagere ufanget til den ytre
try/catch i `app/api/discord/interactions/route.ts`, som overskriver hele
follow-up-meldingen med en generisk feilmelding — eieren ville da tro publiseringen
feilet, selv om `product_updates`-raden alt var satt inn og in-app-varslingen alt
sendt.

**Fiks (commit `bd044ed1`):** `git show bd044ed1` bekrefter:
- `lib/loops/discordActions.ts:262-274` — markør-POST-kallet er nå pakket i
  `try { … } catch { markerNote = ' (fikk ikke markert tavla: nettverksfeil)' }`.
  Samme mønster som `countPublishedThisMonth().catch(() => null)` to linjer over
  (linje 255) — konsistent med rutinens uttalte prinsipp («feil under skal aldri
  rapportere publiseringen som mislykket»).
- `lib/loops/discordActions.test.ts:403-414` — ny test «markør-post KASTER
  (nettverksfeil) etter publisering → suksessmelding med caveat»: mocker `rest` med
  `mockRejectedValueOnce(new Error('fetch failed'))` på det andre kallet (markør-POST-et,
  etter at det første — kommentar-henting — har løst seg normalt), kjører
  `executeAction`, og asserterer alle tre nødvendige ting: (1) `deps.publish` ble
  faktisk kalt (lanseringen skjedde), (2) meldingen inneholder `'Publisert'` (rapporteres
  som suksess, ikke feil), (3) meldingen inneholder `'fikk ikke markert tavla'`
  (caveaten er synlig). Dette er nøyaktig scenarioet runde 1 flagget — rejected
  promise etter en vellykket `publish()`-kall, med assertion på at brukeren likevel
  ser en suksessmelding.

**Vurdering:** funnet er reelt fikset, ikke bare delvis dempet. Fiksen adresserer
throw-grenen spesifikt (som var udekket i runde 1 — testsuiten testet den gang kun
`marker.status !== 201`, ikke selve kastet), og testen validerer atferden end-to-end
gjennom `executeAction`, ikke bare at try/catch-syntaksen finnes.

## Gates

- **`npx vitest run lib/loops/`** (Node 22). PASS —
  `EXPECT: alle grønne, 83 tester (82 fra runde 1 + 1 ny)` →
  **3 test files, 83 tests, alle passed**, 895ms. Matcher.
- **`npm run lint`** (Node 22). PASS — `EXPECT: 0 errors` →
  **55 warnings, 0 errors**, exit code 0. Samme kompleksitets-warning på
  `discordActions.ts:155` som runde 1 (34 > 25, pre-eksisterende klasse av warning
  i 15+ andre filer i repoet) — ingen nye warnings i berørte filer utover den
  allerede observerte.
- **`npm run build`** (Node 22). PASS — `EXPECT: exit 0, ingen «error»/«failed»-linjer` →
  exit code **0**, `grep -niE "error|failed"` på full output ga 0 treff (utenom
  ChunkLoadError-referanser i uendret placeholder-kode, ekskludert fra søket).

## Nye funn av samme klasse (await etter `lansering.publish(...)`)?

Lest `lib/loops/discordActions.ts:221-286` i sin helhet (hele `publish_lansering`-grenen).
Kun to `await`-kall skjer etter `const { recipientCount } = await lansering.publish(...)`
på linje 248:

1. `lansering.countPublishedThisMonth()` (linje 255) — allerede `.catch(() => null)`
   siden runde 1 (var aldri en del av funnet, verifisert grønt den gang og fortsatt
   grønt).
2. Markør-POST via `gh.rest(...)` (linje 262-274) — nå try/catch (fiksen over).

Alle `await`-kall FØR `lansering.publish(...)` (kommentar-GET, `wasRecentlyPublished`,
`findPublisherUserId`) skjer før lanseringen faktisk er ute — et kast der er korrekt
rapportert som feil, siden ingenting har skjedd ennå. Ingen ytterligere post-publish
await-kall finnes i grenen. Ingen nye funn av samme klasse.

Sjekket også `app/api/discord/interactions/route.ts` sin `lanseringDeps()`-wiring
(linje 83-115) — `publish` er en tynn wrapper rundt `publishProductUpdate` (uendret
lib, per Success Criterion 5), ingen ekstra post-publish-logikk lagt til der.

## Konklusjon

Runde 1s eneste CONFIRMED funn er lukket med en presis, testdekket fiks som følger
det eksisterende `.catch()`-mønsteret ved siden av. Alle 3 gates er grønne. Ingen nye
findings av samme eller annen klasse oppdaget ved gjennomgang av hele
`publish_lansering`-grenen. **ACCEPT.**

**Findings (runde 2): ingen.**
