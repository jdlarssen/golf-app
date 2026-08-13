# Forge-evaluering — #1372 Delt førsteplass (+ #1573, #1574)

Evaluert 2026-08-13 av fersk-kontekst-evaluator. Branch `claude/forge-auto-1372-f9d4ef`,
4 commits `d7d699aa..32481827`. Alle kommandoer kjørt av evaluatoren selv (Node 22).

## Per-kriterium

### K1 — Podium viser delt førsteplass som delt seier — PASS
- Én ny test i `app/[locale]/games/[id]/leaderboard/SoloStablefordPodium.test.tsx:197`
  («delt førsteplass: begge medvinnere får champagne, medaljong «1» og «Delt 1. plass»-merke (#1372)»).
  Asserter `slot1.dataset.rank === '1'` OG `slot2.dataset.rank === '1'`, `border-accent`
  på slot 2, medaljong-title «1. plass» på begge, «Delt 1. plass» i begge trinns tekst,
  og at slot 3 beholder bronse uten delt-merke.
- Legacy-tester urørte: numstat 34 added / 1 deleted; den ene slettede linja er
  fabrikk-linja `players.map((p) => ({ ...p, tiedWith: [] }))` erstattet av valgfri
  `tiedWith`-parameter med default `[]` — den sanksjonerte minimale fabrikk-utvidelsen.
  Ingen av de 13 legacy-testene er endret.
- Komponent: akse-splitt korrekt — `heightClass = SLOT_HEIGHTS[slot]`,
  `tierClass = TIER_ACCENT[PLACE_TIER[place]]`, `data-testid` fortsatt slot-basert,
  `data-rank={player.rank}` nytt (SoloStablefordPodium.tsx:337–338).

### K2 — State4View delt-hero + oppgradert rad — PASS
- `State4View.test.tsx` er NY (74 linjer, `git diff --diff-filter=A` bekrefter) med
  nøyaktig ÉN `it(` — delt-leder-casen. Asserter: ingen «Leder ·»-badge,
  «Delt 1. plass» ×2 (hero + rad), gull-medaljong («1. plass»-title) på den
  like-rangerte raden, «· delt» borte, bronse på rank-3-raden. Grønn.
- Komponent: hero-badgen bytter til `t('tiedRank')` når `line.tiedWith.length > 0`
  (State4View.tsx:386–388); rad-medaljong-betingelsen utvidet til rank 1
  (State4View.tsx:492); delt-merket på rank-1-rad løftes til accent semibold
  (State4View.tsx:520–527).

### K3 — Ikke-delte resultater uendret — PASS
- `npx vitest run Podium State4View messages`: **16 filer, 68 tester, alle grønne**,
  ingen `-u`. (13 podium-testfiler + State4View + catalogParity + apostropheParity.)
- Testid-kontrakten holdt: alle 13 podium-komponenter har
  `data-testid={\`podium-rank-\${slot}\`}` (grep-verifisert per fil).
  `grep -rn podium-rank e2e/` → 0 treff, som kontrakten hevdet.

### K4 — i18n begge locales — PASS (sanksjonert avvik verifisert)
- Gjenbruker eksisterende `leaderboard.common.tiedRank`: `messages/no.json:2444`
  («Delt {rank}. plass») og `messages/en.json:2444` (selectordinal «Tied for …»).
- Brukt av begge flater: SoloStablefordPodium via `t('common.tiedRank')` under
  `useTranslations('leaderboard')` (:82), State4View via `t('tiedRank')` der `t` er
  typet `'leaderboard.common'` (:387, :526). Paritetstestene grønne (del av K3-kjøringen).

### K5 — Staging-verifisering — PASS
- Driver `verify-1372.mjs` lest: tre flater, med prod-vakt-orakel (feiler på enhver
  supabase-request utenfor staging-refen `snwmueecmfqqdurxedxv`) og console-orakel.
- Skjermbilder lest visuelt av evaluatoren:
  - `podium-stableford-delt.png`: to champagne-trinn, begge med medaljong «1» og
    «DELT 1. PLASS», 54 poeng begge; tredjemann bronse «3». ✔
  - `state4-bestball-delt.png`: hero-kort «DELT 1. PLASS» med stor «1» (Lag 1); Lag 2-raden
    bærer gull-medaljong «1» med samme total 32/−3. ✔
  - `podium-aceydeucey-delt.png`: TRE-veis delt førsteplass — alle tre trinn champagne
    med «1» + «DELT 1. PLASS», rest-rad viser «4». Dekker (1,1,1)-edge-casen. ✔

### K6 — Notatfiler + Refs — PASS
- `git log d7d699aa..HEAD`: 4 commits, alle `fix(...)`, alle med `Refs #N` i body
  (e84b4059→#1372, 49a0aa7b→#1574, 390f0416→#1573, 32481827→#1574).
- 4 notatfiler under `.changes/` med gyldig frontmatter (`type: fix` + `issue`), én per
  commit: `1372-delt-forsteplass.md`, `1573-delt-plassering-alle-podier.md`,
  `1574-team-stableford-rekkefolge.md`, `1574-patsome-rekkefolge.md`. Ingen
  `package.json`-bump, ingen CHANGELOG-redigering.

### #1573 — 12 søster-podier — PASS
- Alle 12 importerer `podiumPresentation` og bruker `podiumPlace(...)` +
  `TIER_ACCENT[PLACE_TIER[place]]` + `heightClass = SLOT_HEIGHTS[slot]` (grep: nøyaktig
  1 forekomst per fil, 13/13 inkl. anchor); testid forblir `podium-rank-{slot}`.
- Sanksjonert avvik verifisert: nøyaktig de 5 lag-podiene (Nassau, TeamStableford,
  Shamble, TexasScramble, Patsome) beholder lokal 200/170/150-map — nå omdøpt
  `SLOT_HEIGHTS: Record<PodiumSlot, string>` keyed på SLOT, ikke rank, med
  forklarende docstring. Ingen visuell flytting.
- Spot-lest 3 fulle diffs: TeamStablefordPodium (inkl. fjernet villedende
  «allerede sortert»-kommentar), TexasScramblePodium (beholder call-site-sort — dens
  compute er ikke endret), AceyDeuceyPodium. Alle tro mot anchor-mønsteret.
- Én ny delt-case-test per podium: 8 nye testfiler med nøyaktig 1 test hver
  (AceyDeucey, BingoBangoBongo, Nines, Patsome, Shamble, Skins, TexasScramble — og
  State4View under K2); 5 eksisterende testfiler (Nassau, RoundRobin, SoloStrokeplay,
  Wolf, TeamStableford) fikk +1 test — additions-only bortsett fra den sanksjonerte
  1-linjes fabrikk-utvidelsen (verifisert: eneste slettede linje per fil er
  `tiedWith: []`-literalen).

### #1574 — Rangert retur-rekkefølge — PASS
- `computeStablefordTeam` (`lib/scoring/modes/stableford.ts:370–380`) og
  `computePatsome` (`lib/scoring/modes/patsome.ts:184–194`) returnerer nå
  `ranked.map(...)` → rank-rekkefølge, speiler solo-stien; `?? 0`/`?? []`-fallbackene
  erstattet av oppslag som ikke kan bomme (ranked er avledet av baseLines).
- Type A-tester: én per compute med teamNumber-rekkefølge ≠ rank-rekkefølge-fikstur,
  asserter `teams.map(t => t.teamNumber) === [2, 1]` + rank 1/2.
  `npx vitest run lib/scoring/modes/stableford.test.ts lib/scoring/modes/patsome.test.ts`
  dekket av full kjøring: **`npx vitest run lib/scoring` = 46 filer, 1132/1132 grønne**
  (forventet 1132 ✔).
- Konsument-revisjon (rekkefølge-kontrakten): `lib/mail/gameFinishedRecipients.ts`
  itererer (ordre-uavhengig), `lib/scoring/resultSummary.ts` og
  `lib/games/buildShareCardData.ts` mapper `rank` eksplisitt per rad,
  `lib/games/roundReportFacts.ts` teller hull på tvers (ordre-uavhengig).
  `TeamStablefordView`/`PatsomeView` key-er rader på `teamNumber` og bruker indeks kun
  til stagger — de rendres nå korrekt sortert (det VAR buggen). Kommentaren i
  `TeamStablefordPodium.tsx` som feilaktig hevdet sortert input er fjernet (issue-steg 3 ✔).

### Gates — PASS
- `npm run typecheck` (tsc --noEmit): exit 0.
- `npm run lint`: **0 errors**, 55 warnings — alle pre-eksisterende complexity/max-depth
  i urelaterte filer (`calculateSideTournament`, `fitsPlayerCount`). Exit 0.
- Vitest: 68/68 (podier + State4View + messages), 1132/1132 (lib/scoring).

## Adversarielle funn

1. **(Mindre, kosmetisk — ingen handling påkrevd)** State4Views rad-delt-merke ligger i
   en `truncate`-paragraf (`State4View.tsx:510`), så «· Delt 1. plass» kan klippes bak
   ellipse ved lange spillernavn — synlig i staging-skjermbildet (Lag 2-raden viser
   «Fredrik Holm · Håkon …»). Ikke en regresjon: det gamle muted «· delt» satt i samme
   truncate-paragraf, og gull-medaljongen (utenfor paragrafen, alltid synlig) er
   primærsignalet kontrakten krever.
2. **(Info)** `podiumPlace` clamper `rank <= 1 → 1`; en hypotetisk rank-0-linje ville
   fått champagne. De to `?? 0`-fallbackene som kunne produsere rank 0 er nettopp
   fjernet i #1574-fiksene, og ingen podium-konsument kan gjøre noe fornuftigere med
   en oppstrøms scoring-bug. Akseptabel defensiv clamp, dokumentert i helperen.
3. **Jaktet og IKKE funnet:** ingen testid omdøpt (13/13 slot-basert, 0 e2e-treff);
   ingen akse-swap (`SLOT_HEIGHTS[place]`/`PLACE_TIER[slot]`/`TIER_ACCENT[slot]` — 0
   treff); ingen legacy-test endret utover fabrikk-utvidelsen; `tiedWith` leses kun på
   typer som har feltet (tsc exit 0 beviser det — alle line-typer i de 13 podiene +
   `TeamLine` har `tiedWith`); State4View-radens rank-1-medaljong-gren er i praksis kun
   nåbar for delte rader (radene er `teams.slice(1)` av rank-sortert liste — en
   ikke-delt rank-1-rad forutsetter datadrift, og gull-medaljong ville uansett vært
   riktigste rendering); medaljong-størrelse (48/36) og poeng-tekst-styling
   (32px accent) key-er begge på `place` (rank) — konsistent med kontraktens
   presentasjon-følger-rank-regel, så to medvinnere får identisk presentasjon.

## Sanksjonerte avvik — kravene deres holdt

1. `leaderboard.common.tiedRank` finnes i begge locales (no.json:2444, en.json:2444) og
   brukes av begge #1372-flatene. ✔
2. De 5 høyere lag-podiene beholder lokale 200/170/150-maps — verifisert keyed på slot. ✔
3. #1573/#1574 er eier-beordret scope — evaluert mot issue-tekstene, ikke som gold-plating. ✔

## VERDICT: ACCEPT

Alle 6 kontrakt-kriterier + begge scope-utvidelsene bestått med selvstendig kjørt
evidens. Ingen regresjoner funnet i den adversarielle gjennomgangen; de to funnene er
kosmetisk/informasjonelt og krever ingen endring før merge. Produktvalget
(Alternativ A/B) står åpent for eieren i PR-en som kontrakten foreskriver.
