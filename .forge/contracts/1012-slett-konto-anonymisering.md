# Spec: Slett konto — anonymisering i stedet for FK-blokkert sletting (#1012)

## Problem

Selv-slette-flyten (`app/[locale]/profile/slett-konto/actions.ts`) sjekker kun aktive/kommende spill før den kaller `auth.admin.deleteUser(id)`. Men `users.id → auth.users(id) ON DELETE CASCADE` (0001) betyr at auth-slettingen kaskader inn i `public.users`, hvor NO ACTION-FK-er (`game_players.user_id`, `scores.user_id`/`entered_by`, `invitations.invited_by`, `games.created_by` m.fl.) blokkerer. Resultat: **enhver bruker som har fullført én runde kan ikke slette kontoen sin** — de får generisk `delete_failed` uten forklaring. GDPR-sletteretten har ingen fungerende sti. Admin-flyten (`admin/spillere/[id]/slett`) blokkerer samme case eksplisitt (`still_has_games`) — ærlig, men samme begrensning; det bryter også gjeste-kontraktens beslutning 5 («Admin kan slette [gjester] via eksisterende spillere-slett-flyt»), som er umulig for gjester som har spilt.

Viktig: **slett-konto-sidas copy lover allerede anonymiserings-semantikk** («E-postadressen din frigis», «Scoringsdata du har registrert [beholdes]») — alternativ 2 i issuet er den eneste løsningen som holder det løftet.

## Research Findings

- **GoTrue soft delete** (verifisert mot `supabase/auth` master, `internal/models/user.go::SoftDeleteUser`): `auth.admin.deleteUser(id, true)` setter `deleted_at`, **obfuskerer email/phone irreversibelt** (SHA-256 av id+verdi → original e-post frigjøres for ny signup), nuller `encrypted_password`/tokens/`raw_*_meta_data`, soft-sletter identities, og kaller `Logout(tx, u.ID)` → **alle sesjoner/refresh-tokens trekkes**. Det er en UPDATE, ikke DELETE → CASCADE mot `public.users` fyrer IKKE → profilraden overlever. supabase-js v2-signatur: `deleteUser(id, shouldSoftDelete = false)`.
- **Supabase-docs**: hard delete av auth-bruker logger ikke ut (JWT gyldig til utløp) — soft delete-varianten dekker dette via Logout.
- **FK-fasit fra prod** (pg_constraint, 2026-07-03): 41 FK-kolonner → `public.users`. Hard-delete-blokkere (NO ACTION/RESTRICT): `game_players.user_id/approved_by/withdrawn_by`, `scores.user_id/entered_by`, `invitations.invited_by`, `games.created_by`, `game_side_winners.winner_user_id`, `game_registration_requests.decided_by_user_id`, `league_rounds.window_overridden_by`, RESTRICT på `leagues/tournaments/product_updates.created_by`. CASCADE-rader som IKKE ryddes ved anonymisering (må slettes manuelt): `friendships`, `push_subscriptions`, `notifications`, `group_members`, `group_join_requests`, `game_registration_requests.user_id`, `idea_submissions`, `reactions.user_id` (heter `game_reactions` i migrasjon 0119 — **verifiser faktisk tabellnavn mot staging før du skriver SQL**).
- **0014-trigger-fella**: `handle_new_auth_user` insert-er `public.users` med `on conflict (id) do nothing` — dekker IKKE email-unique. Beholdes/blankes e-posten på husk-raden krasjer re-signup av samme adresse med unique_violation. E-post MÅ randomiseres unikt.

## Prior Decisions

- **1009 (gjestespiller):** skygge-bruker-mønsteret med no-MX-plassholder-e-post (`gjest+<uuid>@guest.tornygolf.no`); beslutning 5 utsatte gjeste-anonymisering til «eget issue hvis behovet oppstår» — dette er det issuet. `is_guest` ligger i denylisten til `guard_users_self_update` (0107/0127) — samme guard utvides.
- **393 (profil-revamp) K6:** slett konto skjer via dedikert side — uendret.
- **#1024-presedens:** hånd-patchede types OK; drift-CI på PR er rød til prod-migrasjonen er kjørt; prod-DDL krever eier-ja i sesjon. PR-en åpnes og venter på eier.

