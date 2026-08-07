# Spec: Cup-avslutning i ett trykk + sidepoeng-gate + «Scorekort levert» (#1501 + #1502)

**Issues:** #1501 (ett trykk + gate) · #1502 (levert-status) · **Branch:** claude/cup-one-tap-finish-1501

## Problem

Prod-testen av #1468-flyten (2026-08-07) beviste hullet: «Avslutt cupen» flipper kun
`tournaments.status/finished_at/winner_team` (`lib/cup/actions.ts:365-373`) — kampene røres ikke.
Resultat: avsluttet cup med 0 av 4 kamper spilt og vinner kåret på sidepoengene alene (rullet
tilbake). Arrangøren må i dag besøke hvert host-spills admin-side; kompis-cupen har 6 kamper.
I tillegg ser en ferdig-levert kamp identisk ut som en pågående («Pågår») — arrangøren kan ikke
se at det er klart for avslutning.

## Eierbeslutninger (2026-08-07, issue-tekst + AskUserQuestion i økten — bindende)

1. **Ett trykk:** «Avslutt cupen» avslutter først alle uavsluttede host-kamper via den EKTE
   endGame-pipelinen per spill (resultatsammendrag, differensialer, bragder, rundereferat;
   avledede spill følger via `finishDerivedGames`) — deretter avsluttes cupen som i dag.
2. **Sidepoeng-gate:** cupen kan ikke avsluttes før alle konfigurerte sidepoeng har en
   registrering. Definisjon per kind: ctp/ld → `winner_user_id` satt; gir → BEGGE
   `gir_team1_count`/`gir_team2_count` satt (0 er gyldig — «registrert noe», ikke «brukt»).
