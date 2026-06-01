# Forge-evaluering: Vedvarende bunn-tab-bar (#355)

**Branch:** `issue-355-bunn-nav`
**Range:** `db8000a..HEAD` (5 commits)
**Evaluator:** fresh-context skeptical pass, 2026-06-01
**Verifikasjonsmetode for UI:** kode-lesing av render-tre + eksklusjons-logikk + unit-tester, pluss negativ curl-sjekk på offentlige ruter. Ingen innlogget browser-interaksjon utført (OTP-gated, kan ikke stages lokalt).

## Overall verdict: **ACCEPT** (med to ikke-blokkerende oppfølgings-funn)

Alle AC-er er MET. Alle scoped gates passerer. Pivot-en (global render i `app/layout.tsx`) er sunn og dekker faktisk de ~30 format-spesifikke leaderboard-viewene som motiverte den — den per-prop-tilnærmingen contracten beskrev ville bommet på dem. To minor funn (dead `userId`-tråding + always-on notifications-hook på alle ruter) bør bli oppfølgings-issues, men blokkerer ikke.

## Per-kriterium

| AC | Verdikt | Evidens |
|----|---------|---------|
| **AC1** — ≤1 tap til Hjem/Innboks/Profil fra alle spiller-flater | **MET** | `BottomNav` rendret én gang i `app/layout.tsx:70`, i `<body>` utenfor `{children}`, så den er i tre-et for ALLE ruter inkl. de client-component leaderboard-viewene (NassauView/SkinsView/WolfView/Podium) som eier egen AppShell. Tre faner som `SmartLink` til `/`, `/innboks`, `/profile` (`BottomNav.tsx:44-48`). Ingenting ekskluderer leaderboard-/spill-/scorecard-ruter. Unit-test bekrefter 3 faner rendres (`BottomNav.test.tsx:22-35`). |
| **AC2** — Skjult der den skal | **MET** | `hidden`-guard (`BottomNav.tsx:33-39`): `userId == null` (offentlig), `=== '/login'`, `startsWith('/admin')`, `startsWith('/complete-profile')`, og hull-regex `/^\/games\/[^/]+\/holes\//`. Regex testet mot ruter: skjuler `/games/x/holes/4`, viser `/games/x/leaderboard` + `/games/x/leaderboard/holes` (riktig — leaderboard er spiller-flate). Offentlige ruter (`/login`, `/legal/`, `/signup/`, `/register`) er ekskludert fra proxy-matcher (`proxy.ts:70`) → ingen `x-torny-user-id`-header → `getProxyVerifiedUserId()` returnerer null → bar skjult. Negativ curl bekreftet: `/login` (HTTP 200) og `/legal/privacy` (HTTP 200) har INGEN `Hovednavigasjon`-markup. `complete-profile` ER i matcher (header settes) men selv-skjules via `startsWith`. Tester dekker logged-out/admin/hull (`BottomNav.test.tsx:37-52`). |
| **AC3** — Uleste-prikk på Innboks-fanen | **MET** | `useUnreadNotificationsCount(userId)` (`BottomNav.tsx:28`), `dot: hasUnread` på Innboks-fanen (`:46`), champagne-prikk via `var(--accent)` + `data-testid="bottomnav-innboks-dot"` (`:71-78`). Gjenbruker eksisterende hook, ingen duplisert telle-logikk. |
| **AC4** — Profil = konto-hub; home-footer borte | **MET** | `git grep HomeUtilityFooter` i `app/`/`components/` → tomt (kun `.forge/`-kontrakter + historisk CHANGELOG). `AccountActions` på `app/profile/page.tsx:154-190` rendrer logout-form (`<form action="/logout" method="post">`) + admin-gated «Sekretariatet»-lenke. Logout-route finnes: `app/(auth)/logout/route.ts` (POST → signOut → 303 til /login). Home-header (`app/page.tsx:61-63`) er nå kun `<BrandMark />`, ingen `NotificationBell`. |
| **AC4b** — Ingen dobbel innboks-dør | **MET** | Alle `TopBar ... userId={userId}`-kall i hele app-en er under `app/admin/*` (8 treff, alle `kicker="Sekretariatet"`). Scan av alle ikke-admin TopBar-kall: ingen sender userId. Diff bekrefter `userId`-prop fjernet fra TopBar på cup/approve/leaderboard×2/game/scorecard/submit/trekk-fra/innboks/opprett-spill/historikk/slett-konto/statistikk/spillformer + RevealBruttoView. Admin beholder bjella. |
| **AC5** — Mobile-first + tap-targets | **MET** | `min-h-[56px]` per fane (`BottomNav.tsx:65`, ≥44px). Forest-and-champagne: `text-primary` aktiv / `text-muted` inaktiv, `bg-bg/95 backdrop-blur-sm`, champagne-prikk via `--accent`. Safe-area: `paddingBottom: env(safe-area-inset-bottom, 0px)` (`:54`). AppShell bunn-padding `pb-[calc(5rem+env(safe-area-inset-bottom,0px))]` (`AppShell.tsx:17`) klarerer baren. `viewportFit: 'cover'` satt i layout (`layout.tsx:49`). |
| **AC6** — Ingen regresjon auth-gating/offentlig | **MET** | `proxy.ts` URØRT i diff (kun lest, header `x-torny-user-id` var allerede satt pre-#355). Offentlige sider rendrer uten bar og uten auth-leak (curl bekreftet, ingen userId lekker til markup). Build grønn. |
| **AC7** — Bump + CHANGELOG | **MET** | `package.json` version `1.66.0`. CHANGELOG har `## 1.66.y — Vedvarende navigasjon` åpen, `### [1.66.0] - 2026-06-01` med tagline + Teknisk. Forrige serie `1.65.y` wrappet i `<details>`. Commit `63205e0` bærer bump (commit-msg-hook passerte). |

## Gate-resultater

| Gate | Resultat | Notat |
|------|----------|-------|
| `npx tsc --noEmit` | **PASS** (exit 0) | Ingen feil. Bekrefter at dead `userId`-tråding (se Funn 1) ikke feiler — `noUnusedLocals` er IKKE på i tsconfig. |
| `npx vitest run components/ui` | **PASS** | 5 filer, 26 tester grønne. BottomNav-test dekker 3 faner + aktiv-rute + 3 skjul-cases. |
| `npm run build` | **PASS** (exit 0) | Kompilerer. Route-tabell: nesten alt er nå `ƒ` (dynamic), inkl. tidligere statiske `/legal/privacy`, `/invite`, `/_not-found` — fordi root-layout leser `headers()`. Kun asset-ruter (`/apple-icon`, `/icon`, `/manifest.webmanifest`) forblir `○` static. Akseptabelt og DOKUMENTERT i CHANGELOG Notes. |
| Negativ curl (`/login`, `/legal/privacy`) | **PASS** | Begge HTTP 200, full innhold, INGEN `Hovednavigasjon`-markup. Async root-layout booter uten crash; ingen errors i dev-log. |
| `npx vitest run` (full) | 18 filer feiler — **IGNORERT** | Alle 18 er Playwright `.spec.ts` under `.claude/worktrees/modest-wilbur-c4cc7b/e2e/` (stale worktree, feil-samlet av vitest). 411 tester passerer. Ikke del av denne branchen, ikke regresjon. Bekreftet: hver feilende fil er under den stale stien. |

## Pivot-soundness

Pivot-en (global render framfor per-AppShell `userId`-prop) er **sunn og mer komplett enn contracten**:

- **Dekker gapet contracten ville misset.** `AppShell` rendres ~50 steder, hvorav ~30 er client-component format-views (NassauView, SkinsView, WolfView, podiums) som hver eier sin egen AppShell. Per-prop-tråding måtte rørt hver enkelt + vært en felle for hver ny spillform. Global render i `<body>` (`layout.tsx:70`) garanterer dekning uten per-view-arbeid. AC1 er faktisk **bedre** oppfylt enn den opprinnelige planen.
- **Client/server-grense er ren.** `BottomNav` er `'use client'`; rendres fra et async server root-layout som server-children — gyldig RSC-mønster. `userId` (string|null) er serialiserbar.
- **Hooks-regler korrekt.** `usePathname` + `useUnreadNotificationsCount` kalles UBETINGET før `if (hidden) return null` (`BottomNav.tsx:27-28` før `:39`). Hook-antall stabilt selv når `userId` er null (hook kalles med null, intern guard no-op'er). Ingen conditional-hook-brudd.
- **Dynamic-rendering-risiko:** å lese `headers()` i root-layout opter hele tre-et inn i dynamic. Bekreftet i build-output. Ubetydelig — app-en er allerede overveldende dynamisk (Supabase per-request); kun 3 trivielle sider mistet static-status, og de er eksplisitt notert i CHANGELOG. Ingen funksjonell regresjon.
- **Ingen rute der baren vises feil eller skjules feil** funnet. Admin (`/admin/*`), hull-skjerm, offentlig, complete-profile alle korrekt skjult; alle spiller-flater (inkl. `/games/x/leaderboard/holes`) korrekt vist.

## Funn (ikke-blokkerende → foreslå oppfølgings-issues)

**Funn 1 — Dead `userId`-tråding etterlatt etter pivot (cleanliness).**
`userId` trådes fortsatt inn i tre steder hvor det ikke lenger brukes, fordi den konsumerende `<TopBar userId>` ble fjernet i pivoten:
- `renderState3(opts.userId)` — `app/games/[id]/leaderboard/page.tsx:3308,3311` (destrukturert, 0 bruk i body)
- `renderState35(opts.userId)` — `:3410,3414` (0 bruk i body)
- `RevealBruttoView`-prop `userId` — `RevealBruttoView.tsx:25,40` (de `pc.userId`/`p.userId`-referansene er ANDRE objekt-felt, ikke prop-en)

Passerer tsc (`noUnusedLocals` av) og build (lint-warning, ikke error). Ren dead code — bør strippes. Lav prioritet.

**Funn 2 — `useUnreadNotificationsCount` kjører nå på ALLE innloggede ruter (atferds-endring).**
Fordi hooken kalles før `hidden`-return, og BottomNav rendres globalt, kjører notifications-fetch + realtime-sub `notifications:${userId}` på HVER innlogget rute — inkludert hull-skjermen (scoring) og admin, hvor baren visuelt skjuler seg. Tidligere kjørte hooken kun der `NotificationBell` faktisk var mountet.
- Bounded: én ekstra channel, count-query er «trivielt billig» per hook-docs; hull-skjermen kjører allerede realtime for score-sync.
- **Admin-bivirkning:** admin beholder sin egen bjelle (som ALSO kjører denne hooken) → to abonnenter på SAMME channel-navn `notifications:${userId}` på admin-sider. Verdt å verifisere at `subscribeRealtimeChannel` deduper/ikke dobler. Ikke en korrekthets-bug i seg selv, men en utilsiktet always-on-sub pivoten ikke vurderte.

Anbefaling: vurder å flytte hook-kallet ETTER `hidden`-sjekken (men det bryter hooks-regelen) eller gate hooken på `!hidden` via et tidlig `userId`-derivat. Egnet som lav-prioritets oppfølgings-issue, ikke blokkerende.

## Regresjons-sjekk

- **Bjelle fjernet fra spiller-sider:** ingen brudd — `NotificationBell`-komponenten selv er uendret og fortsatt brukt på admin. Innboks-fanen dekker spiller-rollen.
- **Home-footer fjernet:** `is_admin`/`email` fortsatt hentet på Hjem (`page.tsx:108`) og brukt til `canCreateGame` (`:179-180`) — fjerningen rørte ikke creator-routing. `profile`-data fortsatt brukt.
- **Profil-side:** `AccountActions` henter `is_admin` separat (`page.tsx:157-162`) — korrekt gating av Sekretariatet.
- **Ingen test brutt:** TopBar-test dekker fortsatt bjelle-rendring (admin-sti) — 26/26 grønne.