## Design

**Én regel i begge slette-flyter:** har brukeren 0 `game_players`-rader → forsøk hard delete som i dag (full sletting, kaskade rydder alt); feiler den på FK (f.eks. sendte invitasjoner) → fall tilbake til anonymisering. Har brukeren ≥1 `game_players`-rad → anonymiser direkte. Begge utfall gir brukeren samme svar: kontoen er slettet.

**Anonymisering = én SECURITY DEFINER-funksjon `anonymize_user(p_user_id uuid)`** (ny migrasjon, nummer sjekkes mot origin/main ved bygging; EXECUTE kun for `service_role`, REVOKE fra authenticated/anon; RAISE hvis brukeren er `is_admin` eller ikke finnes). Atomisk i én transaksjon:

1. `users`-raden: `name = 'Slettet bruker'`, `nickname/gender/locale/last_seen_at = NULL`, `email = 'slettet+' || id || '@deleted.tornygolf.no'` (unik, no-MX — gjeste-mønsteret), `hcp_index = 54.0`, `friend_code = generate_friend_code()`, `deleted_at = now()`. `profile_completed_at` beholdes (NULL gir «pending»-oppførsel i `newGameFormData`). `is_guest` beholdes som den er.
2. Slett personlige/sosiale rader: `friendships` (begge retninger), `push_subscriptions`, `notifications` (brukerens innboks), `group_members`, `group_join_requests`, `game_registration_requests` (user_id), `idea_submissions`, reaksjoner brukeren har GITT (`user_id`); `invitations` + `club_invitations` der `lower(email)` = brukerens gamle e-post.
3. Behold all spilldata: `game_players`, `scores`, `games/courses/leagues/tournaments.created_by`, wolf/BBB/patsome-rader, `league_players`, mottatte reaksjoner, `admin_audit_log`.

**Litteral `'Slettet bruker'`, ikke NULL:** NULL-navnestien har verifiserte hull (tom streng i `formatRevealName`-flater, rå UUID i `SettlementTable`, scrambled e-post som visningsnavn på venner-sida) og kolliderer semantisk med «Ukjent spiller» (pending invitees). Med satt name + NULL nickname flyter navnet riktig gjennom alle visningsmønstre uten kodeendringer. i18n-kompromisset (engelsk UI viser norsk litteral) er bevisst — lokalisert visning via flagg er notert som framtidig mulighet, ikke nå.

**Server-action-flyt (selv-slett):**
1. Guards (redirect med error-key): ikke innlogget → login; `is_admin` → ny key `admin_account`; aktive/kommende spill som SPILLER (eksisterende sjekk) ELLER som CREATOR av active/scheduled-spill, ELLER creator av ikke-avsluttede leagues/tournaments → utvidet `active_games`-copy (dekker nå «arrangerer» i tillegg til «er med i»).
2. Hvis `users.deleted_at` allerede satt (retry etter delvis feil): hopp rett til steg 4.
3. `admin`-klient: RPC `anonymize_user` (eller hard delete-stien ved 0 game_players).
4. `admin.auth.admin.deleteUser(id, true)` (soft) → GoTrue obfuskerer + logger ut alle sesjoner.
5. Feil i 3/4 → `console.error` med prefiks `[profile/slett-konto]` + redirect `delete_failed` (brukeren har fortsatt sesjon og kan prøve igjen — rekkefølgen RPC-før-auth er valgt nettopp for retrybarhet).
6. Suksess → redirect `/login?melding=konto_slettet` som i dag.

**Admin-flyt:** fjern `still_has_games`-blokken; samme regel + guards som selv-slett (self-delete-forbidden beholdes; blokk hvis target har aktive/kommende spill eller arrangerer noe uavsluttet — gjenbruk/erstatt `still_has_games`-keyen med ny «pågående»-semantikk). Bekreftelses-sida får to copy-varianter: aldri-spilt (dagens «ingen historikk forsvinner») vs. har-spilt («resultatene beholdes anonymisert som 'Slettet bruker', e-posten frigjøres»). Dette gjør også spilte gjester slettbare (lukker gapet fra 1009-beslutning 5).

