# Spec: Prøvespill — spillbar demoturnering på /demo (#1042)

**Issue:** [#1042](https://github.com/jdlarssen/golf-app/issues/1042) — byggbar del av epic [#1038](https://github.com/jdlarssen/golf-app/issues/1038) «Prøvespill — test Tørny på 60 sekunder»
**Branch:** `claude/musing-nash-4c8a03` (nåværende worktree)
**PR-body:** `Closes #1042` + `Part of #1038`
**Type:** `feat` · area:ui + area:leaderboard → MINOR-bump + CHANGELOG Funksjon-rad

## Problem

Alt Tørny gjør ligger bak innlogging. #1021 «Vindu ut» ga offentlige flater (banesider #1023, plakat #1022, embed #1024) som skaper trafikk — men en fremmed som lander der må fortsatt gi fra seg e-posten før de får se hva appen faktisk *gjør*. Terskelen fra «hørt om Tørny» til «prøvd Tørny» er en innloggingsvegg. Denne kontrakten fjerner den: en ferdig oppsatt, spillbar demoturnering som alle kan åpne uten konto, kjøre på ~60 sekunder, og som ender rett i registreringen.

## Research Findings

Fra tre kartleggings-agenter + nabo-kontrakter (#1022/#1024):

- **`lib/scoring/` er rent og klient-trygt.** `computeLeaderboard(ctx: ScoringContext) → ModeResult` og alle mode-compute-funksjoner er ren TS uten Supabase/DB/fetch. Kan kjøres i nettleseren uten endring. Stableford-resultatet er `StablefordSoloResult { kind:'stableford', variant:'solo', players: [{userId, totalPoints, holesPlayed, perHolePoints[]}], holes: [...] }`.
- **Leaderboard-visningene tar readonly props.** `SoloStablefordView` mottar `{ result, playersById: Map<userId,{name,nickname,teeGender}>, holesPlayed, gameName, backHref }` — null Supabase-kall. `LeaderboardChrome/Shell/Header` er rene UI-wrappere; **`LeaderboardRealtime` MÅ IKKE monteres** (abonnerer på postgres_changes).
- **`ScoreCard` (`components/hole/ScoreCard.tsx`) er ren presentasjon** — +/− stepper, 44px tap-targets, tar `onSetScore(playerId, next)`-callback. `HoleClient`/`page.tsx` er derimot hardkoblet til Dexie + server-fetch → gjenbrukes IKKE; bygg lettvekts demo-wrapper som kaller `setState` istedenfor `writeScore`.
- **Sync-worker er IKKE auth-gated** (`lib/sync/syncWorker.ts`). `writeScore()` legger alltid i `syncQueue`; `drainQueue()` kaller `upsert_score_if_newer`-RPC uten session-sjekk → en utlogget demo-besøkers skrivinger ville feile med 401 klassifisert som *transient* og retry-e i det uendelige. **Demoen kaller derfor aldri `writeScore`/`startSyncListener` og rører aldri Dexie-`'golf-app'`.**
- **Offentlig rute:** `PUBLIC_PATH_PATTERN` i `proxy.ts` (`/^\/(login|register)$|^\/(legal|signup|spectate)(\/|$)/`) matcher bar-pathname (locale strippet). Ny rute legges til her; BottomNav skjuler seg selv når `userId` er null (spectate-presedens). Ruter lever under `app/[locale]/`, `localePrefix:'as-needed'` (`no` uprefikset, `en` under `/en/`).
- **cacheComponents-felle:** ingen `export const runtime` i route-filer (kun `npm run build` fanger bruddet).

## Prior Decisions (videreført)

- **#1022/#1024:** offentlig segment = utvid `PUBLIC_PATH_PATTERN`; chrome-løs/nav-fri offentlig flate er etablert mønster; absolutt-URL hardkodes `https://tornygolf.no`.
- **#598:** nye leaderboard-flater IMPORTERER delte primitiver, aldri copy-paste.
- **#344 «Én dør per rom»:** demoen har ÉN inngang (lenke), ingen parallelle flyter.
- **`torny-*`-konvensjon:** hvis klient-lagring trengs, prefiks `torny-<feature>-` (men se beslutning: v1 er in-memory).
- **Dexie-`'golf-app'` aldri rørt** (CLAUDE.md `### Aldri gjør disse`).

## Design

Én offentlig rute **`/demo`** (ASCII, ren delbar URL). Server-`page.tsx` er tynn og rendrer et klient-komponent-tre som holder all demo-state i React. Ingen `admin`-klient, ingen fetch — seed-dataen er statisk TS.

### Seed-data (`lib/demo/seed.ts`)

Ren modul, ingen I/O:
- **Demobane** «Tørnybanen» med **3 hull** (representativ miks: par 4 / par 3 / par 5, hver med `strokeIndex` + par per kjønn).
- **4 spillere:** «Deg» (highlightet, `teeGender:'mens'`, en midt-på-treet banehandicap) + 3 motstandere med norske navn (f.eks. Ida, Ola, Kari), realistiske banehandicap.
- **Motstandernes scorer er ferdigfylte for alle 3 hull** (realistiske gross som gir en tett, troverdig tavle). «Deg» starter tomt.
- Bygger en `ScoringContext` per `lib/scoring/modes/types.ts` (`game_mode:'stableford'`, `mode_config:{kind:'stableford',team_size:1}`).

### Spillflate (`app/[locale]/demo/` + klient-komponenter)

Én skjerm som viser **både** hull-input og levende tavle samtidig, så bevegelsen er synlig i det du taster (mobil: input øverst, tavle under; det er «se tavla flytte seg»-utbetalingen):

1. **Hull-kort** gjenbruker `ScoreCard` for «Deg» på gjeldende hull (+/− stepper). «Neste hull»/«Forrige»-navigasjon mellom de 3 hullene.
2. **Levende tavle** gjenbruker `SoloStablefordView` (inne i `LeaderboardShell`, UTEN `LeaderboardRealtime`). Ved hver `onSetScore` → `setState` på demo-scorene → `computeLeaderboard(nyContext)` (memo på scores) → tavla re-ranker med «Deg»-raden highlightet.
3. **Demo-banner** (sticky, spectate-mønsteret): «Demo — ingenting lagres. Slik ser en ekte runde ut i Tørny.»
4. **Slutt-CTA:** når alle 3 hull er tastet (eller alltid synlig nederst) — stor **«Klar for ekte runde? →»** → `/login?next=%2F`. Diskré «Spill på nytt»-reset som nullstiller demo-state.

### Chrome

`AppShell` beholdes (BottomNav auto-skjules for `userId=null`), + demo-banner + `LocaleSwitcher` (login-side-mønsteret) + `BrandMark`. Ingen TopBar-nav-lenker som forutsetter session.

### Inngang (`/login`-lenke + offentlige flater)

- **`/login`-siden:** prominent sekundær-affordans under innlogging: «— eller — ▸ Prøv Tørny på 60 sekunder →» → `/demo`. Vises alltid (ikke gatet på self-registration-flagget).
- **Banesider (#1023) + plakat (#1022):** diskré «Se hvordan det funker»-lenke → `/demo` der det passer inn i eksisterende layout (builder plasserer minimalt-invasivt; hvis en flate ikke har naturlig plass, hopp over og noter).

## Edge Cases & Guardrails

- **Ingen sync/DB-lekkasje:** verifiser at `/demo` aldri importerer `writeScore`/`startSyncListener`/`getBrowserClient` og aldri åpner Dexie-`'golf-app'`. Ingen nettverkskall i DevTools mens man spiller (utenom Next RSC/asset).
- **Uinnlogget = ingen redirect:** `/demo` (og `/en/demo`) må returnere 200 uinnlogget; verifiser at `PUBLIC_PATH_PATTERN` matcher og at `x-torny-user-id`-spoofing fortsatt strippes.
- **`computeLeaderboard` med delvis utfylte scorer:** «Deg» med 0–2 av 3 hull tastet må gi gyldig tavle (uspilte hull = ingen poeng, `holesPlayed` reflekterer faktisk antall) — samme null-håndtering som ekte spill (`gross: null`).
- **Reset midt i:** «Spill på nytt» nullstiller til seed uten reload.
- **Tema/reduced-motion:** ingen animasjon som bryter `prefers-reduced-motion` (globals.css undertrykker); tavle-omranking skal ikke kreve animasjon for å være forståelig.
- **cacheComponents:** ingen `export const runtime` i `/demo`-filer; `npm run build` er gate.
- **Norsk copy:** all ny bruker-copy på no + en; humanizer-skill kjørt på ny norsk copy (banner, CTA, reset, hull-nav).
- **Tall:** `tabular-nums` (arves fra `SoloStablefordView`/`ScoreCard` — verifiser).

## Key Decisions

- **100 % klient-side, ingen server-state** — scoring-libet er rent, så demoen trenger verken DB, admin-klient eller RPC. Enkleste arkitektur som oppfyller «alt lagres kun lokalt / ingenting lagres».
- **In-memory React-state, ingen persistering** — 60-sekunders throwaway; reload = start på nytt er akseptabelt og unngår stale-demo-forvirring + storage-feil-edge-cases. (`localStorage`-persistering avvist for v1; kan legges til hvis ekte bruk viser at folk vil fortsette.)
- **Stableford, «Deg» mot 3 ferdigfylte, 3 hull** — poeng-format = tavla beveger seg oppover = mest tilfredsstillende; ferdigfylte motstandere gir umiddelbar «du klatrer»-effekt; 3 hull holder ~60 sek.
- **Rute `/demo`** (ASCII) — ren delbar URL uten `%C3%B8`-encoding; single page (evt. hull-steg i klient-state, ikke sub-ruter).
- **CTA → `/login?next=%2F`** — inn i registreringen (login håndterer self-reg). Ingen spill-spesifikk signup.
- **Én sammenhengende PR** — client-side-featuren har ingen uavhengig-shippbare seams; splitting ville lage kunstige grenser. #1038 lukkes manuelt når denne shipper.

**Claude's Discretion:** eksakt hull-miks + motstander-navn/handicap i seed; nøyaktig layout av input-vs-tavle (side-ved-side desktop vs stablet mobil); om hull-navigasjon er stepper eller «neste»-knapp; eksakt plassering av `/demo`-lenke på banesider/plakat (hopp over flater uten naturlig plass); regex-form for `demo` i `PUBLIC_PATH_PATTERN`; CHANGELOG ↳-tagline.

## Success Criteria

- [ ] **Uinnlogget spillbar demo:** `/demo` (og `/en/demo`) returnerer 200 uten session (curl + staging); en besøker kan taste slag for «Deg» på 3 hull og se `SoloStablefordView`-tavla re-ranke live med «Deg» highlightet — verifisert på staging (preview-klikkrunde + skjermbilde).
- [ ] **Null server/DB-berøring:** ingen nettverkskall til Supabase/RPC og ingen skriving til Dexie-`'golf-app'` under demo-spill (DevTools Network + Application → IndexedDB inspisert); kode importerer ikke `writeScore`/`startSyncListener`.
- [ ] **Gjenbruk, ikke kopi:** tavla rendres via importert `SoloStablefordView` og scoring via `computeLeaderboard` (ingen re-implementert stableford-matte); `ScoreCard` gjenbrukt for input — verifisert i diff.
- [ ] **CTA + inngang:** «Klar for ekte runde?» → `/login?next=%2F`; «Prøv Tørny på 60 sekunder»-lenke synlig på `/login` → `/demo` (staging-klikk).
- [ ] **Copy + i18n:** all ny copy no + en (catalogParity grønn); humanizer kjørt på ny norsk copy; `tabular-nums` på tall.
- [ ] **Flyt-diagram:** vurder om en onboarding/akkvisisjons-flyt i `docs/flows/` skal vise `/demo`-inngangen; oppdater + regenerer PNG hvis ja, ellers begrunn hvorfor ikke.

## Gates

- [ ] `npx tsc --noEmit` — 0 feil
- [ ] `npx eslint <endrede filer>` — 0 nye feil
- [ ] `npx vitest run <co-located>` — grønt (seed/derivering = Type A hvis noen ren helper; **maks én** Type C render-test for demo-tavla/hull-skjermen)
- [ ] `npm run build` — grønt (cacheComponents-fella)
- [ ] Playwright: én e2e golden-path — uinnlogget `/demo` → tast ett slag → tavla endrer seg → «Klar for ekte runde?» lander på `/login` (assert på `data-testid`/role, aldri norsk copy)
- [ ] Staging-klikkrunde av demo-flyten før merge

## Files Likely Touched

- `app/[locale]/demo/page.tsx` (+ `error.tsx`) — tynn server-shell + montering av klient-tre
- `app/[locale]/demo/DemoGame.tsx` (klient) — state, `onSetScore` → `computeLeaderboard`, hull-nav, banner, CTA, reset
- `lib/demo/seed.ts` (+ evt. ren helper + test) — statisk bane/spillere/scorer → `ScoringContext`
- `components/hole/ScoreCard.tsx` — gjenbrukes (evt. liten prop-justering hvis tett koblet til game-context; unngå regresjon i ekte hull-skjerm)
- `app/[locale]/games/[id]/leaderboard/SoloStablefordView.tsx` — gjenbrukes (verifiser at props kan mates fra demo uten server-typer)
- `proxy.ts` — `demo` i `PUBLIC_PATH_PATTERN`
- `app/[locale]/(auth)/login/…` — «Prøv Tørny»-lenke
- `app/[locale]/baner/…` + `app/[locale]/signup/[shortId]/…` — diskré demo-lenke (der naturlig)
- `messages/no.json` + `messages/en.json` — demo/banner/CTA/inngang-copy
- `e2e/…/demo.spec.ts` — golden-path
- `CHANGELOG.md`, `package.json` — minor + Funksjon-rad

## Out of Scope

- **Konverterings-attribusjon (demo → registrert konto):** demoen konverterer til en *konto*, ikke en spill-signup, så `game_players.signup_source` (#1022) gjelder ikke — konto-nivå-attribusjon er ny infra. Egen follow-up-issue hvis eier vil måle demo→signup.
- Persistering av demo-state over reload (`localStorage`/`'torny-demo'`-Dexie) — kun hvis ekte bruk krever det.
- Flere formater enn stableford i demoen (matchplay/scramble/wolf osv.) — v1 er ett format.
- Full 18-hulls demo; flere demo-baner; valg av bane/format.
- Offentlig hjemmeside på `/` (utlogget landing) — root-redirect uendret; egen sak hvis ønsket.
- Emoji-reaksjoner / deling / lyd i demoen.
