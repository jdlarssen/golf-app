# Spec: Venner + åpen-for-venner (#369, lukker #408)

**Issue:** [#369](https://github.com/jdlarssen/golf-app/issues/369) · `enhancement` · `needs-brainstorming`
**Lukker også:** [#408](https://github.com/jdlarssen/golf-app/issues/408) (Venner søkbare i lag-påmelding)
**Milestone:** Klubb-skala (epic) · **Branch:** `claude/friendly-meninsky-ef92cd`
**Substrat (shipped):** #49 (`groups`/`group_members`), #442 (klubb-scoped oppdagbarhet + `games.group_id` + direkte-join for medlem), #357 (`getDiscoverableGames`), #362 (`getTeamCandidates`-resolver med eksplisitt venne-utvidelsespunkt).

## Problem
«Bli med i et spill»-flyten (`docs/flows/02-bli-med-i-spill-fremtid.svg`) har en «Senere: venner & klubb»-node. Klubb-delen er ferdig (#442/#50). Venne-delen er ikke bygget: i dag taster du e-post hver gang, lag-påmeldings-autocomplete viser **kun co-players** (personvern-grense fra #362), og det finnes ingen mellomting mellom helt privat (`invite_only`) og helt åpen (`open`). Denne saken bygger **venne-relasjonen** (flat, gjensidig) + lar **venner alltid se venners spill** + en **«slipp venner forbi gaten»**-mekanisme på `manual_approval`.

## Eier-beslutninger (2026-06-05)
- **Omfang B:** fundament (venne-relasjon + UI + varsler + autocomplete) **OG** åpen-for-venner (discovery + skip-gate). Klubb-scoped påmelding er allerede #442 → ikke her.
- **Vennskap = gjensidig:** forespørsel → mottaker godtar/avslår. **Flat relasjon** — ingen eier, ingen admin, ingen identitet (≠ klubb). Symmetrisk: begge ser hverandre.
- **Tre veier å legge til venn (alle tre):**
  1. **Co-player-forslag** — folk du har spilt med, men ikke er venn med, med «Legg til».
  2. **E-post** — finnes brukeren → forespørsel; **finnes ikke → tilby å invitere** (gjenbruk e-posten du allerede tastet, slått sammen med dagens inviter-venn-flyt `app/invite/actions.ts`).
  3. **Delt lenke** — `/venner/legg-til/[friend_code]`. Du deler den (= du inviterte); den som åpner og er innlogget blir venn **direkte** (= de aksepterte ved å åpne). Auto-kobling, ikke ny forespørsel.
- **Venner ser alltid venners spill** i en egen «Fra vennene dine»-seksjon i «Finn turneringer» — **untatt `invite_only`** (den modusen betyr «privat gjesteliste»; å vise den ville bryte dens hensikt).
- **Hvordan venner blir med følger modusen** på spillet de ser:
  - `open` → melder seg på direkte (som alle andre).
  - `manual_approval` → ser det + kan be om å bli med (ikke garantert plass) — **med mindre** oppretteren har huket av **«Slipp venner direkte inn»** (`games.let_friends_skip_gate`), da går venner rett forbi gaten; ikke-venner ber fortsatt om å bli med.
  - `invite_only` → ser det ikke (privat).
- **Veiviser (kompis-arrangement):** oppretter kan legge til venner (`venner ∪ co-players`) som spillere i roster-steget — uavhengig av skip-gate-checkboxen. Klubb-arrangement beholder klubb-roster (#442); dette gjelder kompis-grenen.
- **Fjern venn = inline bekreft** (to-tap), ikke dedikert `/slett`-rute. **Bevisst avvik** fra «destruktive handlinger → dedikert side»-regelen: relasjonen er lav-innsats, bruker-rettet (ikke admin-destruktiv som slett-spill/spiller/konto), og reversibel ved å legge til igjen. Flagget for eier-veto.

## Prior Decisions (fra eksisterende kontrakter / repo)
- **#362/#408:** `getTeamCandidates(userId)` er **én resolver** (`lib/users/getTeamCandidates.ts`) med eksplisitt utvidelsespunkt (linje 21–24): `kandidater = venner(userId) ∪ co-players(userId)`. `TeamRegistrationForm` leser bare resolveren → **ingen UI-endring i autocomplete-en**.
- **#442:** `registerForOpenGame` (`app/signup/[shortId]/actions.ts`) har `canDirectJoin = open OR (group_id && is_group_member)` (linje ~145–155). **Skip-gate-grenen speiler denne** med en venne-sjekk. `getDiscoverableGames` har en `clubGames`-seksjon (dedup vs `openGames`) — **«Fra vennene dine» speiler clubGames-mønsteret**.
- **#442:** `notifications.kind` er **text + CHECK** (ikke DB-enum) → ny kind = drop/re-add CHECK (mønster 0044/0075) + `NotificationKind`-union + zod-schema (`lib/notifications/types.ts`) + EMOJI/`buildCardContent` (`components/notifications/NotificationCard.tsx`) + deeplink (`app/innboks/InboxClient.tsx`). `notify()` er best-effort.
- **#442:** RPC-stil (0075/0076): `security definer set search_path=''`, fullt skjema-kvalifisert, `p_`/`v_`-prefiks, string-status-retur, revoke anon/public + grant authenticated. `generate_group_short_id()` (8-char base36, retry-til-unik, format-check, unique) → **speiles som `generate_friend_code()`**.
- **`registration_mode` er en DB-enum** (`public.registration_mode`, 0041). Vi legger **ikke** til en verdi (unngår enum-migrasjon + uttømmende-switch-eksplosjon) — vi legger til **boolean-kolonne** `games.let_friends_skip_gate`.

## Design

### A. Schema (migrasjon 0077 — høyeste applyte er 0076)
1. **`friendships`** — `id uuid pk default gen_random_uuid()`, `requester_id uuid not null → users(id) on delete cascade`, `addressee_id uuid not null → users(id) on delete cascade`, `status text not null default 'pending' check (status in ('pending','accepted'))`, `created_at timestamptz default now()`, `responded_at timestamptz`, `unique(requester_id, addressee_id)`, `check (requester_id <> addressee_id)`. Indekser på `(addressee_id, status)` + `(requester_id, status)`.
   - **RLS:** SELECT der `requester_id = auth.uid() OR addressee_id = auth.uid()`. **Ingen** direkte INSERT/UPDATE/DELETE-policy — alle mutasjoner via SECURITY DEFINER-RPC (speil klubb-governance). Venner(userId) i discovery/resolver leses med eksplisitt `userId`-filter.
2. **`users.friend_code`** — `generate_friend_code()` (speil `generate_group_short_id`), backfill alle eksisterende rader, deretter `not null` + `default generate_friend_code()` + format-check `^[0-9a-z]{8}$` + `unique` + index.
3. **`games.let_friends_skip_gate`** — `boolean not null default false`. Kun meningsfull når `registration_mode = 'manual_approval'`.
4. **SECURITY DEFINER-RPCer** (0075-stil):
   - `send_friend_request(p_addressee uuid) returns text` — `auth.uid()` påkrevd; `self` hvis lik; hvis **omvendt pending finnes** → aksepter den (`accepted`); hvis allerede accepted → `already_friends`; hvis pending finnes → `already_pending`; ellers insert pending → `requested`. Best-effort `notify(friend_request)` håndteres i server-action (ikke i RPC).
   - `send_friend_request_by_email(p_email text) returns text` — slå opp `users.id` på `lower(trim(email))`; ingen → `not_found` (server-action tilbyr invitasjon); self → `self`; ellers samme logikk som over (returner også `requester_id`/`addressee_id` via OUT-param eller la server-action slå opp id og kalle `send_friend_request`). *Impl-valg:* RPC returnerer target-`uuid` + status, eller server-action gjør oppslag selv. Claude velger reneste form.
   - `respond_friend_request(p_request_id uuid, p_accept boolean) returns text` — kun `addressee_id = auth.uid()` på en `pending`-rad; accept → `status='accepted'`, `responded_at=now()` → `accepted`; decline → DELETE rad → `declined`. Annet → `not_found`.
   - `remove_friend(p_other uuid) returns text` — DELETE accepted-relasjon i begge retninger mellom `auth.uid()` og `p_other` → `removed`/`not_found`.
   - `connect_via_friend_code(p_code text) returns uuid` — resolve `friend_code` → eier; `self` (raise) hvis eier = `auth.uid()`; hvis allerede venner → returner eier (idempotent); hvis omvendt pending → aksepter; ellers **insert accepted** (begge har samtykket: deling + åpning) med `requester_id = eier`, `addressee_id = auth.uid()`. Returner eier-id (for visning + notify).
5. **Notifications:** nye kinds `friend_request` (mottaker varsles ved forespørsel) + `friend_accepted` (avsender varsles ved godkjenning). Drop/re-add `notifications_kind_check`. Deeplink begge → `/profile/venner`.
6. **Apply via MCP `apply_migration`** (additiv + ureferert til kode deployes — innenfor «test i prod»-avtalen). Regenerer `lib/database.types.ts`. Verifiser med `execute_sql`.

### B. Friends-lib + server-actions
- **`lib/friends/getFriendIds.ts`** — `getFriendIds(supabase, userId): Promise<string[]>` (accepted, begge retninger). Brukes av discovery + resolver + skip-gate.
- **`lib/friends/getFriendData.ts`** — `{ friends, incoming, outgoing, suggestions }` for venner-siden: accepted-venner (navn/nickname), innkommende pending (der jeg er addressee), utgående pending (der jeg er requester), og **forslag** = co-players (gjenbruk co-player-delen av `getTeamCandidates`-logikken) minus eksisterende venner/pending. Navn hentes via admin-client (users-RLS-gap, som `getClubDetail`).
- **`app/profile/venner/actions.ts`** — `sendRequest(addresseeId)`, `addByEmail(email)` (kaller `send_friend_request_by_email`; `not_found` → returner flagg så UI tilbyr `sendFriendInvite` med samme e-post), `respond(requestId, accept)`, `remove(otherId)`, `connect(code)`. Auth → RPC → best-effort `notify` → `revalidateTag`/`revalidatePath`. Mønster: `app/invite/actions.ts` + klubb-actions.
- **TDD (Type A):** ren logikk får test først — `getFriendIds` symmetri/dedup + `suggestions`-filtrering (co-players minus venner/pending). Mock kun ved Supabase-grensen.

### C. Venner-side (`/profile/venner`, NY) + inngang
- **`app/profile/venner/page.tsx`** — seksjoner: **Innkommende forespørsler** (Godta/Avslå), **Vennene dine** (navn + «Fjern» m/ inline bekreft-tilstand), **Sendt** (utgående pending, «Venter»), **Forslag** (co-players, «Legg til»), **Legg til på e-post** (felt → `addByEmail`; `not_found` → «Denne personen er ikke på Tørny ennå — vil du invitere dem?» → `sendFriendInvite`), **Del lenke** (kopier `/venner/legg-til/[friend_code]`).
- **`app/venner/legg-til/[code]/page.tsx`** (NY) — landing: «Bli venn med [navn]» → `connect_via_friend_code`. Uinnlogget → `/login?next=...`. Allerede venner → «Dere er allerede venner».
- **Profil-inngang:** «Venner»-`SettingRow` i `app/profile/page.tsx` (nær `InviteAFriendCard`).

### D. getTeamCandidates-union (lukker #408-kjernen)
- Utvid `lib/users/getTeamCandidates.ts`: `kandidater = venner(userId) ∪ co-players(userId)`, dedup på `id`. **Ingen** endring i `TeamCandidate`-shape eller `TeamRegistrationForm`. Oppdater `getTeamCandidates.test.ts` (ny case: venn uten delt spill dukker opp; venn+co-player dedupes).

### E. Varsler-wiring
- `friend_request` → addressee ved `sendRequest`/`addByEmail`. `friend_accepted` → requester ved `respond(accept)`/`connect`. Zod-schemas (`friend_id`/`actor_name`), EMOJI (🤝/✅-variant), `buildCardContent`-tekster, `buildDeeplink → /profile/venner`. Best-effort `notify` (`Promise.allSettled`).

### F. Åpen-for-venner: «Slipp venner direkte inn» + «Fra vennene dine»-discovery
- **Veiviser:** `RegistrationSection.tsx` — checkbox **«Slipp venner direkte inn»** rendret kun under `manual_approval`-radioen, bundet til `letFriendsSkipGate` i `useGameFormState`/`NewGameFormData`. `lib/games/gamePayload.ts` parser feltet; `createGameInternal` (`app/admin/games/new/actions.ts`) persisterer `let_friends_skip_gate`.
- **Veiviser roster (kompis):** i `PlayersSection.tsx`, under kompis-arrangement (`intent === 'kompis'`), vis venne-quick-add (fra `venner ∪ co-players`) for å legge til spillere/invitéer. Klubb-grenen uendret.
- **Discovery:** `getDiscoverableGames` får **`friendGames`**-seksjon: spill der `created_by ∈ getFriendIds(userId)`, `registration_mode in ('open','manual_approval')`, status oppdagbar, dedup vs `clubGames` + `openGames`. Hver `friendGame` får et avledet `joinMode`: `'direct'` når `open` **eller** (`manual_approval && let_friends_skip_gate`), ellers `'request'`. `HomeDiscoverySection` rendrer «Fra vennene dine»-seksjon med riktig CTA («Meld meg på» / «Be om å bli med»).
- **Signup-join:** `registerForOpenGame` — utvid `canDirectJoin` til `... OR (game.registration_mode = 'manual_approval' AND game.let_friends_skip_gate AND areFriends(viewer, game.created_by))`. Ikke-venn på `manual_approval` → uendret «be om å bli med» (ingen blindvei, ingen ny gate trengs — `invite_only`-modusen er den som skjuler spillet, ikke noe nytt).

### G. Docs / flyt / versjon
- Oppdater `docs/flows/02-bli-med-i-spill-fremtid.svg` (flytt venner fra «Senere» til bygget flyt) + regenerer PNG per `docs/flows/README.md`. `docs/user-flows.md` §0 + P5: venner, «Fra vennene dine», skip-gate.
- README: oppdater «Hva du får» hvis ny kapabilitet dokumenteres (venner + åpen-for-venner). `humanizer` på all ny norsk copy.
- `package.json` + `CHANGELOG.md`: **MINOR**-serie (nye bruker-synlige features). Plumbing-chunk (1) = `chore(db):`/`refactor` (ingen bump).

## Success Criteria
- [ ] **C1 — Schema applyt:** `friendships` (+RLS, secdef-only writes), `users.friend_code` (notnull/unique/format), `games.let_friends_skip_gate` (boolean default false), 5 RPCer (`send_friend_request`, `send_friend_request_by_email`, `respond_friend_request`, `remove_friend`, `connect_via_friend_code`) security definer m/ anon revoked, `friend_request`+`friend_accepted` kinds. *Verifiser:* MCP `execute_sql` mot `information_schema`/`pg_proc`/`pg_policies`/`pg_constraint` + `lib/database.types.ts` har feltene; `npx tsc --noEmit` + `npm run build` grønt.
- [ ] **C2 — Tre veier å legge til venn:** (a) co-player-forslag «Legg til» → pending; (b) e-post: eksisterende bruker → forespørsel, ukjent e-post → invitasjons-tilbud gjenbruker e-posten (`sendFriendInvite`); (c) `/venner/legg-til/[friend_code]` → accepted-relasjon direkte. *Verifiser:* Playwright + `execute_sql` (rad-effekter) + RPC-retur.
- [ ] **C3 — Gjensidig forespørsel→godta + varsler:** forespørsel lager pending + `friend_request`-varsel til mottaker; mottaker godtar (Innboks/venner-side) → `accepted` + `friend_accepted`-varsel til avsender; avslå sletter raden. *Verifiser:* `execute_sql` (status-overgang) + notify-test/observasjon.
- [ ] **C4 — Venneliste + fjern:** `/profile/venner` viser venner/innkommende/utgående/forslag; «Fjern» (inline bekreft) sletter accepted-relasjonen begge veier. *Verifiser:* Playwright + `execute_sql`.
- [ ] **C5 — Autocomplete-union (#408):** lag-påmeldings-autocomplete viser nå `venner ∪ co-players`; en venn uten delt spill dukker opp. *Verifiser:* `getTeamCandidates.test.ts` (ny case) + Playwright på `/signup/[shortId]/team`.
- [ ] **C6 — «Slipp venner direkte inn»:** veiviseren har checkbox kun under `manual_approval`, lagres som `let_friends_skip_gate`; en **venn** av arrangøren melder seg **direkte** på et slikt spill, en **ikke-venn** må be om å bli med. *Verifiser:* `execute_sql` (kolonne satt) + `getDiscoverableGames`/signup-test + Playwright begge stier.
- [ ] **C7 — «Fra vennene dine»-discovery:** venners `open`/`manual_approval`-spill vises i egen seksjon på `/finn-turneringer` + hjem; `invite_only` vises **aldri**; CTA korrekt (direkte ved `open` el. skip-gate+venn, ellers be-om); dedup vs klubb/open. *Verifiser:* `getDiscoverableGames.test.ts` (nye cases) + Playwright.
- [ ] **C8 — Veiviser kompis-venn-quick-add:** under kompis-arrangement kan oppretter legge til venner (`venner ∪ co-players`) som spillere i roster-steget; klubb-grenen uendret. *Verifiser:* Playwright + komponent-ref.
- [ ] **C9 — Ingen regresjon + gates grønne + docs/flyt:** eksisterende discovery/signup/#442-oppførsel uendret; `npm run build` grønn, berørte co-lokerte tester grønne, `02-bli-med-i-spill-fremtid` regenerert, `user-flows.md` oppdatert, ny norsk copy humanisert. *Verifiser:* `npm run build` + `npx vitest run` + `git diff` + flow-regen.

## Gates
- [ ] `npx tsc --noEmit` passerer (etter hver chunk; fanger let_friends_skip_gate/exhaustive-hull i notification-maps).
- [ ] `npx vitest run <co-lokerte testfiler>` passerer; full `npx vitest run` før evaluering hvis delte filer (`getDiscoverableGames`, `getTeamCandidates`, `notifications/types`, `GameWizard`) er rørt.
- [ ] `npm run build` passerer (nye ruter kompilerer; Record/switch-uttømming i NotificationCard/InboxClient).
- [ ] MCP `execute_sql`-verifikasjon (C1–C7 schema/RLS/RPC/rad-effekter).
- [ ] Playwright (preview-tools) verifiserer C2–C8 i nettleser.
- [ ] `humanizer` på alle nye/endrede norske strenger før commit.
- [ ] `feat(...)`-commits bumper `package.json` + `CHANGELOG.md` (commit-msg-hook); `chore(db):`/`refactor` for chunk 1-plumbing. **Worktree-hook-fix engang før første commit** (`git config --worktree core.hooksPath .githooks`).

## Files Likely Touched
- `supabase/migrations/0077_friendships_and_friend_visibility.sql` — **ny** (friendships + RLS + 5 RPCer + friend_code + let_friends_skip_gate + kind-CHECK).
- `lib/database.types.ts` — regenerert.
- `lib/friends/getFriendIds.ts`, `lib/friends/getFriendData.ts` (+ tester) — **nye**.
- `app/profile/venner/page.tsx` + `actions.ts` + klient-komponent(er), `app/venner/legg-til/[code]/page.tsx` — **nye**.
- `app/profile/page.tsx` — «Venner»-inngang.
- `lib/users/getTeamCandidates.ts` (+ `.test.ts`) — venne-union.
- `lib/notifications/types.ts` + `notify`-konsumenter, `components/notifications/NotificationCard.tsx`, `app/innboks/InboxClient.tsx` — `friend_request`/`friend_accepted`.
- `app/admin/games/new/sections/RegistrationSection.tsx` + `PlayersSection.tsx` + `GameWizard.tsx` + `useGameFormState`, `lib/games/gamePayload.ts`, `app/admin/games/new/actions.ts` — skip-gate checkbox + kompis-venn-quick-add + persist.
- `lib/games/getDiscoverableGames.ts` (+ `.test.ts`), `app/HomeDiscoverySection.tsx`, `app/finn-turneringer/page.tsx` — friendGames-seksjon.
- `app/signup/[shortId]/actions.ts` (+ `page.tsx`) — skip-gate direkte-join.
- `app/invite/actions.ts` — gjenbrukes (e-post-ukjent → invitasjon); evt. liten refaktor for å kalle fra venner-action.
- `docs/flows/02-bli-med-i-spill-fremtid.svg` (+ regenerert `.png`), `docs/user-flows.md`, `README.md`.
- `package.json` + `CHANGELOG.md` — MINOR-serie for #369/#408.

## Foreslått chunk-rekkefølge (subagent-drevet for de substansielle)
1. **Schema + RPCer + types** (C1) — `chore(db):`, apply via MCP, verifiser.
2. **Friends-lib + server-actions + TDD** (B) — `refactor`/`feat` (ren logikk testes først).
3. **Venner-side + lenke-landing + profil-inngang** (C2/C3/C4) — `feat` (MINOR åpner serien).
4. **getTeamCandidates-union** (C5) — `feat`, test oppdatert.
5. **Varsler-wiring** (E) — `feat`.
6. **Skip-gate + «Fra vennene dine»-discovery + signup + kompis-quick-add** (C6/C7/C8) — `feat`.
7. **Docs/flyt + full verifisering + humanizer** (C9).

## Out of Scope (→ evt. senere saker)
- **Klubb-scoped påmelding** — ferdig i #442.
- Ett-veis «følg», venne-grupper/lister, blokkering, venne-forslag basert på felles venner.
- Resend-mail for venneforespørsel (in-app-varsel holder; mail kun for ikke-bruker-invitasjon via eksisterende flyt).
- Egen «kun venner»-discovery-modus (eier valgte å uttrykke åpen-for-venner via eksisterende modi + skip-gate, ikke en 4. modus).
- E2E-spec utover Playwright-verifisering i evaluator + unit/render-tester.
