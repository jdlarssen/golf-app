# Forge-kontrakt: #392 — Klubbhuset, universell bunn-nav-fane med rolle-gating på flatene inne

**Issue:** [#392](https://github.com/jdlarssen/golf-app/issues/392)
**Branch:** `claude/naughty-chatterjee-a2c054`
**Milestone:** Klubb-skala (epic)
**Type:** enhancement · area:ui · area:pwa

---

## 1. Mål (én setning)

Gjør `/admin` om til ett felles **Klubbhuset**-rom som alle innloggede når via en ny, universell 4. bunn-nav-fane — der en vanlig spiller møter et lite utvalg (Spill + Baner med oppretting), mens admin ser nøyaktig det samme som i dagens Sekretariat.

## 2. Eier-beslutninger (fra brainstorming 2026-06-05)

Tre avklaringer fra eier styrer designet (alle var «Other»-svar — eierens egne ord):

1. **Admin-modell:** «Klubbhuset skal lenke til /admin, men en vanlig bruker skal ikke se alt som admin ser der.» → Fanen peker på `/admin`. Rommet åpnes for alle innloggede; innholdet gates per rolle.
2. **Create-dører:** «Det må inn i admin (altså klubbhuset). Opprett spill/bane flyttes inn i spill/baner.» → Opprett spill bor i Spill-seksjonen, Opprett bane i Baner-seksjonen. De frittstående Hjem-dørene fjernes.
3. **Navn:** «Klubbhuset overalt.» → Rename den synlige «Sekretariatet»-etiketten → «Klubbhuset».

## 3. Modell vi bygger

**Ett rom, ett navn.** `/admin` ER Klubbhuset. Den universelle bunn-nav-fanen «Klubbhuset» peker på `/admin`. Hver innlogget bruker slipper inn; tile-griden inni filtreres på rolle (mønsteret finnes allerede: `app/admin/page.tsx:259` brancher `role.isAdmin ? [...] : [...]`).

| Rolle | Hva de ser i Klubbhuset (`/admin`) |
|-------|-------------------------------------|
| **Admin** | Uendret fra i dag: hilsen + full tile-grid (Spill, Spillere, Baner, Resultatprotokoll, Lanseringer, Cuper, Formats) + aktivitets-ledger. |
| **Trusted creator** | Spill-tile (→ `/klubbhuset`, egne spill) + Baner-tile (→ `/admin/courses`, full). Ingen ledger/admin-tellinger. |
| **Vanlig spiller** | Spill-tile (→ `/klubbhuset`, egne arrangerte spill + Opprett spill) + Baner-tile (→ `/opprett-bane`). Ingen ledger/admin-tellinger. |

Create-dørene bor allerede inne i seksjonene: admin sin Spill → `/admin/games` (har «+ Nytt»), Baner → `/admin/courses` (har «+ Ny bane»); for ikke-admin er `/klubbhuset` Spill-flaten (har «Sett opp ny runde» → `/opprett-spill`) og `/opprett-bane` er Baner-flaten. Arbeidet her er å **eksponere disse for ikke-admin og fjerne de konkurrerende Hjem-dørene**, ikke å bygge nye create-flyter.

## 4. Sikkerhets-grunnlag (audit utført 2026-06-05)

Å åpne `/admin`-layouten gjør hver sub-rutes egen gate bærende. Audit-funn:

- **Server-actions (40 stk, 17 filer): allerede 100 % self-gatet.** Ingen herding nødvendig — migrasjonen var forberedt i kode (flere filer har «prepares for lifting the admin-layout-gate»-kommentarer).
- **Sider: 23 av 24 self-gater.** Eneste hull: **`app/admin/games/new/page.tsx`** — kun auth-gate, og `getNewGameFormData()` returnerer hele bruker-rosteret med e-poster. **Må herdes** (legg til `requireAdmin` → bounce ikke-admin til `/opprett-spill`).
- **Dashboard-data:** `app/admin/page.tsx` sin `TilesGrid` (tellinger) og `ActivityLedger` (all aktivitet) er admin-data. Vanlig-spiller-grenen må **ikke** kjøre disse — egen, minimal render.
- **Pre-eksisterende funn (ut av scope):** `/opprett-spill` deler `getNewGameFormData()` → ikke-admin får hele roster+e-post i spiller-velgeren. Stammer fra #427, ikke fra #392. Opprett eget issue (se §8).

## 5. Suksess-kriterier (K1–K12)

> Hvert kriterium krysses av med bevis (fil:linje, kommando-output, eller observert oppførsel i preview).

### Sikkerhet & gating
- [ ] **K1 — Rommet åpnes trygt.** `app/admin/layout.tsx` gater ikke lenger på rolle; den krever kun innlogging (redirect `/login` hvis utlogget). En ny, ikke-redirigerende `getRoleContext(supabase)` i `lib/admin/auth.ts` returnerer `AdminRoleContext` uten å redirigere bort ikke-admins.
- [ ] **K2 — Eneste leak lukket.** `app/admin/games/new/page.tsx` kaller `requireAdmin(supabase)` (ikke-admin → `/opprett-spill`). Verifisert: ingen `/admin/*`-side renderer admin-data (roster/e-post, all-games, all-users, ledger) for en vanlig innlogget bruker. Alle admin-only sub-ruter (`/admin/spillere`, `/admin/cup`, `/admin/formats`, `/admin/lanseringer`, `/admin/games`) bouncer fortsatt en vanlig bruker som deep-linker (egne `requireAdmin`-gates intakte).

### Klubbhuset-dashboard (`/admin`)
- [ ] **K3 — Rolle-delt dashboard.** `app/admin/page.tsx` bruker `getRoleContext`. Admin-grenen er uendret (hilsen + full tile-grid + ledger). Ikke-admin-grenen rendrer en minimal Klubbhuset: hilsen + Spill-tile + Baner-tile, **uten** ActivityLedger og **uten** admin-tellings-queries.
- [ ] **K4 — Tile-mål per rolle.** Vanlig spiller: Spill → `/klubbhuset`, Baner → `/opprett-bane`. Trusted creator: Spill → `/klubbhuset`, Baner → `/admin/courses`. Admin: uendret.
- [ ] **K5 — `/klubbhuset` er Spill-flaten.** `app/klubbhuset/page.tsx` sin overskrift/kicker re-merkes fra «Klubbhuset» til en Spill-identitet (f.eks. «Spill» / «Spillene dine») så rommet (Klubbhuset) og seksjonen (Spill) ikke kolliderer i navn. Innhold + create-knapp uendret.

### Bunn-nav
- [ ] **K6 — 4. fane.** `components/ui/BottomNav.tsx` har en universell «Klubbhuset»-fane (→ `/admin`) med eget ikon, synlig for alle innloggede. Aktiv-state dekker `/admin`, `/klubbhuset`, `/opprett-spill`, `/opprett-bane`. `/admin`-eksklusjonen i `hidden` er fjernet; baren forblir skjult på login, complete-profile og hull-skjerm.
- [ ] **K7 — Nytt ikon.** Et `KlubbhusIcon` (bygg/klubbhus) i `components/icons/Icons.tsx`, visuelt distinkt fra `HjemIcon`, samme stroke-stil som øvrige ikoner.
- [ ] **K8 — Shell-padding.** `components/ui/AdminShell.tsx` reserverer bunn-padding for baren (samme `calc(5rem + env(safe-area-inset-bottom))`-mønster som `AppShell`), så innhold ikke scroller under baren.

### Rydding av konkurrerende dører
- [ ] **K9 — Hjem ryddet.** `app/page.tsx` fjerner: `secretariatLink`, `klubbhusetLink`, den midlertidige `courseCreateLink` («Mangler en bane?»), og begge «Opprett spill»-knappene (tom-state + vedvarende). Tom-tilstanden for en ny bruker peker mildt mot Klubbhuset så ingen blir strandet uten vei til å opprette. Død kode/imports (f.eks. `createdCountRes`, `canCreateGame`) fjernes.
- [ ] **K10 — Profil ryddet.** `app/profile/page.tsx` fjerner `<SettingRow href="/klubbhuset" label="Klubbhuset" />` (fanen dekker det).

### Navn, bjelle, copy, docs
- [ ] **K11 — Bjelle + rename.** Den nå-overflødige `NotificationBell` fjernes fra admin-TopBar-ene (slutt å sende `userId` til TopBar på admin-flatene; Innboks-fanen dekker varsler der inne). Synlige «Sekretariatet»-navigasjons/overskrift-etiketter er rename't til «Klubbhuset». (Admin-intern stemme som «Saksbehandler»-hilsen beholdes — det er ikke ordet «Sekretariatet».)
- [ ] **K12 — Gates grønne + flyt levende.** `npm run build` grønn, berørte co-lokerte tester grønne, ny norsk copy kjørt gjennom `humanizer`. `docs/user-flows.md` §0 (routing) oppdatert til 4-fane-bunn-nav med Klubbhuset som universelt rom + create inne. MINOR version-bump + CHANGELOG-oppføring på den bruker-synlige commit-en (commit-msg-hook håndhever).

## 6. Gates (kjøres scopet til det som er endret)

```bash
# Rask iterasjon under bygging:
npx tsc --noEmit
npx vitest run <co-lokerte testfiler for endrede komponenter>

# Før integrerende commit / evaluering:
npm run build            # fanger exhaustive-switch/Record-hull (jf. tsc-gate-trap-memory)
npx vitest run           # full suite hvis nav/shared komponenter rørt
```

- **humanizer** på alle nye/endrede norske strenger (tile-meta, tom-state-pekere, kicker-rename) før commit.
- **Version/CHANGELOG:** ett MINOR-bump for #392, på commit-en som gjør featuren bruker-synlig (fanen dukker opp). Plumbing-commits (rolle-helper, layout-åpning, herding) som ennå ikke er nåbare bruker prefiks `refactor(...)` så commit-msg-hooken ikke krever bump på hver.
- **Worktree-hook-fix (engang, før første commit):** `git config --worktree core.hooksPath .githooks`.

## 7. Foreslått chunk-rekkefølge (subagent-drevet for de substansielle)

1. **Rolle-plumbing + åpne rommet** *(refactor)*: `getRoleContext` i `lib/admin/auth.ts`; `app/admin/layout.tsx` auth-only; herd `app/admin/games/new/page.tsx` (K1, K2).
2. **Klubbhuset-dashboard** *(rolle-delt render)*: `app/admin/page.tsx` minimal ikke-admin-gren + rename + bjelle-fjerning på dashboard-TopBar; re-merk `/klubbhuset` (K3, K4, K5, del av K11).
3. **Bunn-nav + ikon + shell** : `KlubbhusIcon`, 4. fane, fjern `/admin`-eksklusjon, AdminShell-padding (K6, K7, K8).
4. **Bjelle-fjerning resten av admin-TopBar-ene + Sekretariatet→Klubbhuset rename** (~23 flater) (resten av K11).
5. **Rydd Hjem + Profil-dører** *(bruker-synlig flip — bærer MINOR-bump + CHANGELOG)* (K9, K10).
6. **Docs + flyt** : `docs/user-flows.md` §0; verifiser hele K12.

Rekkefølgen holder hvert mellomtrinn trygt: rommet er åpnet og minimalt for ikke-admin før noen fane annonserer det; den bruker-synlige flip-en (fane + Hjem-rydding) kommer til slutt.

## 8. Oppfølgings-issues (opprettes før merge, jf. CLAUDE.md «Reviewer-funn»)

- **Roster/e-post-scoping for ikke-admin create:** `getNewGameFormData()` gir hele `users`-rosteret med e-poster til `/opprett-spill` (ikke-admin). Pre-eksisterende fra #427. Spiller-velgeren trenger neppe e-poster. Eget issue, milestone etter triage.

## 9. Eksplisitt UT av scope

- Ingen migrasjon av `/admin/*`-ruter til `/klubbhuset/*` (eier-modellen beholder `/admin`-stien; comment 2 sier «mest nav-arbeid, ikke greenfield»).
- Ingen «mine baner»-liste for vanlige brukere (comment 1 punkt 3 var en «vurder» — #366 ga bevisst create-only). Baner-tile for vanlig bruker = `/opprett-bane`.
- Ingen endring i RLS eller datamodell.
- Ingen rename av selve `/admin`-URL-en eller Dexie-DB.
- Admin-intern «Saksbehandler»/protokoll-stemme beholdes; kun den navigasjonelle «Sekretariatet»-etiketten rename's.

## 10. Risiko & vakter

- **Sikkerhet:** den ene farlige endringen er å åpne layouten. Vakt: K2 + en eksplisitt evaluator-sjekk at en ikke-admin på `/admin` ikke ser ledger/tellinger/roster, og at deep-link til `/admin/spillere` etc. bouncer.
- **UX-regresjon:** å fjerne «Opprett spill» fra Hjem er en reell endring i kjerne-loopen. Vakt: K9 sin tom-state-peker + at fanen alltid er ett tap unna.
- **Navne-kollisjon:** rommet og Spill-seksjonen het begge «Klubbhuset». Vakt: K5 re-merker `/klubbhuset`.