3. **Uleverte scorekort:** stopp med oversikt over hvilke kamper som mangler leveringer + et
   tydelig «Avslutt likevel»-valg (#375-semantikken løftet til cup-nivå; likevel-varianten kjører
   `allowMissing` per kamp). Peer-approval-gaten relaxes ALDRI (#360) — cup-matcher genereres
   uten peer approval i dag, men sjekken består i pipelinen.
4. **Varsler:** kamper som avsluttes via cup-avslutningen sender IKKE per-kamp «Resultatet er
   klart»-mail eller in-app `game_finished`-varsel — kun `cupFinishedNotification` (sendes
   allerede av `finishTournament`, `lib/cup/actions.ts:409`) er reveal-signalet. Vanlig
   enkeltspill-avslutning er uendret.
5. **«Scorekort levert»-status på BEGGE flater** (#1502): styringssiden OG den offentlige
   cup-siden viser ny mellomtilstand på matchkortene når alle ikke-trukne spillere har levert og
   kampen fortsatt er aktiv. Ikke resultatbærende.

## Research Findings (repo-interne)

- `endGame(gameId, allowMissing)` (`app/[locale]/admin/games/[id]/actions.ts:272`) er en
  redirect-tung server action: per-game `requireAdminOrCreator`, skriv med request-klienten
  under creator-UPDATE-RLS (0071), redirect på hver feil. Kjernen MÅ trekkes ut til en callable
  helper (f.eks. `lib/games/endGameCore.ts`) som returnerer resultat i stedet for å redirecte,
  tar aktør-kontekst eksplisitt, og styrer varsel-sending via option
  (`suppressPerGameNotifications` e.l.). Eksisterende `endGame`-action blir tynn wrapper med
  byte-identisk oppførsel (redirects + mails som før).
- **Authz-kritisk:** klubb-cup kan styres av en annen klubb-admin enn `games.created_by`.
  Cup-løpet gates av `requireAdminOrClubAdminOfCup` (allerede i `finishTournament`); core-en må
  derfor skrive via admin-client med eksplisitt caller-authz — aldri stole på creator-RLS-en
  for cup-stien. (AGENTS.md-felle 3: authz-laget må være bevisst, ikke arvet.)
- `finishTournament` (`lib/cup/actions.ts:346-379`): snapshot → winner → `expectAffected`-update
  → `sendCupFinishedNotification` (best-effort, `Promise.allSettled`-mønster). Orkestreringen
  (gate-sjekker + endGameCore-løp) legges FØR dagens flip; feilkoder → redirect med `?error=`
  (CupManagement har ferdig errorCode→Banner-mapping).
- Kun host-kamper (`source_game_id IS NULL`) endes eksplisitt — derived følger via
  `finishDerivedGames` i pipelinen. Allerede-finished hopper over (idempotent).
- `CupManagement` har `canFinish`/`startHint`-mønsteret for disabled-knapp + hint-banner.
- Matchkort-status i dag: ternary finished→«Spilt» / active→«Pågår» / ellers «Ikke startet» i
  BÅDE `CupManagement.tsx` (~426) og `cup/[id]/page.tsx` (~118) — #1468-evaluator flagget alt
  duplikatet (funn 4); dette arbeidet gir regelen ett hjem.
- `getCupSnapshot` henter allerede `game_players` per match (roster-bygging) — utvid
  `CupMatchSummary` med levert-tilstand (f.eks. `allScorecardsSubmitted: boolean`, withdrawn
  ekskludert) i samme fetch; `computeCupLeaderboard` sender den gjennom.
- `tournament_side_awards`-kolonner verifisert mot live DB: `winner_user_id`,
  `gir_team1_count`, `gir_team2_count`, `gir_max_per_team`, `kind`, `slot`.

## Design

### Gate + orkestrering i `finishTournament`

1. **Sidepoeng-gate:** ny ren helper (f.eks. `lib/cup/sideAwardsRegistered.ts`, Type A-testet)
   som klassifiserer en award-rad som registrert/uregistrert per kind. Brukes av BÅDE
   server-action (avvis med `?error=side_awards_missing`) og `CupManagement` (disabled
   «Avslutt cupen» + hint-linje som navngir hva som mangler). Én regel, ett hjem.
2. **Leverings-sjekk:** alle host-kamper enten finished eller alle ikke-trukne levert. Mangler
   noen → `?error=matches_not_submitted` + banner som lister kampene (matchLabel) + sekundær
   «Avslutt likevel»-form (egen action-parameter `allowMissing=true`; aldri `window.confirm`).
3. **Løpet:** for hver uavsluttet host-kamp: `endGameCore(gameId, { allowMissing,
   suppressPerGameNotifications: true, actor })`. Feil samles; feiler NOEN kamp → cupen
   avsluttes IKKE, redirect med `?error=match_finish_failed` + hvilke kamper (ingen stille
   halvferdig tilstand; allerede-avsluttede kamper står — re-trykk er trygt/idempotent).
4. Alle kamper finished → dagens flip + `sendCupFinishedNotification` som før.

### «Scorekort levert» (#1502)

- Ny delt status-label-logikk (én funksjon/ett hjem): finished→«Spilt», active+alle levert→
  «Scorekort levert» (copy via humanizer), active→«Pågår», ellers «Ikke startert»→(dagens
  «Ikke startet»-nøkkel). Brukes av styringssiden og cup-siden. Resultatsiden beholder
  poeng-labelen for ferdige kamper (uendret).

### i18n + copy

Nye nøkler i BEGGE kataloger (hint, banner-tekster, likevel-knapp, levert-label). Humanizer på
norsk copy. Feilkoder følger eksisterende errorCode-mønster i CupManagement.

## Edge Cases & Guardrails

- Withdrawn spillere teller aldri i levert-sjekken (samme regel som `endGame`).
- Cup uten sidepoeng: gaten er trivielt grønn.
- Kamp allerede finished før trykket: hoppes over — poeng/resultat re-beregnes ikke.
- Delvis feil i løpet: cupen forblir aktiv, avsluttede kamper står, banner sier hvilke som
  feilet; nytt trykk fortsetter der det slapp.
- Vanlige enkeltspill (ikke-cup) og manuell avslutning av én cup-kamp fra game-admin: helt
  uendret oppførsel (mails + redirects som i dag).
- `revalidateTag('game-<id>', 'max')` per avsluttet kamp (cache-konsumentene!) — core-en må
  revalidere det `endGame` revaliderer i dag.
- Ikke rør: `computeCupLeaderboard`-poengregning, RLS, sidepoeng-registrerings-UI (#1489),
  reopen-flyter, #1500 (CSV-gaten).

## Key Decisions

- Ekstrahér `endGameCore` fremfor å duplisere pipelinen — én avslutningslogikk (felle 4).
- Admin-client + eksplisitt cup-authz i core-stien — creator-RLS dekker ikke klubb-styrere.
- Varsel-supresjon som core-option, ikke post-hoc filtrering — mail-helpers røres ikke.
- Gate-helper deles av UI-hint og action — UI kan aldri «love» noe serveren avviser.

**Claude's Discretion:** eksakt norsk copy (humanizer); fil-/funksjonsnavn; om likevel-valget er
inline sekundær-knapp i banneret eller egen bekreftelsesside (aldri browser-confirm); hvordan
levert-tilstanden plumbes gjennom snapshot-typene; rekkefølgen kampene endes i (sekvensielt er
greit — 6 kamper er småskala); om `startHint`-mønsteret gjenbrukes eller får søster-komponent.

## Success Criteria

- [x] **S1 — ett trykk:** staging, aktiv cup (split-dag: 2 host + 2 derived), alle kort levert,
      alle sidepoeng registrert → ETT trykk på «Avslutt cupen» → alle 4 kamper `finished`,
      cupen `finished` med persistert `winner_team`, resultatsiden åpner med matchresultater
      (Playwright + SQL-orakler).
- [x] **S2 — sidepoeng-gate:** én award uregistrert → knappen disabled med hint; direkte
      action-POST avvises med feilkode (server-side re-validering bevist).
- [x] **S3 — uleverte kort:** én spiller ulevert → stopp med kampliste-banner; «Avslutt
      likevel» avslutter alt, den uleverte beholder `submitted_at IS NULL`.
- [x] **S4 — varsler:** ett-trykks-løpet sender ingen per-kamp-mail/in-app-varsel (verifisert i
      kode + logg under staging-kjøringen); cup-mailen sendes; vanlig enkeltspill-avslutning
      sender som før (snapshot-suiten grønn uendret).
- [x] **S5 — levert-status:** kamp med alle kort levert viser «Scorekort levert» på BÅDE
      styringssiden og cup-siden mens den er aktiv; «Spilt» etter avslutning; delvis levert
      viser «Pågår».
- [x] **S6 — regresjon:** full vitest grønn; `npx playwright test e2e/cup/` grønn mot staging;
      `endGame`-wrapperen byte-ekvivalent for vanlige spill (co-located tester grønne).

## Gates

- [x] `npm run build` · `npm run lint` (0 errors) · `npx vitest run` (hele suiten)
- [x] `npx playwright test e2e/cup/` mot staging
- [x] Commit-disiplin: `feat(cup)`, MINOR-bump fra 1.226.2, én Funksjon-linje i CHANGELOG,
      `Refs #1501`/`Refs #1502` i commit-bodies
- [x] PR: `Closes #1501`, `Closes #1502`, fordeler/ulemper-blokk, notat om eier-avgjorte valg
      (ingen `## Produktvalg`-heading); staging-verify + `staging-verified`-label FØR merge

## Files Likely Touched

- `lib/games/endGameCore.ts` (ny — ekstrahert pipeline) + `app/[locale]/admin/games/[id]/actions.ts` (wrapper)
- `lib/cup/actions.ts` (gate + orkestrering i `finishTournament`)
- `lib/cup/sideAwardsRegistered.ts` (ny helper + Type A-test)
- `lib/cup/getCupSnapshot.ts` + `lib/cup/computeCupLeaderboard.ts` (levert-felt)
- `app/[locale]/admin/cup/[id]/CupManagement.tsx` + `app/[locale]/cup/[id]/page.tsx` (gate-hint, banner, likevel, delt status-label)
- `messages/no.json` + `messages/en.json` · `e2e/cup/cup-lifecycle.spec.ts` (ett-trykk-dekning)
- `package.json`/`package-lock.json`/`CHANGELOG.md`

## Out of Scope

- Cup-reopen (gjenåpning av avsluttet cup) — manuell SQL er dagens vei.
- Endringer i sidepoeng-registrerings-UI-et (#1489) og CSV-gaten (#1500).
- Endring av vanlig spill-avslutning (mails, redirects, avslutt-likevel-ruta) utover wrapper-refactoren.
- Varsel-sammendrag per spiller («du vant 2 av 3 kamper» e.l.) — cup-mailen som finnes er signalet.

## Evidens (2026-08-07, staging + gates)

- **S1:** e2e `Cup one-tap finish (#1501)` grønn mot staging (ekte finishTournament via UI, SQL-assertert alle finished) + driver: begge kamper + cup `finished`, `winner_team=1` persistert, resultatside åpnet.
- **S2:** driver: `cup-finish-gate-hint` synlig + knapp disabled med uregistrert ctp; enabled etter registrering (server-side gate i finishTournament, Type A-test på helperen).
- **S3:** driver: stopp-banner + `cup-finish-anyway`; likevel avsluttet alt; ulevert beholdt `submitted_at IS NULL` (SQL); cup forble aktiv etter stopp.
- **S4:** `suppressPerGameNotifications: true` i løpet (lib/cup/actions.ts); mail-snapshot-suite grønn uendret; vanlig endGame-wrapper byte-ekvivalent (co-located tester grønne uendret).
- **S5:** skjermbilde 1501-s2-gate.png: «Scorekort levert» vs «Pågår» på styringssiden; delt label-helper med Type A-test brukt av begge flater.
- **S6:** build grønn · lint 0 errors · vitest 442 filer/5664 tester grønn · e2e cup 3/3 grønn — alt re-kjørt ETTER rebase på main med PR #1504.
- **Gates:** staging-bevis + `staging-verified`-label på PR #1505; feat-commit med MINOR-bump (1.226.2→1.227.0, korrigert etter rebase-dobbeltbump) + CHANGELOG-linje.
