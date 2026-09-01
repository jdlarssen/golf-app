# Spec: GameHome-polering fra tapptest — Juster-knapp (#1875, anker) + wolf-rotasjonsmerking (#1874)

Eierens tapptest av N6b (#1855) traff to kanter i samme seksjon av spill-hjem.
Begge er språk-/designvalg som eieren har avgjort i kontraktøkta 2026-09-01 —
ingen åpne produktvalg gjenstår. PR-en lukker begge: `Closes #1875` +
`Closes #1874`.

**Sekvensering (eier-instruks):** bygges av en Opus-økt ETTER at N6c (#1856) er
merget — N6c rører `GameHome.tsx` og navigasjonen, denne slicen rører
`GameHome.tsx` + `OrganiserSection.tsx`. Rebase på main etter N6c-mergen før
bygging.

## Problem

1. **#1874:** `RosterRow` (`native/app/src/screens/GameHome.tsx:356–373`) viser
   «Flight 3 · Lag 3» for wolf og round robin. Der er `team_number` =
   `flight_number` en **plass i rotasjonen** (`lib/games/assignRotationSlots.ts`),
   ikke lag eller flight — visningen fikk eieren til å tro spillerne gikk i hver
   sin ball. Webben er IKKE berørt: den skjuler Lag/Flight-radene for hele
   solo-familien inkl. wolf/RR (`app/[locale]/games/[id]/(home)/page.tsx:1301`).
2. **#1875:** lag-/flight-velgerne i `OrganiserSection.tsx:184–185` er gatet på
   `needsTeamAssignment`/`needsFlightAssignment` — de vises kun når noen
   MANGLER. Fyller arrangøren siste tomme plass, forsvinner kontrollen i samme
   bevegelse, og rebalansering fra appen er umulig. Eieren traff kanten to
   ganger på fem minutter.

## Research Findings

Ingen ny biblioteksflate: begge endringene bruker RN-primitivene og mønstrene
som allerede står i de samme filene (`useState`-toggle, `Pressable` +
`ui.buttonSecondary`, `ChipRow`). Ingen nye bare-imports → ingen
`native/app/package.json`-endring (Metro-fella fra N6a gjelder ikke).
Wolf-rotasjonsformelen er verifisert i kode: hull 1..R (R = floor(18/n)·n) har
Wolf = spilleren med `team_number === ((hull−1) % n) + 1`
(`lib/scoring/modes/wolf.ts:101`); hull R+1..18 er trailing-wolf (avgjøres av
stillingen). Appens etablerte rollenavn er «Wolf» (`WolfView.tsx`,
`WolfChoiceCard`), ikke «Ulv».

## Prior Decisions

- **#1855-kontrakten la omfordeling til nettsiden i v1.** Eieren har nå
  eksplisitt bestilt app-omfordeling (issue-kommentar på #1875 + kontraktøkta) —
  dette overstyrer v1-kuttet bevisst.
- **Statisk `ui`/`COLORS`, ikke `useTheme()`** (#1855 D5, #1866 utsatt eiervalg).
- **#1868/migrasjon 0168:** arrangørens egen rad er skrivbar for lag/flight —
  Juster-modusen trenger intet eget-rad-unntak.
- **Skriv krever nett** (aldri sync-køen) — uendret N6b-linje.

## Design

### #1874 — rotasjonsmerking i RosterRow (eiervalg: alternativ A)

Gren på `rotationSlotRange(game.gameMode) !== null` (delt helper):

- **Wolf:** dropp «Flight N»/«Lag N»-markene; vis i stedet hullene plassen gir
  Wolf-rollen på i den faste delen av rotasjonen: «Wolf på hull 3, 7, 11 og 15»
  (komma-liste med «og» før siste). Trailing-hullene (R+1..18 ved n=4/5) listes
  IKKE — de avgjøres av stillingen og annonseres av `WolfChoiceCard` på
  hull-skjermen.
- **Round robin:** ingen rotasjonsmark i det hele tatt (rekkefølgen er rent
  kosmetisk for poengene — web-paritet).
- «Trukket»/«Levert»/«Godkjent»-markene beholdes uendret for begge.
- Alle andre formater: uendret visning.

**Ny ren helper** `wolfLinearHolesForSlot(slot, n)` i delt lib (naturlig hjem:
`lib/wolf/`, ved siden av `holeLabels`) — utledet av SAMME formel som motoren,
Type A-testet først (TDD — `lib/`-scoring-disiplinen). Edge-tabell:

| input | forventet |
|---|---|
| n=3, slot=1 | [1, 4, 7, 10, 13, 16] (R=18) |
| n=4, slot=3 | [3, 7, 11, 15] (R=16) |
| n=4, slot=4 | [4, 8, 12, 16] — hull 17–18 er trailing, utelates |
| n=5, slot=5 | [5, 10, 15] (R=15) |
| slot > n (stale data) | [] → ingen mark |
| slot < 1 eller n < 3 | [] → ingen mark |
| duplicate/tie | N/A — ren funksjon av (slot, n) |
| concurrent/tz | N/A — ren matte |

`n` = aktive (ikke-trukkede) spillere i bundelen — samme telling motoren bruker.

### #1875 — «Juster»-knapp i OrganiserSection (eiervalg: kompakt, dekker begge)

Radene gjelder når formatet har dem: lag-rader når
`modeRequiresTeamNumber(mode, teamSize)`, flight-rader når
`!isSingleFlightGame(mode, players)`. Observérbar oppførsel (kun `scheduled`):

- **Noen mangler lag/flight** → radene står framme som i dag (påkrevd arbeid;
  start er blokkert).
- **Alle fordelt** → kompakt tekstknapp **«Juster»** (sekundær-stil med
  `alignSelf: 'flex-start'`, som `rowButton`-mønsteret — IKKE full bredde).
  Trykk folder ut alle radene formatet har (lag og/eller flight); knappen
  toggler til «Ferdig» som lukker igjen.
- **Forsvinn-vaksinen (kjernekravet):** å fylle siste tomme plass må ALDRI
  skjule radene i samme interaksjon — de står til arrangøren selv lukker eller
  forlater skjermen. NB: `onChanged`-refetch kjører etter hvert skriv;
  toggle-staten må overleve den (jf. remount-fella «client-state from
  initialData needs key»).
- Eiervalgets begrunnelse for tekst framfor ikon: appen har null ikonspråk (ingen
  vector-icons-dep, ingen glyfknapper) — en tekstknapp er mønsteret som finnes.
- Kapasitetsvakta i `setPlayerTeam` står uendret foran skrivet — fullt lag
  avvises fortsatt med «Det laget er fullt» via `describeRosterFailure`.
- Kommentarblokken `OrganiserSection.tsx:180–183` (som dokumenterer den gamle
  gaten) skrives om til den nye modellen.

## Edge Cases & Guardrails

- **Ingen klipping** (lærdommen fra #1842): «Wolf på hull 3, 6, 9, 12, 15 og
  18» (n=3-tilfellet, lengst) må bryte/krympe, aldri renne ut av raden. Én
  render-test dekker n=3-lengden.
- Wolf + trukket spiller: «Trukket»-mark vises; wolf-marken kan stå eller
  utelates (Claude's discretion) men må aldri krasje ved stale slot (`[]`-grenen).
- Wolf før start: `teamNumber == null` → ingen mark (uendret, slots trekkes ved
  start).
- Juster-knappen vises aldri for wolf/RR (`modeRequiresTeamNumber` false,
  `isSingleFlightGame(wolf)` alltid true) eller matchplay (sidene eies av
  `incomplete_sides`-vakta — web-flate).
- Solo-format med >4 aktive spillere (kun flight-rader, ingen lag): Juster
  dekker flight-radene alene.
- `active`/`finished` status: ingen Juster-knapp — rebalansering etter start er
  fortsatt web/sekretariat.

## Key Decisions (eier, kontraktøkta 2026-09-01)

- **#1874-merkelapp:** «Wolf på hull …» for wolf, ingenting for round robin —
  valgt over «Rotasjon N» og full skjuling.
- **#1875-form:** kompakt «Juster»-tekstknapp som dekker både lag- og
  flight-rader — eieren ba om «Juster» eller ikon; tekst valgt fordi appen ikke
  har noe ikonspråk (delegert avgjørelse, bokført her).
- **#1844/#1842 holdes UTE** av slicen — begge har egne `autonomy:ready`-
  kontrakter for nattkjøreren; ingen filkollisjon.

**Claude's Discretion:** eksakt plassering av Juster-knappen i seksjonen;
lukket/åpen-etikettpar («Juster»/«Ferdig» er default, kan matche
«Lukk listen»-mønsteret); mekanismen bak forsvinn-vaksinen (f.eks.
`adjusting`-state som settes ved chip-trykk); om wolf-marken beholdes på
trukne rader; layoutgrep mot klipping (flexShrink vs egen linje).

## Success Criteria

1. `npx vitest run lib/wolf` grønn — `wolfLinearHolesForSlot` dekker
   edge-tabellen med `it.each` (Type A, test-først).
2. `cd native/app && npx tsc --noEmit && npx jest` grønne. Jest-suiten viser:
   wolf-spill (active) rendrer «Wolf på hull …» og INGEN «Flight/Lag»-mark;
   round robin rendrer ingen slot-mark; lag-format uendret.
3. OrganiserSection-tester viser: alle-fordelt → «Juster»-knapp; trykk → rader;
   fylling av siste tomme plass skjuler IKKE radene (forsvinn-vaksinen).
4. `npm run build` grønn i repo-rota (delt `lib/` er rørt — full gate, ingen
   «pre-existing»-unntak).
5. `grep -rn "Flight \${" native/app/src` og tilsvarende for «Lag» viser at
   rotasjonsgrenen er eneste nye avvik — team-/matchplay-visning urørt.
6. VERIFICATION GAP: visuell bekreftelse på enhet er eierens tapptest —
   bokføres i PR-en (simulator-skjermbilde av wolf-roster + Juster-flyt i PR-en
   der praktisk).

## Gates

`cd native/app && npm install && npx tsc --noEmit && npx jest` etter hver chunk;
`npx vitest run lib/wolf` + `npm run build` i rota før PR. Ny norsk copy →
humanizer-tone (`docs/copy-style.md`).

## Files Likely Touched

- `native/app/src/screens/GameHome.tsx` — RosterRow-grenen for rotasjonsformater
- `native/app/src/components/game/OrganiserSection.tsx` (+ test) — Juster-modus
- `lib/wolf/` — ny `wolfLinearHolesForSlot` + Type A-test
- Evt. `native/app/src/screens/GameHome.test.tsx` (eller der RosterRow testes)

## Out of Scope

- #1844 og #1842 — egne kontrakter, nattkjøreren (eiervalg).
- Matchplay-radenes «Lag N»-ordlyd (sider, ikke lag) — observert i økta, eget
  issue hvis eieren vil.
- Rebalansering under aktive spill; sekretariat-overstyringer (web).
- Web-endringer — webben viser allerede ingenting for rotasjonsformater
  (#1874s «sjekk webben» er verifisert: ikke berørt).
- Dark mode (#1866), `suggestTeam`/`suggestFlight`-algoritmer, sync-kø for
  roster-skriv.

## Bokføring for byggeøkta

Commits: `Refs #1875` (evt. `Refs #1874` der det passer) + `[no-changelog]`
(native-presedens — footeren er webbens). PR: draft-først (#1516),
`Closes #1875` + `Closes #1874`, Fordeler/ulemper-blokk, INGEN
produktvalg-heading (valgene er tatt av eier i kontraktøkta).
