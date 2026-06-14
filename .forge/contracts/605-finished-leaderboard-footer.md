# Forge-kontrakt: Status-bevisst leaderboard-footer (#605)

- **Issue:** [#605](https://github.com/jdlarssen/golf-app/issues/605) — Leaderboard-footer sier «Lykke til.» også på ferdigspilte spill
- **Branch:** `claude/inspiring-wescoff-45e2c1`
- **Type:** `fix` (bruker-synlig copy-bug i avslutnings-momentet) → PATCH-bump
- **Flyt-forankring:** «avslutt»-fasen i kjernesløyfa (opprett → bli med → spill → avslutt). Footeren vises på hver ferdig leaderboard, alle poengformater — bredeste flate av fallow-funn-klyngen.

## Problem

Den dekorative golf-flagg-footeren (`PullQuote`) nederst på leaderboarden viser `«Lykke til.»` (`leaderboard.common.goodLuck`) også når `game.status === 'finished'`. «Lykke til» antyder at runden ikke har startet — tonalt feil for et avsluttet spill. Matchplay-familien løser allerede dette (`hasDecidedWinner ? tc('congratulations') : tc('goodLuck')` i `MatchplayMatchView`/`FourballMatchplayView`/`FoursomesMatchplayView`), men poeng-formatene gjør det ikke.

## Eier-beslutning (gråsone)

Ferdig-tilstandens footer-tekst: **«Vel spilt!»** (en: **«Well played!»**). Bevisst distinkt fra podiets `congratulations` («Gratulerer.») — på ferdige spill renderes poeng-format-Viewet chromeless UNDER podiet, så å gjenbruke `congratulations` ville vist «Gratulerer» to ganger. «Vel spilt!» er en kollektiv avslutnings-signatur for hele feltet.

## Utvidet funn under utforskning (viktig)

Ingen av de to footer-familiene er status-bevisst i dag — de feiler hver sin vei:
- **9 leaderboard-Views** hardkoder `goodLuck` («Lykke til.») → feil på ferdig (= #605s klage).
- **9 holes-Views** hardkoder `wellPlayed` i hoved-returen → viser «Godt spilt.» selv på AKTIVE spill (omvendt feil; «Hull for hull»-ruten redirecter draft/scheduled, så de får kun active/finished).

Det fantes ALLEREDE en kanonisk nøkkel `leaderboard.common.wellPlayed` = «Godt spilt.» / «Well played.» (kun brukt av de 9 holes-views). Eier-beslutning: samle alt på ÉN linje = **«Vel spilt!»** / **«Well played!»** (verdien til den eksisterende nøkkelen endres; ingen ny duplikat-nøkkel). Den delte komponenten gjør begge familier status-bevisste → fikser #605 OG den omvendte holes-feilen i samme grep.

## Approach

1. **Gjenbruk eksisterende nøkkel** `leaderboard.common.wellPlayed`, verdi endret til `"Vel spilt!"` (no) / `"Well played!"` (en). Ingen ny nøkkel — unngår duplikat (JSON tar siste). catalogParity-testen grønn.
2. **Delt komponent** `app/[locale]/games/[id]/leaderboard/LeaderboardFooter.tsx` — eier sin egen `useTranslations('leaderboard.common')` og rendrer den status-bevisste PullQuote-en. Erstatter de 18 inline-footerne (DRY, følger `project_scramble_stableford_family_pattern` + #598-dedup-mål). Server-komponent (ingen `'use client'`, speiler eksisterende Views).
   - Props: `gameStatus: 'draft' | 'scheduled' | 'active' | 'finished'`, `className?: string`.
   - Render: `<PullQuote className={className}>{gameStatus === 'finished' ? tc('wellPlayed') : tc('goodLuck')}</PullQuote>`.
3. **Wire de 18 nåbare footerne** til `<LeaderboardFooter gameStatus={…} className="…" />` (behold eksisterende className på hvert sted): 9 leaderboard-Views (erstatter `goodLuck`-footeren) + 9 holes-Views (erstatter den hardkodede `wellPlayed`-hoved-footeren).

## Scope — nøyaktig hvilke footere endres

**Endres (18 steder, alle nåbare på ferdig spill, alle har `gameStatus` i scope):**

9 leaderboard-Views (bunn-footeren ETTER spillerlista — *ikke* reveal-hidden/tom-tilstand-grenen):
- `BingoBangoBongoView.tsx:146` · `NassauView.tsx:173` · `SkinsView.tsx:212` · `WolfView.tsx:187` · `NinesView.tsx:178` · `AceyDeuceyView.tsx:178` · `RoundRobinView.tsx:189` · `ShambleView.tsx:181` · `PatsomeView.tsx:192`

9 holes-Views — erstatt den hardkodede `wellPlayed`-HOVED-footeren (den som alltid viste «Godt spilt.», også på aktive spill):
- `holes/BingoBangoBongoHolesView.tsx:108` · `holes/NassauHolesView.tsx:122` · `holes/SkinsHolesView.tsx:122` · `holes/WolfHolesView.tsx:106` · `holes/NinesHolesView.tsx:111` · `holes/AceyDeuceyHolesView.tsx:106` · `holes/RoundRobinHolesView.tsx:128` · `holes/SoloStrokeplayHolesView.tsx:117` · `holes/SoloStablefordHolesView.tsx:122`

**Røres IKKE (live-only — `goodLuck` er korrekt der):**
- Reveal-hidden/tom-tilstand-PullQuotes inne i early-return-grener (f.eks. `BingoBangoBongoView.tsx:100`, holes `goodLuck` på linje ~76) — gardet av `gameStatus !== 'finished'`, aldri nåbar på ferdig.
- 4 Views uten `gameStatus` (kun rendret på active/scheduled, podium overtar på finish): `SoloStablefordView`, `SoloStrokeplayView`, `TexasScrambleView`, `TeamStablefordView`.
- `page.tsx:3758` + `page.tsx:3855` — best-ball waiting-room states (`state3`/`state3.5`), aldri nåbar på finished.
- Matchplay-familien — løser allerede dette selv (`hasDecidedWinner`-ternæren). Rør ikke.

## Success-kriterier

- [ ] **C1** — `leaderboard.common.wellPlayed` finnes i `messages/no.json` (`"Vel spilt!"`) og `messages/en.json` (`"Well played!"`); catalogParity-testen grønn. *Evidens: grep + test-output.*
- [ ] **C2** — `LeaderboardFooter`-komponenten finnes, rendrer `wellPlayed` ved `gameStatus==='finished'` og `goodLuck` ellers. *Evidens: file:line + komponent-test grønn.*
- [ ] **C3** — Alle 18 nåbare footere bruker `LeaderboardFooter`; ingen gjenværende inline `goodLuck`-PullQuote blant de 18 (verifiser med grep). *Evidens: grep viser 0 inline-footere i de 18 filene.*
- [ ] **C4** — De live-only stedene (4 gameStatus-løse views, page.tsx 3758/3855, reveal-hidden-grener) er UENDRET. *Evidens: git diff rører ikke disse linjene.*
- [ ] **C5** — Ferdig-tilstand: en finished BBB/Nassau/Wolf-leaderboard viser «Vel spilt!» nederst (ikke «Lykke til.»); live-tilstand viser fortsatt «Lykke til.». *Evidens: oppdaterte render-tester / observert i preview.*
- [ ] **C6** — Ingen «Gratulerer»-dobling: podium + view-footer på samme ferdige skjerm sier «Gratulerer.» (podium) + «Vel spilt!» (footer). *Evidens: snapshot/observasjon.*
- [ ] **C7** — Versjon bumpet til `1.127.4` + CHANGELOG-oppføring under åpen tema-serie. *Evidens: package.json + CHANGELOG diff.*

## Gates

Kjør scoped til endringen, fiks før checkbox:
1. `npx tsc --noEmit` — grønn (ny komponent + exhaustive union).
2. `npx vitest run app/\[locale\]/games/\[id\]/leaderboard` — alle leaderboard-tester grønne (oppdater finished-tilstand-snapshots/asserts med `-u` der de kodet bug-en; ingen NYE tester utenom C2-komponenttesten).
3. `npm run lint` — ingen nye feil.
4. `npm run build` — grønn (fanger exhaustive-switch/Record-feller per Vercel-build-disiplin).

## Test-plan (test-disiplin)

- **Type C / pure:** ÉN fokusert render-test på `LeaderboardFooter` (active→«Lykke til.», finished→«Vel spilt!»). Begrunnet: delt helper med ny ren logikk (status→nøkkel-mapping), per family-pattern-unntaket «ny test kun hvis helper får ny ren logikk».
- **Eksisterende view-tester:** flere rendrer finished-tilstand og vil få footer-strengen flippet. Oppdater snapshots med `npx vitest -u`; for eksplisitte `getByText('Lykke til.')`-asserts i finished-render → flipp forventning til «Vel spilt!» (testen kodet bug-en). INGEN nye view-tester.
- **Forbudt:** «mens jeg var her»-tester, duplisert mock-oppsett, mer enn nødvendig snapshot-churn.

## Humanizer

«Vel spilt!» er idiomatisk norsk sportsuttrykk — kjør humanizer-sjekk ved commit per CLAUDE.md (NO→EN, så `no-nb` gjelder ikke; humanizer på den norske strengen).

## Filer

- Ny: `app/[locale]/games/[id]/leaderboard/LeaderboardFooter.tsx` + `LeaderboardFooter.test.tsx`
- Endret: `messages/no.json`, `messages/en.json`, 9 Views, 9 HolesViews, `package.json`, `CHANGELOG.md`
