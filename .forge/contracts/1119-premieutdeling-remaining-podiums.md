# Spec: Premieutdeling på resten av podium-formatene (epic #1039, #1119)

## Problem
#1051 leverte Premieutdeling-kortet («premie → vinner» ved rundeslutt) og monterte det på de tre dominerende podiene: **stableford**, **solo slagspill** og **best ball**. Den delte helperen `buildPrizeAwards()` + den rene `linkPrizesToWinners()` er format-generiske (kobler på `result_summary.rank` + `game_side_winners`), og premiebordet vises alt _før start_ på alle formater via `PremiebordCard`. Men ved rundeslutt viser 10 av podium-formatene fortsatt ikke Premieutdelingen — så en arrangør som legger inn en premie på f.eks. Texas scramble eller Skins ser premien før start, men den «forsvinner» når runden er ferdig. Denne delen tetter det hullet: ren innmontering av den allerede-utregnede `prizeAwardsNode` i de resterende format-renderene. Ingen ny data-henting, ingen ny logikk.

## Prior Decisions (carry-forward)
- **#1051 (del 2):** `prizeAwardsNode` regnes ut ÉN gang i `leaderboardContent.tsx` (`buildPrizeAwards` → `PrizeAwardsCard`, null når spillet ikke har premier eller ingen premie fikk vinner) og tres inn i format-renderenes finished-footer. Samme node gjenbrukes her — ingen ny utregning.
- **#585:** Matchplay-familien er UTELATT by design (intet podium; `result_summary.kind === 'matchplay'` har ingen rank). Gjelder `singles_matchplay`, `fourball_matchplay`, `foursomes/greensome/chapman/gruesome_matchplay` — disse renderene røres ikke.
- **Test-disiplin:** Ingen nye unit-tester — `linkPrizesToWinners` er alt dekket (`lib/games/prizeAwards.test.ts`: delt plass, manglende vinner, lag, matchplay, fieldSize<3, skins). Dette er ren node-tre-ing (Type-D-territorium: staging-klikkrunde), ikke ny logikk. «Mens jeg var her»-tester er forbudt.
- **Bruker-vedtak (denne økten):** alle 10 formatene wires (også penge-/poeng-formatene — de produserer rank, og premiebordet viser premien før start uansett, så å utelate dem gir vist-før-men-borte-etter-inkonsistens).

## Research Findings (kodebase-scout, 2026-07-07)
Ingen eksterne biblioteker involvert — rent internt React/Next-arbeid. Scouten (Explore-agent over alle 16 format-renderene + `resultSummary.ts`/`persistResultSummaries.ts`/`prizeAwards.ts`) fant:

- **Alle 10 mål-formatene produserer numerisk rank** i `result_summary` (kind `placement` for 9, dedikert `skins` for Skins) — `linkPrizesToWinners` matcher plasseringspremier for hver av dem (`prizeAwards.ts:62` guarder `kind === 'placement' || kind === 'skins'`). **Ingen no-op-tilfeller.** `computeResultSummaries` bruker `assertNever` som default, så enhver mode som ikke er dekket ville vært compile-error — alle 10 er garantert dekket.
- **Alle 10 har finished-podium og støtter sideturnering** (`game.side_tournament_enabled`-gren), altså **to** innmonteringspunkter hver: ikke-side-returen + `{reportSection}`-siblingen etter side-fanene.
- **Ingen av de 10 har `WithdrawnPlayersSection`** — deres `gwp.players`-type utelater `withdrawn_at`. Så prepend-målet er ren `<>{prizeAwardsNode}{reportSection}</>` (ikke `{...}{wdSection}` som i stableford).
- **texasScramble er eneste avviker:** podium-closuren har signatur `(chromeless)` UTEN `footerSlot`-parameter — den setter `footerSlot={chromeless ? undefined : reportSection}` direkte (`texasScramble.tsx:191`). De andre 9 har alt en `(chromeless, footerSlot?)`-closure klar til å ta imot et ekstra fragment-barn.
- **`isScrambleFamily()` dekker `texas_scramble | ambrose | florida_scramble`** — alle tre ruter gjennom `texasScramble.tsx`, så den ene filen dekker hele scramble-trioen. `nines` dekker Nines/Split Sixes (én mode-streng).

## Design

### Referanse-mønster (fra #1051, `stableford.tsx` / `soloStrokeplay.tsx`)
Tre-delt endring per renderer:
1. **opts-type:** legg til feltet, med JSDoc, som siste felt:
   ```tsx
   /** #1051/#1119: Premieutdeling-kortet, rendret under podiet i finished-footeren. */
   prizeAwardsNode?: ReactNode;
   ```
2. **destrukturer:** legg `prizeAwardsNode` til i den eksisterende destruktur-linja.
3. **footer-prepend:** i BEGGE finished-grener (ikke-side + side-sibling), bytt bar `reportSection` mot `<>{prizeAwardsNode}{reportSection}</>` (prepend som første barn).

