# Kontrakt: Hjem-kortet teller kun egne score-rader — makkeren i lag-formater sendes til hull 1 (#1538)

Kilde: kontrakt-kommentar på issue #1538 (kontrakt-smeden, Opus-verifisert mot e2ce624).
Eierbeslutningen om utsettelse gjaldt en pågående cup som nå er ferdigspilt — mandatet er aktivt.

## Problem

`getActiveGameCardData` (`lib/games/getActiveGameCardData.ts:72`) henter
fylte hull med `.eq('user_id', userId)` — viewerens **egne** score-rader. I
lag-kollapsede modus (scramble-familien texas/ambrose/florida,
foursomes/greensome/chapman/gruesome, patsome fra hull 7) skriver hele laget
til lag-kapteinens rad (lex-min `user_id`, jf.
`holes/[holeNumber]/page.tsx:750–753` for utledningen og `:647–654` for
kollaps-settet, dokumentert i `lib/scoring/modes/types.ts:1157–1159`).
Makkeren har null rader → `filled.size = 0` → `nextHole = 1` → Hjem-kortet
viser «Fortsett → hull 1» uansett reell fremdrift.

På splittet cup-dag (#1449) forsterkes det: `mergePairExtras`
(`lib/games/pairActiveCard.ts:33–42`) tar front9-grenen så lenge
`front9.extras.nextHole != null`, så makkeren krysser aldri til back9-hullene.
Prod-bekreftet i cup `7fb3caab-…` (issue-en har detaljene). Split-dag-formen
er verifisert fra to kilder: front9-host = greensome (kollapset), back9-host =
best ball (per-spiller, IKKE kollapset) — fiksen treffer riktig halvdel.

## Design

1. **Ett hjem for lag-kort-eierskap:** to nye rene helpers:
   - `modeCollapsesToTeamCard(gameMode, holeNumber?)` — samme sett som
     hull-sidens inline-flagg (`page.tsx:647–654`). Det finnes **ikke** ett
     eksisterende predikat som dekker settet; komponer av de to som finnes,
     etter mønsteret fra `supportsHoleSegment` (`types.ts:153`):
     `isScrambleFamily(mode) || isAlternateShotMatchplay(mode) ||
     (mode === 'patsome' && (holeNumber ?? 0) >= 7)` — der `isScrambleFamily`
     (`types.ts:85`) = texas_scramble + ambrose + **florida_scramble**, og
     `isAlternateShotMatchplay` (`types.ts:104`) = foursomes + greensome +
     chapman + gruesome. Ikke bruk `formatPlayStyle === 'team'` — den er for
     bred (tar med best_ball, fourball, shamble). Predikatet bor naturlig i
     `lib/scoring/modes/types.ts` ved siden av søsknene sine (teknisk valg —
     avgjøres i økten).
   - `teamScoreOwnerId(teamMembers)` — lex-min `user_id` blant lagets aktive
     (ikke-withdrawn) medlemmer; returnerer `null` for tom liste. Hull-siden
     bruker kun `captain.user_id` (`page.tsx:755`, `:765`), så `string | null`
     er nok for den mekaniske erstatningen. Denne bor i `lib/games/`
     (persistens-/kort-eierskap).
2. **`getActiveGameCardData`:** for continue-spill i lag-kollapsede modus,
   hent `game_players` også for disse: utvid `.in('game_id', …)`- og
   gate-betingelsen (`:75`) til unionen av peer-approval-spill og kollapsede
   continue-spill, og legg `team_number` i både select-strengen (`:78`) og
   `MateRow`-typen (`:96–103`) → finn viewerens lag → `captainId`. Utvid
   scores-spørringen fra `.eq('user_id', userId)` til
   `.in('user_id', [userId, ...captainIds])`, og utvid select-en til
   `'game_id, hole_number, user_id'` — uten `user_id` kan ikke radene
   attribueres per spill. Når `filledByGame` bygges, **filtrer hver rad mot
   DET spillets tillatte eier-sett** {viewer, spillets captain}: en bruker som
   er captain i spill A kan være vanlig deltaker i spill B, og en
   uten-filter-union ville blåst opp B-ens `filled`-sett og hoppet over hull.
   For rene lag-modus har viewer 0 rader (identisk resultat som kun captain);
   for patsome gir unionen riktig dekning (egne rader hull 1–6, captain-rader
   hull 7–18 — patsome er alltid `hole_segment='full'`, `types.ts:153`).
   Oppdater JSDoc-en (`:40–49`) som i dag sier «game_players for the games
   requiring peer approval».
3. **Hull-siden adopterer helperen** for captain-utledningen (mekanisk
   erstatning av inline lex-min-blokken) — regelen skal ha ett hjem
   (AGENTS.md felle 4). Kun utledningen; hull-sidens handicap-beregninger
   røres ikke.
4. `pairActiveCard.ts` endres ikke — den fungerer riktig så snart per-halvdel-
   dataene er riktige.

## Edge Cases & Guardrails

- Viewer uten `team_number` (null): fall tilbake til egne rader (dagens
  oppførsel).
- Withdrawal er ikke tilbudt i disse modusene (`supportsWithdrawal`,
  `types.ts:292` — kun best_ball/stableford-familien/solo), så «captain
  withdrawn» er en teoretisk admin-sti. Inntreffer den likevel, blir lex-min
  blant aktive en NY bruker mens radene ligger på den gamle — kortet
  underrapporterer da. Samme oppførsel som hull-siden i dag; ingen egen
  kompensasjon i dette issuet.
- RLS: viewer leser captain-rader via `same_flight_or_solo`-grenen i
  `scores select gating per mode` (`supabase/migrations/0121_live_follow.sql:19–42`,
  helper i `0095_flight_single_group_and_assignment.sql:118–145`) — true ved
  samme `flight_number`, begge `flight_number IS NULL`, eller ≤ 4 aktive
  spillere. Ingen ny klient/policy trengs; Hjem bruker `getServerClient()`
  (`app/[locale]/page.tsx:73`, kall på `:423`). Det er **ikke** DB-håndhevet
  at et lag ligger i én flight — i et >4-spillers spill med tildelte flights
  der laget spenner flights returnerer spørringen ingen captain-rader. Da
  skal kortet degradere til dagens oppførsel (egne rader), aldri kaste.
- Per-spiller-rader (skal IKKE i kollaps-settet): `best_ball`,
  `fourball_matchplay`, `shamble`, stableford-familien, og `patsome` hull 1–6.
  **NB: `florida_scramble` og `ambrose` KOLLAPSER** — `isTexas` på hull-siden
  er `isScrambleFamily(game.game_mode)` (`page.tsx:260`), ikke
  `=== 'texas_scramble'`. Settet avledes av hull-sidens faktiske flagg.
- `lib/games/getActiveGameCardData.test.ts` finnes (108 linjer) og
  fake-supabase-en (`:18–33`) speiler kjeden eksakt: `.select().in().eq().not()`.
  Byttet `.eq` → `.in` knekker fake-en (`.in(...).in is not a function`) —
  oppdater den i samme commit, ellers ryker de fem eksisterende #1441-testene.
- Degradering: på spørringsfeil beholdes dagens fallback (spilloversikt-href).

## Key Decisions

- Union {viewer, captain} i én spørring framfor per-spill-forgrening — enklest
  som bevarer «to spørringer maks»-designet i helperen (jf. JSDoc-en) — men
  med per-spill-filtrering ved bygging av `filledByGame` (se Design punkt 2).
- Hull-siden utleder captain fra den flight-scopede rosteren; Home-helperen
  utleder fra hele `game_players`. Identisk resultat så lenge et lag ligger i
  én flight — som allerede er en implisitt invariant (et flight-splittet lag
  ville splittet dataene på hull-siden i dag også).

## Success Criteria

- [x] Type A-tester på helperne: lex-min blant aktive; withdrawn ekskludert;
  tom liste → null; patsome hull-avhengighet; kollaps-settet matcher
  hull-sidens flagg (inkl. ambrose/florida).
  **Evidens:** TDD rød→grønn: `modeCollapsesToTeamCard` 42 failed → 160 passed;
  `teamScoreOwnerId` 7 failed → 12 passed (commit 26f2d5ba + d9e562ba).
- [x] Test på `getActiveGameCardData`: greensome-makker-caset.
  **Evidens:** testfila rød på fake-kjeden (13 failed) → 13 passed (5 gamle
  #1441 + 8 nye), commit 658d8717.
- [x] Cross-game-lekkasje-testen (captain i A lekker ikke inn i B).
  **Evidens:** dedikert test i samme fil; per-spill-filter i `filledByGame`.
- [x] Eksisterende `pairActiveCard`-tester uendret grønne.
  **Evidens:** filene byte-identiske med HEAD~3, 13 tester grønne.
- [x] `npm run typecheck` + lint + `npx vitest run lib/games` grønt.
  **Evidens:** tsc clean; eslint 0 errors (page.tsx-kompleksitet REDUSERT
  112→106); vitest lib/games+lib/scoring/modes: 90 filer / 2016 tester;
  `npm run build` exit 0 (pipefail).
- [ ] Staging-verifisering før merge: greensome-spill med to spillere, captain
  fører 3 hull, makkeren åpner Hjem → kortet viser «Fortsett → hull 4» (ikke
  hull 1).

## Bygge-avvik (dokumentert, alle vurdert kontrakts-forenlige)

1. `teamScoreOwnerId` bor i eksisterende `lib/games/teamCaptain.ts` som adapter
   over `pickTeamCaptain` (4 eksisterende kallsteder) — ny fil ville skapt
   regelens andre hjem (AGENTS.md felle 4). Kontrakts-antagelsen «ingen
   eksisterende predikat» gjaldt kollaps-settet, ikke lex-min.
2. Captain-attribusjon er hull-bevisst (`modeCollapsesToTeamCard(mode,
   hole_number)` per rad) — flat union ville talt captainens egne 4BBB-baller
   på patsome hull 1–6 som viewerens fremdrift; matcher kontraktens egen
   patsome-setning. Testdekket.
3. Commit 1–2 er `refactor(` (hooken krever notatfil for feat; helpers alene er
   ikke bruker-synlige); notatfilen følger fix-commiten.
4. `captainsForViewer` ekstrahert (ellers ny complexity-advarsel 29>25).
5. HoleClient-duplikatet av kollaps-regelen (bevisst utenfor scope) er filt som
   #1606 FØR merge, per reviewer-funn-regelen.

## Gates

`tsc` + `lint` + `vitest` (pre-push + CI) + staging-klikkrunde av berørt flyt
(bruker-synlig fix).

## Files Likely Touched

- `lib/scoring/modes/types.ts` (`modeCollapsesToTeamCard`-predikatet) + test
- `lib/games/teamCardOwner.ts` (ny — `teamScoreOwnerId`) + test
- `lib/games/getActiveGameCardData.ts` (+ oppdatering av eksisterende testfil
  inkl. fake-supabase-kjeden)
- `app/[locale]/games/[id]/holes/[holeNumber]/page.tsx` (adopter helper for
  captain-utledning)
- `.changes/1538-<slug>.md` (notatfil, type fix)

## Out of Scope

- #1577 (lever-CTA-en på hull-siden for ikke-kapteiner — samme rotmønster, men
  egen flate med et uavklart produktspørsmål; bygges ETTER at denne helperen
  finnes).
- Endringer i `mergePairExtras`/`mergePairState`-semantikken (#1449/#1466).
- Hull-sidens handicap-/allowance-beregninger.





