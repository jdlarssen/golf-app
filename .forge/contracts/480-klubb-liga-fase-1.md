# Spec: #480 Fase 1 — grunnmur + klubb-liga (group_id på leagues, klubb-admin oppretter, medlemmer ser)

**Issue:** [#480](https://github.com/jdlarssen/golf-app/issues/480) (epos, splittet ut fra #464). **Bygger på** #464 (`getClubMemberPlayerOptions`, `selectablePlayers`) og liga-epos #452/#453 (som eksplisitt utsatte «klubb-kobling» til «Fase 3»).
**Branch:** `claude/pedantic-dhawan-38ecf2`
**Type:** MINOR (ny bruker-synlig feature: klubb-eier/admin kan opprette en liga for klubben sin; medlemmer ser den) → `1.85.0` → **`1.86.0`**
**Fase:** 1 av epos. **F2 = klubb-CUP** (eget barne-issue, gjenbruker grunnmuren her). Demokratisert frittstående liga-oppretting = eget issue. (Begge avklart med eier i kontrakt-runden.)

## Problem

Cup og liga kjøres i dag frittstående: deltakere = venner, og **bare global admin (Jørgen)** kan opprette dem. Eier vil at en **klubb skal kunne kjøre sine egne konkurranser** — klubb-eiere/-admins setter opp, klubbmedlemmer ser og deltar. Men `leagues` (`0080`) har ingen `group_id` (kommentaren sier selv «Fase 3 utvider med klubb-medlemskap»), og det finnes ingen auth-vei for en klubb-admin (som ikke er global admin) til å opprette noe — `/admin/liga/new` er `requireAdmin`-gatet. Denne fasen leverer **den ene vertikalen ende-til-ende for liga**: schema + RLS-grunnmur, en klubb-admin-gate, opprett-inngang på klubb-siden, medlems-sourcet deltaker-picker, og en medlems-synlig liste over klubbens ligaer.

## Prior Decisions (arvet + avklart i denne runden)

- **#464:** `getClubMemberPlayerOptions(userId)` (admin-client, e-post-fri `PlayerOption[]` + `memberIdsByClub`) finnes; liga-opprett bruker allerede `getFriendPlayerOptions` for frittstående. Picker-kilde-som-ren-fn er etablert.
- **#453 (liga F1):** liga-skriv var admin-only (`is_admin()`), `getLigaSnapshot` er admin-client (RLS-bypass), `/liga/[id]` er offentlig (innlogget). «Demokratisert (ikke-admin) liga-opprettelse» + «klubb-kobling» var bevisst utsatt.
- **#442/#50:** klubb-detalj `/klubber/[id]` er medlems-gatet (RLS `is_group_member`), eksponerer `myRole` (owner/admin/member), og har allerede owner/admin-only seksjoner + en «Sett opp en runde for klubben»-knapp → `/opprett-spill?klubb=`. `is_group_member()`/`is_group_admin()` er `SECURITY DEFINER` (0074). Klubb-oppretting forblir global-admin-only (ikke rørt her).
- **Eier-beslutninger (denne runden):** (1) klubb-cup/klubb-liga opprettes av **klubb-eiere/-admins**; (2) **medlems-flate bygges nå** (medlemmer ser klubbens ligaer + offentlig detalj gates til medlemmer for klubb-scopede); (3) cup-kamp-sourcing = klubbmedlemmer — men **cup er Fase 2**, ikke denne runden; (4) frittstående liga forblir admin-only her (egen sak).

## Design

### 1. Schema — `supabase/migrations/0083_leagues_group_scoping.sql`

`leagues` additivt + RLS-omskriving (mal: `games.group_id` i `0075`, RLS-stil i `0080`):

```sql
alter table public.leagues
  add column group_id uuid references public.groups(id) on delete set null;
create index leagues_group_id_idx on public.leagues (group_id) where group_id is not null;
comment on column public.leagues.group_id is
  'Valgfri klubb-tilknytning (#480 F1). NULL = frittstående (venner). Satt = klubb-liga: medlemmer ser den, klubb-admin styrer den.';

-- SELECT: frittstående synlig for alle (som i dag); klubb-scopet kun medlemmer + global admin.
drop policy "leagues select authenticated" on public.leagues;
create policy "leagues select scoped" on public.leagues for select to authenticated
  using (group_id is null or public.is_admin() or public.is_group_member(group_id));

-- WRITE: global admin alt; klubb-admin kun rader scopet til en klubb de admin-er.
-- Frittstående (group_id null) forblir admin-only (demokratisering utsatt → eget issue).
drop policy "leagues admin write" on public.leagues;
create policy "leagues admin or club-admin write" on public.leagues for all to authenticated
  using (public.is_admin() or (group_id is not null and public.is_group_admin(group_id)))
  with check (public.is_admin() or (group_id is not null and public.is_group_admin(group_id)));

-- Helper: parent-ligaens group_id, SECURITY DEFINER for å unngå RLS-rekursjon på barn-tabellene.
create or replace function public.league_group_id(p_league_id uuid) returns uuid
  language sql security definer stable set search_path = ''
  as $$ select group_id from public.leagues where id = p_league_id $$;
grant execute on function public.league_group_id(uuid) to authenticated;

-- league_rounds + league_players WRITE: global admin ELLER klubb-admin av parent-ligaens klubb.
-- (SELECT på barn-tabellene forblir `using(true)` — uendret; lesing går via admin-client-snapshot.)
drop policy "league_rounds admin write" on public.league_rounds;
create policy "league_rounds admin or club-admin write" on public.league_rounds for all to authenticated
  using (public.is_admin() or (public.league_group_id(league_id) is not null and public.is_group_admin(public.league_group_id(league_id))))
  with check (public.is_admin() or (public.league_group_id(league_id) is not null and public.is_group_admin(public.league_group_id(league_id))));

drop policy "league_players admin write" on public.league_players;
create policy "league_players admin or club-admin write" on public.league_players for all to authenticated
  using (public.is_admin() or (public.league_group_id(league_id) is not null and public.is_group_admin(public.league_group_id(league_id))))
  with check (public.is_admin() or (public.league_group_id(league_id) is not null and public.is_group_admin(public.league_group_id(league_id))));
```

**Sikkerhet/regresjon:** Eksisterende ligaer beholder `group_id = null` → SELECT `group_id is null` → fortsatt synlig for alle (ingen regresjon). WRITE: global admin skriver fortsatt alt. Ingen data-migrering. `0080`-policy-navnene er verifisert eksakte (`"leagues select authenticated"`, `"leagues admin write"`, `"league_rounds admin write"`, `"league_players admin write"`).

### 2. Auth-helper — `lib/admin/auth.ts` (ny `requireAdminOrClubAdmin`)

Speil `requireAdminOrCreator` (samme fil): global admin passerer; ellers må kaller være `owner`/`admin` i `group_members` for `clubId`; ellers `redirect('/klubber/${clubId}')`.

```ts
export async function requireAdminOrClubAdmin(
  supabase: ServerSupabase, clubId: string,
): Promise<AdminRoleContext> {
  const ctx = await loadRole(supabase);
  if (ctx.isAdmin) return ctx;
  const { data } = await supabase
    .from('group_members').select('role')
    .eq('group_id', clubId).eq('user_id', ctx.userId).maybeSingle();
  if (data?.role === 'owner' || data?.role === 'admin') return ctx;
  redirect(`/klubber/${clubId}`);
}
```

### 3. Klubb-spesifikk medlems-kilde — `lib/clubs/getClubMemberOptionsForClub.ts` (ny)

`getClubMemberPlayerOptions(userId)` er scopet til **kallerens egne** klubber → en global admin som ikke er medlem av målklubben ville fått tom liste. Ny helper henter medlemmene i **én spesifikk klubb** (admin-client, e-post-fri, samme `PlayerOption`-mapping som #464):

```ts
export async function getClubMemberOptionsForClub(clubId: string): Promise<PlayerOption[]>
```
Henter `group_members.user_id` for `clubId` → de brukernes e-post-frie `PlayerOption`-felt (id/name/nickname/hcp_index/pending/gender/level). Best-effort (tom ved feil), per #464-mønsteret.

### 4. Opprett-inngang — ny rute `/klubber/[id]/liga/ny`

`app/klubber/[id]/liga/ny/page.tsx` (server):
- `const { userId } = await requireAdminOrClubAdmin(supabase, id);`
- `getClubDetail(supabase, id, userId)` for `club.name` + frossen-sjekk; `notFound()` hvis null; hvis `isClubExpired(club.valid_until)` → `redirect('/klubber/${id}')` (frossen klubb tar ikke nye ligaer, speiler «Sett opp runde»-gatingen).
- Parallelt: `getNewGameFormData()` (kun `courses`) + `getClubMemberOptionsForClub(id)`.
- `me` = medlems-raden med `id === userId` (null hvis ikke medlem); `invitable = [me?, ...members uten userId]`.
- Render `<CreateLigaForm courses={courses} players={invitable} meId={me?.id ?? null} groupId={id} clubName={club.name} />`.

### 5. `CreateLigaForm` — klubb-bevisst (`app/admin/liga/new/CreateLigaForm.tsx`)

To nye valgfrie props: `groupId?: string`, `clubName?: string`.
- Skjult felt: `<input type="hidden" name="group_id" value={groupId ?? ''} />` (alltid; tom = frittstående).
- Når `clubName` satt: et lite informasjons-kort/banner øverst — «Denne ligaen settes opp for {clubName}. Bare klubbens medlemmer kan delta.» — og deltaker-seksjonens hjelpetekst sier «medlemmer» i stedet for «vennene dine» (kontekst-bevisst copy; humanizer-pass).
- Ingen annen logikk endres: `players`-proppen (allerede medlems-sourcet av siden) driver pickeren som før.

### 6. Server-action — `createLeagueDraft` aksepterer klubb-sti (`lib/league/actions.ts`)

Generaliser authz (i dag hardkodet `requireAdmin`):
```ts
const rawGroupId = str(formData, 'group_id');
let userId: string; let groupId: string | null = null;
if (rawGroupId) {
  ({ userId } = await requireAdminOrClubAdmin(supabase, rawGroupId)); groupId = rawGroupId;
} else {
  ({ userId } = await requireAdmin(supabase));   // frittstående forblir admin-only
}
```
- Legg `group_id: groupId` i `leagues`-insert-objektet.
- **Medlems-guardrail (klubb-sti):** når `groupId` satt, filtrer `playerIds` til faktiske medlemmer av klubben (query `group_members` for `groupId`, behold snitt) før `league_players`-insert. Hindrer at en klubb-admin poster ikke-medlemmer. Oppretters egen rad bekreftes (`acceptedAtForActor`) som før.
- RLS er forsvar-i-dybden: selv om authz-helperen skulle omgås, avviser «leagues/…_players admin or club-admin write»-policyene innsetting utenfor klubben.

### 7. Medlems-flate — `/klubber/[id]` (`app/klubber/[id]/page.tsx`)

Ny seksjon «Klubbens ligaer» (alle medlemmer ser; runner som innlogget bruker → ny SELECT-RLS slipper medlemmer til):
```ts
const { data: clubLeagues } = await supabase
  .from('leagues').select('id, name, status, season_start, season_end')
  .eq('group_id', id).order('created_at', { ascending: false });
```
- Render hver liga som et kort → lenke til `/liga/${league.id}` med status-merke (gjenbruk eksisterende status-label-mønster).
- Tom-tilstand: kort hint «Ingen ligaer i klubben ennå.»
- **«Ny liga»-knapp** kun for owner/admin (`isAdmin` i siden) og `!frozen` → `/klubber/${id}/liga/ny`. Plasseres sammen med/over «Sett opp en runde for klubben».

### 8. Offentlig detalj gates til medlemmer — `/liga/[id]` + snapshot

- `getLigaSnapshot`: legg `group_id` i `leagues`-select-strengen + `LeagueRow`-typen (`group_id: string | null`).
- `app/liga/[id]/page.tsx`: etter snapshot, **hvis `league.group_id` satt** og betrakteren verken er medlem (`group_members`-oppslag på (group_id, userId)) eller global admin → `notFound()`. (Snapshot bruker admin-client som omgår RLS, så denne app-laget-sjekken er det som faktisk skjuler klubb-ligaer for utenforstående på den lenke-delbare siden.)

### 9. Flyt-diagram + versjon

- Oppdater `docs/flows/06-liga-fremtid.svg` med klubb-liga-grenen (klubb-admin oppretter fra klubb-siden; medlemmer ser) + regenerer PNG per `docs/flows/README.md`.
- MINOR-bump `1.86.0` + CHANGELOG ny serie «1.86.y — Klubb-liga» (tre-lags, humanizer-pass på tagline).

## Edge Cases & Guardrails

- **Frossen klubb (`valid_until` utløpt):** opprett-ruten redirecter bort; «Ny liga»-knapp skjult — speiler eksisterende «Sett opp runde»-frysing.
- **Global admin oppretter for klubb de ikke er medlem av:** `requireAdminOrClubAdmin` slipper dem (isAdmin), `getClubMemberOptionsForClub` henter klubbens medlemmer uansett (admin-client), `me=null` → admin forhåndsvelges ikke (de er arrangør, ikke spiller). Korrekt.
- **Klubb-admin poster manipulerte `player_ids`:** server-filter til faktiske medlemmer + RLS-write-policy = dobbel sperre.
- **Medlem (ikke admin) prøver opprett-ruten:** `requireAdminOrClubAdmin` → redirect til klubb-siden.
- **Ikke-medlem åpner `/liga/[id]`-lenke til klubb-liga:** `notFound()`.
- **Eksisterende frittstående ligaer:** `group_id=null` → uendret synlighet/skriving (ingen regresjon).
- **Barn-tabell-RLS-rekursjon:** unngått via `SECURITY DEFINER league_group_id()`.
- **`/admin/liga/[id]`-styring (rediger runder, legg til deltakere etterpå, vindu-override) forblir global-admin-only denne fasen** — klubb-admin oppretter med alle medlemmer valgt opp front; dypere klubb-admin-styring = oppfølging (Out of Scope).

## Key Decisions

- **Ny rute `/klubber/[id]/liga/ny`** (ikke gjenbruk av `/admin/liga/new`): `/admin/*`-treet self-gates med `requireAdmin`; klubb-konteksten hører hjemme på klubb-siden, og URL-en bærer klubben eksplisitt.
- **Gjenbruk `CreateLigaForm` med 2 valgfrie props** framfor egen klubb-form: minste diff, ett vedlikeholdspunkt; siden mater riktig `players`.
- **Egen `getClubMemberOptionsForClub(clubId)`** framfor `getClubMemberPlayerOptions(userId)`: sistnevnte er kaller-klubb-scopet og ville sviktet for global admin på fremmed klubb.
- **Frittstående liga forblir admin-only** (group_id null → write krever `is_admin()`): demokratisering er bevisst eget issue (eier-valg).
- **App-lag-gate på `/liga/[id]`** (ikke bare RLS): snapshot er admin-client, så RLS alene skjuler ikke den offentlige siden.

**Claude's Discretion:**
- Eksakt redirect-mål i `requireAdminOrClubAdmin` for ikke-medlem (klubb-side vs `/klubber`).
- Eksakt copy/markup for klubb-banner i form + «Klubbens ligaer»-seksjon (gjenbruk eksisterende kort/badge-mønstre; humanizer-pass).
- Om medlems-gaten på `/liga/[id]` leser `users.is_admin` direkte eller via `getRoleContext`.
- Om creator forhåndsvelges (kun hvis medlem) — default: ja hvis medlem.

## Success Criteria

- [ ] Migrasjon `0083_leagues_group_scoping.sql` (group_id + scoped SELECT-RLS + admin/klubb-admin WRITE på leagues/rounds/players + `league_group_id()`-helper) lagt til **og applyt** (rollback-tx-validert først); `lib/database.types.ts` har `leagues.group_id`. Verifikasjon: `grep group_id lib/database.types.ts` treffer leagues-blokken; `list_migrations` viser 0083.
- [ ] Klubb-eier/admin oppretter en klubb-liga fra `/klubber/[id]` («Ny liga» → `/klubber/[id]/liga/ny`); ligaen får `group_id = klubben`. Verifikasjon: DB-rad `leagues.group_id` satt; preview-røyktest.
- [ ] Deltaker-pickeren i klubb-liga-opprett viser **kun klubbens medlemmer** (ikke venner, ikke hele basen). Verifikasjon: `getClubMemberOptionsForClub` mates inn; preview viser medlemsliste.
- [ ] Klubbmedlemmer ser «Klubbens ligaer» på `/klubber/[id]` med lenke til `/liga/[id]`; «Ny liga» kun for owner/admin. Verifikasjon: Type-C render-test (medlem ser liste uten knapp; admin ser knapp) + preview.
- [ ] RLS håndhevet: klubbmedlem SELECT-er klubb-ligaen, ikke-medlem gjør ikke; klubb-admin INSERT-er klubb-liga, vanlig medlem avvises; frittstående liga uendret synlig. Verifikasjon: `execute_sql`-prober som ulike `auth.uid()` (set local role/claims) ELLER logisk policy-gjennomgang dokumentert i eval.
- [ ] Ikke-medlem som åpner en klubb-liga-lenke `/liga/[id]` får `notFound()`; medlem/admin ser den. Verifikasjon: app-lag-gate i `page.tsx` + preview.
- [ ] `requireAdminOrClubAdmin` gater opprett-ruten (medlem→redirect, admin/klubb-admin→inn). Verifikasjon: kode-gjennomgang + preview-røyktest.
- [ ] Flyt-diagram `06-liga-fremtid.svg`/`.png` oppdatert; MINOR-bump `1.86.0` + CHANGELOG-serie.

## Gates

- [ ] `npx tsc --noEmit` — 0 errors (nye union/Record dekket; `LeagueRow.group_id` lagt til)
- [ ] `npm run build` — Compiled successfully (Vercel-paritet; ingen «pre-existing»-filtrering)
- [ ] `npx vitest run lib/league app/klubber` + endrede co-lokerte tester grønne
- [ ] `npm run lint` passerer
- [ ] `.githooks/pre-commit` ingen humanizer-advarsler på nye norske strenger
- [ ] Preview-røyktest (Safari mobil): som klubb-admin → `/klubber/[id]` → «Ny liga» → opprett (2 medlemmer, 1 runde) → ligaen vises i «Klubbens ligaer» → `/liga/[id]` viser den; som ikke-medlem → samme lenke gir 404
- [ ] Migrasjon applyt til prod via Supabase MCP (rollback-tx-validert), `get_advisors` (security) uten nye funn på de endrede tabellene

## Files Likely Touched

- `supabase/migrations/0083_leagues_group_scoping.sql` (ny) + `lib/database.types.ts` (regenerert)
- `lib/admin/auth.ts` — `requireAdminOrClubAdmin`
- `lib/clubs/getClubMemberOptionsForClub.ts` (ny)
- `app/klubber/[id]/liga/ny/page.tsx` (ny rute)
- `app/admin/liga/new/CreateLigaForm.tsx` — `groupId`/`clubName`-props + skjult felt + kontekst-copy
- `lib/league/actions.ts` — `createLeagueDraft` klubb-sti + medlems-filter
- `app/klubber/[id]/page.tsx` — «Klubbens ligaer»-seksjon + «Ny liga»-knapp (+ Type-C test)
- `lib/league/getLigaSnapshot.ts` — `group_id` i select + `LeagueRow`
- `app/liga/[id]/page.tsx` — medlems-gate for klubb-scopet liga
- `docs/flows/06-liga-fremtid.svg` (+ PNG) · `package.json` + `CHANGELOG.md` (MINOR `1.86.0`)

## Out of Scope (egne issues / Fase 2)

- **Klubb-CUP** (group_id på `tournaments`, klubb-cup-opprett fra klubb-siden, cup-kamper arver klubb + medlems-sourcing, medlems-cup-flate) — **#480 Fase 2** (eget barne-issue, gjenbruker `requireAdminOrClubAdmin` + RLS-mønsteret).
- **Demokratisert frittstående liga-oppretting** (alle brukere oppretter ikke-klubb-liga, ny ikke-admin inngang + creator-RLS) — eget issue.
- **Klubb-admin post-opprett-styring** av klubb-liga (rediger runder, legg til/fjern deltakere etterpå, vindu-override fra klubb-siden) — `/admin/liga/[id]` forblir global-admin-only denne fasen.
- Klubb-scopede varsler/mail (runde-åpner, liga-start) til medlemmer.
- Klubb-liga på medlemmenes profil/historikk.