Og i **`leaderboardContent.tsx`**: legg `prizeAwardsNode` til i hvert av de 10 `renderX({...})`-kallene (noden er alt utregnet på linje 176–182 — den sendes bare ikke inn i disse 10 ennå). `renderTexasScramble`-kallet (linje 248–256) sender alt `formatLabel` — legg `prizeAwardsNode` til samme objekt.

### Per-fil innmonteringspunkter (fra scout — bygg mot disse, verifiser linjenr. da de kan ha driftet)
De 9 rett-fram-filene (closure har alt `(chromeless, footerSlot?)`):

| Fil | Ikke-side-retur | Side-gren `{reportSection}`-sibling |
|---|---|---|
| `wolf.tsx` | ~160 `finishedView(false, reportSection)` | ~156 |
| `nassau.tsx` | ~222 `mainContent(false, reportSection)` | ~218 |
| `skins.tsx` | ~206 `mainContent(false, reportSection)` | ~202 |
| `bingoBangoBongo.tsx` | ~213 `mainContent(false, reportSection)` | ~209 |
| `nines.tsx` | ~145 `finishedView(false, reportSection)` | ~141 |
| `roundRobin.tsx` | ~131 `finishedView(false, reportSection)` | ~127 |
| `aceyDeucey.tsx` | ~144 `finishedView(false, reportSection)` | ~140 |
| `shamble.tsx` | ~162 `finishedView(false, reportSection)` | ~158 |
| `patsome.tsx` | ~136 `finishedView(false, reportSection)` | ~132 |

Mønster for de 9: `finishedView(false, reportSection)` → `finishedView(false, <>{prizeAwardsNode}{reportSection}</>)` (samme for `mainContent`), og prepend `{prizeAwardsNode}` foran `{reportSection}`-siblingen i side-grenen.

**`texasScramble.tsx` (avviker):** closuren `podium(chromeless)` mangler `footerSlot`-param. To like gyldige veier — byggerens skjønn:
- (a) Utvid ternæren på ~linje 191: `footerSlot={chromeless ? undefined : <>{prizeAwardsNode}{reportSection}</>}`, ELLER
- (b) utvid closure-signaturen til `(chromeless, footerSlot?)` og speil de 9 andre.
Uansett: prepend `{prizeAwardsNode}` foran `{reportSection}`-siblingen etter side-fanene (~linje 207).

### Resultat for brukeren
Et avsluttet spill i et hvilket som helst av disse formatene, med premier lagt inn, viser nå «Premieutdeling»-kortet rett under podiet — premie koblet til vinner (delt plass lister alle navn; slott uten vinner utelates), akkurat som på stableford/slagspill/best ball i dag. Penge-/poeng-formatene får plasseringspremien koblet til den som rangerte 1./2./3. på formatets egen metrikk.

## Edge Cases & Guardrails
- `prizes = []` eller ingen premie fikk vinner → `prizeAwardsNode` er `null` → ingenting rendres (gated i `leaderboardContent.tsx`). Uendret oppførsel.
- **Matchplay-renderene røres ikke** (`matchplay.tsx`, `fourballMatchplay.tsx`, `foursomesMatchplay.tsx`) — intet podium, ingen rank. Ikke legg `prizeAwardsNode` til deres opts.
- **state3/state3.5** (venterom / front-9-låst) er pre-finished → ingen premieutdeling, ingen endring der.
- Lag-formater (scramble/shamble/patsome): rank er per lag; `linkPrizesToWinners` lister alle lagmedlemmer på lagets premielinje (alt dekket i tester).
- Skins bruker dedikert `kind: 'skins'` med egen rank — alt håndtert av `linkPrizesToWinners`.
- Ikke rør demo-spillet (`/demo`) — det har ingen prizes i datasettet.
- **Ute av scope: #1126** (solo-stableford + sideturnering-grenen som glemte `{prizeAwardsNode}` i #1051) — egen bug-issue etter bruker-vedtak; ikke rør `stableford.tsx` i denne PR-en.
- Ingen DB-, RLS- eller migrasjonsendring — ren visnings-tre-ing.

## Key Decisions
- **Alle 10 formater wires, inkl. penge-/poeng-formater** (bruker-vedtak): rank finnes for alle, og premiebordet viser premien før start uansett format — å utelate premieutdeling ville gitt vist-før-men-borte-etter.
- **Solo-stableford-side-bug skilt ut til #1126** (bruker-vedtak): holder #1119 rent på de 10 nye formatene; ikke smyg fiksen inn her.
- **Ingen nye unit-tester** (test-disiplin): `linkPrizesToWinners` er alt dekket; endringen er ren node-tre-ing. Bevises via staging-klikkrunde.
- **Staging-verifisering på representativt utvalg** (bruker-vedtak): Texas scramble (lag/scramble + avviker-renderen) + Skins (penge-/duell-format) — endringen er identisk per renderer, så utvalget beviser mønsteret innen #1076-portens 45-min-tak.

