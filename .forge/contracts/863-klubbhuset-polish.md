# Spec: Klubbhuset-polish (#863)

**Issue:** [#863](https://github.com/jdlarssen/golf-app/issues/863)
**Branch:** `claude/elegant-gould-1def25` (worktree)
**Milestone:** Backlog — uplanlagt / scale-triggered

## Problem

Funn fra en multi-agent-analyse av Klubbhuset-flaten (2026-06-22), adversarisk verifisert mot live kode. Sju små, lavrisiko defekter på rommet flest folk går gjennom: nav-highlighten slukker på enkelte Klubbhus-flater, «Klubbhuset» er kicker på tre ulike sider (orienterings-kollisjon), hubben re-fetcher navn den allerede har i minnet, en tile-meta har grammatisk feil flertall ved n=1, norsk lekker forbi next-intl inn i engelsk locale, og de delte tile-lenkene mangler trykk/fokus-feedback (a11y-hull). Ingen feature-hull — bare polering. Scope er strengt låst til de 7 oppgavene; ikke utvid.

## Research Findings

Ren intern-polish — ingen ny bibliotek-integrasjon. ICU plural (next-intl / MessageFormat) er eneste «bibliotek»-bit, og mønsteret er allerede i bruk i samme katalog (`admin.dashboard.metaActive` = `{n, plural, one {# aktiv} other {# aktive}}`). Grunnlaget er de fungerende søsken-nøklene in-repo — sterkere enn ekstern doc. Ingen DeepWiki-spørring nødvendig (verifisert mot faktiske arbeidende eksempler i `messages/no.json`).

## Prior Decisions (fra #392, carry-forward)

- `/admin` ER Klubbhuset; den universelle bunn-nav-fanen peker dit. Fanen gates ikke; flatene inne gates. (Påvirker task 1 + task 4.)
- Back-office-stemmen «Sekretariatet»/«Saksbehandler»/«Orden i protokollen» er BEVISST bevart (CLAUDE.md, test-låst). Task 6 nøkler den kun for i18n-paritet — **ordlyden endres ikke** (samme norske streng, bare via `t()` så engelsk locale får `admin.dashboard.saksbehandlerLabel` = «Case officer» i stedet for norsk lekkasje).
- `AdminRoleContext` bærer `name` (`lib/admin/auth.ts:16`) nettopp for å unngå ekstra `users`-round-trips. (Grunnlag for task 2 + task 3.)

## Design

Sju uavhengige oppgaver. Hver med verifisert anker + nøyaktig edit.

### 1. Nav-aktiv-state på egne rom-sider *(bruker-synlig → PATCH-bump)*
`components/ui/BottomNav.tsx:86` — Klubbhuset-fanens `also`-array er i dag `['/klubbhuset', '/opprett-spill', '/opprett-bane']`. Legg til `'/klubber'` og `'/spillformater'`. Aktiv-state-logikken (`matchOne`, linje 69-76) gjør `startsWith(href + '/')`, så `/klubber/[id]` dekkes automatisk. Ingen kollisjon med de andre fanene (/, /innboks, /profile).
- **Test:** `components/ui/BottomNav.test.tsx:52-61` — utvid loop-en (linje 54) med `'/klubber'`, `'/klubber/abc'` og `'/spillformater'`; assert Klubbhuset-fanen er `aria-current="page"`.

### 2. Spiller-hub blokkerer ikke first-paint *(refactor, ingen bump)*
`app/[locale]/admin/TilesGrid.tsx` `PlayerKlubbhus` (257-266): fjern `getAdminContext()`-kallet (linje 258) og `users.select('name')`-spørringen (261-265); bruk `firstName(role.name)` (`role` er allerede param; `firstName` er importert linje 18; `AdminRoleContext.name` finnes). Etter dette har visningen ingen egen await → fully static, renders umiddelbart. **Ikke** legg til skjelett. La `getAdminContext`-importen stå (brukes fortsatt av `TilesGrid`, linje 39).

### 3. Samme overflødige navn-spørring på admin-greeting *(refactor, ingen bump)*
`app/[locale]/admin/page.tsx`: `getRole()` (linje 26, `cache()`-wrappet, returnerer `AdminRoleContext` med `name`) kjører før admin-grenen. `GreetingCard` (73-112) gjør i dag `getAdminContext()` + `users.select('name')` (82-87). Tråd `firstName(role.name)` inn som prop fra page-en (linje 51-53 render-kallet) → `GreetingCard` dropper begge. `firstName` er importert i page.tsx (linje 8). `GreetingSkeleton` (114) er en sync Suspense-fallback uten `t`/role — for task 6 trenger den `saksbehandlerLabel` som prop (se under); den kan få `firstName` på samme måte hvis nødvendig, men trenger det ikke (skjelettet viser ikke navnet).

### 4. «Klubbhuset»-kicker-kollisjon *(refactor/i18n, ingen bump)*
Kicker er det ene sentrerte orienterings-signalet (`components/ui/TopBar.tsx:64-68`). I dag viser tre sider «Klubbhuset»: `/admin` (`admin.nav.klubbhus`), `/klubbhuset` (`klubbhuset.kicker`), `/klubber` (`klubb.list.kicker`). Endre i **begge** locales:
- `klubb.list.kicker`: no «Klubbhuset» → «Klubber»; en «Clubhouse» → «Clubs». (pageTitle «Klubbene dine» / «Your clubs» står.)
- `klubbhuset.kicker`: no «Klubbhuset» → «Spill»; en «Clubhouse» → «Games». (pageTitle «Spillene dine» står.)
- **Behold** `admin.nav.klubbhus` = «Klubbhuset» (kun hubben beholder navnet).

### 5. Manglende flertall på Spill-tile-meta *(fix, ingen bump — intern grammatikk, ikke ny oppførsel)*
`admin.dashboard.metaActiveAndPlanned`: no er i dag `"{active} aktive · {planned} planlagte"` (feil ved n=1: «1 aktive · 1 planlagte»). Bytt til to ICU-plural-blokker (samme form som søsken-nøklene, men med var-navnene `active`/`planned`):
`"{active, plural, one {# aktiv} other {# aktive}} · {planned, plural, one {# planlagt} other {# planlagte}}"`
EN er maskert (engelske adjektiv bøyes ikke), men speil formen for paritet: `"{active, plural, one {# active} other {# active}} · {planned, plural, one {# planned} other {# planned}}"`.

### 6. Norsk-lekkasje inn i engelsk locale *(refactor/i18n, ingen bump)*
Hardkodet norsk forbi next-intl:
- `app/[locale]/admin/page.tsx:66` — `<PullQuote>Orden i protokollen.</PullQuote>` → ny nøkkel `admin.dashboard.pullQuote` (no «Orden i protokollen.», en — engelsk ekvivalent, f.eks. «Order in the records.»; ordlyden er back-office-stemme — hold tonen).
- `app/[locale]/admin/page.tsx:125` — skjelettet hardkoder «Saksbehandler». Nøkkelen finnes alt (`admin.dashboard.saksbehandlerLabel`, no «Saksbehandler» / en «Case officer»). Tråd den inn som prop til `GreetingSkeleton` fra page-en (page er async, har `t`).
- `app/[locale]/admin/ActivityLedger.tsx` — fallbacks `'(ukjent)'` (linje 17), `'(spill)'` (109, 117), `'klubbinvitasjon'` (151). Legg keyed strenger (f.eks. `admin.dashboard.ledgerUnknown`, `ledgerGameFallback`, `ledgerClubInvite`). Hold norsk ordlyd liten/uendret; engelsk ekvivalent i en.json. **Ikke** lag en delt unknown-name-nøkkel på tvers av moduler (søsken-helpers har test-låste varianter).

### 7. Trykk/hover/fokus-feedback på tiles *(bruker-synlig → PATCH-bump)*
`app/[locale]/admin/TilesGrid.tsx` `TileGridView` tile-lenkene (206-218) har ingen interaksjons-feedback og **ingen `focus-visible`-ring** (a11y for tastatur/switch). Legg hus-idiomer på den delte `SmartLink`-className:
- Fokus: `focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40` (eksakt som `components/ui/Button.tsx:11`).
- Trykk/hover: color-basert, som `components/ui/SettingRow.tsx:21` (`transition-colors ... active:bg-...`). **Unngå** transform-basert press uten `prefers-reduced-motion`-guard (CLAUDE.md). Arves av begge grids (admin + spiller).

## Edge Cases & Guardrails

- Task 1: ikke fjern eksisterende `also`-entries; bare legg til. Verifiser at ingen annen fane skal eie `/klubber` eller `/spillformater` (de gjør ikke).
- Task 2/3: behold `getAdminContext`-importen (brukes andre steder). Ikke endre admin-grenens øvrige data-henting.
- Task 4: kun de tre kicker-nøklene — ikke rør pageTitle/andre nøkler. `admin.nav.klubbhus` SKAL forbli «Klubbhuset».
- Task 6: ordlyden i den norske back-office-stemmen endres IKKE (test-låst stemme); kun engelsk-paritet via nøkler. Bekreft at ingen snapshot-test brekker på de tre ledger-strengene; oppdater snapshots kun hvis de er rene streng-flytt (ingen oppførsels-endring).
- Generelt: ikke utvid scope. Funn utenfor de 7 → eget issue, ikke smug inn.

## Key Decisions

- **Bump-splitt:** task 1 (nav) + task 7 (tile-feedback) er bruker-synlige → ÉN samlet PATCH-bump + CHANGELOG-oppføring (nest under åpen tema-serie per changelog-konvensjon). Task 2/3/4/5/6 er refactor/i18n/intern-fix uten bruker-synlig oppførsels-endring → commit-prefiks `refactor(...)`/`fix(...)` UTEN bump (commit-msg-hook slår kun på feat/fix/perf — bruk `refactor`/`i18n via fix` forsiktig: bruk `refactor(...)` for query/i18n-flytt så hooken ikke krever bump). Atomisk commit per oppgave.
- **Commit-rekkefølge:** gjør de ikke-bumpende refactor/i18n-oppgavene (2,3,4,5,6) først, så de to bruker-synlige (1,7) med bump til slutt — holder hver commit ren.

**Claude's Discretion:**
- Eksakt engelsk ordlyd for `pullQuote` + de tre ledger-fallback-nøklene (hold back-office-tonen).
- Nøkkel-navn for de nye i18n-strengene (under `admin.dashboard`).
- Hvorvidt `GreetingSkeleton` mottar `firstName` (trengs ikke) — kun `saksbehandlerLabel` er påkrevd.

## Success Criteria

- [ ] **K1:** `/klubber` og `/spillformater` tenner Klubbhuset-fanen (`BottomNav.tsx:86` utvidet; `BottomNav.test.tsx` grønn med nye stier).
- [ ] **K2:** `PlayerKlubbhus` har ingen `users`-spørring og ingen `getAdminContext()`-kall; bruker `firstName(role.name)` (`TilesGrid.tsx`).
- [ ] **K3:** `GreetingCard` har ingen `users.select('name')`; navnet kommer fra `role.name` via prop (`admin/page.tsx`).
- [ ] **K4:** Tre distinkte kickers: `/admin`=«Klubbhuset», `/klubbhuset`=«Spill»/«Games», `/klubber`=«Klubber»/«Clubs» (begge locales).
- [ ] **K5:** `metaActiveAndPlanned` rendrer «1 aktiv · 1 planlagt» ved n=1 (ICU plural i no + en).
- [ ] **K6:** Ingen hardkodet norsk i `admin/page.tsx:66/125` eller `ActivityLedger.tsx:17/109/117/151`; alle via `t()`/prop; engelsk locale viser engelsk.
- [ ] **K7:** Tile-lenkene har `focus-visible:ring` + color-basert active/hover (begge grids); ingen ugarderte transform-animasjoner.
- [ ] **K8:** Ett PATCH-bump + CHANGELOG dekker de bruker-synlige bitene (1+7); øvrige commits uten bump.

## Gates

- [ ] `npx tsc --noEmit` passerer.
- [ ] `npx vitest run components/ui/BottomNav.test.tsx` grønn (+ evt. ActivityLedger/admin co-lokerte tester hvis de finnes).
- [ ] `npm run build` grønn (fanger exhaustive-switch/Record-hull).
- [ ] `npm run lint` ren på endrede filer.
- [ ] Ny/endret norsk copy kjørt gjennom `humanizer` (pullQuote/ledger-fallbacks).
- [ ] (UI rørt) Playwright/preview spot-sjekk på Klubbhuset-fanens aktiv-state + tile-fokus er valgfritt — co-lokert test dekker nav-logikken.

## Files Likely Touched

- `components/ui/BottomNav.tsx` — task 1 (`also`-array).
- `components/ui/BottomNav.test.tsx` — task 1 (test).
- `app/[locale]/admin/TilesGrid.tsx` — task 2 (PlayerKlubbhus), task 7 (TileGridView className).
- `app/[locale]/admin/page.tsx` — task 3 (GreetingCard/Skeleton), task 6 (pullQuote, skeleton label).
- `app/[locale]/admin/ActivityLedger.tsx` — task 6 (fallback-nøkler).
- `messages/no.json` + `messages/en.json` — task 4 (kickers), task 5 (plural), task 6 (nye nøkler).
- `package.json` + `CHANGELOG.md` — task 8 (ÉN PATCH-bump for 1+7).

## Out of Scope

- Admin-hub kommandosentral (handling-stripe, trykkbar ledger) → eget issue #864.
- Spiller-Klubbhus-ombygging (adaptivt rom) → eget issue #892.
- Endring av back-office-ordlyden («Sekretariatet»/«Saksbehandler»/«Orden i protokollen») — kun i18n-paritet, ikke ny tekst.
- Tile-tiering/badges/ikon-distinksjon, dynamiske metas, `/klubbhuset`-shell-unifisering (nice-to-haves fra analysen, ikke i #863).
- Alt utenfor de 7 oppgavene.
