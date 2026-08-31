# Spec: Native — wolf/BBB valg-UI i appen (åpner format-gaten for to Must-formater)

## Problem

N4 (#1828) gatet `wolf` og `bingo_bango_bongo` i appen med vilje: ren slag-tasting uten
valg-UI gir meningsløse resultater (hvert wolf-hull står «pending»; BBB-poeng utledes
ikke fra slag i det hele tatt). MoSCoW-beslutningen 2026-08-30 (epic #1816) gjør begge
til **Must før butikk-byttet** — de er spilte formater. Denne slicen leverer valg-UI +
datafetch, bygger de to manglende leaderboard-rendererne og åpner gaten.

## Research Findings (verifisert 2026-08-31 mot main, adversarielt re-verifisert av fersk-kontekst-agent)

- **RLS-skriveveier FINNES — ingen DB-endring trengs.** Webbens `setWolfChoice`
  (`lib/wolf/setWolfChoice.ts:70-92`) og `setBingoBangoBongoHole`
  (`lib/bbb/setBingoBangoBongoHole.ts:57, 93-103`) bruker brukerens egen
  cookie-klient, ikke service-role — autorisasjonen ER RLS: `wolf_choices_insert/
  update` krever `wolf_user_id = auth.uid()` (eller admin) (0049:66-75);
  `bbb_holes_write` slipper enhver deltaker i spillet til (0053:42-57). Appens
  supabase-js-klient (`native/app/src/supabase.ts:23`, full v2-klient med
  AsyncStorage-session) kan gjøre identisk typet upsert direkte — begge tabellene
  finnes i `lib/database.types.ts`.
- **Realtime er IKKE tilgjengelig for valg-tabellene:** `wolf_hole_choices` og
  `bingo_bango_bongo_holes` står ikke i `supabase_realtime`-publikasjonen (verifisert
  mot live staging OG prod via `pg_publication_tables`; kun games, notifications,
  reactions, scores er med, og ingen migrasjon legger dem til). En
  `postgres_changes`-binding ville levert ingenting. Denne slicen bruker derfor
  **polling/refetch**, ikke realtime (se Key Decisions). Sidefunn: webbens
  `subscribeWolfChoices`/`subscribeBingoBangoBongo` har av samme grunn aldri levert
  events — bokført som eget issue.
- **Leaderboard-rendererne finnes IKKE.** `native/app/src/components/leaderboard/
  ResultView.tsx:288-293` har en navngitt `case 'wolf' | 'bingo_bango_bongo' |
  'patsome'` som returnerer `CalmNote` med `WEB_ONLY_RESULT_MESSAGE`. Slicen må bygge
  to nye renderere over `WolfResult` (`lib/scoring/modes/types.ts:1639-1650` —
  `holes: WolfHoleRow[]` med per-hull stake/outcome + `players: WolfPlayerLine[]`)
  og `BingoBangoBongoResult` (players med bingos/bangos/bongos/totalPoints/rank).
- **Delte context-byggere finnes og er import-rene:** `buildWolfContext` og
  `buildBingoBangoBongoContext` i `lib/scoring/context/` har kun `import type` fra
  `@/lib/scoring/modes/types` (erases; aliaset løses av appens tsconfig/metro/jest —
  samme som de sju søsknene appen alt bruker, `scoringContext.ts:26-32`). De tar
  `wolfChoices: WolfHoleChoice[]` / `bingoBangoBongoHoles: BingoBangoBongoHoleInput[]`
  — **camelCase-typer** (`types.ts:1568-1574`, `1843-1848`). Webbens mappere
  (`lib/wolf/getWolfChoices.ts`, `lib/bbb/getBingoBangoBongoHoles.ts`) er
  `server-only` og kan IKKE gjenbrukes — appens fetch-modul eier snake→camel-mappingen
  selv (select-listene i de to filene er fasit).
  Adapterens `needs-choices`-gren (`scoringContext.ts:322-324`) er hullet som tettes.
- **Wolf-rotasjonen har allerede to hjem:** `determineWolf()` i
  `lib/scoring/modes/wolf.ts` (motoren) og `determineWolfForHole()` i
  `app/[locale]/games/[id]/holes/[holeNumber]/wolfRotation.ts` (ren, null imports).
  Appen trenger samme svar for badge + «er jeg wolf?»; en TREDJE kopi er trap 4.
  Fila flyttes til `lib/wolf/wolfRotation.ts` (mekanisk, null adferdsendring);
  importørene som re-pekes er komplett: `useWolfHole.ts:11` og
  `wolfRotation.test.ts:3-5` (testen importerer også typen `WolfRotationPlayer`).
  `lib/` er i Metros watchFolders, så appen kan importere den flyttede fila.
- **Skrive-disiplinen i appen er etablert:** `native/app/src/data/playerActions.ts`
  viser mønsteret (direkte RLS-skriv, trap 2-vern via delt `expectAffected`). For
  upserts med `onConflict` er `.select()`-kjeding + rad-sjekk samme vern.
- **`buildWolfContext` leser `team_number` som rotasjonsslot** (buildWolfContext.ts:16,
  68) — appens rader bærer den allerede (`scoringContext.ts:166`). Ingen fetch-endring.

## Design

**Datafetch (nytt: `native/app/src/data/choices.ts`):**
- Hent alle rader for spillet fra `wolf_hole_choices` hhv. `bingo_bango_bongo_holes`
  via appens klient (RLS-read dekker deltakere), map snake→camel til
  `WolfHoleChoice[]` / `BingoBangoBongoHoleInput[]` (modulen eier mappingen), hold i
  minne-state keyed på `holeNumber`.
- **Oppdatering via polling/refetch, ikke realtime:** hent ved skjerm-mount/fokus,
  på et nøkternt intervall mens skjermen er aktiv (gjenbruk gjerne
  leaderboard-mønsteret med `POLL_MS`, `Leaderboard.tsx:36`), og umiddelbart etter
  egen skriving. Intervall-valg er discretion; aldri tettere enn leaderboardets.

**Adapter (`native/app/src/lib/scoringContext.ts`):**
- `buildScoringContext`/`computeGameLeaderboard` tar valgfrie extras
  (`wolfChoices`, `bingoBangoBongoHoles`), ruter `wolf` → `buildWolfContext` og
  `bingo_bango_bongo` → `buildBingoBangoBongoContext`. `needs-choices`-problemet
  fjernes fra unionen. NB: `screens/Leaderboard.tsx:42-48` har et
  `Record<ScoringContextProblem, string>` med `'needs-choices'`-nøkkel og er
  hoved-kallstedet som skal tre extras inn (`:133`); `teamPlay.test.ts:477-479` og
  `scoringContext.test.ts:227-235` asserter på `needs-choices` og skrives om.

**Leaderboard-renderere (nye, i `components/leaderboard/`):**
- `WolfView` over `WolfResult` (spillertotaler + per-hull-rader med stake/outcome)
  og `BingoBangoBongoView` over `BingoBangoBongoResult` (poengtabell) — omfang som
  `PotViews.tsx`. Rut de to kindsene i `ResultView.tsx` dit (patsome beholder
  `CalmNote`-grenen).

**Wolf-UI (Hole-skjermen):**
- Badge: «🐺 <navn> er Wolf» via flyttet `determineWolfForHole` + poeng fra motorens
  WolfResult (trailing-wolf etter rotasjonsslutt) — aldri egen poengformel.
- Er JEG wolf på hullet: valg-UI (partner/lone/blind + partnervalg) som upserter
  `{game_id, hole_number, wolf_user_id: meg, choice, partner_user_id, entered_by: meg}`
  med `onConflict: 'game_id,hole_number'` og webbens valideringsregler speilet
  (`setWolfChoice.ts:50-68`: partner kreves ved 'partner', ellers null; partner ≠ wolf;
  hull 1-18; INGEN finished-lås — web har bevisst ingen i v1, speil det).
  Web-referanse for UX: `WolfChoiceModal.tsx`.
- Andre spillere ser badge + gjeldende valg, ingen skrivekontroller (RLS avviser dem
  uansett — UI-en skal ikke tilby det).

**BBB-UI (Hole-skjermen):**
- Per-hull mottaker-velger for bingo/bango/bongo (hver: en deltaker eller ingen),
  åpen for ALLE deltakere (speiler `bbb_holes_write` + webbens
  `BingoBangoBongoEntry.tsx`), upsert mot `bingo_bango_bongo_holes` med webbens
  valideringer speilet — **inkludert finished-låsen**: skriv avvises når
  `games.status === 'finished'` (`setBingoBangoBongoHole.ts:68-89`) — RLS håndhever
  den IKKE, så appen MÅ speile sjekken selv (jest-låses).

**Gate-åpning (`native/app/src/lib/formatGate.ts`):**
- Fjern `wolf` og `bingo_bango_bongo` fra `GATED_MODES` (patsome står);
  `formatGate.test.ts:46-71` flippes. Merk at åpningen også gjør wolf-/BBB-scorekort
  levérbare fra appen (`Scorecard.tsx:131` keyer på `isScoringSupported`) — det er
  TILSIKTET: begge er per-spiller-rad-formater, samme lever-flyt som web.

**Web-berøring (sanksjonert, mekanisk):**
- Flytt `wolfRotation.ts` → `lib/wolf/wolfRotation.ts`, re-pek `useWolfHole.ts:11`
  og `wolfRotation.test.ts:3-5` (funksjon + type). Null adferdsendring; webbens
  vitest-suite er fasit.

## Edge Cases & Guardrails

- **Aldri en null-valg-wolf-tabell som ser autoritativ ut** (selve grunnen til at N4
  gatet formatet): har fetch av valgene IKKE lyktes denne økta (kaldstart offline,
  nettfeil), viser leaderboardet en ærlig note («fikk ikke hentet valgene») i stedet
  for en tabell der alle hull står uavgjort, og valg-UI-en sier fra at valg ikke
  kunne lastes. Lyktes fetchen er tom liste et gyldig mellomresultat (samme som web
  før første valg).
- **Offline:** valg-UI-en krever nett (disable + kort forklaring når skriv feiler) —
  valgene går IKKE i sync-køen i v1.
- **Trap 2:** upsert kjeder `.select()` og sjekker at raden kom tilbake — 0 rader =
  feilmelding, aldri stille suksess.
- **RLS-avslag** (ikke-wolf prøver å skrive via manipulert state): typet feilkode →
  norsk copy, ingen rå Postgres-feil.
- **Rotasjons-flyttingen:** ren flytting — ingen logikkendring; testen flytter med
  (import-sti), antall assertions uendret.
- **Reveal-modus:** wolf/BBB følger samme reveal-regler som øvrige formater via delte
  predikater (som N4) — ingen egen gren.
- **Web-fredning ellers:** utover wolfRotation-flyttingen (+ import-re-pek) skal
  web-diffen være null; `lib/`-diff kun den flyttede fila.
- **Ingen nye npm-deps, ingen DB-migrasjon, ingen endring i RLS, ingen ny
  realtime-kanal.**

## Key Decisions

- **Direkte RLS-skriv fra appen, ikke ny RPC** — webbens server actions er tynne
  valideringsskall rundt samme upsert; RLS er den reelle porten (verifisert over).
- **Polling/refetch i stedet for realtime** — valg-tabellene står ikke i
  `supabase_realtime`-publikasjonen (staging + prod), så realtime ville krevd en
  DB-migrasjon og gjort slicen aldri-auto. Polling matcher dessuten webbens FAKTISKE
  oppførsel i dag (webbens choice-abonnementer er døde av samme grunn — eget issue).
  Kan oppgraderes til realtime når/hvis publikasjons-migrasjonen tas som egen
  DB-kontrakt.
- **Valg holdes i minne, ikke i SQLite/sync-køen** — valg gjøres stående på hullet
  med nett i praksis; LWW-kø for et trelags valg er mer maskineri enn formatet
  fortjener i v1. Ærlig-note-guardrailen over dekker kaldstart-hullet.
- **`needs-choices` fjernes** — tom (men vellykket hentet) valg-liste er et gyldig
  mellomresultat.
- **Rotasjonshelperen flyttes til `lib/wolf/`** — aldri en tredje kopi (trap 4).
- **Finished-lås speiles KUN der web har den** (BBB ja, wolf nei) — paritet, ikke
  ny policy.

**Claude's Discretion:** modal vs. inline valg-UI, komponentstruktur, minne-state-form
(hook/context), poll-intervall (aldri tettere enn leaderboardets), tekstene (norsk,
humanizer-tone), testfil-inndeling.

## Success Criteria

- [ ] 1. **Jest-låst logikk:** adapteren ruter wolf/BBB med extras til delte byggere
  (Type A: mapping snake→camel, tom liste, withdrawn); valg-valideringen speiler
  webbens regler (partner-kravene, hull 1-18, BBB-finished-låsen); gate-suiten
  oppdatert (wolf/BBB åpne, patsome gatet); renderer-logikken dekket (maks 1 Type C
  per ny view). `npx jest` grønn i `native/app/`.
- [ ] 2. **Wolf ende-til-ende på staging:** service-role-rigget aktivt wolf-spill
  (3-4 spillere, e2e-spiller som wolf på et hull) — appen viser wolf-badge, valg-UI
  for wolfen, skrevet valg lander i `wolf_hole_choices` (service-role-les), og
  leaderboardet viser motorens poeng; valg skrevet utenfra (service-role) dukker opp
  i appen innen neste poll/refetch uten app-restart. Evidens: skjermbilder +
  service-role-les.
- [ ] 3. **BBB ende-til-ende på staging:** rigget BBB-spill — mottaker-velger synlig
  for vanlig deltaker, skriv lander i `bingo_bango_bongo_holes`, leaderboard viser
  poeng; finished-spill avviser skriv med norsk melding. Evidens: skjermbilder +
  service-role-les.
- [ ] 4. **Web uendret:** `npx vitest run` grønn (uendret antall) etter
  wolfRotation-flyttingen; web-diff = kun flytting + import-re-pek.
- [ ] 5. **Porter + runbook:** alle Gates grønne; `docs/native/app-spike.md` får
  wolf/BBB-seksjon (gate-åpningen, valg-semantikken, polling-beslutningen,
  seed-oppskrift). Eier-tapptest på fysisk iPhone hvis eier tilgjengelig, ellers
  `VERIFICATION GAP` + restanse.

## Gates

(Fersk worktree: `npm install` i BÅDE repo-rot og `native/app/` — eget lockfile.)

- [ ] `npx jest` i `native/app/` grønt
- [ ] `npx tsc --noEmit` i `native/app/` grønt
- [ ] `npx expo export --platform ios` grønt (`dist/` slettes etterpå)
- [ ] `npm run typecheck` (rot) grønt
- [ ] `npx vitest run` (rot) grønt — uendret antall (wolfRotation-flyttingen)
- [ ] `npx eslint native/app` grønt
- [ ] `npm run build` (rot) grønt før PR

## Files Likely Touched

- `native/app/src/data/choices.ts` (ny) — fetch + snake→camel-mapping + poll-støtte
- `native/app/src/lib/scoringContext.ts` (+ test) — extras-ruting, `needs-choices` ut
- `native/app/src/lib/formatGate.ts` (+ test) — gate-åpningen
- `native/app/src/lib/teamPlay.test.ts` — needs-choices-assertions skrives om
- `native/app/src/screens/Hole.tsx` — wolf-badge, valg-UI, BBB-velger
- `native/app/src/screens/Leaderboard.tsx` — extras-treing, problem-Record, poll
- `native/app/src/components/leaderboard/ResultView.tsx` + nye `WolfView`/`BingoBangoBongoView`
- `lib/wolf/wolfRotation.ts` (flyttet fra `app/[locale]/games/[id]/holes/[holeNumber]/wolfRotation.ts`)
- `app/[locale]/games/[id]/holes/[holeNumber]/useWolfHole.ts` + `wolfRotation.test.ts` — import-re-pek
- `native/app/src/**/*.test.ts(x)` — nye/oppdaterte suiter
- `docs/native/app-spike.md` — wolf/BBB-seksjon

## Out of Scope

- Realtime for valg-tabellene (krever publikasjons-migrasjon — egen DB-kontrakt;
  webbens døde choice-abonnementer er bokført som eget issue); offline-kø for valg;
  admin-override-UI i appen (web dekker); patsome; segment-/deriverte spill (N5);
  push (N7); `submit_team_scorecard`-RPC; endringer i RLS eller DB-skjema; wolf-/
  BBB-regelendringer i motoren.

---

## Drift-verifisering (2026-08-31, økt-start — appendiks, endrer ikke spec-en over)

Kontrakten over er kontrakt-smedens issue-kommentar fra 2026-08-30T23:32 (#1832),
re-verifisert mot `origin/main @ 1096925d` etter at N4-bokføringen (PR #1843) og
design-fundamentet (#1830, PR #1834) merget:

- `needs-choices`-grenen: `scoringContext.ts:324` (marginalt linjeskift fra 322-324) ✓
- `ResultView.tsx:290-293` (wolf/BBB/patsome → `CalmNote`) ✓
- `formatGate.ts:35-38` (`GATED_MODES` = wolf, bingo_bango_bongo, patsome) ✓
- `Leaderboard.tsx:36` (`POLL_MS = 1500`), `:42-48` (`PROBLEM_MESSAGES`) ✓
- `setWolfChoice.ts`-valideringene + BBB-finished-låsen (`setBingoBangoBongoHole.ts:68-89`) ✓
- `wolfRotation.ts` + importørene (`useWolfHole.ts:11`, `wolfRotation.test.ts:5`) ✓
- RLS: `wolf_choices_read/insert/update` (0049, perf-omskrevet 0092),
  `bbb_holes_read/write` (0053/0092) — deltaker-LES og skriveveiene bekreftet ✓
- `buildWolfContext`/`buildBingoBangoBongoContext` finnes i `lib/scoring/context/` ✓

### Tillegg etter #1830 (design-fundamentet — bindende for byggerne)

- **Aldri `fontWeight` oppå custom `fontFamily`** — expo-font registrerer én familie
  per snitt; bruk `FONTS`-tokenene fra `native/app/src/theme.ts`.
- Nye komponenter i EKSISTERENDE skjermer (Hole.tsx, Leaderboard.tsx/ResultView-treet)
  styler seg som søsknene: statiske `ui`-/`COLORS`-tokens fra `theme.ts` (verifisert:
  PotViews/Table/MatchView bruker `ui`, ingen leaderboard-komponent bruker
  `useTheme()` ennå). `useTheme()`-miks inne i en ukonvertert skjerm gir lys/mørk-kaos;
  hel-skjerm-konvertering er #1833.
- En eventuell ny FRITTSTÅENDE skjerm (egen navigasjonsrute) bruker `useTheme()`.
- ASSUMPTION: eierens føring «nye skjermer bruker useTheme()/FONTS» tolkes som over —
  nye ruter ja, nye komponenter i ukonverterte skjermer matcher søsken (#1833 tar dem).

### Praktiske føringer for denne kjøringen

- Bygge-worktree: `app-performance-loading-8c9a87` (node_modules + Pods + varm
  xcodebuild-cache), branch `claude/1832-wolf-bbb-valg-ui` fra `origin/main`. Node 22.
- Simulator: KUN `498CF5EF` (iPhone 17 Pro Max, innlogget e2e-spiller). `820CA940`
  tilhører en annen økt.
- OTP-mint: `type:"magiclink"`, koden ligger i `email_otp`-SVARfeltet (runbook).
- Wolf-seed: eget testspill 3-5 spillere (rotasjonsslot = `team_number`), full
  user-id-er fra DB; seed-oppskrift i runbook «Rigge testspill på staging».
- Eier er tilgjengelig for tapp-test på fysisk iPhone til slutt (kriterium 5).