**Claude's Discretion:**
- texasScramble: ternær-utvidelse (a) vs closure-signatur (b) — velg det som holder diffen minst og mest lik de 9 andre.
- Nøyaktig linjenr. (kan ha driftet siden scout) — match på `finishedView(false, reportSection)` / `mainContent(false, reportSection)` / `podium(false)` og `{reportSection}`-siblingen, ikke på tall.

## Success Criteria
- [x] Alle 10 renderene (`texasScramble`, `wolf`, `nassau`, `skins`, `bingoBangoBongo`, `nines`, `roundRobin`, `aceyDeucey`, `shamble`, `patsome`) tar `prizeAwardsNode?: ReactNode` i opts, destrukturerer den, og prepender den i BEGGE finished-grener (ikke-side + side). **Bevis:** `grep -c prizeAwardsNode` = 4 i hver av de 10 filene (opts + destructure + non-side + side).
- [x] `leaderboardContent.tsx` sender `prizeAwardsNode` inn i alle 10 `renderX(...)`-kallene. **Bevis:** grep gikk fra 5 → 15 passeringspunkter (10 nye), commit `fc21d84d`.
- [x] Matchplay-renderene og `stableford.tsx` er URØRT. **Bevis:** `grep -c prizeAwardsNode` = 0 i matchplay/fourballMatchplay/foursomesMatchplay; `git diff stableford.tsx` tom.
- [x] `npm run build` grønn (tsc + Next). **Bevis:** BUILD_EXIT=0 («✓ Compiled successfully», «Finished TypeScript in 14.4s»); første feil var env-mangel (`.env.local`), ikke koden.
- [ ] Staging (representativt): avsluttet **Texas scramble** + **Skins** med premier viser «Premieutdeling» under podiet, koblet til rett vinner (snapshot-assertion på `data-testid`, ikke norsk copy). **Utsatt til stagingbevis-porten på PR-en (#1076).**

## Gates
- [x] `npm run build` — exit 0 (tsc + Next build). **Bevis:** BUILD_EXIT=0.
- [x] `npx vitest run` for berørte filer — grønt. **Bevis:** `lib/games/prizeAwards.test.ts` 12/12 passed; ingen nye tester lagt til.
- [x] `npm run lint` — 0 errors. **Bevis:** «54 problems (0 errors, 54 warnings)» — kun pre-eksisterende complexity-warnings i urørte filer.
- [x] Ingen ny bruker-copy → `humanizer` ikke påkrevd. **Bevis:** ingen nye UI-strenger; kun CHANGELOG-linja (konvensjon: humanizer ikke påkrevd på oppføringer).
- [ ] **Stagingbevis-porten FØR merge:** kjør `.claude/skills/staging-verify/SKILL.md` mot PR-en (torny-staging, OTP-mint, tre orakler). Representativt utvalg: Texas scramble + Skins. Sett `staging-verified`-label. Dette er #1076s første ekte kjøring. **Neste steg etter PR.**
- [x] `package.json` minor-bump (feat) + én Funksjon-linje i `CHANGELOG.md`. **Bevis:** 1.182.0 → 1.183.0; Funksjon-rad «1.183 · Premieutdeling på alle spillformer», commit `fc21d84d`.

## Files Likely Touched
- `app/[locale]/games/[id]/leaderboard/formats/texasScramble.tsx` — opts + destructure + closure/ternær + side-sibling
- `app/[locale]/games/[id]/leaderboard/formats/wolf.tsx` — opts + destructure + 2 footer-punkter
- `app/[locale]/games/[id]/leaderboard/formats/nassau.tsx` — samme
- `app/[locale]/games/[id]/leaderboard/formats/skins.tsx` — samme
- `app/[locale]/games/[id]/leaderboard/formats/bingoBangoBongo.tsx` — samme
- `app/[locale]/games/[id]/leaderboard/formats/nines.tsx` — samme
- `app/[locale]/games/[id]/leaderboard/formats/roundRobin.tsx` — samme
- `app/[locale]/games/[id]/leaderboard/formats/aceyDeucey.tsx` — samme
- `app/[locale]/games/[id]/leaderboard/formats/shamble.tsx` — samme
- `app/[locale]/games/[id]/leaderboard/formats/patsome.tsx` — samme
- `app/[locale]/games/[id]/leaderboard/leaderboardContent.tsx` — 10 `renderX(...)`-kall får `prizeAwardsNode`
- `package.json` + `CHANGELOG.md` — feat, minor bump, én Funksjon-linje

## Out of Scope
- **#1126** — solo-stableford + sideturnering-grenens manglende `{prizeAwardsNode}` (egen bug-issue).
- **Matchplay-familien** — intet podium, ingen rank (#585).
- Nye premie-slott, ny data, ny RLS/migrasjon, notifikasjoner, share-image/rundereferat (#1008-flatene).
- `#1052` sponsorlogo-opplasting (eget infra-issue).
- Nye unit-tester (test-disiplin: ren node-tre-ing, alt dekket).
