# Spec: #524 — Klubb-scopet CUP (Fase 2 av epos #480)

**Issue:** [#524](https://github.com/jdlarssen/golf-app/issues/524) (Fase 2 av epos [#480](https://github.com/jdlarssen/golf-app/issues/480)). **Speiler** den ferdige klubb-LIGA-en: #480 Fase 1 (schema+RLS+opprett), #483 (full klubb-admin-styring), #485 (dedikert klubb-styringsflate, delt komponent).
**Branch:** `claude/wizardly-williams-94c855`
**Type:** MINOR (ny bruker-synlig capability: klubb-eier/-admin oppretter og kjører sin egen cup ende-til-ende; medlemmer ser den) → `1.105.4` → **`1.106.0`**
**Scope-valg (eier, denne runden):** «Full vertikal, klubb-URL» — hele kjeden opprett→generer→start/avslutt på en dedikert `/klubber/[id]/cup/[cupId]`-flate uten admin-chrome (mirror liga sin endestand, ikke to-stegs som liga ble bygd). Ærer «én vei til rom».

## Problem

Klubb-LIGA er ferdig: en klubb-eier/-admin oppretter og styrer sin egen liga, medlemmer ser den (#480/#483/#485, shippet). Klubb-CUP mangler den symmetriske behandlingen — cup kjøres fortsatt frittstående (deltakere = alle brukere, kun global admin oppretter). Denne fasen leverer den samme vertikalen for cup-domenet.

**Latent bug oppdaget + verifisert live (fikses som bivirkning):** `tournaments` har RLS på med **kun** `tournaments_select_authenticated` (`using(true)`) og **ingen write-policy**. Cup-handlingene (`lib/cup/actions.ts`) bruker request-scoped (`authenticated`) klient. En live RLS-probe som global admin gir `42501: new row violates row-level security policy`, og `tournaments`-tabellen i prod er **tom** — ingen cup har noensinne blitt opprettet via denne stien. Cup-skriving er altså ødelagt i dag. Write-policyen klubb-cup uansett må legge til (`is_admin() OR klubb-admin`) **gjenoppretter** frittstående cup-oppretting for global admin samtidig. Null regresjonsrisiko (ingen cup-data finnes).

## Research Findings

- **Mønstrene er verifisert mot shippet liga-kode (#480/#483/#485) + live DB**, ikke mot eksterne docs — det er den autoritative grunnen for denne kodebasens Next 16-konvensjoner:
  - Cross-route import av delt server-komponent fra admin-treet fungerer (`/klubber/[id]/liga/ny` importerer `@/app/admin/liga/new/CreateLigaForm`; `/klubber/[id]/liga/[ligaId]` importerer `LigaManagement` fra admin-treet). #485 verifiserte at statisk segment `ny` tar presedens over dynamisk `[ligaId]` i Next 16 — samme gjelder `cup/ny` vs `cup/[cupId]`.
  - Server-action invokert fra `<form>` re-rendrer ruten den ble kalt fra → `force-dynamic` klubb-ruter oppdateres etter hver handling uten endring i handlingene (#485 edge case, verifisert).
- **Live RLS-probe (denne runden):** `tournaments` har RLS på (`relrowsecurity=true`, ikke forced), `authenticated` har INSERT/UPDATE/DELETE table-grants, men ingen write-policy → authenticated insert nektes (`42501`). `is_admin()`, `is_group_member(uuid)`, `is_group_admin(uuid)` er alle `SECURITY DEFINER` og brukes allerede i leagues-policyene (0083).
- **Strukturell cup vs liga:** Liga velger deltakere ved opprettelse (`createLeagueDraft` inserter liga + `league_players`). Cup opprettes tomt (`createTournamentDraft` = navn/lag/poeng), kamper legges til separat i match-genererings-wizarden (`app/admin/cup/[id]/generer/`), som i dag henter spillere fra **alle** profil-fullførte `users`. Cup-kamper er `games`-rader med `tournament_id`-FK (ikke en egen barn-tabell). Derfor: medlems-sourcing skjer i genererings-wizarden, og det trengs **ingen** `tournament_group_id()` SECURITY DEFINER-helper (cup har ingen barn-tabell hvis WRITE-RLS må slå opp parent — match-`games` autoriseres via `created_by` = «games creator insert»-policyen).

## Prior Decisions (arvet fra liga-eposet)

- **Gates (`lib/admin/auth.ts`):** `requireAdminOrClubAdmin(supabase, clubId)` og `requireAdminOrClubAdminOfLeague(supabase, leagueId)` finnes. Cup får en søster: `requireAdminOrClubAdminOfCup(supabase, tournamentId)`.
- **Medlems-kilde:** `getClubMemberOptionsForClub(clubId)` (admin-client, e-post-fri `PlayerOption[]`) finnes og gjenbrukes.
- **Klubb-detalj `/klubber/[id]`:** medlems-gatet, eksponerer `myRole`, har `getClubDetail(supabase, id, userId)` + `isClubExpired(club.valid_until)` (lib/clubs/clubStatus.ts) + «Sett opp en runde»-knapp og en `ClubLeaguesSection`. Cup får en parallell `ClubCupsSection`.
- **Delt-komponent + variant-prop (#485):** styringsflaten trekkes ut til én delt server-komponent med `variant: 'admin' | 'club'` som kun styrer shell (`AdminShell`/`AppShell`) + 2–3 href-er; alt innhold deles. Slett speiles fullt ut til klubb-rommet. Gaten gjøres i ruten, ikke komponenten.
- **App-lag-gate på offentlig detalj:** snapshot bruker admin-client (RLS-bypass), så `/cup/[id]` må gate klubb-scopet cup i `page.tsx` (`notFound()`), ikke bare via RLS — speiler `/liga/[id]`.

## Design

### 1. Schema — `supabase/migrations/0089_tournaments_group_scoping.sql`

```sql
alter table public.tournaments
  add column group_id uuid references public.groups(id) on delete set null;
create index tournaments_group_id_idx on public.tournaments (group_id) where group_id is not null;
comment on column public.tournaments.group_id is
  'Valgfri klubb-tilknytning (#524, #480 F2). NULL = frittstående. Satt = klubb-cup: medlemmer ser den, klubb-admin styrer den.';

-- SELECT: frittstående synlig for alle innloggede (som i dag); klubb-scopet kun medlemmer + global admin.
drop policy "tournaments_select_authenticated" on public.tournaments;
create policy "tournaments select scoped" on public.tournaments for select to authenticated
  using (group_id is null or public.is_admin() or public.is_group_member(group_id));

-- WRITE: NY policy (ingen fantes → fikser også latent global-admin write-bug).
-- Frittstående (group_id null): global-admin-only. Klubb-cup: global admin ELLER klubb-admin.
create policy "tournaments admin or club-admin write" on public.tournaments for all to authenticated
  using (public.is_admin() or (group_id is not null and public.is_group_admin(group_id)))
  with check (public.is_admin() or (group_id is not null and public.is_group_admin(group_id)));
```

**Sikkerhet/regresjon:** Ingen cup-data finnes (prod tom), så ingen migrering/regresjon. `for all`-write-policyen dekker også SELECT, men OR-es permissivt med den dedikerte scoped-select (samme mønster som liga 0083 — bevist ufarlig). Match-`games` trenger ingen RLS-endring: klubb-admin inserter dem som `created_by = seg selv` via eksisterende «games creator insert».

### 2. Gate — `lib/admin/auth.ts` (ny `requireAdminOrClubAdminOfCup`)

Speil `requireAdminOrClubAdminOfLeague` eksakt, mot `tournaments`:
```ts
export async function requireAdminOrClubAdminOfCup(
  supabase: ServerSupabase, tournamentId: string,
): Promise<AdminRoleContext> {
  const { data } = await getAdminClient()
    .from('tournaments').select('group_id').eq('id', tournamentId).maybeSingle();
  const groupId = (data?.group_id as string | null | undefined) ?? null;
  return groupId ? requireAdminOrClubAdmin(supabase, groupId) : requireAdmin(supabase);
}
```

### 3. Opprett — gjenbrukbar cup-form + klubb-dør

- **Gjør cup-create-formen gjenbrukbar:** trekk cup-felt-kroppen (navn, lag-navn, points_to_win, allowance-toggles) fra `app/admin/games/new/CupSetup.tsx` til en `CreateCupForm`-komponent (eller gi `CupSetup` `groupId?`/`clubName?`-props og bruk den cross-route — Claude's Discretion hvilken som gir minst diff). Skjult felt `<input type="hidden" name="group_id" value={groupId ?? ''} />`. Når `clubName` satt: lite banner «Denne cupen settes opp for {clubName}. Bare klubbens medlemmer kan delta.» (humanizer-pass).
- **Ny rute `app/klubber/[id]/cup/ny/page.tsx`** (server): `requireAdminOrClubAdmin(supabase, id)`; `getClubDetail` for navn + `isClubExpired` → frossen klubb redirecter til `/klubber/[id]`; render formen med `groupId={id}`, `clubName`.
- **`createTournamentDraft` (lib/cup/actions.ts) blir klubb-bevisst** (mirror `createLeagueDraft`): les `group_id` fra formData; satt → `requireAdminOrClubAdminOfCup`-stil authz via `requireAdminOrClubAdmin(supabase, groupId)` + insert med `group_id`; tom → `requireAdmin` (frittstående). **Redirect-mål blir kontekst-bevisst:** klubb-sti → suksess til `/klubber/[id]/cup/[nyCupId]` (klubb-admin fortsetter i klubb-chrome for å generere kamper), feil til `/klubber/[id]/cup/ny?error=...`; frittstående-sti uendret (`/admin/cup/[id]` / `/admin/games/new?intent=cup&error=...`).

### 4. Match-generering — klubb-bevisst + delt

- **Delt komponent (#485-mønster):** trekk kroppen av `app/admin/cup/[id]/generer/page.tsx` til en delt server-komponent (f.eks. `app/admin/cup/[id]/generer/GenerateMatches.tsx`) med `variant: 'admin' | 'club'`. Komponenten gjør all fetching; gaten gjøres i ruten.
  - **Spiller-kilde:** `tournament.group_id` satt → `getClubMemberOptionsForClub(group_id)` (mappet til `WizardPlayer`-shape: `{id, displayName, hcpIndex}`); ellers alle profil-fullførte `users` som i dag.
  - **Variant-forskjeller:** shell (`AdminShell`/`AppShell`), `backHref` (`/admin/cup/[id]` vs `/klubber/[id]/cup/[cupId]`), kicker (klubbnavn for club).
- **Ny klubb-rute `app/klubber/[id]/cup/[cupId]/generer/page.tsx`:** `requireAdminOrClubAdminOfCup(supabase, cupId)` → `<GenerateMatches variant="club" …>`.
- **`createCupMatchesFromPlan` + manuell cup-match-sti:** bytt `requireAdmin` → `requireAdminOrClubAdminOfCup(supabase, tournamentId)` (les tournamentId først). **Medlems-guardrail (klubb-sti):** filtrer `player_ids` til faktiske klubbmedlemmer før games/game_players-insert (mirror liga sin medlems-filter). **Sett `group_id` på match-`games`** = cupens `group_id` (data-konsistens; nær gratis). Suksess-redirect kontekst-bevisst (club → `/klubber/[id]/cup/[cupId]`).

### 5. Styringsflate — delt `CupManagement` (#485-mønster)

- **Trekk hele kroppen** fra `app/admin/cup/[id]/page.tsx` (leaderboard-preview, roster, matches-liste, generer-knapp, start/avslutt, slett-lenke) til `app/admin/cup/[id]/CupManagement.tsx` med `variant: 'admin' | 'club'`. Komponenten henter snapshot + `notFound()`; gaten i ruten.
  - **Variant-forskjeller:** shell, `backHref` (`/admin/cup` vs `/klubber/[id]`), «Generer matcher» → riktig generer-rute, slett-lenke → riktig slett-rute.
  - **Club-variant skjuler de manuelle «+ Singles/Fourball/… match»-lenkene** (de peker til `/admin/games/new` = admin-chrome). Club legger til kamper KUN via generer-wizarden. Admin-variant beholder begge.
- **`app/admin/cup/[id]/page.tsx` → tynn:** `requireAdminOrClubAdminOfCup` + `<CupManagement variant="admin">`.
- **Ny `app/klubber/[id]/cup/[cupId]/page.tsx`:** `requireAdminOrClubAdminOfCup(supabase, cupId)` + `<CupManagement variant="club">`.
- **Styrings-handlinger** (`startTournament`, `finishTournament`, `updateTournament`, `deleteTournament`): bytt `requireAdmin` → `requireAdminOrClubAdminOfCup(supabase, id)` (les `id` fra formData først). Notifikasjons-fan-out uendret. `deleteTournament` redirect kontekst-bevisst (club → `/klubber/[id]`).

### 6. Slett — delt `CupDeleteConfirm` + klubb-rute

- Trekk kroppen fra `app/admin/cup/[id]/slett/page.tsx` til delt komponent med `variant`. Ny `app/klubber/[id]/cup/[cupId]/slett/page.tsx` (gate + club-variant, Avbryt → klubb-styringsruta). Dedikert konfirmasjons-side beholdes (per «destruktive handlinger = egen side»).

### 7. Medlems-flate — `ClubCupsSection` på `/klubber/[id]`

Mirror `ClubLeaguesSection`. `app/klubber/[id]/page.tsx`: hent `tournaments` der `group_id = id` (`select id, name, status, created_at`). Ny `ClubCupsSection` (+ Type-C-test): kort → `/cup/${cupId}` (offentlig) med status-chip; «Styr» → `/klubber/[id]/cup/[cupId]` kun for owner/admin (`canManage`); «Ny cup»-knapp kun owner/admin + `!frozen` → `/klubber/[id]/cup/ny`. Tom-tilstand: «Ingen cuper i klubben ennå.»

### 8. Offentlig detalj gates til medlemmer — `/cup/[id]` + snapshot

- `getCupSnapshot`: legg `group_id` i tournaments-select + `CupSnapshot.tournament`-typen.
- `app/cup/[id]/page.tsx`: etter snapshot, hvis `tournament.group_id` satt og betrakteren verken er medlem (`group_members`-oppslag på (group_id, userId)) eller global admin → `notFound()`.

### 9. Versjon

MINOR-bump `1.106.0` + CHANGELOG ny serie «1.106.y — Klubb-cup» (tre-lags, humanizer-pass på tagline). Ingen cup-flyt-diagram eksisterer i `docs/flows/` → ingen diagram-oppdatering (eget issue hvis ønskelig).

## Edge Cases & Guardrails

- **Latent write-bug:** ny write-policy gjenoppretter frittstående cup-oppretting (global admin) — verifiser med live insert-probe (rullet tilbake) før/etter.
- **Frossen klubb:** opprett-ruten redirecter bort; «Ny cup»-knapp skjult (mirror liga/«Sett opp runde»).
- **Global admin oppretter for klubb de ikke er medlem av:** `requireAdminOrClubAdmin` slipper dem (isAdmin); `getClubMemberOptionsForClub` henter medlemmer via admin-client uansett.
- **Klubb-admin poster manipulerte player_ids i generering:** server-filter til faktiske medlemmer (RLS på match-`games` er creator-basert, ikke medlems-basert, så server-filteret er den reelle guardrailen her — viktig).
- **Confused-deputy (manipulert tournament_id i handling):** gaten autoriserer på tournament_id; RLS på `tournaments` (UPDATE/DELETE `using`-clause evaluerer radens faktiske `group_id`) er backstop. Gate = UX, RLS = sikkerhet.
- **Annen klubbs / frittstående cup via direkte klubb-URL:** gaten slår opp cupens faktiske `group_id`; frittstående → `requireAdmin` → ikke-global redirectes; annen klubbs → redirect til den klubben. RLS backstop.
- **Ikke-medlem åpner klubb-cup-lenke `/cup/[id]`:** `notFound()`.
- **Rute-presedens:** `cup/ny` (statisk) vs `cup/[cupId]` (dynamisk) — statisk vinner i Next 16 (#485-verifisert for liga).
- **`/admin/cup`-LISTEN forblir global-admin-only** (lister ALLE cuper); klubb-admin når sin cup via «Styr» fra klubb-siden.

## Key Decisions

- **Full vertikal med dedikert klubb-URL (eier-valg):** speiler liga sin endestand (#480+#483+#485 fusjonert), ikke liga sin tre-stegs byggehistorikk. Klubb-admin holder seg 100 % i klubb-chrome (opprett→generer→styr→slett).
- **Ingen `tournament_group_id()` SECURITY DEFINER-helper:** cup har ingen barn-tabell hvis WRITE-RLS må slå opp parent — match-`games` autoriseres via `created_by`. Enklere enn liga.
- **Medlems-sourcing i genererings-wizarden, ikke ved opprettelse:** følger cup-domenets to-stegs natur. Server-filter til medlemmer = reell guardrail (games-RLS er creator-basert).
- **Club-variant skjuler manuelle per-match `/admin/games/new`-lenker:** holder klubb-flyten i klubb-chrome; kamper legges til via generer-wizarden.
- **Write-bug fikses som bivirkning, ikke som eget issue:** policyen må uansett legges til; å utelate den ville la cup-oppretting forbli ødelagt.

**Claude's Discretion:**
- Om cup-create-formen gjenbrukes ved å gi `CupSetup` props vs ved å trekke ut en `CreateCupForm` (velg minste diff; mirror `CreateLigaForm`-presedensen).
- Eksakt plassering/markup for delte komponenter (følg `LigaManagement`/`LigaDeleteConfirm`-co-lokering i admin-treet) + klubb-banner/«Klubbens cuper»-copy (humanizer-pass).
- Om klubbnavn-kicker slås opp i ruten/komponenten eller foldes inn i `getCupSnapshot`.
- Om creator forhåndsvelges i generering (default: nei — cup-arrangør er ikke nødvendigvis spiller).
- CHANGELOG-serie-struktur per `docs/changelog-conventions.md`.

## Success Criteria

- [ ] Migrasjon `0089_tournaments_group_scoping.sql` (group_id + scoped SELECT + admin/klubb-admin WRITE) lagt til **og applyt** (rollback-tx-validert); `lib/database.types.ts` har `tournaments.group_id`. Verifikasjon: `grep group_id lib/database.types.ts` treffer tournaments-blokken; `list_migrations` viser 0089.
- [ ] **Write-bug fikset:** global admin kan opprette en frittstående cup (live insert-probe som authenticated global admin lykkes nå; var `42501` før). Verifikasjon: RLS-probe rullet tilbake, dokumentert i eval.
- [ ] Klubb-eier/admin oppretter klubb-cup fra `/klubber/[id]` («Ny cup» → `/klubber/[id]/cup/ny`); cupen får `group_id = klubben`; lander på `/klubber/[id]/cup/[cupId]`. Verifikasjon: DB-rad + preview-røyktest.
- [ ] Match-genererings-pickeren viser **kun klubbens medlemmer** for klubb-cup; server-filter avviser ikke-medlemmer. Verifikasjon: kilde = `getClubMemberOptionsForClub`; preview + kode.
- [ ] Klubb-admin (is_admin=false) styrer hele kjeden (generer→start→avslutt→slett) fra `/klubber/[id]/cup/[cupId]`-flater **uten admin-chrome** (`AppShell`). Verifikasjon: live RLS+gate-probe + preview.
- [ ] Delt `CupManagement`/`GenerateMatches`/`CupDeleteConfirm` finnes; både admin- og klubb-ruter rendrer dem (ingen duplisert styrings-markup). Verifikasjon: `grep` viser styrings-JSX kun i de delte komponentene; begge ruter importerer dem.
- [ ] Klubbmedlemmer ser «Klubbens cuper» på `/klubber/[id]`; «Ny cup»/«Styr» kun owner/admin. Verifikasjon: Type-C render-test + preview.
- [ ] RLS håndhevet: medlem SELECT-er klubb-cup, ikke-medlem ikke; klubb-admin INSERT-er, vanlig medlem avvises; frittstående uendret synlig. Ikke-medlem på `/cup/[id]`-klubb-lenke → `notFound()`. Verifikasjon: `execute_sql`-prober som ulike auth.uid() + app-lag-gate.
- [ ] MINOR-bump `1.106.0` + CHANGELOG-serie.

## Gates

- [ ] `npx tsc --noEmit` — 0 errors (nye union/Record dekket; `tournaments.group_id` i typene)
- [ ] `npm run build` — Compiled successfully (Vercel-paritet; alle nye ruter registrert)
- [ ] `npx vitest run lib/cup app/klubber app/admin/cup` + endrede co-lokerte tester grønne
- [ ] `npm run lint` — 0 errors i endrede filer
- [ ] `.githooks/pre-commit` ingen humanizer-advarsler på nye norske bruker-rettede strenger
- [ ] Live RLS+gate-probe (rullet tilbake): write-bug-fix + klubb-admin styrer egen klubb-cup, avvist på frittstående/annen klubbs
- [ ] Preview-røyktest (Safari): klubb-admin → klubb-side → «Ny cup» → opprett → generer 2 matcher (kun medlemmer i picker) → start → avslutt; alt i klubb-chrome. Ikke-medlem → `/cup/[id]` gir 404
- [ ] Migrasjon applyt til prod via Supabase MCP; `get_advisors` (security) uten nye finding-klasser på `tournaments`

## Files Likely Touched

- `supabase/migrations/0089_tournaments_group_scoping.sql` (ny) + `lib/database.types.ts` (regenerert)
- `lib/admin/auth.ts` — `requireAdminOrClubAdminOfCup`
- `lib/cup/actions.ts` — `createTournamentDraft` klubb-sti + kontekst-redirect; `start/finish/update/deleteTournament` gate-bytte + kontekst-redirect
- `lib/cup/getCupSnapshot.ts` — `group_id` i select + type
- `app/admin/games/new/CupSetup.tsx` (el. ny `CreateCupForm`) — `groupId`/`clubName`-props + skjult felt + banner
- `app/admin/cup/[id]/CupManagement.tsx` (ny delt) + `page.tsx` → tynn
- `app/admin/cup/[id]/generer/GenerateMatches.tsx` (ny delt) + `page.tsx` → tynn; `generer/actions.ts` gate + medlems-filter + group_id på games
- `app/admin/cup/[id]/slett/CupDeleteConfirm.tsx` (ny delt) + `page.tsx` → tynn
- `app/klubber/[id]/cup/ny/page.tsx` (ny) · `cup/[cupId]/page.tsx` (ny) · `cup/[cupId]/generer/page.tsx` (ny) · `cup/[cupId]/slett/page.tsx` (ny)
- `app/klubber/[id]/ClubCupsSection.tsx` (ny + `.test.tsx`) + `app/klubber/[id]/page.tsx` — cup-fetch + seksjon
- `app/cup/[id]/page.tsx` — medlems-gate for klubb-scopet cup
- `package.json` + `CHANGELOG.md` (MINOR `1.106.0`)

## Out of Scope (egne issues / oppfølging)

- **Demokratisert frittstående cup-oppretting** (ikke-admin, uten klubb) — eget issue (samme avgjørelse som for liga).
- **Klubb-scopede varsler/mail til alle medlemmer** (cup-start/-slutt-kunngjøring klubb-bredt) — eksisterende deltaker-varsler (#417/#377) er uendret og dekker deltakerne; klubb-bred kunngjøring deferres (liga deferret tilsvarende).
- **Cup-flyt-diagram** i `docs/flows/` (eksisterer ikke for cup i dag) — eget issue hvis ønskelig.
- **Klubb-cup på medlemmenes profil/historikk.**
