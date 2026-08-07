# Spec: Cup per-spiller-poengregnskap på resultatsiden (#1497)

## Problem

Alt cup-poengregnskap er per LAG. Spillerne spør «hvilke poeng bidro jeg til?» og «hvor mange
poeng samlet den enkelte inn?» — ingen flate aggregerer kamppoeng + ctp/ld-sidepoeng per person.
Dataene finnes allerede i `getCupSnapshot` (spillere per kamp med `team_number`, per-kamp-poeng i
`CupMatchSummary`, `winnerUserId` per ctp/ld-slot). Resultatsiden (#1468) er seremonirommet der
regnskapet hører hjemme.

## Research Findings

Ingen eksterne biblioteker i spill — ren TS-aggregator + server-rendret React + next-intl-nøkler,
alle mønstre finnes i repoet. Ground-truth fra scouting (denne økten):

- `CupMatchSummary` (`lib/cup/computeCupLeaderboard.ts:121`) har allerede per-kamp-poeng
  (`pointsTeam1`/`pointsTeam2`) beregnet med vekter (`win_points`/`tie_points`) og
  finished-gating — aggregatoren skal GJENBRUKE disse, aldri regne kamppoeng på nytt
  (recompute-vs-reuse: poengregelen har ett hjem i `pointsForMatch`).
- `CupMatchInput` mangler spiller-ID-er per side (kun navn-labels) — må utvides med valgfrie
  `team1UserIds`/`team2UserIds` som `getCupSnapshot` setter (side1Players/side2Players finnes
  allerede i loopen, `getCupSnapshot.ts:330`).
- `CupSideAwardSnapshot` (ctp/ld-varianten) har `winnerUserId` — klar for spiller-attribusjon.
  gir-varianten har ingen spiller-attribusjon (by design #1489).
- Utbrettbar rad: native `<details>` er husets mønster (`components/ui/Disclosure.tsx`) —
  server-rendret, ingen klient-JS. Raden her er for kompakt for Disclosure-kortet; bygg egen
  slank `<details>`-rad i samme stil.
- `formatPoints` (`lib/cup/formatPoints.ts`) for komma-desimal; `displayName`-regelen er
  nickname ?? name (roster har begge felt).
- i18n: nye nøkler under `cup.results.*` i `messages/no.json` + `messages/en.json`.
  Sidepoeng-labels gjenbrukes: `cup.sideAwards.kindCtp` («Nærmest hullet»), `kindLd`,
  `holeShort` («hull {n}»).

## Prior Decisions

- #1468: resultatside er låst til `status = 'finished'`; delt synlighets-helper `canViewCupPage`.
  Regnskapet rendres KUN i finished-grenen — låst-grenen røres ikke.
- #1489: GIR er lag-attribuert, ingen spiller-attribusjon — holdes UTENFOR spillerregnskapet.
- #1441 D8: vektede poeng (`win_points`/`tie_points`) — aldri hardkod 1/0,5.
- #1472/#1468 (seremoni-filosofien): resultater er en seremoni; kortene utenfor spoiler aldri.

## Eierbeslutning (fra issue, 2026-08-07)

**Ryder Cup-konvensjonen: full kreditt.** I lagkamper får BEGGE spillerne i paret hele
kamppoenget (hele `tie_points` ved delt kamp) — ikke 0,5/0,5-deling. Spillertotalene summerer
dermed IKKE til lagtotalen; det er bevisst og skal ikke «fikses».

## Design

**Ny ren aggregator** `lib/cup/computeCupPlayerPoints.ts` (Type A, TDD). Input er
snapshot-formen: `{ matches: CupMatchSummary[]; roster: CupRoster; sideAwards: CupSideAwardSnapshot[] }`.
Output: per-lag-lister med rader:

```ts
type CupPlayerPointsRow = {
  userId: string;
  displayName: string;            // nickname ?? name ?? 'Ukjent spiller'
  team: 1 | 2;
  points: number;                 // avrundet til nærmeste 0,1 som lagtotalen
  contributions: Array<
    | { type: 'match'; gameId: string; matchLabel: string | null; opponentLabel: string;
        outcome: 'won' | 'tied'; points: number }
    | { type: 'ctp' | 'ld'; holeNumber: number; points: number }
  >;
};
```

- Kamp-kreditering: for hver match i `matches`, hver spiller i `teamNUserIds` krediteres
  `pointsTeamN` når den er > 0 (full kreditt per eierbeslutningen). Uferdig/uavgjort-null
  match har allerede 0 der — ingen egen gating i aggregatoren.
- Sidepoeng: ctp/ld med `winnerUserId` i rosteret → +points på den spilleren. gir hoppes over.
- Rader for HELE rosteret — spillere med 0 poeng vises med 0 (tom contributions).
- Sortering per lag: poeng synkende, deretter displayName stigende (deterministisk).

**Visning** på `app/[locale]/cup/[id]/resultater/page.tsx`, kun i finished-grenen: ny seksjon
mellom lagtotalene og kamplisten. Én gruppe per lag (lagnavn som overskrift). Hver spillerrad:
navn + poeng (`tabular-nums`, `formatPoints`), utbrettbar via native `<details>` til
kontribusjonsliste («Vant mot X · +1», «Delte med Y · +0,5», «Nærmest hullet, hull 7 · +1»).
Innlogget deltakers rad framheves (champagne-tint i stil med GOLD_CARD_STYLE + «Dine poeng»-
markør) — `userId` finnes allerede på siden. Presentasjonen trekkes ut i en ikke-async
komponent `CupPlayerPoints.tsx` i resultater-mappen (server-kompatibel, ingen `'use client'`).
`data-testid` på seksjon og egen-rad for staging-verifisering.

## Edge Cases & Guardrails (edge-tabell, T1)

| Input-klasse | Forventet |
|---|---|
| tom (0 kamper, 0 sidepoeng) | alle roster-spillere 0 p, sortert på navn |
| én ferdig singles-kamp, side 1 vant | vinner +win_points, taper 0 |
| spiller i flere kamper (host + avledet) | summen av alle kampenes poeng |
| grense: vektede poeng win=2/tie=1 | fulle vektede verdier krediteres, aldri 1/0,5 |
| lik totalsum (tie) | deterministisk rekkefølge: poeng desc, navn asc |
| ugyldig: ctp-vinner utenfor roster / null | ingen spiller-kreditt, ingen crash |
| delt lagkamp | BEGGE i paret får hele tie_points |
| gir-rader | bidrar aldri til spillerrader |
| samtidighet / tidssone | N/A — ren funksjon over én snapshot, ingen datoer |

- Trukkede spillere står i rosteret → vises med det de faktisk samlet inn.
- Låst side (ikke finished): seksjonen rendres ikke — låst-grenen uendret.
- `CupMatchInput`-utvidelsen er valgfrie felt — eksisterende call-sites/tester upåvirket (T2).

## Key Decisions

- Full kreditt per spiller (eierbeslutning i issue) — Ryder Cup-konvensjon.
- Gjenbruk `pointsTeam1/2` fra `CupMatchSummary` — poengregelen har ett hjem.
- GIR utenfor spillerregnskapet (eierbeslutning, #1489-design; #1496 dekker laglinje-detaljer).
- Native `<details>` per rad — husets mønster, ingen klient-JS, reduced-motion-trygt.

**Claude's Discretion:**
- Kontribusjonslisten viser kun poenggivende hendelser (tapte/uferdige kamper listes ikke) —
  regnskapet er en kvittering for innsamlede poeng, jf. issue-eksemplet.
- Seksjonens plassering (mellom lagtotaler og kampliste), eksakt copy (humanizer før commit),
  sorterings-collator, testid-navn.

`ASSUMPTION:` de to diskresjonspunktene over er ikke produktvalg (eierbeslutningene i issuet
dekker semantikken); PR-en beskriver dem i Fordeler/ulemper-blokken med veto-mulighet.

## Success Criteria

- [ ] Aggregatoren krediterer full kamppoeng (vektet) til hver spiller på vinnende/delt side,
      og summerer på tvers av kamper — `npx vitest run lib/cup/computeCupPlayerPoints.test.ts` grønn
      med edge-tabellen over som testcases.
- [ ] ctp/ld krediteres via `winnerUserId`; gir og utenfor-roster-vinnere gir null spiller-bidrag
      (testbevis fra samme suite).
- [ ] Resultatsiden (finished) viser per-lag-spillertabell sortert på poeng, `tabular-nums`,
      utbrettbare rader med kamp-for-kamp-detalj (file:line + staging-skjermbilde).
- [ ] Innlogget deltakers rad er framhevet med «Dine poeng»-markør (staging-verifisert som
      deltaker).
- [ ] Låst resultatside er uendret — ingen spillertabell før finish (file:line-bevis).
- [ ] Begge locales har nøklene (`messages/no.json` + `messages/en.json`), norsk copy
      humanizer-kjørt.
- [ ] Maks én Type C render-test for `CupPlayerPoints` (test-disiplinen); ingen re-assertering
      av Type A-tall.

## Gates

- [ ] `npx vitest run lib/cup` grønn (hele cup-suiten, inkl. ny aggregator-test)
- [ ] `npx vitest run "app/[locale]/cup/[id]/resultater"` grønn (render-testen)
- [ ] `npm run build` grønn (tsc-fella: aldri filtrer «pre-existing»)
- [ ] `npm run lint` grønn
- [ ] Staging-klikkrunde av resultatsiden (staging-verify-skill) + bevis-kommentar + label FØR merge

## Files Likely Touched

- `lib/cup/computeCupPlayerPoints.ts` + `.test.ts` — ny ren aggregator (TDD)
- `lib/cup/computeCupLeaderboard.ts` — `CupMatchInput` + valgfrie `team1UserIds`/`team2UserIds`
- `lib/cup/getCupSnapshot.ts` — populer userId-feltene per match
- `app/[locale]/cup/[id]/resultater/page.tsx` — ny seksjon (kun finished-gren)
- `app/[locale]/cup/[id]/resultater/CupPlayerPoints.tsx` + én render-test
- `messages/no.json` + `messages/en.json` — nye `cup.results.*`-nøkler
- `package.json`/`package-lock.json` (minor-bump) + `CHANGELOG.md` (feat-linje)

## Out of Scope

- #1508 MVP-kåring / «dro ned mest» — bygger på aggregatoren, egen sak ETTER denne.
- #1496 sidepoeng-detaljer per hull (laglinje/GIR-visning) — egen sak, ikke samtidig.
- Ingen DB-endringer, ingen RLS-endringer, ingen endring i lagtotal-beregningen.
- Ingen «avstemming» mellom spillersum og lagtotal — avviket er by design.
