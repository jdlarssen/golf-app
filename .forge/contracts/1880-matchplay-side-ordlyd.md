# Spec: «Side», ikke «Lag», på matchplay-spillere (#1880)

Eiervalg tatt i kontraktøkt 2026-09-01 — ingen åpne produktvalg. PR:
`Closes #1880`.

**Sekvensering:** native-halvdelen rører `RosterRow` i `GameHome.tsx` — samme
linjer som #1875-slicen (og #1879s statusmerker). Bygges ETTER at #1875-slicen
er merget; har #1879 landet først, rebase mot den (marks-blokken er felles).
Web-halvdelen har ingen kø.

## Problem

I matchplay er `game_players.team_number` en side i duellen
(`lib/games/matchplaySides.ts`, sidene er alltid {1, 2}), men tre flater sier
«Lag»: appens spillerliste (`native/app/src/screens/GameHome.tsx:359`), webbens
info-kort på spill-hjem (`app/[locale]/games/[id]/(home)/page.tsx:1200` og
:1312, nøklene `game.home.teamLabel`/`teamValue`) og utkast-oversikten
(`DraftTeamsOverview.tsx:56` + kicker `draftTeamsLabel` i `page.tsx:1273`).
Produktets etablerte ord er «Side» (admin-detalj `page.tsx:543`, appens
veiviser `rosterLimits.ts:110–112`). I tillegg: en matchplay-runde er alltid
én duell med maks 4 spillere i flight 1 — Flight-visningen er konstant støy der.

## Research Findings

Rent visningsarbeid, ingen ny biblioteksflate. Verifisert i økta:
- `isMatchplayMode` (`lib/games/matchplaySides.ts:31`) dekker alle seks
  matchplay-modi; ren TS uten nye bare-imports → Metro-trygg i native.
- Native gater KUN patsome (`formatGate.ts`) — alle matchplay-spill rendrer
  spillerlista i appen, så native-grenen er reell.
- `isSoloFormat` regner ALDRI matchplay som solo (`types.ts:212ff`) — begge
  web-kortvariantene treffer «Lag»-raden for duellspill i dag.
- `leaderboard.common.teamLabel` brukes kun av Texas-/Patsome-/Shamble-podier —
  matchplay har ingen podium (delt presedens), så den nøkkelen røres IKKE.
  (Issue-ets «verifiser før lukking» er dermed gjort.)

## Design

Gren på `isMatchplayMode(gameMode)` på alle tre flatene:

1. **App, `RosterRow`:** matchplay → mark «Side {n}» i stedet for «Lag {n}»,
   og INGEN Flight-mark (eiervalg — alltid flight 1). Øvrige marks
   (Trukket/Levert/Godkjent) uendret. Mode må ned til `RosterRow`
   (prop/beregnes i forelderen — byggerens valg).
2. **Web, info-kortet (begge varianter):** matchplay → dt «Side», dd
   «Side {number}» (samme mønster som dagens «Lag»/«Lag {number}»), og
   Flight-dt/dd-paret droppes for matchplay. CH-raden uendret.
3. **Web, utkast-oversikten:** matchplay → kicker «SIDER», rader
   «Side {number}». Mode er tilgjengelig i `page.tsx`; hvordan den når
   `DraftTeamsOverview` er byggerens valg.

**i18n:** nye nøkler i `game.home` i BÅDE `messages/no.json` og
`messages/en.json` (catalogParity- og apostropheParity-testene håndhever
paritet). Engelsk bruker samme ord: «Side» / «Side {number}» / «SIDES» —
korrekt matchplay-engelsk. Nøkkelnavn er byggerens (f.eks. `sideLabel`,
`sideValue`, `draftSidesLabel`, `sideLabel2`).

## Edge Cases & Guardrails

- `team_number` utenfor {1, 2} på en matchplay-rad (stale data): vis raden uten
  side-mark — aldri krasj, aldri «Lag»-fallback som gjeninnfører feilen.
- `team_number == null` (før sider er satt): ingen mark, som i dag.
- Ikke-matchplay-formater: bit-for-bit uendret visning (lag-formatene skal
  fortsatt si «Lag», solo skal fortsatt skjule radene).
- Ingen DB-, RLS- eller logikkendring — kun visning + i18n.

## Key Decisions (eier, kontraktøkta 2026-09-01)

- **«Side N»** per etablert presedens (avgjort allerede i issuet).
- **Flight droppes for matchplay** på både app-marken og webbens kort-rad —
  konstant «Flight 1» bærer ingen informasjon.

**Claude's Discretion:** nøkkelnavn i i18n; hvordan mode når `RosterRow`/
`DraftTeamsOverview`; om side-marken vises på trukne rader.

## Success Criteria

1. `cd native/app && npx tsc --noEmit && npx jest` grønne; berørte
   GameHome-tester oppdatert (maks én ny assertion-case for side-grenen hvis
   ingen fixture dekker matchplay i dag — ingen «mens jeg var her»-tester).
2. Rot: `npx vitest run messages` grønn (paritetstestene ser de nye nøklene) +
   `npm run build` grønn.
3. Manuell verifisering: matchplay-spill viser «Side 1»/«Side 2» og ingen
   Flight-rad/mark på (a) appens spillerliste, (b) webbens info-kort, (c)
   utkast-oversikten; et lag-format viser fortsatt «Lag»/«Flight» uendret.
4. Staging-klikkrunde av webbens spill-hjem for et matchplay-spill FØR merge
   (bruker-synlig web-endring — staging-verify-porten gjelder), bevis på PR-en.
5. VERIFICATION GAP: appens visning bekreftes med simulator-skjermbilde i
   PR-en; endelig enhets-dom er eierens tapptest.

## Gates

Web-endringer: `npm run build` + `npx vitest run` for berørte testfiler.
Native: `cd native/app && npm install && npx tsc --noEmit && npx jest`.
Norsk copy er allerede eier-godkjent ordrett («Side N», «SIDER»).

## Files Likely Touched

- `native/app/src/screens/GameHome.tsx` (+ testfil) — RosterRow-grenen
- `app/[locale]/games/[id]/(home)/page.tsx` — begge kort-variantene + kicker
- `app/[locale]/games/[id]/(home)/DraftTeamsOverview.tsx` — side-rader
- `messages/no.json` + `messages/en.json` — nye nøkler

## Out of Scope

- `leaderboard.common.teamLabel` og podiene (matchplay treffer dem aldri).
- Duellkortene/MatchView (#1842 eier layouten der; ordbruken der er alt «side»).
- Admin-flatene (sier alt «Side») og veiviseren (`rosterLimits` sier alt «side»).
- Enhver DB-/logikkendring.

## Bokføring for byggeøkta

To atomiske commits: web-fixen som `fix(...)` MED `.changes/1880-<slug>.md`
(type `fix` — bruker-synlig web-endring), native-fixen med `[no-changelog]`
(native-presedens). Begge med `Refs #1880`. PR: draft-først (#1516),
`Closes #1880`, Fordeler/ulemper-blokk, ingen produktvalg-heading.
