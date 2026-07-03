# Evaluation: Slett konto — anonymisering (#1012)

**Evaluert:** 2026-07-03, fersk-kontekst skeptisk evaluator (oppdatert samme dag etter funn-fix `2699d5fb`)
**Kontrakt:** `.forge/contracts/1012-slett-konto-anonymisering.md`
**Fix-commit:** `c1ae6ed5` (v1.170.1) · Kontrakt: `fa1fa23e` · Evidens: `b1d0c433` · Evaluator-funn-fix: `2699d5fb` (v1.170.2)

## Verdict

**ACCEPT** — betinget kun av at prod-migrasjon 0131 kjøres etter eier-godkjenning (samme forbehold som #1024-presedensen; drift-CI er rød til da). Den opprinnelige tilleggsbetingelsen (GitHub-issue for invite-eligibility-gapet) er FRAFALT: gapet ble fikset direkte i commit `2699d5fb`, verifisert under funn 1.

Kjernefiksen er reell, riktig designet og grundig verifisert. Jeg gikk inn med mistanke om fabrikkert staging-evidens (databasen har i dag NULL spor av probene) — men Supabase auth- og API-loggene beviser entydig at klikkrunden fant sted kl. 15:03–15:10 UTC i dag, med nøyaktig de query-sekvensene koden genererer, etterfulgt av opprydding. Detaljer under.

## Criteria-gjennomgang

### 1. Staging: selv-slett med avsluttet spill → anonymisering — **PASS**

Kan ikke gjenta klikkrunden (probene er ryddet bort), men evidensen er uavhengig korroborert:

- **Auth-logg:** `probe@example.com` (id `1483fd71`) opprettet av service_role, OTP-mail 15:03:05Z, `user_recovery_requested` + `login`-event — en ekte innlogget sesjon.
- **API-logg 15:04–15:10 UTC:** eksakt `getDeleteBlockReason`-sekvensen (users `is_admin,deleted_at` → game_players m/ `games.status=in.(active,scheduled)` → games/tournaments/leagues `created_by`-sjekker) → users `deleted_at` → HEAD game_players-count → `POST /rest/v1/rpc/anonymize_user` **204** → `DELETE /auth/v1/admin/users/<id>` **200** (soft). Dette er `deleteOrAnonymizeUser`-flyten, kjørt live.
- **Leaderboard-lesing** av et avsluttet probe-spill (`fab70b1a`) kl. 15:04 — konsistent med «Slettet bruker»-podium-sjekken.
- 9 `user_deleted`-events (flyt-slettinger + opprydding) forklarer at staging i dag er tom for tombstones.

### 2. Staging: fersk bruker → hard delete — **PASS**

Auth-logg viser `user_signedup` + `user_deleted` for `probe-kontob`/`probe-kontoc`; staging har i dag 0 rader for disse i både `public.users` og `auth.users` — konsistent med hard delete-stien. Koden (`deleteOrAnonymizeUser`) prøver hard delete ved 0 game_players-rader og faller tilbake til anonymisering ved FK-feil; unit-testet.

### 3. Staging: admin-slett med historikk → anonymisert + copy-branch — **PASS**

API-loggen viser to separate delete-flyt-kjøringer (side-render-blokksjekk + action-blokksjekk + RPC + soft delete) for to ulike probe-id-er — konsistent med både selv-slett- og admin-flyt-probe. `bodyPlayed`-nøkkelen finnes i begge locales og velges på `hasPlayed` i `app/[locale]/admin/spillere/[id]/slett/page.tsx`. Banner-copy («X er slettet») kan jeg ikke re-verifisere visuelt; evidensen er spesifikk og konsistent med koden.

### 4. pgTAP: anonymize_user + EXECUTE-denial + admin-RAISE — **PASS (med kompensasjon)**

Suiten `supabase/tests/users_anonymize_test.sql` er skrevet (plan(11) matcher 11 asserts, følger rigg-mønsteret, ny `try_set_deleted_at`-helper i `rls_helpers.psql`). Den er IKKE kjørt (Docker-riggen utilgjengelig — kjent begrensning, ærlig dokumentert i kontrakten). Jeg verifiserte selv direkte mot staging:

- `anonymize_user` finnes; EXECUTE-grants = **kun** `postgres` (owner) + `service_role` — ingen anon/authenticated/PUBLIC.
- `pg_get_functiondef(guard_users_self_update)` inneholder `deleted_at`-blokken (42501), identisk med 0131-fila, og 0127-denylisten (is_admin, is_guest) er bevart uendret — ingenting falt ut ved replace.
- Migrasjon påført staging som `20260703143753` (16:37 Oslo, før fix-commiten — riktig 0107-rekkefølge).

### 5. Hostile-PATCH: self-update av deleted_at → 42501 — **PASS**

Guard-funksjonen deployet på staging er verifisert (punkt 4). Byggerens probe-evidens (forfalsket authenticated-JWT → 42501-melding som matcher funksjonsteksten ordrett) er konsistent. RPC-en skrev `deleted_at` som service (API-logg 204) — service-stien passerer.

### 6. Picker-eksklusjon — **PASS** (hull funnet i første gjennomgang, lukket i `2699d5fb`)

Verifisert i diffen: `.is('deleted_at', null)` i `getTeamCandidates`, `newGameFormData`, `InviteToGameSection`, venne-kode-oppslaget (`venner/legg-til/[code]`), claim (`claimGuestResult` + claim-seksjonen i `games/[id]/spillere`), admin-spillerlista + telling, notify-gate, digest-gate. API-loggen viser til og med den filtrerte spillerlista-querien live (`deleted_at=is.null`). `rosterCandidates.ts` er ren filterlogikk over allerede-filtrerte kilder — trengte ikke endres.

**Hullet (funnet, så lukket):** kontraktens Design lister «invite-eligibility (`getInviteEligibleIds`)» som filter-site. I `c1ae6ed5` ble den ikke filtrert — evidens-teksten («friendships/group_members slettes i RPC-en så id-kildene tømmes») utelot det tredje benet: `getCoPlayerIds` leser `game_players`, som med vilje BEHOLDES. En anonymisert bruker forble invite-eligible for alle som hadde delt et spill med dem. Commit `2699d5fb` lukker dette — se funn 1 for verifiseringen.

### 7. Versjonsbump + CHANGELOG + Refs — **PASS**

v1.170.0 → v1.170.1 (patch, riktig for fix), CHANGELOG Feilrettinger-linje i Juli-seksjonen (teller 4→5), alle commits har `Refs #1012`. Funn-fixen `2699d5fb` bumper videre til v1.170.2 med `[no-changelog]` — riktig: intern hardening uten bruker-synlig endring.

## Gates-resultat

| Gate | Resultat |
|---|---|
| `npx tsc --noEmit` (Node 22) | ✅ 0 feil |
| `npm run build` | ✅ exit 0, «Compiled successfully» |
| `npm run lint` | ✅ 0 errors (52 warnings, alle pre-eksisterende complexity-warnings) |
| `npx vitest run lib/users lib/games lib/notifications lib/productUpdates app/[locale]/admin/spillere` | ✅ 64 filer, 1035 tester grønne (inkl. ny `deleteAccount.test.ts`, 9 tester) |
| pgTAP mot staging | ⚠️ Ikke kjørbar (Docker-rigg utilgjengelig, kjent) — kompensert med direkte staging-verifisering av grants/guard/funksjon + loggkorroborert probe-kjøring |
| Staging-klikkrunde | ✅ Korroborert via Supabase auth- + API-logger (se kriterium 1–3) |
| Re-kjøring etter `2699d5fb` | ✅ `tsc --noEmit` 0 feil; `vitest run lib/games lib/users` 47 filer / 901 tester grønne (uavhengig re-verifisert av evaluator) |

## Funn/bekymringer

**Aktivt lett etter problemer; her er alle, inkludert de jeg avviste:**

1. **[REELL — FIKSET i `2699d5fb`, verifisert] Invite-eligibility filtrerte ikke deleted.** Se kriterium 6. Fiksen filtrerer union-settet (alle tre ben) mot `users.deleted_at IS NULL` med én `.in('id', union)`-query i `lib/games/inviteEligibility.ts`. Verifisert i diffen:
   - **Dekker rot-årsaken ved kilden:** filteret ligger på union-settet, ikke per ben — co-player-benet (og eventuelle framtidige ben) er dekket.
   - **Fail-safe-retningen er riktig:** oppslags-feil → tomt sett → guarden AVVISER (fail-closed), konsistent med filens dokumenterte best-effort-filosofi («en transient feil krymper settet»). Tom union short-circuiter uten query.
   - **Gates re-verifisert uavhengig:** `npx tsc --noEmit` 0 feil, `npx vitest run lib/games lib/users` 47 filer / 901 tester grønne. Versjon v1.170.2 + `[no-changelog]` + `Refs #1012` — alt korrekt.
   - **Merknad (ikke blokkerende):** ingen ny unit-test for filteret — `inviteEligibility.ts` hadde ingen testfil fra før (best-effort komponent-reads, boundary-mock-tungt), så det følger eksisterende mønster og test-disiplinens tilbakeholdenhet.
   - **Rest som står igjen (kosmetisk):** en admin som manuelt taster tombstone-e-posten (`slettet+<uuid>@deleted.tornygolf.no` — konstruerbar fra kjent uuid) i inviteEmail-feltet kan fortsatt re-legge brukeren til et spill; admin er bevisst unntatt eligibility (kurator-modellen), admin-only og selvforskyldt. Ikke verdt issue.

2. **[UNDERSØKT OG AVKREFTET] «Fabrikkert» staging-evidens.** Staging har i dag null anonymiserte rader, ingen probe-brukere, ingen soft-deleted auth-rader og intet probe-spill — kontraktens evidens så først udokumenterbar ut. Auth-loggen (3× `user_signedup` for probe-konto/b/c, OTP-login, 9× `user_deleted`) og API-loggen (RPC-kall, soft-delete-kall, blokksjekk-sekvenser med nøyaktig kodens query-former, 15:03–15:10 UTC) beviser at rundene fant sted, etterfulgt av full opprydding. **Kritikk som står igjen:** evidens-commiten nevner ikke oppryddingen — en evaluator uten logg-tilgang ville stått fast. Dokumentér opprydding i framtidige evidens-notater.

3. **[AVVIST] `.neq('status','finished')` kunne blokkere for evig på en 'cancelled'-status.** Sjekket CHECK-constraints på staging: leagues og tournaments har kun `draft/active/finished`. Ingen felle.

4. **[NOTERT, ikke blokkerende] Blokksjekken er fail-open ved query-feil.** `getDeleteBlockReason` ignorerer `error` på alle fire parallelle queries — en transient feil på f.eks. leagues-querien lar en aktiv arrangør slette seg. Lav sannsynlighet (admin-client, fire enkle queries), og gamle koden hadde samme form. Verdt en `error`-sjekk ved neste berøring.

5. **[NOTERT, contract-konform] Liga-/cup-DELTAKER (ikke-creator) i noe uavsluttet blokkeres ikke.** Kontrakten valgte bevisst spill-deltakelse + creator-roller som blokk-kriterier. Konsekvens: en spiller i en pågående cup/liga uten scheduled kamp kan slette seg, og fremtidige genererte kamper kan inkludere «Slettet bruker» på rosteret (creator må trekke dem manuelt). Liga-runde-påmelding er self-service (krever sesjon → umulig for slettede), så eksponeringen er i praksis cup-match-generering. Lav alvorlighet og innenfor kontraktens design — kan tas som eget issue hvis det dukker opp i praksis.

6. **[AVVIST] Migrasjons-SQL-feller.** Verifisert mot staging: `reactions` er riktig tabellnavn (kontrakten flagget game_reactions-risikoen), `product_updates_unsubscribed_at` og `friendships.requester_id/addressee_id` finnes, `club_invitations` finnes. Flerlinje-strengkonkatenering i `comment on` er gyldig SQL (adjacent literals over newline). `generate_friend_code()` har kollisjon-retry (0077) og kalles kvalifisert under `search_path ''`. Ingen hcp-CHECK som kolliderer med 54.0. Idempotens via `coalesce` på begge tidsstempler. `for update`-lås + `no_data_found`/`insufficient_privilege` RAISEs er riktige.

7. **[AVVIST] i18n-hull.** Begge veier sjekket programmatisk: `adminBanner`, `errors.admin_account`, `admin.players.errors.target_active`, `admin.players.profile.errors.target_active` og `delete.bodyPlayed` finnes i BÅDE no.json og en.json; alle brukes i kode. `still_has_games` er fjernet fra begge locales og begge namespace-steder, og eneste gjenværende forekomst i repoet er en forklarende kode-kommentar (harmløst). Admin-[id]-sida leser `profile.errors.*` — `target_active` ligger riktig der òg.

8. **[AVVIST] Guard-replace kunne mistet 0127-regler.** Diffet funksjonskroppen mot 0127: identisk + ny deleted_at-blokk. Staging-deployet versjon matcher.

9. **[NOTERT, kosmetisk] `admin_account`-blokk i admin-flyten gjenbruker `self_delete_forbidden`-copyen.** Med dagens éne admin er target-admin === deg selv, så copyen stemmer. Får appen flere admins en dag blir teksten misvisende. Ikke verdt issue nå.

## Påkrevde utbedringer (for betinget ACCEPT)

1. **Prod-migrasjon 0131** kjøres via Supabase MCP etter eier-ja i sesjon (0107-mønsteret); drift-CI på PR-en er rød til da. Allerede flagget i commit-melding og kontrakt — bare ikke glem den.

*(Opprinnelig betingelse 2 — GitHub-issue for invite-eligibility-gapet — er frafalt: gapet ble fikset direkte i `2699d5fb` og verifisert, se funn 1.)*
