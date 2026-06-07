# Spec: #485 — dedikert klubb-styringsflate for klubb-liga (delt LigaManagement-komponent)

**Issue:** [#485](https://github.com/jdlarssen/golf-app/issues/485) (oppfølging av [#483](https://github.com/jdlarssen/golf-app/issues/483) approach b, utsatt).
**Branch:** `claude/vibrant-euclid-be91af`.
**Type:** MINOR (ny bruker-synlig flate: klubb-admin styrer klubb-ligaen sin fra en `/klubber`-URL uten admin-chrome) → `1.87.0` → **`1.88.0`**.

## Problem

[#483](https://github.com/jdlarssen/golf-app/issues/483) ga klubb-eiere/-admins **full styring** av sin egen klubb-liga, men via approach **(a)**: gjenbruk av `/admin/liga/[id]`-styringssiden, gjort klubb-bevisst. Det fungerer, men en ikke-global-admin klubb-admin ser fortsatt en `/admin/liga/...`-URL og admin-chrome (`AdminShell`). Det bryter «én vei til rom» — klubb-ting hører hjemme under `/klubber`.

**Grunnmuren er allerede på plass (#483):** gaten `requireAdminOrClubAdminOfLeague`, alle 9 styrings-handlinger i `lib/league/actions.ts`, RLS-policyene (0083), klubb-bevisst deltaker-picker og chrome. Dette issuet er en ren **re-montering**: trekk styrings-UI-et ut til en delt komponent og gi klubb-admin en egen dør under `/klubber` — ingen ny RLS, ingen ny auth, ingen endring i handlingene.

## Prior Decisions (avklart med eier i denne runden)

- **Rute-navn:** `/klubber/[id]/liga/[ligaId]` (bar form, speiler `/admin/liga/[id]` direkte). `ny` (opprett) ligger allerede på `/klubber/[id]/liga/ny` som statisk segment → ingen kollisjon med `[ligaId]`.
- **Slett-flate speiles til klubb-rommet:** ny rute `/klubber/[id]/liga/[ligaId]/slett` med en delt `<LigaDeleteConfirm>`. Slik holder klubb-admin seg 100 % i klubb-chrome gjennom hele flyten (også sletting) — ellers lekker `/admin`-chrome i siste steg. (Akseptkriterium 1.)
- **Delt-komponent-plassering:** de to delte server-komponentene bor co-lokert i admin-rute-treet (`app/admin/liga/[id]/LigaManagement.tsx`, `app/admin/liga/[id]/slett/LigaDeleteConfirm.tsx`), og klubb-rutene importerer dem **cross-route** — identisk mønster som `/klubber/[id]/liga/ny` allerede bruker for `@/app/admin/liga/new/CreateLigaForm`. Ingen ny `components/league/`-kategori; de delte server-komponentene ligger ved siden av Liga*-klient-sub-komponentene de er avhengige av (`LigaRoundRow`, `LigaAddRound`, `LigaAddPlayers`, `LigaRemovePlayer`, `LigaStatusActions`).

## Design

### 1. Delt styrings-komponent — `app/admin/liga/[id]/LigaManagement.tsx` (NY)

Trekk **hele kroppen** fra dagens `app/admin/liga/[id]/page.tsx` (alt fra `getLigaSnapshot`-fetch til slett-lenken — info-kort, status-handlinger, runder, deltakere, slett-lenke, chrome) ut til en async server-komponent:

```ts
type LigaManagementVariant = 'admin' | 'club';
export async function LigaManagement({
  leagueId, userId, variant,
}: { leagueId: string; userId: string; variant: LigaManagementVariant }): Promise<JSX.Element>
```

- Komponenten gjør **all** fetching (snapshot, `getNewGameFormData`, klubbmedlemmer/venner, klubbnavn) og kaller `notFound()` om snapshot er null — flyttet uendret fra dagens page.
- **Gaten gjøres i ruten, ikke komponenten.** Ruten kaller `requireAdminOrClubAdminOfLeague(supabase, id)` og sender `userId` inn.
- **Variant-styrte forskjeller** (alt annet identisk):
  | | `admin` | `club` |
  |---|---|---|
  | Shell | `AdminShell` | `AppShell` |
  | TopBar `backHref` | `/admin/liga` | `/klubber/${groupId}` |
  | TopBar `kicker` | `clubName ?? 'Klubbhuset'` | `clubName ?? 'Klubbhuset'` |
  | Slett-lenke href | `/admin/liga/${leagueId}/slett` | `/klubber/${groupId}/liga/${leagueId}/slett` |
- BrassRibbon (`${groupId ? 'Klubb-liga' : 'Liga'} · ${status}`), info-kort, «Se sesong-tabellen →» (`/liga/${leagueId}`), status-handlinger, runder, deltakere: uendret, identisk i begge varianter.
- `groupId` for club-varianten er garantert satt (man når club-ruten via klubb-siden, og ligaen er klubb-scopet); defensiv fallback `?? '/klubber'` på backHref.

### 2. `app/admin/liga/[id]/page.tsx` → tynn (gate + delt komponent)

```tsx
export const dynamic = 'force-dynamic';
export default async function LigaDetailPage({ params }) {
  const { id } = await params;
  const supabase = await getServerClient();
  const { userId } = await requireAdminOrClubAdminOfLeague(supabase, id);
  return <LigaManagement leagueId={id} userId={userId} variant="admin" />;
}
```

### 3. Ny rute — `app/klubber/[id]/liga/[ligaId]/page.tsx` (NY)

```tsx
export const dynamic = 'force-dynamic';
export default async function KlubbLigaManagePage({ params }) {
  const { ligaId } = await params;            // [id] = klubb, [ligaId] = liga
  const supabase = await getServerClient();
  const { userId } = await requireAdminOrClubAdminOfLeague(supabase, ligaId);
  return <LigaManagement leagueId={ligaId} userId={userId} variant="club" />;
}
```

- Gaten slår opp ligaens `group_id` (admin-client) → klubb-liga → klubb-eier/-admin slipper inn; ikke-styrer redirectes (RLS er backstop). En frittstående liga (`group_id` null) ⇒ gaten faller til `requireAdmin` ⇒ ikke-global-admin redirectes til `/` (forventet — frittstående ligaer hører ikke hjemme under en klubb).

### 4. Delt slett-komponent — `app/admin/liga/[id]/slett/LigaDeleteConfirm.tsx` (NY)

Trekk kroppen fra dagens `app/admin/liga/[id]/slett/page.tsx` (banner, sletting-sammendrag med runde/deltaker/flight-tellinger, slett-knapp, avbryt) ut til:

```ts
export async function LigaDeleteConfirm({
  leagueId, variant, errorCode,
}: { leagueId: string; variant: 'admin' | 'club'; errorCode?: string }): Promise<JSX.Element>
```

- Henter `league` (legg til `group_id` i select) + tellinger; `notFound()` om league null.
- Variant-styrte forskjeller: Shell (`AdminShell`/`AppShell`), `backHref`/Avbryt-href (`/admin/liga/${leagueId}` vs `/klubber/${groupId}/liga/${leagueId}`).
- Form `action={handleDeleteLeague}` (uendret) → `deleteLeague` redirecter allerede til `/klubber/${groupId}` for klubb-liga. ERROR_MESSAGES/STATUS_WARNINGS-mappene flyttes inn i komponenten.

### 5. Flytt `handleDeleteLeague` → `lib/league/actions.ts`

Den tynne void-wrapperen flyttes fra `app/admin/liga/[id]/slett/actions.ts` til `lib/league/actions.ts` (ved siden av `deleteLeague`), så begge slett-rutene + den delte komponenten importerer fra ett nøytralt sted. Gammel `slett/actions.ts` slettes (blir død).

### 6. `app/admin/liga/[id]/slett/page.tsx` → tynn + ny `app/klubber/[id]/liga/[ligaId]/slett/page.tsx` (NY)

Begge: gate (`requireAdminOrClubAdminOfLeague`) + les `?error=` searchParam + render `<LigaDeleteConfirm leagueId variant=… errorCode=… />`.

### 7. «Styr»-lenke → klubb-rute — `app/klubber/[id]/ClubLeaguesSection.tsx`

`href={`/admin/liga/${liga.id}`}` → `href={`/klubber/${clubId}/liga/${liga.id}`}`. (Komponenten har allerede `clubId`.) Alle ligaene i denne seksjonen er klubb-scopet (filtrert på `group_id = clubId`), så lenken peker til klubb-ruten for alle (klubb-admin og global admin). Global admin når fortsatt `/admin/liga/[id]` via den globale lista.

## Edge Cases & Guardrails

- **Server-action-refresh:** status-handlingene (`startLeague`/`finishLeague`/…) returnerer `{error}` (ikke redirect) og kaller `revalidatePath('/admin/liga/${leagueId}')`. Begge styrings-ruter er `force-dynamic`, og en server-action invokert fra `<form>` re-rendrer **ruten den ble kalt fra** automatisk → klubb-ruten oppdateres etter hver handling uten endring i handlingene. `revalidatePath('/admin/liga/…')` er belt-and-suspenders (ingen page-cache på force-dynamic); `revalidatePath('/liga/…')` buster den offentlige sesong-tabellen. **`lib/league/actions.ts` trenger ingen endring** (utover flyttingen av `handleDeleteLeague`).
- **Rute-kollisjon:** `/klubber/[id]/liga/ny` (statisk `ny`) tar presedens over `/klubber/[id]/liga/[ligaId]` (dynamisk) i Next 16 — ingen kollisjon. `[ligaId]` matcher kun UUID-er.
- **Annen klubbs / frittstående liga via direkte URL på klubb-ruten:** gaten slår opp ligaens faktiske `group_id`. Frittstående → `requireAdmin` → ikke-global redirectes. Annen klubbs → `requireAdminOrClubAdmin` mot den klubben → ikke-admin der redirectes. RLS backstop på alle skriv (uendret fra #483).
- **`getLigaSnapshot` er admin-client (RLS-bypass)** — komponenten viser data uansett; gaten foran avgjør tilgang. Konsistent med dagens design og #483.
- **Confused-deputy:** uendret fra #483 — gaten autoriserer på `league_id`, RLS evaluerer barn-radens faktiske parent-liga.

## Key Decisions

- **Ren re-montering, ikke gjenoppbygging** — gate/handlinger/RLS fra #483 er urørt; kun UI flyttes til delt komponent + ny dør. Speiler #483-kontraktens egen begrunnelse for å utsette dette.
- **Cross-route import av delt komponent fra admin-treet** — følger `CreateLigaForm`-presedensen eksakt; minst overraskende, holder delt server-komponent ved siden av sine klient-avhengigheter.
- **Variant-prop framfor to kopier** — `'admin' | 'club'` styrer kun shell + 2–3 href-er; alt innhold deles (akseptkriterium 2: ingen duplisering).
- **Slett speiles fullt ut** — for å holde akseptkriterium 1 («ingen /admin-chrome») gjennom hele flyten, ikke bare på hovedsiden.

**Claude's Discretion:**
- Eksakt prop-form (om `groupId`/`clubName` beregnes i komponenten via snapshot vs sendes inn) — komponenten henter snapshot uansett, så den utleder `groupId`/`clubName` selv.
- Om `LigaManagement` tar `userId` som prop (for venne-fallback på frittstående) eller henter det selv — sender det inn fra gaten (gaten returnerer det allerede).
- CHANGELOG-tema/serie-struktur (ny `## 1.88.y`-serie vs utvid Klubb-liga-temaet) per `docs/changelog-conventions.md`.
- Humanizer-pass på evt. ny/endret norsk bruker-rettet copy (forventer minimal ny copy — dette er en flytting).

## Success Criteria

- [ ] Delt `<LigaManagement>` finnes; **både** `/admin/liga/[id]` og `/klubber/[id]/liga/[ligaId]` rendrer den (ingen duplisert styrings-markup). Verifikasjon: fil finnes, begge page-er importerer den, `grep` viser at info-kort/runder/deltaker-JSX kun finnes i den delte komponenten.
- [ ] Ny rute `/klubber/[id]/liga/[ligaId]` gatet til `requireAdminOrClubAdminOfLeague`, rendrer `variant="club"` i `AppShell`, `backHref → /klubber/[id]`. Verifikasjon: kode + preview.
- [ ] **Klubb-admin (is_admin=false) styrer sin klubb-liga fra `/klubber`-URL uten admin-chrome** (`AppShell`, ingen `AdminShell`). Verifikasjon: kode + live gate-probe/preview.
- [ ] Delt `<LigaDeleteConfirm>` finnes; **begge** slett-ruter rendrer den; ny `/klubber/[id]/liga/[ligaId]/slett` gatet, `AppShell`, Avbryt → klubb-styringsruta; sletting redirecter til klubb-siden. Verifikasjon: kode + preview.
- [ ] «Styr»-lenke på «Klubbens ligaer» → `/klubber/[clubId]/liga/[ligaId]` (ikke `/admin`). Verifikasjon: oppdatert Type-C-test (`ClubLeaguesSection`) + preview.
- [ ] Global admin styrer fortsatt alle ligaer via `/admin/liga/[id]` (`AdminShell`); `/admin/liga`-lista uendret. Verifikasjon: kode + preview.
- [ ] MINOR-bump `1.88.0` + CHANGELOG.

## Gates

- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `npm run build` — Compiled successfully
- [ ] `npx vitest run app/klubber app/admin/liga lib/league` + endrede co-lokerte tester grønne
- [ ] `npm run lint` — 0 errors
- [ ] `.githooks/pre-commit` ingen humanizer-advarsler på nye norske bruker-rettede strenger
- [ ] Live gate-probe: klubb-admin (is_admin=false) når `/klubber/[id]/liga/[ligaId]` for egen klubb-liga (renders), avvises på annen klubbs/frittstående; global admin når `/admin/liga/[id]`
- [ ] Preview-røyktest (Safari): klubb-admin → klubb-side → «Styr» → klubb-styringsside (ingen admin-chrome) → start/avslutt → slett-bekreftelse i klubb-chrome

## Files Likely Touched

- `app/admin/liga/[id]/LigaManagement.tsx` — **NY** (delt styrings-kropp)
- `app/admin/liga/[id]/page.tsx` — tynn (gate + `<LigaManagement variant="admin">`)
- `app/admin/liga/[id]/slett/LigaDeleteConfirm.tsx` — **NY** (delt slett-kropp)
- `app/admin/liga/[id]/slett/page.tsx` — tynn (gate + `<LigaDeleteConfirm variant="admin">`)
- `app/admin/liga/[id]/slett/actions.ts` — **slettes** (`handleDeleteLeague` flyttet)
- `lib/league/actions.ts` — `handleDeleteLeague`-wrapper flyttet hit
- `app/klubber/[id]/liga/[ligaId]/page.tsx` — **NY**
- `app/klubber/[id]/liga/[ligaId]/slett/page.tsx` — **NY**
- `app/klubber/[id]/ClubLeaguesSection.tsx` (+ `.test.tsx`) — «Styr» href → klubb-rute
- `package.json` + `CHANGELOG.md` (MINOR `1.88.0`)

---

## Status — self-eval (2026-06-07)

Bygd i 4 atomiske commits (`d7a1145` kontrakt · `ba70cc3` extract LigaManagement · `29fc3fe` extract LigaDeleteConfirm + flytt handleDeleteLeague · `fcc150f` feat klubb-flate + bump + CHANGELOG). Sluttilstand-gates: `tsc --noEmit` 0 · `vitest app/klubber app/admin/liga lib/league` 21/21 · `eslint` endrede filer 0 · `npm run build` ✓ (begge nye ruter registrert som ƒ dynamic).

- [x] **Delt `<LigaManagement>` finnes; begge ruter rendrer den, ingen duplisering.** `grep`: styrings-JSX («Sesong-modell», «Legg til deltakere», «Se sesong-tabellen») kun i `app/admin/liga/[id]/LigaManagement.tsx` (CreateLigaForm-treffet er opprett-wizarden, ikke styringskroppen). Importert av `app/admin/liga/[id]/page.tsx` + `app/klubber/[id]/liga/[ligaId]/page.tsx`.
- [x] **Ny rute `/klubber/[id]/liga/[ligaId]`** gatet til `requireAdminOrClubAdminOfLeague(ligaId)`, `variant="club"` → `AppShell`, `backHref` = `/klubber/${groupId}` (LigaManagement:127). Registrert i build-output.
- [x] **Klubb-admin styrer uten admin-chrome:** `variant === 'admin' ? AdminShell : AppShell` (LigaManagement.tsx:126) → club-varianten bruker `AppShell`. (Live auth'd preview blokkert lokalt: dev-server mangler Supabase-env, `proxy.ts:9` 500-er ALLE ruter før route-kode kjører — env-/seed-begrensning, ikke kode-defekt; build kompilerer alle ruter. Live UI → Vercel PR-preview/prod per prod-only-workflow.)
- [x] **Delt `<LigaDeleteConfirm>`; begge slett-ruter; club slett `AppShell` + redirect.** Liga-slett-JSX («Slett ligaen for alltid») kun i `LigaDeleteConfirm.tsx`. `deleteLeague` redirecter klubb-liga til `/klubber/${groupId}` (uendret). Avbryt/backHref club-variant → `/klubber/${groupId}/liga/${leagueId}`.
- [x] **«Styr» → `/klubber/${clubId}/liga/${liga.id}`** (ClubLeaguesSection.tsx:59); ingen `/admin/liga`-URL igjen i klubb-koden (kun cross-route komponent-imports). Type-C-test oppdatert + grønn.
- [x] **Global admin uendret:** `/admin/liga/[id]` `variant="admin"` → `AdminShell`; `/admin/liga`-lista (`app/admin/liga/page.tsx`) urørt.
- [x] **MINOR-bump `1.88.0`** + CHANGELOG ny serie «1.88.y — Klubb-liga · dedikert styringsflate», 1.87.y kollapset i Klubb-liga-skuffen («#480, #483 — 2 serier»).

**Avvik / merknad:** Ingen endring i `lib/league/actions.ts` utover å flytte `handleDeleteLeague` dit — gate/handlinger/RLS fra #483 er urørt (kontraktens kjerne-premiss). `backHref` for admin-varianten er klubb-bevisst (`groupId ? /klubber/${groupId} : /admin/liga`) framfor alltid `/admin/liga` som kontrakt-tabellen antydet — bevarer #483-sikkerhetsnettet for en klubb-admin på den gamle admin-URL-en, mindre variant-forgrening, innenfor «Claude's Discretion».