**Ekskludering av slettede (deleted_at IS NOT NULL) — filter i kildene:**
- `lib/users/getTeamCandidates.ts` (lag-autocomplete/creator-nettverk)
- `lib/games/newGameFormData.ts` (spiller-picker i veiviseren)
- `lib/games/rosterCandidates.ts` (admin-invite-kortet)
- invite-eligibility (`app/[locale]/admin/games/[id]/inviteToGameActions.ts::getInviteEligibleIds`)
- venn-oppslag via friend_code (add-friend-flyten)
- claim-eligibility for gjester (`lib/games/claimGuestResult.ts` + claim-seksjonens datakilde)
- `lib/notifications/notify.ts` (gate mail/push slik `is_guest` gates i dag) og `lib/productUpdates/digest.ts`
- `/admin/spillere`-listas query (husk-rader skjules; de nås ikke lenger som «spillere»)
- IKKE filtrer: leaderboards/avsluttede spill, klubb-tavla, historikk — der er «Slettet bruker»-visning poenget.

**Guard-utvidelse:** `guard_users_self_update` (0127-versjonen) får `deleted_at` i denylisten — self-PATCH som endrer `deleted_at` → 42501; admin/service-role passerer (0107-mønsteret).

**Types/CI:** migrasjon påføres staging via MCP først; `database.types.ts` hånd-patches med `deleted_at` (+ evt. gen fra staging); drift-CI på PR-en er rød til eier godkjenner prod-migrasjonen — dokumenteres i PR-body.

## Edge Cases & Guardrails

- **Dobbel sletting/retry:** `deleted_at`-shortcircuit + idempotent RPC (re-kjøring scrubber en allerede-scrubbet rad harmløst).
- **Re-signup med frigjort e-post:** gir helt ny konto (0014-trigger) — ønsket. Åpne invitasjoner til e-posten er slettet, så `email_is_invited` gater som for ukjent adresse.
- **Anonymisert gjest:** skal IKKE kunne claimes (claim-filter over) — ellers kunne noen overta husk-raden.
- **Admin-konto:** kan aldri anonymiseres/slettes via disse flytene (RAISE i RPC + guard i action).
- **Creator-edge:** bruker som arrangerer scheduled spill uten å stå i game_players fanges nå av utvidet blokk (før: cron auto-start ville varslet en anonymisert creator).
- **Mail til husk-adressen:** no-MX-domene = stille bounce som backstop, men notify/digest-gatene skal hindre forsøket.
- **Ikke rør:** Dexie-DB-navnet, `lib/scoring/`, eksisterende hard-delete-oppførsel for aldri-spilte brukere (minus fallbacken).

## Key Decisions

- **Anonymisering (alternativ 2), ikke bare ærlig feilmelding:** UI-copyen lover det allerede; GDPR-sletteretten krever fungerende sti. — *Autonom beslutning, dokumentert her; eier kan overprøve før merge.*
- **Hard delete beholdes for 0-spill-brukere:** full erasure er bedre enn husk-rad når det er mulig; fallback til anonymisering gjør stien robust.
- **`'Slettet bruker'`-litteral i DB** framfor NULL+flagg-lokalisering — se Design.
- **Admin-flyten inkluderes** (samme helper, copy-branch) — issuet nevner den eksplisitt, og den lukker gjeste-gapet.
- **Rekkefølge RPC → auth-soft-delete** for retrybarhet (motsatt rekkefølge kan låse brukeren ute med PII intakt).

