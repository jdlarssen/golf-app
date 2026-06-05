# Spec: Klubb-eierskap, delegering & tilgangsstyring (#50)

**Issue:** [#50](https://github.com/jdlarssen/golf-app/issues/50) · `enhancement` · `blocks-club-scale`
**Milestone:** Klubb-skala (epic) · **Branch:** `claude/brave-maxwell-d03dbe`
**Substrat:** #49 (`groups`/`group_members`/`group_role`, 0074) + #442 (klubb-UI, RPCer, discovery, 0075) — begge shipped i dag.

> **Scope-utvidelse mot opprinnelig issue-tittel:** Issuet het «utnevner med-admins (delegering)». Under
> kontrakt-diskusjonen (2026-06-05) utvidet eieren modellen til også å dekke **tilgangsstyring**: klubb-
> opprettelse gates til hoved-admin, som oppretter og overfører klubber til brukere med en avtale (medlemstak
> + varighet). Det er bevisst og avtalt — closing-kommentaren og issue-en oppdateres til å reflektere dette.

## Problem
#442 shippet **åpen** klubb-opprettelse (enhver bruker kan lage inntil 2 klubber). Eieren vil gate dette:
store norske klubber skal ikke bare kunne opprette en klubb og bruke Tørny gratis — opprettelse skal gå via
en avtale med hoved-admin (Jørgen), som et monetiserings-anker. Samtidig mangler #442 selve **delegeringen**:
en klubb-eier kan ikke utnevne med-eiere/admins, og #442s «Overfør eierskap først»-feilmeldinger peker på en
escape-hatch som ikke finnes ennå. #50 leverer begge: (a) admin-gated opprettelse + overføring med avtale-
rammer (medlemstak, varighet), og (b) eier-drevet rolle-delegering inne i klubben.

## Eier-beslutninger (2026-06-05, to diskusjonsrunder)
- **Full gating:** vanlige brukere kan IKKE opprette klubb. Kun `is_admin` (Jørgen) oppretter, og overfører
  til en bruker. «Opprett klubb»-døra gråes ut: «Vil du ha en klubb for laget ditt? Ta kontakt: klubb@tornygolf.no».
- **Overføring = eneeierskap:** den navngitte brukeren blir **eneeier** (`owner`); admin er IKKE medlem etter
  overføring (ren portvokter-rolle). Avtalen styrer hvor lenge.
- **Avtale-rammer på klubben:** admin setter **medlemstak** (`member_cap`) og **varighet** (`valid_until`)
  ved opprettelse. Varighet har alltid et «Uendelig»-alternativ (`valid_until = null`); ellers en sluttdato.
  Admin kan endre/forlenge/sette sluttdato senere (når en kunde sier opp).
- **Utløp = myk frys (reversibelt):** når `valid_until` passeres blir klubben inaktiv — skjult fra «Finn
  turneringer», ingen nye medlemmer eller klubb-spill, medlemmer ser «utløpt». Alt bevares; admin gjenåpner
  ved å forlenge datoen. **Pågående spill spilles ferdig** (spill sjekker ikke klubb-status).
- **Ingen per-bruker klubb-tak:** taket fra #442 (2 opprettede) **fjernes** — admin håndterer alt manuelt.
- **Rolle-delegering = bare eier:** kun `owner` (eller global `is_admin`) endrer roller. Admins beholder
  #442-makten (legg til/fjern medlem, godkjenn forespørsler) men kan ikke endre roller.
- **Rolle-UI = egen side per medlem** (speiler #442s «Fjern»-lenke → dedikert rute).
- **Varsel ved rolle-endring:** den berørte får et in-app-varsel («Du er nå admin/eier i …»).

## Prior Decisions (fra #49/#442 — speiles)
- **SECURITY DEFINER-RPC-stil (0075):** `language plpgsql security definer set search_path = ''`, fullt
  skjema-kvalifiserte refs, `revoke all/execute from public/anon` + `grant execute to authenticated`. Status-
  retur som tekst for UX-tilstander (`not_found`/`already_member`), `raise exception` for ekte feil.
- **`is_admin()`** (0002) og **`is_group_admin()`/`is_group_member()`** (0074) er etablerte helpere.
- **Sist-eier-guard (#442 fjern/forlat):** tell `owner`-rader via admin-client; blokkér å fjerne/degradere
  siste owner. Speiles i `set_club_member_role`.
- **Notification-kind = text + CHECK** (drop/re-add, mønster 0044/0069) + `NotificationKind`-union + zod-schema
  i `lib/notifications/types.ts` + `NotificationCard`/`InboxClient`-rendering (speiler `club_join_request`, #442).
- **getClubDetail/getMyClubs:** request-scoped klient for authz (RLS), admin-client for navn (users-RLS-gap).
- **Destruktive/betydelige handlinger:** dedikert konfirmasjons-rute, aldri inline-toggle/`<details>`.

## Design

### A. Schema + RPCer (migrasjon 0076 — høyeste applyte er 0075)
1. **`groups.member_cap int`** nullable (`null` = ubegrenset). Maks antall medlemmer per avtale.
2. **`groups.valid_until timestamptz`** nullable (`null` = uendelig). **Utløpt ⟺ `valid_until is not null
   and valid_until < now()`** — derivert tilstand, ingen cron/flagg. Backfill-`'Tørny'`-gruppa får begge `null`
   (grandfathered: ubegrenset + uendelig).
3. **DROP `create_club(text)`** (#442 self-serve, `grant ... to authenticated`). Den er en **gating-hull**: en
   vanlig bruker kan kalle RPC-en direkte og omgå UI-gaten. Erstattes av `admin_create_club`.
4. **RPC `admin_create_club(p_name text, p_owner_email text, p_member_cap int, p_valid_until timestamptz)
   returns uuid`** — krever `public.is_admin()` (ellers `raise 'not_authorized'`); trim+valider navn (≤60,
   `name_required`); slå opp owner på `lower(email)` (`raise 'owner_not_found'` hvis ingen — klubb opprettes
   IKKE); insert group (`created_by = auth.uid()` (admin), `member_cap`, `valid_until`, `short_id` via default);
   insert `group_members(group_id, owner, 'owner')`; returner group-id. **Atomisk** (én transaksjon).
5. **RPC `set_club_member_role(p_group_id uuid, p_user_id uuid, p_role public.group_role) returns text`** —
   caller må være **`owner` av gruppa ELLER `is_admin()`** (ellers `not_authorized`); target må være medlem
   (`not_member`); **sist-eier-guard:** target er `owner` + ny rolle ≠ `owner` + owner-count ≤ 1 → `raise
   'last_owner'`; oppdater rolle; returner ny rolle. (Varsel sendes best-effort i action-laget, ikke RPC-en.)
6. **CREATE OR REPLACE `add_club_member_by_email`** (0075): legg til, FØR insert: **utløp-sjekk** (`valid_until
   < now()` → return `'club_expired'`) + **medlemstak-sjekk** (`member_cap not null and count(members) >=
   member_cap` → return `'club_full'`). Resten uendret.
7. **CREATE OR REPLACE `decide_join_request`** (0075): på approve-grenen, FØR membership-insert: samme utløp- +
   medlemstak-sjekk → return `'club_expired'`/`'club_full'` (forespørselen forblir `pending`). Resten uendret.
8. **notifications.kind += `'club_role_changed'`** (drop/re-add CHECK, mønster 0044/0069).
9. **Apply via MCP `apply_migration`** (prosjekt `glofubopddkjhymcbaph`). Regenerer `lib/database.types.ts`.
   Verifiser med `execute_sql`. (Additivt + gating-RPC ureferert til gammel kode før deploy — innenfor «test i
   prod»-avtalen, jf. #49/#442.) **Term-redigering** (medlemstak/valid_until) + admin owner-reassign trenger
   INGEN ny RPC: #49s `groups`/`group_members` UPDATE-policy er `is_admin() OR is_group_admin(...)`, så admin
   redigerer via admin-client med kode-`is_admin`-sjekk; owner-reassign går via `set_club_member_role` (admin
   tillatt der).

### B. Gating (vanlig bruker mister opprett-døra)
- **`app/klubber/page.tsx`:** fjern begge `/klubber/ny`-dørene (tom-tilstand + liste-footer). Erstatt med en
  dempet info-affordance: «Vil du ha en klubb for laget ditt? Ta kontakt på **klubb@tornygolf.no**.»
  Medlemskaps-lista beholdes uendret (du kan fortsatt være medlem av klubber admin har laget).
- **Slett `app/klubber/ny/` (page + actions)** — self-serve-opprettelse finnes ikke lenger.
- **`lib/clubs/getMyClubs.ts`:** fjern `createdCount`-spørringen (død etter at cap-gatingen er borte).

### C. Admin-governance (`/admin/klubber/*`, kun `is_admin`)
- **`/admin/klubber`** (NY): liste over ALLE klubber (admin-client): navn, eier-navn, medlemstall/-tak,
  status-badge (Aktiv / Utløper {dato} / **Utløpt**). «Opprett klubb»-dør → `/admin/klubber/ny`. Rad →
  `/admin/klubber/[id]`.
- **`/admin/klubber/ny`** (NY): skjema — klubbnavn, eier-e-post, medlemstak (valgfritt tall, blank =
  ubegrenset), varighet (radio: **Uendelig** / **Sett sluttdato** + dato-input) → `admin_create_club`-RPC.
  `owner_not_found` → «Fant ingen Tørny-bruker med e-posten … Be dem opprette konto først.»
- **`/admin/klubber/[id]`** (NY): admin-redigering — vis medlemmer + eier + avtale; endre **medlemstak** +
  **valid_until** (forleng / sett sluttdato / sett uendelig). `updateClubTerms`-action (admin-client +
  kode-`is_admin`-sjekk → update `groups`). Owner-reassign via e-post = **Claude's discretion** (kan reuse
  `set_club_member_role`).
- **`app/admin/page.tsx`:** «Klubber»-tile i admin-grenen pekes om til `/admin/klubber` (governance-hjem).
  (Vanlig-bruker-grenens «Klubber»-tile → `/klubber` uendret.)

### D. Rolle-delegering inne i klubben (eier-drevet)
- **`app/klubber/[id]/page.tsx`:** på hvert medlemskort, for `owner`-visning (`myRole === 'owner'`), legg til
  en «Endre rolle»-lenke → `/klubber/[id]/rolle/[userId]` (ved siden av eksisterende «Fjern»). Admins ser
  fortsatt «Fjern» men IKKE «Endre rolle» (kun eier endrer roller).
- **`/klubber/[id]/rolle/[userId]`** (NY): eier-only konfirmasjons-side. Viser medlemsnavn + nåværende rolle +
  rolle-valg (Medlem / Admin / Eier). Sist-eier-tilfelle vises med vennlig blokk-melding. → `setMemberRole`.
- **`app/klubber/[id]/rolle/[userId]/actions.ts`** (NY): `setMemberRole` → `set_club_member_role`-RPC; map
  `last_owner`/`not_authorized`/`not_member`; **best-effort `notify({kind:'club_role_changed'})`** til target
  (`Promise.allSettled`); `revalidatePath`; redirect med status.
- **`club_role_changed`-payload:** `{ group_id, group_name, new_role }`. Deeplink `/klubber/[group_id]`.
  Melding rendres i `NotificationCard`: «Du er nå eier av {klubb}» / «Du er nå admin i {klubb}» / «Rollen din i
  {klubb} er nå medlem». `InboxClient`-deeplink + ikon speiler `club_join_request`.

### E. Medlemstak- + utløp-håndhevelse (utenfor RPCene)
- **`lib/games/getDiscoverableGames.ts`:** ekskluder utløpte klubber fra `clubGames`. Utvid medlems-spørringen
  (`group_members.select('group_id')`, linje ~79) til `select('group_id, groups(valid_until)')` og filtrer
  `myClubIds` til ikke-utløpte FØR games-spørringen (linje ~104). (Alternativt: behold `myClubIds`, men legg
  til et `valid_until`-filter på games-joinen — velg minst diff.)
- **`lib/games/newGameFormData.ts`:** ekskluder utløpte klubber fra `clubs`-returen (medlems-spørringen joiner
  `groups(id, name)` → legg til `valid_until` og filtrer). En utløpt klubb skal ikke kunne velges i veiviseren.
- **`app/admin/games/new/actions.ts`** (`createGameInternal`, ~linje 151–161): etter medlemskaps-sjekken, dropp
  `groupId = null` hvis klubben er utløpt (samme «manipulert verdi → null»-mønster). Et klubb-spill kan ikke
  scopes til en frossen klubb.
- **`app/klubber/[id]/page.tsx`:** hvis klubben er utløpt, vis en `Banner tone="warning"`: «Denne klubben er
  utløpt. Ta kontakt på klubb@tornygolf.no for å fornye.» Skjul «Sett opp en runde for klubben»-CTA og
  legg-til-medlem/del-lenke-kontrollene (frossen).
- **`app/klubber/[id]/actions.ts`:** `addMember`/`decideRequest` mapper de nye `club_full`/`club_expired`-retur-
  kodene til vennlige Banner-meldinger («Klubben er full (maks {n} medlemmer).» / «Klubben er utløpt.»).

## Edge Cases & Guardrails
- **Gating-hull:** `create_club`-RPC-en MÅ droppes (ikke bare skjules i UI) — den er `grant ... authenticated`
  og kan kalles direkte. Etter drop er `admin_create_club` (is_admin-gated) eneste opprett-vei.
- **Sist-eier:** `set_club_member_role` blokkerer å degradere siste owner (`last_owner`). Overføring/step-down
  skjer additivt: eier utnevner ny owner → så degraderer/forlater seg selv (escape-hatch #442 lovte).
- **Admin ikke medlem etter overføring:** admin styrer klubber via `/admin/klubber/*` (is_admin-RLS +
  admin-client), ikke via `/klubber` (medlemskaps-liste). `getClubDetail` forblir medlems-gated; admin bruker
  ikke den ruta.
- **Medlemstak grandfathering:** senker admin taket under dagens medlemstall, fjernes ingen — kun nye
  innmeldinger blokkeres. `member_cap = null` = ubegrenset.
- **Utløp er mykt + reversibelt:** ingen sletting; `valid_until`-forlengelse gjenåpner. Pågående spill rører vi
  ikke (games sjekker ikke gruppe-status). Kun discovery + nye medlemmer + nye klubb-spill fryses.
- **`owner_not_found` ved opprettelse:** klubben opprettes ikke (transaksjon ruller tilbake); vennlig melding.
- **Rolle-varsel best-effort:** `Promise.allSettled` + `console.error`; varsel-feil blokkerer aldri rolle-
  endringen (speiler #442 notify-disiplin).
- **Ingen regresjon:** #49/#442-RLS, eksisterende discovery/signup, og medlems-styringen (add/fjern/forlat,
  join-requests) står urørt bortsett fra de additive tak/utløp-sjekkene og gating-endringen.

## Key Decisions
- **Full gating, `create_club` droppes** — eier-valg; lukker både UI- og RPC-veien for self-serve.
- **`admin_create_club` med avtale-rammer (cap + valid_until)** — admin oppretter + overfører til eneeier.
- **Utløp = derivert myk frys** (`valid_until < now()`), ingen cron — beregnes på lese/skrive-tid.
- **`set_club_member_role`: owner/`is_admin`-gated + sist-eier-guard** — eier-drevet delegering.
- **`club_role_changed`-varsel** — eier-valg (ja).
- **Per-bruker klubb-tak fjernet** — eier-valg (admin håndterer alt).

**Claude's Discretion:**
- Eksakte rutenavn under `/admin/klubber/*` og `/klubber/[id]/rolle/*` (hold «én dør» + dedikerte ruter).
- Om `myClubIds` filtreres på utløp i discovery vs. et join-filter (velg minst diff).
- Owner-reassign på eksisterende klubb i admin-edit (reuse `set_club_member_role`) — nice-to-have.
- Om medlemstak-tallet vises som badge på admin-lista vs. kun på detalj-siden.
- Render-test-plassering (maks én per ny komponent, jf. test-disiplin) + plassering av status-badge-helper.
- Mail-backup (Resend) ved `club_role_changed` (speil `shouldAlsoSendMail`) eller kun in-app — default in-app.
- Eksakt copy på alle nye norske strenger (kjøres gjennom `humanizer` uansett).

## Success Criteria
- [ ] **C1 — Schema + RPCer applyt (0076):** `groups.member_cap`+`valid_until` (nullable); `create_club`
  droppet; `admin_create_club`+`set_club_member_role` finnes (security definer, anon revoked, is_admin/owner-
  gated); `add_club_member_by_email`+`decide_join_request` håndhever cap+utløp; `club_role_changed`-kind finnes.
  *Verifiser:* MCP `execute_sql` (information_schema/pg_proc/pg_constraint/pg_policies) + `lib/database.types.ts`
  regenerert + `npx tsc --noEmit` + `npm run build` grønn.
- [ ] **C2 — Gating:** en vanlig (ikke-admin) bruker kan ikke opprette klubb noe sted; `/klubber` viser «ta
  kontakt klubb@tornygolf.no»-affordancen i stedet for en opprett-dør; self-serve `/klubber/ny` finnes ikke;
  `create_club`-RPC kan ikke kalles (droppet). *Verifiser:* Playwright som ikke-admin + `execute_sql`
  (`create_club` fraværende i `pg_proc`) + grep (ingen self-serve `/klubber/ny`).
- [ ] **C3 — Admin oppretter + overfører med avtale:** admin lager klubb via `/admin/klubber/ny` med
  eier-e-post + medlemstak + varighet (uendelig/dato); den navngitte blir **eneeier**, admin er IKKE medlem;
  ukjent e-post avvises vennlig. *Verifiser:* Playwright + `execute_sql` (owner-rad finnes, ingen admin-
  membership-rad, `member_cap`/`valid_until` satt).
- [ ] **C4 — Rolle-delegering + varsel:** en klubb-eier endrer et medlems rolle via `/klubber/[id]/rolle/
  [userId]` (eier-only; member↔admin↔owner); siste owner kan ikke degraderes (blokkert m/ melding); berørt
  medlem får `club_role_changed`-varsel. *Verifiser:* Playwright + `execute_sql` (rolle oppdatert + notification-
  rad) + RPC-test (`last_owner` raise + non-owner `not_authorized`).
- [ ] **C5 — Medlemstak håndhevet:** når en klubb har nådd `member_cap`, blokkeres legg-til-på-e-post OG
  godkjenn-forespørsel med vennlig «klubben er full»; `member_cap = null` = ubegrenset. *Verifiser:* RPC/
  `execute_sql` (cap nådd → `club_full`) + observert Banner-melding.
- [ ] **C6 — Utløp = myk frys:** en klubb forbi `valid_until` er borte fra «Finn turneringer», blokkerer nye
  medlemmer + nye klubb-spill, og viser medlemmer en «utløpt»-tilstand; pågående spill virker fortsatt; admin
  forlenger `valid_until` og klubben er aktiv igjen. *Verifiser:* `getDiscoverableGames.test.ts` (utløpt klubb
  ekskludert) + `execute_sql` + observert oppførsel + admin-edit-flyt.
- [ ] **C7 — Ingen regresjon + gates grønne:** eksisterende discovery/signup/#49+#442-oppførsel uendret utenom
  gating + additive tak/utløp-sjekker; `npm run build` grønn, berørte co-lokerte tester grønne, ny norsk copy
  gjennom `humanizer`; `docs/user-flows.md` §0 oppdatert med gated-klubb-modellen. *Verifiser:* `npm run build`
  + `npx vitest run` + `git diff`-inspeksjon.

## Gates
- [ ] `npx tsc --noEmit` passerer (etter hver chunk; fanger nye GameMode/Record/exhaustive-hull + types).
- [ ] `npx vitest run <co-lokerte testfiler>` passerer; full `npx vitest run` før evaluering hvis delte filer
  (`getDiscoverableGames`, `notifications/types`, `newGameFormData`) er rørt.
- [ ] `npm run build` passerer (nye ruter kompilerer; Record/switch-uttømming, jf. tsc-gate-fella).
- [ ] MCP `execute_sql`-verifikasjon (C1–C6 schema/RLS/RPC/rad-effekter).
- [ ] Playwright (preview-tools) verifiserer C2–C6 i nettleser.
- [ ] `humanizer` på alle nye/endrede norske strenger før commit.
- [ ] `feat(...)`-commits bumper `package.json` + `CHANGELOG.md` (commit-msg-hook); `chore(db):`/`refactor` for
  ikke-bruker-synlig plumbing (chunk 1). **Worktree-hook-fix engang før første commit**
  (`git config --worktree core.hooksPath .githooks`).

## Files Likely Touched
- `supabase/migrations/0076_clubs_governance_and_roles.sql` — **ny** (member_cap/valid_until, drop create_club,
  admin_create_club, set_club_member_role, cap/utløp i add/decide, club_role_changed-kind).
- `lib/database.types.ts` — regenerert.
- `app/klubber/page.tsx` (gating-affordance), `app/klubber/ny/**` — **slettes** (self-serve borte).
- `lib/clubs/getMyClubs.ts` — dropp `createdCount`.
- `app/admin/klubber/page.tsx`, `app/admin/klubber/ny/{page,actions}.tsx`, `app/admin/klubber/[id]/
  {page,actions}.tsx` — **nye** (governance).
- `app/admin/page.tsx` — «Klubber»-tile → `/admin/klubber` (admin-grenen).
- `app/klubber/[id]/page.tsx` (+ «Endre rolle»-lenke + utløpt-banner/frys), `app/klubber/[id]/actions.ts`
  (club_full/club_expired-mapping), `app/klubber/[id]/rolle/[userId]/{page,actions}.tsx` — **nye**.
- `lib/clubs/getClubDetail.ts` — eksponer `member_cap`/`valid_until` (+ utløpt-flagg) for klubb-siden.
- `lib/notifications/types.ts` (`club_role_changed`-kind + schema), `app/.../NotificationCard.tsx` +
  `InboxClient` — rendering + deeplink.
- `lib/games/getDiscoverableGames.ts` (+ `.test.ts`) — ekskluder utløpte klubber.
- `lib/games/newGameFormData.ts` — ekskluder utløpte klubber fra picker.
- `app/admin/games/new/actions.ts` — dropp group_id på utløpt klubb.
- `package.json` + `CHANGELOG.md` — MINOR-serie for #50.
- `docs/user-flows.md` — §0 klubb-modell (gating + avtale + delegering).

## Foreslått chunk-rekkefølge (subagent-drevet for de substansielle)
1. **Schema + RPCer + types** (chunk 1) — `chore(db):`/`refactor`, apply via MCP, verifiser C1.
2. **Gating** (C2) — `/klubber` affordance + slett `/klubber/ny` + getMyClubs-rydd. `feat` (MINOR åpner serien).
3. **Admin-governance** (C3) — `/admin/klubber` liste + opprett + edit + tile-repoint.
4. **Rolle-delegering + varsel** (C4) — klubb-side-lenke + `/rolle/[userId]` + action + `club_role_changed`.
5. **Tak + utløp-håndhevelse** (C5+C6) — discovery/wizard-filter + klubb-side-frys + action-mappinger.
6. **Docs/flyt + full verifisering + humanizer** (C7).

## Out of Scope (→ senere saker)
- **Betaling/abonnement-mekanikk** (faktura, Stripe, auto-fornyelse) — avtalen håndteres off-app; #50 lagrer
  kun rammene (cap + varighet) + håndhever dem.
- **Automatiske utløps-varsler** (mail X dager før `valid_until`) — eget oppfølgings-issue ved behov.
- **Selvbetjent fornyelse / klubb-eier endrer egen avtale** — kun admin redigerer avtale-rammer.
- **klubb@tornygolf.no innboks-oppsett** (Domeneshop-videresending) — bruker-oppgave, ikke kode.
- **Venne-system / «åpen for venner»** → #369. **Klubb-logo/branding, klubb-browsing/oppdag-klubber.**
- E2E-spec utover Playwright-verifisering i evaluator + unit/render-tester.
