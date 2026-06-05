# Forge-evaluering: #392 — Klubbhuset, universell bunn-nav-fane

**Evaluert:** 2026-06-05 · branch `claude/naughty-chatterjee-a2c054` (7 commits over `origin/main`)
**Metode:** Uavhengig kode-lesing + kjørte gates. Live browser-verifisering av innloggede flater er
IKKE mulig lokalt (alle authed-ruter gates bak Supabase OTP, ingen måte å hente innloggingskode i
preview). Authed-kriterier verifisert via kode-lesing + passerende komponent-tester, jf. oppdrags-notatet.

## Verdict: ACCEPT

Alle tolv suksess-kriterier er oppfylt. Den høyrisiko-endringen (åpne `/admin`-layouten til auth-only)
er korrekt herdet: rolle-branchen i `app/admin/page.tsx` skjer FØR noen admin-scoped query, hver
admin-only sub-rute beholder sin egen `requireAdmin`-gate, og den ene roster/e-post-eksponeringen
(`/admin/games/new`) self-gater nå. Ingen sti funnet der en vanlig innlogget bruker ser admin-data.

Build grønn (exit 0), full test-suite grønn (2657/2657), targeted lås-tester grønne (36/36). Ingen
out-of-scope-smugling — sub-rute-diffene er rent mekaniske (bjelle-fjerning + kicker-rename).