**Claude's Discretion:**
- Eksakt ordlyd i ny/endret copy (kjør `humanizer:humanizer` på norsk copy; oppdater begge locales; `admin.players.*errors*` finnes på TO steder i katalogene).
- Om `product_updates_unsubscribed_at` også settes ved anonymisering (belte-og-seler for digest).
- pgTAP-filstruktur (følg eksisterende `supabase/tests/`-mønster fra #732/0107).
- Om mottatte reaksjoner beholdes eller slettes (default: behold — target er anonymisert).

## Success Criteria

- [ ] **Staging:** bruker med avsluttet spill sletter kontoen → suksess-redirect; `users`-raden har `deleted_at` satt, `name='Slettet bruker'`, e-post matcher `slettet+%@deleted.tornygolf.no`; auth-raden er soft-deleted (OTP-forespørsel til gammel e-post gir ikke tilgang til gammel konto); avsluttet-spill-leaderboard viser «Slettet bruker». (Verifiseres med staging-klikkrunde + SQL.)
- [ ] **Staging:** fersk bruker uten historikk sletter kontoen → `users`-raden er BORTE (hard delete-stien intakt).
- [ ] **Staging:** admin sletter en spiller med historikk (f.eks. gjest) via `/admin/spillere/[id]/slett` → anonymisert + suksessbanner; aldri-spilt-copy vs. har-spilt-copy vises riktig.
- [ ] **pgTAP:** `anonymize_user` scrubber users-raden og sletter cleanup-tabellradene i én transaksjon; EXECUTE nektes for authenticated/anon; RAISE på is_admin-target.
- [ ] **pgTAP/hostile-PATCH:** self-update av `deleted_at` → 42501; service-role passerer.
- [ ] **Picker-eksklusjon:** anonymisert bruker dukker ikke opp i lag-kandidater/spiller-picker/invite-eligibility (SQL-/unit-bevis + staging-sjekk).
- [ ] Versjonsbump (patch) + CHANGELOG Feilrettinger-linje; commits med `Refs #1012`.

## Gates

- [ ] `npx tsc --noEmit` og `npm run build` (fanger exhaustive-switch/types-drift)
- [ ] `npm run lint`
- [ ] Co-located vitest for endrede filer (`npx vitest related` eller fil-spesifikk)
- [ ] pgTAP-testene grønne mot staging
- [ ] Staging-klikkrunde av berørt flyt FØR merge (CLAUDE.md-krav for bruker-synlige fikser)

## Files Likely Touched

- `supabase/migrations/0131_*.sql` (nummer verifiseres) — `users.deleted_at`, `anonymize_user()`, guard-utvidelse
- `lib/supabase/database.types.ts` — hånd-patch `deleted_at`
- `app/[locale]/profile/slett-konto/actions.ts` + `page.tsx` — ny flyt + guards + copy-tweak (bullet3)
- `app/[locale]/admin/spillere/[id]/slett/actions.ts` + `page.tsx` — fjern still_has_games, copy-branch
- `lib/users/getTeamCandidates.ts`, `lib/games/newGameFormData.ts`, `lib/games/rosterCandidates.ts`, `app/[locale]/admin/games/[id]/inviteToGameActions.ts`, `lib/games/claimGuestResult.ts`, venn-kode-oppslaget — deleted-filter
- `lib/notifications/notify.ts`, `lib/productUpdates/digest.ts` — deleted-gate
- `app/[locale]/admin/spillere/` liste-query — deleted-filter
- `messages/no.json` + `messages/en.json` — nye/endrede keys
- `supabase/tests/*` — pgTAP
- `package.json` + `CHANGELOG.md`

## Out of Scope

- Scrubbing av navn-snapshots i ANDRE brukeres notification-JSONB (`invited_by_name` o.l.) — GDPR-residue, eget oppfølgings-issue.
- `admin_key_metrics`-viewet (slettede teller med i users_ge1/ge2 — mindre drift, eget issue ved behov).
- Lokalisert «Slettet bruker»-visning via flagg (à la GuestBadge) — bevisst utsatt.
- Automatisk purge/retention av husk-rader.
- «Slettet»-badge på admin-/roster-flater (#1017-skinnene kan gjenbrukes senere).
- Rad-flytting/claim til eksisterende konto (1009-beslutning 6 står).
