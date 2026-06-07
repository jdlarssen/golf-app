# Spec: #483 — klubb-admin styrer sin egen klubb-liga (league-aware gate, full styring)

**Issue:** [#483](https://github.com/jdlarssen/golf-app/issues/483) (oppfølging av [#480](https://github.com/jdlarssen/golf-app/issues/480) Fase 1).
**Branch:** `claude/pedantic-dhawan-38ecf2` (#480 Fase 1 er merget til `main`).
**Type:** MINOR (ny bruker-synlig capability: klubb-eier/-admin kan nå starte, avslutte og styre sin egen klubb-liga) → `1.86.1` → **`1.87.0`**

## Problem

#480 Fase 1 lar en klubb-eier/-admin **opprette** en klubb-liga, men **styringen** (start utkast→aktiv, avslutt, rediger/legg til runder, legg til/fjern deltakere, vindu-override, slett) skjer på `/admin/liga/[id]` + `lib/league/actions.ts`, som alle er `requireAdmin`-gatet (kun global admin). Så en klubb-admin oppretter et utkast, men kan ikke kjøre sin egen liga — global admin (Jørgen) må gjøre alt etter opprettelse. Det bryter «klubben kjører sin egen konkurranse»-autonomien.

**Grunnmuren er allerede på plass:** migrasjon `0083` (#480) sine WRITE-policyer tillater **allerede** en klubb-admin å skrive `leagues`/`league_rounds`/`league_players` for sin egen klubb (verifisert med live RLS-probe). Eneste reelle blokker er `requireAdmin`-gatene i app-laget.

## Prior Decisions (avklart med eier i denne runden)

- **Approach (a): gjenbruk `/admin/liga/[id]`**, gjort klubb-bevisst, framfor en dedikert `/klubber`-flate nå. Begrunnelse: gate-arbeidet (9 handlinger) er likt uansett rute, og styrings-kontrollene er allerede gjenbrukbare komponenter, så en senere dedikert flate er en re-montering — ikke en gjenoppbygging. Den dedikerte flaten files som **oppfølgings-issue** (sporet, bygges hvis pilot-en sier fra om admin-chrome).
- **Omfang: full styring** — start, avslutt, legg til/fjern deltakere (fra klubbmedlemmer), rediger + legg til runder, vindu-override, slett.
- **`/admin/liga`-LISTEN forblir global-admin-only** (den lister ALLE ligaer). Klubb-admin når sin liga via «Styr»-lenke fra «Klubbens ligaer» på klubb-siden.
- **Frittstående liga uendret** (`group_id` null → global-admin-only styring som før).
- Arvet fra #480: `requireAdminOrClubAdmin(supabase, clubId)`, `getClubMemberOptionsForClub(clubId)`, `getLigaSnapshot` (bærer `group_id`).

## Design

### 1. Ny league-aware gate — `lib/admin/auth.ts`

```ts
export async function requireAdminOrClubAdminOfLeague(
  supabase: ServerSupabase, leagueId: string,
): Promise<AdminRoleContext> {
  // Faktisk group_id-oppslag via admin-client (authz-beslutning skal ikke
  // avhenge av RLS-synlighet); null = frittstående → global-admin-only.
  const admin = getAdminClient();
  const { data } = await admin.from('leagues').select('group_id').eq('id', leagueId).maybeSingle();
  const groupId = data?.group_id ?? null;
  return groupId
    ? requireAdminOrClubAdmin(supabase, groupId)   // klubb-admin ELLER global admin
    : requireAdmin(supabase);                       // frittstående: global admin
}
```

### 2. Bytt gate i styrings-flatene + handlingene

- **`app/admin/liga/[id]/page.tsx`** og **`app/admin/liga/[id]/slett/page.tsx`**: `requireAdmin(supabase)` → `requireAdminOrClubAdminOfLeague(supabase, id)`.
- **`lib/league/actions.ts`** — i hver styrings-handling: les `league_id` fra formData **først**, deretter `requireAdminOrClubAdminOfLeague(supabase, leagueId)` i stedet for `requireAdmin`. Gjelder: `updateLeagueRound`, `addLeagueRound`, `overrideRoundWindow`, `addLeaguePlayers`, `removeLeaguePlayer`, `startLeague`, `finishLeague`, `deleteLeague`, og intern `setLeagueStatus(leagueId, …)`. `createLeagueDraft` håndterer allerede sin egen `group_id`-authz (#480) — urørt.

### 3. Klubb-bevisst deltaker-kilde + chrome — `app/admin/liga/[id]/page.tsx`

- **Deltaker-kilde:** når `snapshot.league.group_id` er satt → `getClubMemberOptionsForClub(group_id)` (klubbens medlemmer); ellers `getFriendPlayerOptions(userId)` som før. Mates til `LigaAddPlayers`. `LigaAddPlayers` tom-tilstand gjøres kontekst-bevisst (klubb → «ingen andre medlemmer»; venner → «legg til venner»-lenke) via en liten prop.
- **Chrome:** når klubb-scopet, `TopBar backHref` → `/klubber/${group_id}` og `kicker` → klubbnavnet (slå opp `groups.name` via admin-client), pluss en liten «Klubb-liga: {navn}»-indikator. Frittstående: uendret (`/admin/liga`-tilbake). Beholder `AdminShell` (akseptert admin-chrome-tradeoff, jf. Prior Decisions).

### 4. «Styr»-lenke på klubb-siden — `app/klubber/[id]/ClubLeaguesSection.tsx`

- Ny prop `canManage: boolean` (= owner/admin). Når true, får hvert liga-kort en «Styr»-lenke → `/admin/liga/[ligaId]` (i tillegg til den offentlige `/liga/[id]`-lenken som alle medlemmer har). Klubb-siden sender `canManage={isAdmin}`.

## Edge Cases & Guardrails

- **Confused-deputy (mismatched `league_id` + `round_id`/`user_id`):** gaten autoriserer på `league_id`, men selve skrivingen går via request-scoped klient → **RLS er sannheten**: WRITE-policyene på `league_rounds`/`league_players` evaluerer barn-radens FAKTISKE parent-liga (via `league_group_id()`). En klubb-admin som prøver å redigere en annen ligas runde blir avvist av RLS uansett hva gaten sa. Gaten = UX (redirect ikke-styrere); RLS = sikkerhet.
- **Frittstående liga + klubb-admin:** `group_id` null → gaten faller til `requireAdmin` → ikke-global redirectes. Uendret.
- **Klubb-admin når global liga-liste:** `/admin/liga` (liste) er fortsatt `requireAdmin` — de ser ikke andres ligaer. De når kun sin egen via direktelenke fra klubb-siden.
- **Annen klubbs liga via direkte URL:** `requireAdminOrClubAdminOfLeague` slår opp den ligaens `group_id`, klubb-admin er ikke admin der → redirect til `/klubber/[den-klubben]` (eller, hvis ikke medlem, redirect-målet i `requireAdminOrClubAdmin`). RLS backstop på alle skriv.
- **Slett:** klubb-admin kan slette sin egen klubb-liga (cascade rounds+players). RLS DELETE-policy tillater det (klubb-admin av ligaens klubb). Dedikert konfirmasjons-side beholdes (`/slett`).
- **`getLigaSnapshot` er admin-client (RLS-bypass)** — styrings-siden viser data uansett; gaten foran avgjør tilgang. Konsistent med dagens design.

## Key Decisions

- **Gjenbruk `/admin/liga/[id]` (eier-valg)** framfor dedikert flate nå — minimal kode, full styring umiddelbart, ingen UI-duplisering; dedikert `/klubber`-flate = oppfølging.
- **Én league-aware gate** (`requireAdminOrClubAdminOfLeague`) i stedet for å spre `group_id`-oppslag i hver handling — én sannhetskilde, speiler `requireAdminOrCreator`-mønsteret.
- **RLS er sikkerhets-grensa, gaten er UX** — derfor er gate-på-`league_id` trygt selv ved manipulerte round/user-felt.
- **Deltaker-kilde følger ligaens kontekst** (klubbmedlemmer for klubb-liga) — speiler #464/#480-prinsippet.

**Claude's Discretion:**
- Eksakt markup/plassering for «Styr»-lenke + «Klubb-liga»-indikator + klubb-tom-tilstand i `LigaAddPlayers` (gjenbruk eksisterende mønstre; humanizer-pass på ny norsk copy).
- Om `LigaAddPlayers`-tom-tilstanden styres av en `sourceKind`-prop eller `isClubLeague`-boolean.
- Om klubbnavn-oppslaget gjøres i page-en eller foldes inn i `getLigaSnapshot`.

## Success Criteria

- [ ] `requireAdminOrClubAdminOfLeague(supabase, leagueId)` finnes; null-`group_id` → `requireAdmin`, satt → `requireAdminOrClubAdmin`. Verifikasjon: kode + `grep`.
- [ ] Alle 9 styrings-handlinger + `setLeagueStatus` + styrings-siden + slett-siden bruker den nye gaten (ikke `requireAdmin` direkte). Verifikasjon: `grep -n requireAdmin lib/league/actions.ts app/admin/liga/[id]` viser kun den nye helperen (+ `createLeagueDraft`s frittstående-gren) der det er klubb-relevant.
- [ ] **Klubb-admin (is_admin=false) kan starte/avslutte/styre sin egen klubb-liga; ikke en annen klubbs eller en frittstående.** Verifikasjon: live RLS+gate-probe (status-update som klubb-admin lykkes på egen klubb-liga, avvises på frittstående/annen).
- [ ] Styrings-sidens deltaker-picker viser **klubbmedlemmer** for klubb-liga (ikke venner). Verifikasjon: kilde = `getClubMemberOptionsForClub` når `group_id` satt; preview.
- [ ] Klubb-bevisst chrome: klubb-liga-styringssiden har tilbake-lenke til klubb-siden + klubbnavn-kicker. Verifikasjon: kode + preview.
- [ ] «Styr»-lenke vises på «Klubbens ligaer» kun for eier/admin → `/admin/liga/[ligaId]`. Verifikasjon: oppdatert Type-C-test (`ClubLeaguesSection`: `canManage` true → «Styr»-lenke; false → ingen) + preview.
- [ ] Frittstående liga-styring uendret (global-admin-only). Verifikasjon: gate faller til `requireAdmin`; preview/kode.
- [ ] MINOR-bump `1.87.0` + CHANGELOG (ny serie, forrige kollapset).

## Gates

- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `npm run build` — Compiled successfully
- [ ] `npx vitest run app/klubber lib/league` + endrede co-lokerte tester grønne
- [ ] `npm run lint` — 0 errors
- [ ] `.githooks/pre-commit` ingen humanizer-advarsler på nye norske *bruker-rettede* strenger
- [ ] Live RLS+gate-probe: klubb-admin starter/avslutter egen klubb-liga; avvist på frittstående/annen klubbs liga (alt rullet tilbake)
- [ ] Preview-røyktest (Safari): som klubb-admin → klubb-side → «Styr» → start liga → avslutt; deltaker-picker viser medlemmer

## Files Likely Touched

- `lib/admin/auth.ts` — `requireAdminOrClubAdminOfLeague`
- `lib/league/actions.ts` — gate-bytte i 9 handlinger + `setLeagueStatus` (les `league_id` før gate)
- `app/admin/liga/[id]/page.tsx` — gate + klubb-bevisst deltaker-kilde + chrome (+ klubbnavn-oppslag)
- `app/admin/liga/[id]/slett/page.tsx` — gate
- `app/admin/liga/[id]/LigaAddPlayers.tsx` — kontekst-bevisst tom-tilstand (liten prop)
- `app/klubber/[id]/ClubLeaguesSection.tsx` (+ `.test.tsx`) — `canManage` + «Styr»-lenke
- `app/klubber/[id]/page.tsx` — send `canManage`
- `package.json` + `CHANGELOG.md` (MINOR `1.87.0`)

---

## Status — self-eval (2026-06-07)

Bygd i 4 atomiske commits (`69c2c6d` kontrakt · `f88a824` gate+actions · `e7ad081` styringsside · `83d6ab3` Styr-lenke+bump). Sluttilstand-gates: `tsc --noEmit` 0 · `vitest app/klubber + lib/league` 21/21 · `lint` 0 errors · `build` ✓.

- [x] **`requireAdminOrClubAdminOfLeague`** finnes (`lib/admin/auth.ts`): admin-client group_id-oppslag → null=`requireAdmin`, satt=`requireAdminOrClubAdmin`.
- [x] **Alle 9 handlinger + side + slett bruker den nye gaten.** `grep` i `lib/league/actions.ts`: eneste `requireAdmin(supabase)` igjen er `createLeagueDraft`s frittstående-gren; alle styrings-handlinger bruker `requireAdminOrClubAdminOfLeague`. Side + slett-side byttet.
- [x] **Klubb-admin styrer kun sin egen klubb-liga (live RLS-probe, rullet tilbake).** Klubb-admin (is_admin=false) UPDATE status→active: egen klubb-liga **1**, annen klubbs **0**, frittstående **0**. RLS er sikkerhets-grensa under app-gaten.
- [x] **Picker = klubbmedlemmer på styringssiden for klubb-liga.** Kilde = `getClubMemberOptionsForClub(group_id)` når satt; `LigaAddPlayers` tom-tilstand klubb-bevisst. `addLeaguePlayers` filtrerer til medlemmer.
- [x] **Klubb-bevisst chrome.** TopBar `backHref`=`/klubber/${group_id}`, kicker=klubbnavn, BrassRibbon «Klubb-liga · …» når klubb-scopet. Slett + deleteLeague redirecter til klubb-siden.
- [x] **«Styr»-lenke kun for eier/admin** → `/admin/liga/[ligaId]`. Type-C-test (`canManage` true → 2 «Styr»-lenker m/ rett href; false → ingen).
- [x] **Frittstående uendret** (gate faller til `requireAdmin`; probe: frittstående-start avvist for klubb-admin).
- [x] **MINOR-bump `1.87.0`** + CHANGELOG ny serie «1.87.y», forrige 1.86.y kollapset.

**Avvik / merknad:** `/admin/liga`-LISTEN forblir global-admin-only (bevisst — klubb-admin når kun egen liga via «Styr»). Dedikert klubb-styringsflate under `/klubber` er bevisst utsatt (eier-valg) — files som oppfølging.

## Out of Scope (egne issues / oppfølging)

- **Dedikert klubb-styringsflate** under `/klubber/[id]/liga/[ligaId]` (ingen admin-chrome) via en delt `<LigaManagement>`-komponent — eget oppfølgings-issue (eier-valg: bygges hvis pilot-en sier fra).
- Demokratisert frittstående liga-oppretting/-styring for alle brukere — eget issue.
- Klubb-CUP (#480 Fase 2).
- Klubb-scopede varsler/mail til medlemmer.