Én prosess-merknad (ikke blokkerende, se nederst): oppfølgings-issuet fra kontrakt §8 (pre-eksisterende
roster/e-post-leak i `getNewGameFormData()` for `/opprett-spill`, stammer fra #427) er ikke opprettet ennå.

## Kriterier K1–K12

| # | Status | Bevis |
|---|--------|-------|
| K1 | PASS | `app/admin/layout.tsx:17-21` kaller kun `getRoleContext(supabase)` (ingen rolle-redirect); `lib/admin/auth.ts:53-57` returnerer `AdminRoleContext` uten å bounce ikke-admin (kun `/login` ved manglende session via `loadRole`). |
| K2 | PASS | `app/admin/games/new/page.tsx:80-82`: `getRoleContext` → `if (!role.isAdmin) redirect('/opprett-spill')` FØR `getNewGameFormData()` (kjøres først i Suspense-bodies linje 263/306). Alle fem admin-only sub-ruter beholder `requireAdmin`: spillere:81, games:88, cup:57, formats:48, lanseringer:44. |
| K3 | PASS | `app/admin/page.tsx:88-89`: `const role = await getRole(); if (!role.isAdmin) return <PlayerKlubbhus role={role} />`. Returnerer FØR `<Suspense>`-trærne med `TilesGrid`/`ActivityLedger` bygges — de async-komponentene kjører aldri for ikke-admin. `PlayerKlubbhus` (382-447) kjører kun ett query: brukerens eget `name`. |
| K4 | PASS | `app/admin/page.tsx:405-414` (vanlig): Spill→`/klubbhuset`, Baner→`/opprett-bane`. `391-403` (trusted): Baner→`/admin/courses`. Admin-grenen (257-317) uendret. |
| K5 | PASS | `app/klubbhuset/page.tsx:59` tittel re-merket «Klubbhuset» → «Spillene dine»; subtitle «Spillene du arrangerer …». Kicker «Klubbhuset» beholdt som rom-brødsmule (backHref nå `/admin`). Innhold + create-knapp uendret. |
| K6 | PASS | `components/ui/BottomNav.tsx:72-78`: 4. fane «Klubbhuset» → `/admin`, `also: ['/klubbhuset','/opprett-spill','/opprett-bane']`. `/admin`-eksklusjon fjernet fra `hidden` (46-50); baren skjules kun på login/complete-profile/hull-skjerm. |
| K7 | PASS | `components/icons/Icons.tsx:177-185` `KlubbhusIcon` (flat-toppet bygg + vimpel), visuelt distinkt fra `HjemIcon` (159-164, spiss takhus), samme `base(size)`-stroke. |
| K8 | PASS | `components/ui/AdminShell.tsx:20`: `pb-[calc(5rem+env(safe-area-inset-bottom,0px))]` — samme mønster som AppShell. |
| K9 | PASS | `app/page.tsx`: `secretariatLink`/`klubbhusetLink`/`courseCreateLink` + begge Opprett-knapper fjernet; død kode (`createdCountRes`, `canCreateGame`, `CREATE_GAME_LABEL`-import, `is_admin` i select) borte (grep tom). Tom-tilstand: «Åpne Klubbhuset»-knapp → `/admin`. |
| K10 | PASS | `app/profile/page.tsx`: `<SettingRow href="/klubbhuset" …>` fjernet (grep på `klubbhuset` tom). |
| K11 | PASS | Alle `kicker="Sekretariatet"` → `"Klubbhuset"`; `userId={userId}` droppet fra alle admin-TopBar-er (grep `userId={` i `app/admin/` tom). Beskyttet stemme bevart: `registrationRequest.ts:86` «Sekretariatet» intakt; ledger-aktør `who: 'Sekretariatet'` (page.tsx 567/577) intakt; «Saksbehandler»-hilsen intakt. |
| K12 | PASS | `npm run build` exit 0; targeted tester 36/36; full suite 2657/2657. `docs/user-flows.md` §0 oppdatert til 4-fane-nav + Klubbhuset universelt rom + create-inne. MINOR-bump til 1.78.0 + CHANGELOG-oppføring til stede. |

## Security (uavhengig analyse av /admin-åpningen)

Den eneste farlige endringen er at `/admin`-layouten nå er auth-only. Konklusjon: **trygt herdet.**

1. **Layout (`app/admin/layout.tsx`)** — auth-only bekreftet. `getRoleContext` redirecter kun ved
   manglende session (`/login`), ikke på rolle. Verifisert mot `lib/admin/auth.ts:53-57` + `loadRole:20-42`.

2. **Dashboard-branchen (`app/admin/page.tsx:88-89`)** — den kritiske grensa. For en ikke-admin returnerer
   `KlubbhusetPage` `<PlayerKlubbhus>` synkront FØR React bygger `<Suspense>`-trærne. Siden `TilesGrid`
   (all-games/all-users/all-courses-tellinger) og `ActivityLedger` (leverte scorekort, signeringer,
   invitasjons-aksept m/e-post-prefiks, roster-navn) bare er inkludert i admin-grenens returnerte tre,
   eksekverer de aldri for en ikke-admin. **Ingen streaming-leak mulig** — det er ikke et tilfelle av
   «render og skjul», komponentene er fjernet fra treet. `PlayerKlubbhus` kjører ett query:
   `users.select('name').eq('id', role.userId)` — brukerens EGET navn. Ingen tellinger, ingen ledger,
   ingen roster.

3. **`/admin/games/new` (roster + e-post)** — `getRoleContext` → `if (!role.isAdmin) redirect('/opprett-spill')`
   på linje 80-82, FØR `getNewGameFormData()` (som returnerer hele bruker-rosteret m/e-post) kjøres i
   Suspense-bodyene (`PlayerShortageBanner:263`, `GameFormBody:306`). Lukket korrekt.

4. **Admin-only deep-links** — alle fem fortsatt hard-gatet med `requireAdmin` (som bouncer ikke-admin til
   `/` eller trusted til `/admin`): `app/admin/spillere/page.tsx:81`, `games/page.tsx:88`, `cup/page.tsx:57`,
   `formats/page.tsx:48`, `lanseringer/page.tsx:44`. Verifisert ved grep + lesing.

5. **Beskyttet back-office-stemme IKKE feil-rename't** — `lib/mail/registrationRequest.ts:86` beholder
   «Sekretariatet»; ledger-aktøren `who: 'Sekretariatet'` i `app/admin/page.tsx` beholdt. Begge bevisste,
   låst av tester. De gjenværende «Sekretariatet»-treffene i app/components er utelukkende kommentarer,
   CSS, test-navn og admin-intern action-stemme — ingen synlige nav/heading-etiketter.

6. **Proxy** — `proxy.ts:69-71` catch-all-matcher dekker `/admin`, så `getProxyVerifiedUserId()` får sin
   header der. Ingen endring i proxy/RLS/migrasjon (verifisert: name-only diff har ingen `.sql`/`proxy.ts`).

**Ingen sti funnet der en ikke-admin ser admin-only data.**

## Gates (faktisk kjørt)

- `npm run build` → **exit 0** (full route-tabell printet, ingen type/exhaustive-switch-feil).
- `npx vitest run components/ui/BottomNav.test.tsx lib/admin/auth.test.ts lib/mail/registrationRequest.test.ts "app/admin/games/[id]/actions.test.ts"` → **4 filer, 36 tester, alle grønne.** BottomNav-testen er oppdatert til å låse 4-fane-oppsettet + `also`-aktiv-state på `/admin`+`/klubbhuset`+`/opprett-spill` (den gamle «skjuler seg på admin»-testen korrekt invertert til «vises på Klubbhus-rommet»).
- `npx vitest run` (full suite) → **218 filer, 2657 tester, alle grønne.** Bekrefter implementer-påstanden eksakt.

## Out-of-scope / gold-plating

Ingen funnet. Diffen holder seg til kontrakten:

- Sub-rute-endringene (~24 admin-flater) er rent mekaniske: droppet ubrukt `getProxyVerifiedUserId`-import
  + `userId`-local (bjelle borte) og rename kicker. Ingen query-/gating-/logikk-endring smuglet inn.
- Ingen migrasjon, RLS-endring, `/admin`→`/klubbhuset`-rute-flytting eller Dexie-rename (alle eksplisitt
  ut av scope i §9). Verifisert via `git diff --name-only` (ingen `.sql`/`proxy.ts`).
- «Finn turneringer» er nå synlig for alle innloggede (før: kun ikke-create-brukere). Dette er en bevisst
  følge av at Hjem blir «play + discover»-navet (K9) og er dokumentert i CHANGELOG-oppføringen — i scope.
- CHANGELOG: ny `1.78.y`-serie m/korrekt tre-lags-struktur (tagline + Teknisk-details m/Added/Changed/
  Security/Removed). Forrige `1.77.y` foldet inn i «Opprettelse & påmelding»-drawer, drawer-tellingen
  bumpet 4 → 5 serier. `package.json` på 1.78.0. Alt velformet.

## Merknad (ikke blokkerende)

- **Kontrakt §8 oppfølgings-issue mangler.** Kontrakten ba om at et issue for den pre-eksisterende
  roster/e-post-eksponeringen i `getNewGameFormData()` for ikke-admin `/opprett-spill` (stammer fra #427,
  ikke #392) skulle opprettes «før merge». Søk i åpne issues (number/title) finner det ikke. Dette er en
  pre-eksisterende leak, ikke en regresjon fra #392, og påvirker ingen K-kriterium — men per CLAUDE.md
  «Reviewer-funn» bør issuet opprettes med milestone før PR-merge så funnet ikke forsvinner ut av kontekst.
  Anbefaling til hovedchatten: opprett issuet (type:enhancement, area:admin/security, milestone etter
  triage) før merge. Ikke grunn til NEEDS WORK på selve leveransen.
