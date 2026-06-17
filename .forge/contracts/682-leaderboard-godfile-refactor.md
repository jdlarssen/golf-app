# Spec: Bryt opp leaderboard-god-fila (#682)

**Issue:** [#682](https://github.com/jdlarssen/golf-app/issues/682)
**Type:** Ren refaktor — oppførsel bevart. Ingen `package.json`-bump, ingen CHANGELOG (per CLAUDE.md skip-regel for `refactor(...)`).
**Branch:** `claude/hungry-williams-64f84d` (egen branch → PR, per issue «ikke bunt med en feature-PR»).

## Problem

`app/[locale]/games/[id]/leaderboard/page.tsx` er 3902 linjer med 29 `return (`-grener i én modul: server-datahenting, side-turnering-wrapping, per-format `ScoringContext`-bygging og 15 format-spesifikke render-funksjoner + 2 state-render-funksjoner, alt inline. Det er den høyest-trafikkerte fila i nord-stjerne-flyten («spille en runde») og samtidig den risikableste å endre: en format-justering tvinger leseren gjennom tusenvis av linjer, og per-gren-duplisering (gjentatte `game_side_winners`-fetch, gjentatte tournament-label-fetch i tre matchplay-grener) hever sjansen for en én-gren-regresjon som bare manuell QA fanger.

Målet er **å gjøre fila vedlikeholdbar uten å endre noe brukeren ser** — identisk rendret output for alle 16+ format/state-grener.

## Research Findings

Verifisert mot faktisk kode i worktreen (ikke antakelser):

- **Realtime-«gapet» i issue-en er allerede lukket (#679).** Issue-en hevder «realtime had to be hand-added per branch and was only done in 2 of ~16» og foreslår å «move `PreRoundLeaderboardRealtime` into the shared render path». Men `LeaderboardRealtime` (egen komponent, ikke `PreRoundLeaderboardRealtime`) er allerede montert **én gang** i `LeaderboardShell` ([LeaderboardChrome.tsx:38,47](app/[locale]/games/[id]/leaderboard/LeaderboardChrome.tsx)), i både chromed og `chromeless` gren. Hver format-`View`/`Podium`-komponent wrapper innholdet sitt i `LeaderboardShell` (~40 filer bekreftet via grep), så **alle format-leaderboardene arver allerede live-refresh** på `scores`-INSERT. `PreRoundLeaderboardRealtime` håndterer i tillegg de pre-runde best-ball-statene (State3/3.5) + `RevealBruttoView` (reveal-flippet på `games`-UPDATE). **Konklusjon: ingen realtime-endring i denne refaktoren** — det ville duplisert abonnement og endret oppførsel. Issue-ens premiss her er utdatert (audit 2026-06-17 misset #679).
- **Next.js 16 App Router:** server-komponenter kan fritt splittes på tvers av modulfiler uten direktiv. `'use client'`-komponenter (de eksisterende `View`/`Podium`/realtime) er allerede separate filer og røres ikke. Ekstraksjon av `async function renderX(opts)` til søsken-moduler følger Next.js' server-komponent-modell uten ny boundary.
- **Eksisterende konvensjon:** hver format har allerede en `View` + `Podium` som separat fil i `leaderboard/`. Å legge `formats/X.tsx`-render-moduler ved siden av matcher mønsteret #598 (`LeaderboardChrome`) og #576 etablerte.

## Prior Decisions

- **#598 (LeaderboardChrome):** delt `LeaderboardShell` + `LeaderboardHeader` trukket ut fra ~40 lokale `Shell`/`Header`-kopier. Nye render-moduler skal IKKE re-introdusere lokale shell-kopier — de renderer `View`-komponenter som allerede eier shellen.
- **#679 (LeaderboardRealtime):** realtime sentralisert i shellen. Ikke rør.
- **#576 (sideturnering på alle poengformater):** `renderSideTournamentTabs(teamGrouping)` er den generiske side-turnering-wrapperen brukt av alle 11 score-/podium-formater; matchplay-familien er bevisst ekskludert (`renderMatchplaySideSection` har egen, smalere gren). Bevar dette skillet eksakt.
- **Matchplay-familien har ingen podium / ingen reveal-props** (memory) — ikke «fiks» manglende podium i matchplay-grenene; det er by design.

## Design

### Målarkitektur

Trekk de selvstendige render-funksjonene ut av `page.tsx` til moduler, og gjør `LeaderboardBody` til en tynn dispatcher. Hver render-funksjon tar allerede en typet `opts`-struct og er i praksis en server-komponent i forkledning, så ekstraksjonen er en **near-verbatim flytt** — funksjonskroppen (JSX + logikk) kopieres uendret; bare `import`-ene legges til i den nye fila.

```
app/[locale]/games/[id]/leaderboard/
  page.tsx                  # LeaderboardPage (entry) + LeaderboardBody (tynn dispatcher) + delte typer/fetch
  formats/
    stableford.tsx          # renderStableford
    matchplay.tsx           # renderMatchplay
    fourballMatchplay.tsx   # renderFourballMatchplay
    foursomesMatchplay.tsx  # renderFoursomesMatchplay
    soloStrokeplay.tsx      # renderSoloStrokeplay
    texasScramble.tsx       # renderTexasScramble
    wolf.tsx                # renderWolf
    nassau.tsx              # renderNassau
    skins.tsx               # renderSkins
    bingoBangoBongo.tsx     # renderBingoBangoBongo
    nines.tsx               # renderNines
    roundRobin.tsx          # renderRoundRobin
    aceyDeucey.tsx          # renderAceyDeucey
    shamble.tsx             # renderShamble
    patsome.tsx             # renderPatsome
    state3.tsx              # renderState3 + renderState35 (best-ball pre-runde-statene)
  sideTournament.tsx        # computeSideTournament + renderSideTournamentTabs + renderMatchplaySideSection + delte side-typer
  leaderboardTypes.ts       # delte opts-/data-typer som flere moduler trenger (hvis nødvendig)
```

(Filnavn er Claude's discretion — gruppering kan justeres hvis en naturligere seam dukker opp under bygging. State3/State35 kan dele én fil siden begge er best-ball-pre-runde.)

### `LeaderboardBody` som dispatcher

Etter ekstraksjon skal `LeaderboardBody` gjøre nøyaktig det den gjør i dag, bare tynnere:
1. Kjør de delte fetch-ene én gang (`course_holes`, `scores`, `courses`, og — der relevant — `game_side_winners`).
2. Bygg det delte konteksten (`gwp`, lokalisert game-navn, holes-rader, score-rader).
3. Dispatch til riktig `formats/X`-modul basert på `GameMode` (samme gren-logikk som i dag, samme rekkefølge).
4. Best-ball faller gjennom til state-maskinen (State3/3.5/reveal/full) uendret.

Dispatch-grenene må bevare **eksakt samme rekkefølge og betingelser** som dagens linjer 380–743 — ingen omskriving av hvilken modus som matcher hva.

### Fetch-dedup (oppførsel-bevarende)

1. **`game_side_winners`** hentes i dag to steder: i `LeaderboardBody` (best-ball-grenen, ~785) og inne i `computeSideTournament` (~1433). Dedup til **én delt helper** (f.eks. `fetchSideWinners(supabase, gameId)`) brukt begge steder. Default: behold lazy-henting (format-pathen henter kun når side-turnering er aktiv) — ikke hoist til ubetinget fetch for alle formater, det ville lagt en unødvendig query på formater uten side-turnering. Code-dedup, ikke fetch-timing-endring. (Claude's discretion: hvis det viser seg trivielt trygt å hoiste og sende ned, gjør det — men kun hvis output er identisk.)
2. **Matchplay tournament-labels** (`tournaments.team_1_name/team_2_name`) hentes i tre grener (`renderMatchplay`, `renderFourballMatchplay`, `renderFoursomesMatchplay`). Trekk ut til én delt helper hvis fetch-koden er identisk. (Claude's discretion.)

### Hva som IKKE endres

- Ingen realtime-endring (#679 dekker det allerede).
- Ingen endring i `View`/`Podium`-komponentene eller deres tester.
- Ingen endring i `holes/page.tsx` (eget follow-up-issue — se Out of Scope).
- Ingen endring i rendret JSX, copy, klasser, eller ScoringContext-bygging per format.
- Ingen ny `package.json`/CHANGELOG (ren refaktor).

## Edge Cases & Guardrails

- **`'use client'`/`'use server'`-grenser:** render-funksjonene er `async` server-funksjoner som bruker `getTranslations` (server). `page.tsx` importerer også `useTranslations` (client-hook) — verifiser om den faktisk brukes; hver ekstrahert modul skal kun importere det den bruker. Ikke dra en client-hook inn i en server-modul.
- **Ekshaustiv `GameMode`-switch:** TS-bygget feiler hvis en gren droppes. Det er det sterkeste vernet — ikke filtrer bort tsc-feil som «pre-eksisterende» (memory: kjør `npm run build`).
- **Delte typer:** noen `opts`-typer er definert inline i `page.tsx`. Eksporter dem fra en delt `leaderboardTypes.ts` eller fra modulen som eier dem; unngå sirkulær import (moduler importerer typer fra `page.tsx` ELLER en nøytral types-fil, ikke kryssvis).
- **Near-verbatim-krav:** funksjonskroppene flyttes uendret. Hvis en kropp må endres for å kompilere (f.eks. en variabel som var i closure-scope i `LeaderboardBody`), send den inn via `opts` i stedet for å reprodusere logikken. Enhver semantisk endring av en render-kropp er en bug i denne refaktoren.
- **Side-turnering team-grouping:** `renderSideTournamentTabs` tar `teamGrouping: 'solo' | 'byTeamNumber'` — bevar nøyaktig hvilken verdi hver format-gren sender.
- **Matchplay-ekskludering:** matchplay-grenene bruker `renderMatchplaySideSection`, ikke `renderSideTournamentTabs`. Ikke bland.

## Key Decisions

- **Ren strukturell flytt + trygg fetch-dedup, ingen realtime-endring** — fordi #679 allerede lukket realtime-seamen; å «fikse» den igjen ville duplisert abonnement og endret oppførsel. Bruker valgte «smartest på lang sikt» (2026-06-17); smartest = maksimal vedlikeholdbarhet med null QA-risiko på en prod-testet kjernefil.
- **Scope = `page.tsx` only.** `holes/page.tsx` (1591 linjer, `course_holes` hentet 10×) fortjener samme behandling, men bunting dobler diff-en og review-risikoen. → eget follow-up-issue.
- **PR, ikke direkte push** — per post-v1.0-disiplin + issue-instruks.

**Claude's Discretion:**
- Endelig modul-gruppering og filnavn (kan slå sammen små grener hvis naturlig).
- Om `game_side_winners`-dedup hoistes eller forblir lazy-via-helper (default: lazy helper).
- Om matchplay-label-fetch trekkes ut (kun hvis identisk).
- Om delte typer havner i `leaderboardTypes.ts` eller eksporteres fra eier-modulen.
- Rekkefølge/batching av ekstraksjonen (anbefalt: sideTournament-modul først, så formater i grupper, så slank dispatcher til slutt — commit per gruppe).

## Success Criteria

- [ ] **Alle 15 format-render-funksjoner + 2 state-render-funksjoner er flyttet ut av `page.tsx` til moduler under `leaderboard/formats/` (og `sideTournament.tsx`).** Verifiser: `grep -c "async function render" app/[locale]/games/[id]/leaderboard/page.tsx` ≈ 0 (kun dispatcher igjen), og `ls leaderboard/formats/` viser modulene.
- [ ] **`page.tsx` er vesentlig kortere** (mål: < ~900 linjer; dispatcher + delt fetch + entry). Verifiser: `wc -l page.tsx`.
- [ ] **De dupliserte `game_side_winners`-fetch-ene er konsolidert til én delt helper.** Verifiser: `grep -rn "from('game_side_winners')" leaderboard/` viser ett kall-site (helper-en), brukt fra begge paths.
- [ ] **Render-kroppene er flyttet near-verbatim (ingen semantisk omskriving).** Verifiser: `git diff` viser ekstraksjon (flytt), ikke rewrite — for et utvalg på 3 formater, sammenlign modulkroppen mot original-funksjonen og bekreft JSX/logikk er identisk.
- [ ] **`npm run build` passerer** (full Next.js prod-build, inkl. ekshaustiv tsc over hele appen). Verifiser: exit 0.
- [ ] **Alle eksisterende leaderboard-tester er grønne** (View/Podium/Realtime/SideTournament — ~28 testfiler, uendret). Verifiser: `npx vitest run "app/[locale]/games/[id]/leaderboard"` → 0 failed.
- [ ] **Ingen realtime-endring og ingen `View`/`Podium`-endring.** Verifiser: `git diff --stat` rører ikke `*View.tsx`/`*Podium.tsx`/`*Realtime.tsx` (utover evt. ren import-flytt hvis en type måtte re-eksporteres).

## Gates

Kjør etter hver chunk, scoped til det som endret seg:
- [ ] `npx tsc --noEmit` passerer (rask iterasjon under bygging).
- [ ] `npm run build` passerer (full ekshaustiv build — minst før self-eval og før PR).
- [ ] `npx vitest run "app/[locale]/games/[id]/leaderboard"` passerer (co-located leaderboard-tester).
- [ ] `npm run lint` introduserer ingen NYE feil i de berørte filene (baseline = 22 pre-eksisterende, sporet i #692).

## Files Likely Touched

- `app/[locale]/games/[id]/leaderboard/page.tsx` — slankes til entry + tynn `LeaderboardBody`-dispatcher + delt fetch/typer.
- `app/[locale]/games/[id]/leaderboard/formats/*.tsx` — NYE: én modul per format/state-render.
- `app/[locale]/games/[id]/leaderboard/sideTournament.tsx` — NY: `computeSideTournament` + `renderSideTournamentTabs` + `renderMatchplaySideSection` + delte side-typer + `fetchSideWinners`-helper.
- `app/[locale]/games/[id]/leaderboard/leaderboardTypes.ts` — NY (hvis delte typer trengs).

## Out of Scope

- **Realtime-endring** — allerede løst av #679. (Hvis evalueringen mener realtime-dekning bør utvides ytterligere, blir det eget issue.)
- **`holes/page.tsx`-refaktor** (1591 linjer, `course_holes`-fetch ×10) — fortjener samme behandling, men eget issue/PR for å holde diff-en reviewbar. → opprett follow-up-issue.
- **Endring av `View`/`Podium`-komponenter, ScoringContext-logikk, eller noe brukeren ser.**
- **Ytelses-optimalisering utover den trygge fetch-dedup-en** (RLS/indekser dekkes av andre issues).
- **Nye page-nivå-tester** — test-disiplinen fraråder Type C-duplisering; leaf-komponentene er allerede dekket.
