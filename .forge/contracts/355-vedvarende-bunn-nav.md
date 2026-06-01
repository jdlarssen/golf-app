# Forge-kontrakt: Vedvarende bunn-tab-bar (#355)

**Issue:** [#355](https://github.com/jdlarssen/golf-app/issues/355)
**Branch:** (denne) — opprett `issue-355-bunn-nav` hvis ny trengs
**Flyt:** Tverrgående (touch-er alle flyter); funn i UX-flyt-audit (`docs/user-flows.md` #1)
**Bump:** MINOR (ny bruker-synlig navigasjon) → `1.65.1` → `1.66.0`

## Problem

Appen har ingen vedvarende navigasjon. `app/page.tsx` (Hjem) er eneste nav-nav: for å nå profil, innboks eller bytte spill må brukeren tilbake til Hjem og inn igjen. I en installert PWA (iPhone Safari) uten nettleser-chrome føles dette som en blindvei. Profil er verst stilt — den er kun nåbar fra en muted footer på Hjem (`HomeUtilityFooter`). Innboks er allerede ≤1 tap via `NotificationBell` i `TopBar` på indre sider, men ikke via et fast, forutsigbart element.

## Beslutninger (avklart med bruker 2026-06-01)

1. **Bunn-tab-bar** (ikke hjem-snarvei eller topp-meny). App-native følelse for installert PWA. Kodebasen er allerede forberedt: `components/icons/Icons.tsx`-kommentar nevner «bottom-nav», og `AppShell` reserverer alt `pb-24`.
2. **Tre faste faner: Hjem / Innboks / Profil.** «Finn turneringer» (#357) og «Opprett» blir værende på Hjem (per fremtids-flyt 2: «fast Finn turneringer på Hjem»), ikke egne faner.
3. **Profil-knappen på Hjem erstattes av Profil-fanen** (brukerens oppfølgings-spørsmål). `HomeUtilityFooter` fjernes helt; «Logg ut» + (admin) «Sekretariatet» flyttes til Profil-siden, som blir konto-/utility-hub.
4. **`NotificationBell` fjernes fra spiller-sider med en gang** (brukervalg 2026-06-01: «fjern bjella med en gang», ren «én dør» fra dag én). Innboks-fanen overtar rollen på spiller-flater. Bjella **beholdes på admin** (AdminShell har ingen bunn-nav). Mekanisme: spiller-sider slutter å sende `userId` til `TopBar` (→ ingen bjelle), og sender det i stedet til `AppShell` (→ baren). Admin-sider sender fortsatt `userId` til `TopBar`.

## Prior Decisions (videreført)

- **«Én dør per rom» (#344, memory `one_door_per_room`):** tab-baren ER døra til hver destinasjon. Derfor fjernes duplikat-dørene: home-footerens «Min profil» (→ Profil-fanen) og home-headerens øverste `NotificationBell` (→ Innboks-fanen).
- **`NotificationBell`-mønster:** champagne-prikk, ingen telletall — gjenbrukes på Innboks-fanen via `useUnreadNotificationsCount(userId)` (ikke dupliser tellelogikk).
- **Admin = eget rom (`AdminShell`, varm linen-bg):** admin-flater får IKKE spiller-tab-baren. De beholder `TopBar` + back-til-Sekretariatet/Hjem. Brukeren (Jørgen) når Sekretariatet fra Profil-siden.

## Research Findings (Next.js 16, lokale docs)

- **Route-grupper `(group)`** gir delt layout uten URL-endring, og en delt layout *persisterer* på tvers av navigasjon (med Cache Components hides pages via `<Activity>`, state bevares). Det IDIOMATISKE hjemmet for global nav er en `app/(player)/layout.tsx`. **Men** å flytte ~15 rute-mapper inn i en gruppe er en stor, risikabel refaktor (admin/offentlig må holdes utenfor), og AGENTS.md advarer eksplisitt: «this is NOT the Next.js you know».
- **Valgt approach (mindre risiko for autonom loop):** baren rendres `position: fixed` nederst i viewport via **`AppShell`** (som alle spiller-sider alt bruker), styrt av en `userId`-prop — samme konvensjon som `TopBar` allerede bruker for bjella. Lokalt, forutsigbart, per-side verifiserbart. En manglende side degraderer grasiøst (mangler baren), bryter ikke. Route-gruppe-layout noteres som fremtidig optimalisering (persistent realtime-sub) — ikke i scope.
- `usePathname()` (klient) brukes for aktiv-fane-highlight. Baren er en `'use client'`-komponent; stateless bortsett fra aktiv-rute + unread-hook, så remount-per-navigasjon er usynlig (bjella remounter alt i dag per side — ingen regresjon).

## Design

**1. Ny komponent `components/ui/BottomNav.tsx`** (`'use client'`):
- Fixed bar nederst: `fixed inset-x-0 bottom-0 z-30`, `bg-bg/95 backdrop-blur`, top-border, `max-w-md mx-auto` for å matche AppShell-kolonnen.
- Tre faner som `SmartLink` (prefetch): Hjem (`/`), Innboks (`/innboks`), Profil (`/profile`). Ikon + etikett, vertikalt stablet, ≥44px tap-target, `tabular-nums` ikke relevant.
- **Aktiv-tilstand** via `usePathname()`: Hjem aktiv kun på `/`; Innboks på `/innboks*`; Profil på `/profile*`. Aktiv = `text-primary` + sterkere vekt; inaktiv = `text-muted`. (Spill-/leaderboard-sider → ingen fane aktiv, det er greit.)
- **Innboks-prikk:** gjenbruk `useUnreadNotificationsCount(userId)` → champagne-prikk på Innboks-ikonet når `count > 0` (samme stil som `NotificationBell`).
- **Safe-area:** `padding-bottom: max(<px>, env(safe-area-inset-bottom))` så baren klarerer iPhone home-indicator (`viewportFit: 'cover'` er alt satt i `app/layout.tsx`).
- **Ikoner** (line-stil fra `Icons.tsx`: `currentColor`, 1.5 stroke, round caps): Innboks kan bruke `KonvoluttIcon`. Hjem + Profil mangler glyph — lag `HjemIcon` (hus) + `ProfilIcon` (person) i `Icons.tsx` i samme stil. (Builder-skjønn på eksakt form.)

**2. `AppShell` (`components/ui/AppShell.tsx`)** får `userId?: string | null`:
- Når satt → render `<BottomNav userId={userId} />` (fixed).
- Bunn-padding på `<main>` økes fra `pb-24` til å klarere baren + safe-area (f.eks. `pb-[calc(5rem+env(safe-area-inset-bottom))]`).
- Når `userId` er null/utelatt → ingen bar (offentlige/pre-profil-sider degraderer grasiøst).

**3. Tre Profil-side-tillegg (`app/profile/page.tsx`)** — bli konto-hub:
- «Logg ut» (`<form action="/logout" method="post">`) — finnes ikke der i dag.
- «Sekretariatet» (`/admin`) — kun når `is_admin` (flyttet fra home-footer).

**4. Hjem (`app/page.tsx`)** ryddes:
- Fjern `HomeUtilityFooter`-funksjonen + begge kall (linje ~237/358).
- Fjern øverste `NotificationBell` i home-headeren (Innboks-fanen dekker det); behold `BrandMark`.
- Send `userId` til `AppShell`.

**5. Tråd `userId` til `AppShell` på alle spiller-flater** (de har alt userId i scope for `TopBar`-bjella, eller henter bruker). Se «Files» for sjekkliste.

## Edge Cases & Guardrails

- **Hull-skjerm (`/games/[id]/holes/[holeNumber]`):** bruker IKKE `AppShell` (egen fullskjerm-layout) → baren skal IKKE vises. Ikke send userId/AppShell her. Verifiser at scoring-flaten er uberørt.
- **Admin (`/admin/*`, `AdminShell`):** ingen spiller-bar. Uendret.
- **Offentlige/pre-profil-sider** (`/login`, `/legal/privacy`, `/signup/[shortId]*`, `/complete-profile`): bruker AppShell men skal IKKE få baren — ikke send `userId`. Robust mot logget-ut-tilstand.
- **`z-index`:** baren `z-30`; `SyncBanner` er `z-40` (over). Sjekk at fixed-bar ikke dekker `BottomActionBar` på hull-skjerm (den siden ekskluderes uansett) eller submit/avslutt-CTA-er (de scroller i flow over baren — verifiser i preview).
- **TopBar-bjella fjernes på spiller-sider (i scope nå):** ingen dobbel innboks-dør. Spiller-sider slutter å sende `userId` til `TopBar`. **Admin beholder bjella** (sender fortsatt userId til TopBar — ingen bunn-nav der). Påse at `TopBar.test.tsx` fortsatt dekker bjelle-rendring (admin-stien) og oppdater hvis en test antok bjelle på en spiller-side.

## Key Decisions

- **Integrasjon via AppShell `userId`-prop, ikke route-gruppe-layout** — lavere risiko for autonom build-loop; grasiøs degradering; per-side verifiserbart.
- **3 faner, ikke 4–5** — Finn turneringer/Opprett hører på Hjem.
- **Profil blir konto-hub** — Logg ut + Sekretariatet flyttes dit; home-footer dør.

**Claude's Discretion:**
- Eksakt høyde/spacing/ikon-glyph på baren (følg forest-and-champagne + 44px).
- Om Profil-sidens nye «Logg ut»/«Sekretariatet» blir egen seksjon eller footer-stil (match eksisterende profil-side-mønster).
- Om `complete-profile` skal ha baren (lean: nei — pre-profil).

## Success Criteria

- [ ] **AC1 — ≤1 tap til alle tre.** Fra en hvilken som helst innlogget spiller-side (Hjem, et spill, leaderboard, scorecard, innboks, profil) når brukeren Hjem + Innboks + Profil i ett tap via bunn-baren. *(Bevis: baren rendret på sjekklist-sidene; preview-screenshot.)*
- [ ] **AC2 — Baren skjules der den skal.** Ikke synlig på hull-skjerm, admin-flater, eller offentlige/pre-profil-sider (`/login`, `/legal/privacy`, `/signup/*`, `/complete-profile`). *(Bevis: kode — disse sender ikke userId; preview på hull-skjerm + /legal/privacy.)*
- [ ] **AC3 — Uleste-prikk på Innboks-fanen.** Når brukeren har uleste varsler vises champagne-prikk på Innboks-ikonet (gjenbruk `useUnreadNotificationsCount`). *(Bevis: kode kobler hook til prikk; manuell/preview.)*
- [ ] **AC4 — Profil er ny konto-hub; home-footer borte.** `HomeUtilityFooter` fjernet fra Hjem; «Logg ut» + (admin) «Sekretariatet» finnes på `/profile`. Home-header-bjella fjernet. *(Bevis: `git grep -n HomeUtilityFooter` tomt; profil-side rendrer logout-form + admin-lenke.)*
- [ ] **AC4b — Ingen dobbel innboks-dør.** `NotificationBell` vises ikke lenger på spiller-sider (Innboks-fanen overtar), men beholdes på admin-flater. *(Bevis: spiller-`TopBar`-kall sender ikke userId; admin-kall gjør det fortsatt; preview på en indre spiller-side viser ingen topp-bjelle.)*
- [ ] **AC5 — Mobile-first + tap-targets.** Baren ≥44px tap-targets, forest-and-champagne, safe-area-inset-bottom klarerer home-indicator, AppShell-innhold scroller ikke under baren. *(Bevis: kode + preview på notched-viewport.)*
- [ ] **AC6 — Ingen regresjon på auth-gating/offentlige sider.** `proxy.ts` uendret; offentlige sider rendrer fortsatt uten bar og uten auth-leak. *(Bevis: `proxy.ts` urørt i diff; build grønn.)*
- [ ] **AC7 — Bump + CHANGELOG.** MINOR → `1.66.0` + CHANGELOG-oppføring (serie 1.66.y åpnes, 1.65.y wrappes i `<details>`). *(Bevis: commit-msg-hook passerer.)*

## Gates (scoped)

1. `npx tsc --noEmit` → ingen feil (ny AppShell-prop + BottomNav typer rent)
2. `npx vitest run components/ui` → grønn (+ ny `BottomNav`-render-test hvis lagt til, maks én per test-disiplin)
3. `npm run build` → grønn
4. `.githooks/commit-msg` + `.githooks/pre-commit` passerer (bump+CHANGELOG; humanizer på nye norske strenger «Hjem/Innboks/Profil/Logg ut»)
5. Preview (frontend): logg inn som spiller → bar synlig på Hjem/spill/innboks/profil, skjult på hull-skjerm; uleste-prikk; tap når alle tre i ett tap. Screenshot som bevis.

## Files Likely Touched

- `components/ui/BottomNav.tsx` — **NY** fixed tab-bar.
- `components/ui/AppShell.tsx` — `userId?`-prop + render BottomNav + bunn-padding/safe-area.
- `components/icons/Icons.tsx` — **NYE** `HjemIcon` + `ProfilIcon` (Innboks bruker `KonvoluttIcon`).
- `app/page.tsx` — fjern `HomeUtilityFooter` + home-bjella; send userId til AppShell.
- `app/profile/page.tsx` — legg til «Logg ut» + (admin) «Sekretariatet».
- **Tråd `userId` → AppShell OG fjern userId fra `TopBar`** (sjekkliste, spiller-flater — bjella bort, baren på): `app/innboks/page.tsx`, `app/profile/page.tsx` (+ `historikk`/`statistikk`/`slett-konto`), `app/games/[id]/page.tsx`, `.../leaderboard/page.tsx` (+ `RevealBruttoView.tsx` + `/holes`), `.../scorecard/page.tsx`, `.../submit/page.tsx`, `.../approve/page.tsx`, `.../trekk-fra/page.tsx`, `app/spillformer/page.tsx` (+ `[slug]`), `app/opprett-spill/page.tsx`, `app/cup/[id]/page.tsx`. Home (`app/page.tsx`) fjerner sin egen `<NotificationBell>` direkte.
  - **Admin-flater (alle `app/admin/*`): IKKE rør** — behold `userId` på `TopBar` (bjella blir), ingen AppShell-bar.
- **IKKE rør:** `app/games/[id]/holes/[holeNumber]/page.tsx` (ingen AppShell), alle `app/admin/*` (AdminShell), `proxy.ts`, `app/login`, `app/legal`, `app/signup/*`, `app/complete-profile`.
- `package.json` + `CHANGELOG.md` — MINOR-bump `1.66.0` + oppføring.
- `docs/flows/*` — KUN hvis en flyt eksplisitt tegner nav-løs blindvei (sjekk; trolig ikke — flytene er journey-diagram, ikke chrome).

## Out of Scope (unngå gold-plating)

- **Route-gruppe-layout-refaktor** (persistent nav uten remount) — fremtidig optimalisering, egen vurdering.
- **Finn turneringer / Opprett som faner** — bevisst på Hjem.
- **Admin-egen bunn-nav** — admin beholder TopBar-modellen.
- **Tab-bar på hull-skjerm** — bevisst nav-fri scoring.
- **Animasjoner/transitions på fane-bytte** — utover enkel aktiv-highlight.

## Commit-plan (atomiske)

1. `feat(ui): bunn-tab-bar-komponent + AppShell-integrasjon (Hjem/Innboks/Profil)` — BottomNav + AppShell `userId`-prop + nye ikoner + safe-area. (Ikke synlig før wiret → vurder om bump hører hit eller i chunk 2; samle bump på den commiten som faktisk viser baren.)
2. `feat(ui): vis bunn-nav på spiller-flater + flytt konto-handlinger til Profil` — tråd userId, fjern home-footer/bjelle, Profil får Logg ut + Sekretariatet + MINOR-bump + CHANGELOG.
3. `test(ui): render-test for BottomNav` (hvis nødvendig, maks én).
4. `docs(flows): ...` — kun hvis nødvendig.

## Følge-issues å opprette (per reviewer-disiplin)

- (Vurder) «Flytt bunn-nav til route-gruppe-layout for persistent realtime-sub» (perf/arkitektur, lav).
