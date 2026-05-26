# Spec: Selv-påmelding til turnering

**Issue:** [#199](https://github.com/jdlarssen/golf-app/issues/199) — Selv-påmelding til turnering (fri-slipp / manuell godkjenning / invite-only + solo/lag/begge)
**Branch:** `claude/distracted-lalande-1d5cd3`
**Berører ruter:** `app/admin/games/new`, `app/opprett-spill`, `app/admin/games/[id]`, `app/admin/games/[id]/påmeldinger` (ny), `app/påmelding/[shortId]` (ny), `app/profile/historikk` (selv-trekk), `app/(auth)/login/actions.ts` (utvider eksisterende `notifyInvitedToGame`-hook med team-invite-fallback), `lib/notifications`, `lib/mail`, `supabase/migrations/0040–0043`
**Bump:** MINOR til `1.32.0`. Ny bruker-synlig funksjon (offentlig påmeldings-flate, godkjennings-UI, lag-formasjon, 5 nye notifikasjons-typer). Bygger oppå #166 (selv-registrering) + #182 (game-scoped invites, shipped 1.29.0) + #47 fase 1 (Ryder Cup-grunnmur). Datamodellen er additiv — ingen breaking endring for kompis-kjernen.
**Sluttmål:** Closes #199.

## Problem

I dag må arrangøren invitere hver spiller eksplisitt via `/admin/spillere`. For klubb-skala (og ofte kompis-skala) er det friksjon — én admin er flaskehals. Målet: arrangøren oppretter spillet, deler en kort lenke (`/påmelding/<8-char-id>`), og spillere melder seg på selv via en av tre modi:

- **`open`** — hvem som helst med lenken melder seg på direkte (etter login).
- **`manual_approval`** — spillere sender forespørsel, arrangør godkjenner per påmelding.
- **`invite_only`** — dagens flyt, uendret (kun pre-inviterte e-poster kommer gjennom).

Orthogonal akse: hva man melder på.

- **`solo`** — individuell påmelding (dagens stableford/best-ball-flyt).
- **`team`** — for Scramble / Ryder Cup. Kapteinen oppretter laget; medspillere kobles via in-app-varsel (kjente brukere) eller mail-invitasjon (ukjente). Lag-medlemskap er låst gjennom spillet.
- **`both`** — solo + lag tillatt i samme spill (hybrid-formater).

Selv-registrering ([#166](https://github.com/jdlarssen/golf-app/issues/166), shipped 2026-05-26) løste at ukjente e-poster kan opprette konto. Denne kontrakten bygger på det: en ukjent som klikker en `open`-lenke kan gå gjennom `/login` (med `NEXT_PUBLIC_ALLOW_SELF_REGISTRATION=true`), fullføre profil, og lande tilbake på påmeldings-siden uten admin-mellomledd.

## Research Findings

Ingen nye eksterne biblioteker. Verifisert mot dagens kode (post-#166-rebase, 2026-05-26):

- **`games`-skjema** ([`supabase/migrations/0001_initial_schema.sql:41–53`](supabase/migrations/0001_initial_schema.sql:41), utvidet til 0035): kolonner som er relevante her — `id (uuid)`, `status`, `created_by`, `game_mode`, `mode_config`. RLS i 0002:66–73: SELECT er gated på admin OR `game_players`-membership; INSERT/UPDATE er admin-only. Ny INSERT-policy må gates på `registration_mode != 'invite_only'` — eller vi bypasser via admin-client (samme mønster som #198 trusted creators).
- **`game_players`-skjema** ([`supabase/migrations/0001_initial_schema.sql:55–65`](supabase/migrations/0001_initial_schema.sql:55), 0030 gjorde team/flight nullable): INSERT er admin-only ([`0002:85–86`](supabase/migrations/0002_rls_policies.sql:85)). `game_players_team_flight_consistency`-CHECK ([`0030:39`](supabase/migrations/0030_game_modes.sql:39)) krever at både team_number og flight_number er begge null eller begge set. Selv-påmelding på `texas_scramble` må derfor sette team_number FØR insert — det betyr at kapteinen velger team-slot eller systemet auto-tildeler.
- **Notifikasjons-infrastruktur** ([`supabase/migrations/0032_notifications.sql`](supabase/migrations/0032_notifications.sql), [`lib/notifications/notify.ts:26–71`](lib/notifications/notify.ts:26), [`lib/notifications/types.ts:8–14`](lib/notifications/types.ts:8)): tabell + `notify()`-helper + 6 `kind`-verdier i CHECK-constraint og Zod-schema. `notify()` returnerer `shouldAlsoSendMail`-flagg basert på `users.last_seen_at` (5-min terskel) — caller fyrer mail-IO etterpå. Realtime er wired ([`hooks/useUnreadNotificationsCount.ts`](hooks/useUnreadNotificationsCount.ts)). UI lever på [`/innboks`](app/innboks/page.tsx) + `NotificationBell` i top-bar.
- **Login-flow post-#166** ([`app/(auth)/login/actions.ts:39–63`](app/(auth)/login/actions.ts:39)): `shouldCreateUser = Boolean(isInvited) || allowSelfReg` (env-flagget). `verifyCode` stamps `invitations.accepted_at` for matching e-poster. Det er HER vi hooker inn deferred-notify for game-scoped flows: hvis bruker som nettopp logget inn har en pending `invitations`-rad med `game_id` satt, opprett en notification etter OTP-verify og auto-joiner game_players hvis registration_mode er `open` (eller marker som approved-rad i request-tabellen for `manual_approval`).
- **Rate-limit-primitiv** ([`supabase/migrations/0026_admin_action_rate_limit.sql:31–70`](supabase/migrations/0026_admin_action_rate_limit.sql:31), [`lib/admin/rateLimit.ts:25`](lib/admin/rateLimit.ts:25), [`lib/auth/loginRateLimit.ts`](lib/auth/loginRateLimit.ts)): generisk bucket-RPC `consume_admin_rate_limit(bucket, max, window_seconds)`. Vi gjenbruker den med tre nye buckets — se §5.10.
- **Existing `invitations`-tabell** ([`supabase/migrations/0001_initial_schema.sql:78–93`](supabase/migrations/0001_initial_schema.sql:78)): har allerede `game_id`-FK (`ON DELETE CASCADE`), `token`, `expires_at`, `accepted_at`. Bra for ukjente lag-medlemmer — vi opprydder ikke noe, bare bruker `game_id`-feltet som var udokumentert til nå.
- **Game creation flow** ([`app/admin/games/new/actions.ts:79–145`](app/admin/games/new/actions.ts:79), [`lib/games/gamePayload.ts`](lib/games/gamePayload.ts), [`app/opprett-spill`](app/opprett-spill/page.tsx)): begge ruter bruker `GameWizard`-komponent. Wizard har "Spillere"-steg som i dag krever at admin velger spillere fra eksisterende-bruker-roster. For selv-påmeldings-modi (`open` / `manual_approval`) skal dette steget kunne hoppes over (eller bli valgfritt — admin kan pre-populere med noen kjernespillere og la resten melde seg på selv).
- **Ingen slug-kolonne på `games`**. URL-strategi: `/påmelding/[shortId]` med ny `games.short_id`-kolonne (8-char base32, generert ved insert via DB-trigger eller server-side).
- **Eksisterende `invitations.game_id`** ([`0001:85`](supabase/migrations/0001_initial_schema.sql:85)) brukes ikke i dag (NULL alltid). [#182](https://github.com/jdlarssen/golf-app/issues/182) har kontrakt for game-scoped invites men er ikke shipped. Vi henter det wiremost i denne kontrakten — våre ukjent-bruker-team-invites bruker `invitations.game_id`-feltet rett.

## Prior Decisions

- **Fra [#166](https://github.com/jdlarssen/golf-app/issues/166) (selv-registrering, shipped 2026-05-26):** env-flagget `NEXT_PUBLIC_ALLOW_SELF_REGISTRATION` + login-rate-limit + honeypot finnes allerede. Vi avhenger av at flagget er `true` i prod for at `open`-modus skal fungere for ukjente e-poster. Hvis admin har slått flagget av, faller `open`-modus tilbake til "kjente brukere kan melde seg på" — ukjente møter samme `user_not_found`-error som før #166. Vi flagger dette i admin-UI med en infobokse hvis flagget er av.
- **Fra [#198](https://github.com/jdlarssen/golf-app/issues/198) (trusted creators, shipped 2026-05-24):** `requireAdminOrTrustedCreator()` finnes som auth-gate. Trusted creators får samme rettigheter til å sette `registration_mode` / `registration_type` som admin. INSERT på `games` bypasses via `getAdminClient()` for å unngå RLS-konflikt — vi gjør samme her for `game_registration_requests`-approval-action.
- **Fra [#182](https://github.com/jdlarssen/golf-app/issues/182) (game-scoped invite notifications, shipped 1.29.0):** `notifyInvitedToGame(opts)`-helperen ([`lib/notifications/notifyInvitedToGame.ts`](lib/notifications/notifyInvitedToGame.ts)) finnes og kalles fra picker-add, backfill-flyten i `/admin/games/new` og deferred-notify i `verifyCode` ([`app/(auth)/login/actions.ts:219–221`](app/(auth)/login/actions.ts:219)). Vi bygger team-invite-flyten oppå dette: ny `notifyInvitedToTeam`-helper (eller utvidet `notifyInvitedToGame` med valgfri `team_name`-parameter, se §5.6) som bruker en ny `kind: 'team_invite'`-payload. Bruker IKKE samme `invite`-kind fordi semantikken er forskjellig — `invite` betyr «admin la deg til», `team_invite` betyr «kapteinen vil ha deg i sitt lag (du må bekrefte)».
- **Fra [#47 fase 1](https://github.com/jdlarssen/golf-app/issues/47) (Ryder Cup-grunnmur, shipped 1.31.x):** `tournaments`-tabell + `games.tournament_id`-FK finnes (migrasjon 0039). Cup-er er multi-match wrappers. Denne kontrakten griper IKKE inn i cup-flyten — selv-påmelding gjelder per game-rad, ikke per tournament. Hvis en spiller melder seg på via `/påmelding/[shortId]` til en match som er del av en cup, behandles det som vanlig spill-påmelding; cup-aggregeringen plukker dem opp via tournament_id-joinen. Vi flagger evt. UX-implikasjoner i admin-pending-side om matchet tilhører en cup.
- **Notifikasjons-pattern:** in-app-notification er primær signal; mail er backup via `shouldAlsoSendMail` (5-min `last_seen_at`-terskel). Ingen mail-preferences-tabell finnes — alle notifikasjoner bruker samme gating. Det er fint for denne kontrakten.
- **`/complete-profile`-flow:** brukere uten `profile_completed_at` redirectes dit av middleware. Self-registered brukere (post-#166) går samme vei. Selv-påmeldings-flyten setter `next=/påmelding/<shortId>` så de lander tilbake på rett sted etter onboarding.

## Design

### 5.1 Datamodell

**Migrasjon 0040 — `games_self_registration_columns.sql`**

```sql
-- Akse 1: registration mode
CREATE TYPE public.registration_mode AS ENUM ('invite_only', 'manual_approval', 'open');
ALTER TABLE public.games ADD COLUMN registration_mode public.registration_mode
  NOT NULL DEFAULT 'invite_only';

-- Akse 2: registration type
CREATE TYPE public.registration_type AS ENUM ('solo', 'team', 'both');
ALTER TABLE public.games ADD COLUMN registration_type public.registration_type
  NOT NULL DEFAULT 'solo';

-- Public short ID: 8-char base32. Generert ved INSERT via DB-side default.
ALTER TABLE public.games ADD COLUMN short_id text
  UNIQUE
  CHECK (short_id ~ '^[0-9a-z]{8}$');

-- Generator: 8 tegn fra base32-alfabet (0-9, a-z minus de letteforvirrende — vi tar
-- alle 36 og lever med det fordi 36^8 ≈ 2.8 trillion kombinasjoner).
CREATE OR REPLACE FUNCTION public.generate_game_short_id() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  alphabet text := '0123456789abcdefghijklmnopqrstuvwxyz';
  result text;
  i int;
  candidate text;
BEGIN
  FOR i IN 1..20 LOOP  -- max 20 forsøk før vi gir opp (kollisjon skal være ~0)
    result := '';
    FOR i IN 1..8 LOOP
      result := result || substr(alphabet, 1 + floor(random() * 36)::int, 1);
    END LOOP;
    -- Sjekk unikhet — race-vindu er minimalt fordi UNIQUE-constraint fanger
    -- alle parallelle inserts uansett.
    PERFORM 1 FROM public.games WHERE short_id = result;
    IF NOT FOUND THEN
      RETURN result;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'Kunne ikke generere unik short_id etter 20 forsøk';
END $$;

-- Backfill eksisterende games (ingen — vi er pre-1.0 alpha med få spill, men
-- migrasjonen må fungere idempotent uansett).
UPDATE public.games SET short_id = public.generate_game_short_id() WHERE short_id IS NULL;
ALTER TABLE public.games ALTER COLUMN short_id SET NOT NULL;
ALTER TABLE public.games ALTER COLUMN short_id SET DEFAULT public.generate_game_short_id();

CREATE INDEX games_short_id_idx ON public.games (short_id);
```

**Migrasjon 0041 — `game_registration_requests.sql`**

```sql
CREATE TYPE public.registration_request_status AS ENUM ('pending', 'approved', 'rejected', 'withdrawn');

CREATE TABLE public.game_registration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status public.registration_request_status NOT NULL DEFAULT 'pending',
  team_name text,                     -- valgfri ved team/both — kapteinens lag-navn
  is_team_captain boolean NOT NULL DEFAULT false,
  team_request_id uuid REFERENCES public.game_registration_requests(id) ON DELETE CASCADE,
  -- ↑ peker til kapteins-rad for medspillere; null for solo eller kaptein-selv
  rejection_reason text,
  message text,                       -- valgfri "hilsen" fra søker til admin (max 200 char)
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by_user_id uuid REFERENCES public.users(id),
  UNIQUE (game_id, user_id)           -- ingen dobbelt-påmelding per bruker per spill
);

CREATE INDEX game_reg_requests_game_status_idx ON public.game_registration_requests (game_id, status);
CREATE INDEX game_reg_requests_user_idx ON public.game_registration_requests (user_id);
CREATE INDEX game_reg_requests_team_idx ON public.game_registration_requests (team_request_id) WHERE team_request_id IS NOT NULL;

ALTER TABLE public.game_registration_requests ENABLE ROW LEVEL SECURITY;

-- SELECT: bruker ser egne rader; admin/creator ser alle for spillet.
CREATE POLICY "view own requests" ON public.game_registration_requests
  FOR SELECT USING (user_id = auth.uid() OR public.is_game_creator_or_admin(game_id));

-- INSERT: authenticated bruker kan opprette egen pending-rad, gated på at
-- spillet faktisk har manual_approval-modus og ikke er startet.
CREATE POLICY "self request pending" ON public.game_registration_requests
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = game_id
        AND g.registration_mode = 'manual_approval'
        AND g.status IN ('draft', 'scheduled')
    )
  );

-- UPDATE: bare admin/creator kan oppdatere status. Bruker kan oppdatere
-- status til 'withdrawn' på egen rad.
CREATE POLICY "admin updates request" ON public.game_registration_requests
  FOR UPDATE USING (public.is_game_creator_or_admin(game_id));
CREATE POLICY "self withdraw" ON public.game_registration_requests
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (status = 'withdrawn');

-- Hjelpe-funksjon (SECURITY DEFINER for å unngå RLS-rekursjon ved gate-check).
CREATE OR REPLACE FUNCTION public.is_game_creator_or_admin(p_game_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.games g
    WHERE g.id = p_game_id
      AND (g.created_by = auth.uid() OR public.is_admin())
  )
$$;
```

**Migrasjon 0042 — `game_players_self_register_and_withdraw.sql`**

```sql
-- Tillat authenticated bruker å INSERT egen rad i game_players, men kun
-- når games.registration_mode = 'open' OG spillet ikke er startet.
-- (`manual_approval`-modus bruker IKKE denne flyten — der lager admin
-- raden via approval-action med admin-client-bypass.)
CREATE POLICY "self register open game" ON public.game_players
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = game_id
        AND g.registration_mode = 'open'
        AND g.status IN ('draft', 'scheduled')
    )
  );

-- Self-withdraw: spiller kan slette egen rad pre-active.
CREATE POLICY "self withdraw before start" ON public.game_players
  FOR DELETE USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = game_id
        AND g.status IN ('draft', 'scheduled')
    )
  );
```

**Migrasjon 0043 — `notifications_self_registration_kinds.sql`**

```sql
-- Utvid CHECK-constraint på notifications.kind med fire nye kinds.
ALTER TABLE public.notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK (
  kind IN (
    'invite',
    'peer_approval_request',
    'scorecard_submitted',
    'scorecard_approved',
    'game_finished',
    'product_update',
    'team_invite',              -- ny: kaptein inviterer kjent bruker til lag
    'registration_request',     -- ny: bruker bad om å bli med (til admin)
    'registration_approved',    -- ny: admin godkjente forespørsel
    'registration_rejected'     -- ny: admin avslo forespørsel
  )
);
```

### 5.2 Auth & landing-flyt

Public URL: `/påmelding/[shortId]`. Server-component renderer landing.

```ts
// app/påmelding/[shortId]/page.tsx
async function PaameldingPage({ params }) {
  const { shortId } = await params;
  const game = await fetchGameByShortId(shortId);  // bruker admin-client for å bypass RLS — slik at uthentede brukere kan se base-info
  if (!game) notFound();

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=/påmelding/${shortId}`);
  }

  if (!user.profile_completed_at) {
    redirect(`/complete-profile?next=/påmelding/${shortId}`);
  }

  // Game.registration_mode === 'invite_only' → "Dette spillet krever invitasjon"
  // Game.status NOT IN ('draft', 'scheduled') → "Påmelding stengt"
  // Game.registration_mode === 'open' → render solo + (hvis type tillater) lag-flow
  // Game.registration_mode === 'manual_approval' → render request-form

  ...
}
```

`proxy.ts` må whitelist-e `/påmelding/*` slik at uautentiserte brukere får besøke siden (vi redirecter dem selv til `/login` med `next`-param). Sjekk eksisterende proxy-matcher — `/legal/privacy` er allerede whitelisted, samme mønster.

### 5.3 Solo open-modus

Enklest flow:

1. Bruker klikker lenken. Logget inn + profil komplett → ser CTA «Meld meg på».
2. POST til `/påmelding/[shortId]/actions:register` (server action).
3. Server gjør:
   - Rate-limit-sjekk (per-user, per-IP — se §5.10).
   - Sjekk: `game.registration_mode === 'open'` (cache-bypass via short-id-lookup).
   - Sjekk: `game.status IN ('draft', 'scheduled')`.
   - Sjekk: `max_players` ikke overskredet (hvis felt finnes — se §5.7).
   - INSERT `game_players` med `user_id=auth.uid()`, team_number/flight=null (for `stableford` / `solo_strokeplay_netto`), eller auto-tildelt slot for team-modi (se §5.6).
   - `revalidateTag(\`game-${gameId}\`, 'max')`.
   - `notify({ userId: game.created_by, kind: 'registration_request', payload: ... })` med "successfully joined"-variant — admin får varsel når noen melder seg på.
4. Redirect til `/games/[id]` (rett inn i spillet).

**Idempotens:** UNIQUE-constraint på `game_players (game_id, user_id)` fanger duplikater. Server-action konverterer Postgres `23505`-error til vennlig melding: «Du er allerede påmeldt».

### 5.4 Solo manual-approval-modus

1. Bruker klikker lenken, ser request-form med valgfri "hilsen"-tekstrute (max 200 tegn).
2. POST til `/påmelding/[shortId]/actions:requestApproval`.
3. Server INSERT-er rad i `game_registration_requests` (status=pending).
4. `notify({ userId: game.created_by, kind: 'registration_request', payload: { game_id, game_name, requester_name, message } })` — admin varsel i innboks.
5. `shouldAlsoSendMail` ⇒ send mail via `lib/mail/registrationRequest.ts` (best-effort, `Promise.allSettled` + `console.error`-mønster fra eksisterende mail-helpers).
6. Søker ser kvittering: «Forespørsel sendt — du får varsel når arrangøren har bestemt seg.»

Admin-side på `/admin/games/[id]/påmeldinger` viser pending med approve/reject-knapper:

- Approve → admin-action: UPDATE-status til `approved`, sett `decided_at`, `decided_by_user_id`. Admin-client INSERT i `game_players`. Notify søker med `registration_approved`. Mail-backup ved off-app.
- Reject → modal med valgfri rejection_reason (200 chars). UPDATE status. Notify søker med `registration_rejected` (payload inneholder reason). Mail-backup.

### 5.5 Solo invite-only-modus

**No-op for selve påmeldingen** — dagens flyt uendret. Lenken `/påmelding/[shortId]` til et invite_only-spill viser «Dette spillet krever invitasjon. Spør arrangøren om å sende deg en.» Ingen knapp for selvbetjening.

Hvis bruker har en pending `invitations`-rad med `game_id = game.id`, viser vi i stedet «Du har en invitasjon. Logg inn for å akseptere.» med login-knapp. Dette gir et naturlig fallback for brukere som klikker lenken før de har sett mailen.

### 5.6 Team-formasjon (kaptein-flyt med dynamisk kjent/ukjent)

Kaptein-flyt for `registration_type IN ('team', 'both')`:

1. Bruker (kaptein) klikker `/påmelding/[shortId]`, velger "Lag-påmelding" (hvis `both`-modus) eller får automatisk lag-form (hvis `team`-only).
2. Form-felter:
   - Lag-navn (påkrevd, 3–40 tegn).
   - Medspillere — én rad per slot (basert på `mode_config.team_size`, default 4 for Texas Scramble). Hver rad er enten:
     - Lookup-felt for kjente Tørny-brukere (autocomplete fra `users`-tabellen, søker på navn/e-post).
     - Manuell e-post-felt (toggle: «Inviter via e-post»).
3. Submit:
   - Rate-limit-sjekk.
   - INSERT kaptein-rad i `game_registration_requests` (status=approved hvis `open`-modus, pending hvis `manual_approval`-modus). Sett `is_team_captain=true`, `team_name`.
   - For hver kjent medspiller:
     - INSERT rad i `game_registration_requests` (status matches kapteinens; `team_request_id` peker til kapteinens rad).
     - `notify({ userId, kind: 'team_invite', payload: { game_id, game_name, team_name, invited_by_name, request_id } })`.
     - Mail-backup ved off-app.
   - For hver ukjent e-post:
     - Sjekk om e-posten finnes i `auth.users` via `email_is_invited`-style RPC (utvid eller lag ny `lookup_user_by_email` SECURITY DEFINER).
     - Hvis finnes → behandle som kjent (notify pluss request-rad).
     - Hvis ikke → INSERT rad i `invitations` med `game_id`, `token`, `expires_at = now() + interval '7 days'`. Send mail via `lib/mail/teamInvitation.ts` med link til `/login?next=/påmelding/[shortId]?team=<request_id>`.
4. For hver `open`-modus team-medspiller: når invitéen aksepterer (klikker notification eller mail-link), POST til `/påmelding/[shortId]/actions:joinTeam` som verifiserer request_id, sjekker at request er fortsatt åpen, og INSERT-er `game_players` direkte (om `open`) eller venter på admin (om `manual_approval`).
5. For ukjente brukere som klikker mail-link til `/login`: `verifyCode`-action ([`app/(auth)/login/actions.ts`](app/(auth)/login/actions.ts)) sjekker for matchende `invitations.game_id` etter OTP-verify, oppretter deferred `team_invite`-notification, og redirecter til påmeldings-siden.

**Auto-team-assignment:** `team_number` settes ved approval. Kaptein får team_number = laveste ledige slot (1, 2, 3, ...). Medspillere får samme team_number ved INSERT i `game_players`. `flight_number = team_number` (auto-default), admin kan re-tildele flights senere som i dag.

**Captain dashboard:** Kaptein ser pending medspillere på `/påmelding/[shortId]/team` (egen UI) med "Send påminnelse"-knapp (re-sender notification + mail) og "Fjern medspiller"-knapp (slett deres request-rad).

### 5.7 Lag-låsing semantikk

**"Låst" betyr at lag-medlemskap (team_number) er konstant gjennom spillet.** Flight-tildeling forblir admin-flexible — admin kan flytte hele laget mellom flights, men ikke splitte medlemmer mellom team.

**Trekk-fra-lag pre-start:**

- Medspiller utfører self-DELETE på `game_players` (§5.1 ny RLS-policy).
- Trigger på DELETE oppretter notification til kaptein (`team_invite`-variant med "medspiller trakk seg"-payload? — vi bruker en egen kind hvis det blir for kunstig; alternativt en custom system-kind for team-membership-changes).
- Faktisk: vi bruker `registration_rejected`-kind på kaptein-siden er feil — la oss legge til en femte ny kind: `team_member_withdrew` med payload `{ game_id, game_name, withdrawn_player_name, team_name }`.
- Laget eksisterer videre. Hvis `mode_config.team_size = 4` og laget faller til 3, viser admin-UI en warning ("Lag X har 3 av 4 spillere"). Admin kan starte spillet uansett — vi blokkerer ikke status-overgangen til `active`.
- Kapteinen kan invitere ny medspiller via `/påmelding/[shortId]/team` (re-bruker form-en fra §5.6 med tom slot).

**Kaptein trekker seg:** dette er mer brutalt. Hvis kapteinen sletter egen `game_players`-rad, oppløses laget _ikke_ automatisk (vi vil ikke at en accidental click skal slette flere personer). Men admin-UI viser en warning, og admin kan promotere en medspiller til kaptein via et knapp («Gjør X til kaptein»). Hvis ingen i laget vil ta over, kan admin slette hele laget.

**Min/max lag-størrelse:** validert mot `mode_config.team_size` ved spill-start (`status` → `active`). Server-action `startGame` legger til ny check: «Lag X mangler Y spillere — start uansett?». Ikke blokkering, bare bekreftelse.

### 5.8 Admin-UI endringer

**`/admin/games/new` + `/opprett-spill`** — `GameWizard` får nytt steg eller felt-gruppe «Påmelding»:

- Radio: registration_mode (`invite_only` / `manual_approval` / `open`). Default `invite_only` (matcher dagens flyt — ingen overraskelser for eksisterende brukere).
- Radio: registration_type (`solo` / `team` / `both`). Default `solo`. Disablet for spill-modus uten team-støtte (e.g. stableford → `team` er ikke valgbar).
- Hjelpe-tekst som forklarer hver modus.
- Hvis registration_mode != `invite_only`: vis preview av delbar lenke (`tornygolf.no/påmelding/[shortId]`) etter at spillet er opprettet.

Eksisterende «Spillere»-steg blir valgfritt når mode != `invite_only` — admin kan opprette spillet uten å ha valgt noen spillere på forhånd og overlate det helt til selv-påmelding.

**`/admin/games/[id]`** — game-detalj-side får nytt section «Påmeldinger» når mode != `invite_only`:

- Antall pending requests (om `manual_approval`).
- Antall self-registered spillere (om `open`).
- Knapp «Vis alle påmeldinger» → `/admin/games/[id]/påmeldinger`.
- «Kopier lenke»-knapp som kopierer `tornygolf.no/påmelding/[shortId]` til clipboard.

**`/admin/games/[id]/påmeldinger`** — ny side. Lister:

- Pending requests (om `manual_approval`) med approve/reject-knapper.
- Approved/rejected/withdrawn requests (med filter-tabs).
- Team-grupperinger når `registration_type` involves teams.
- Search/sort-felt.

### 5.9 RLS-oppsummering

Datamodellen krever fire RLS-tilpasninger:

| Tabell | Operasjon | Ny policy | Gate |
|---|---|---|---|
| `game_players` | INSERT | `self register open game` | `registration_mode = 'open'` AND status pre-active |
| `game_players` | DELETE | `self withdraw before start` | `auth.uid() = user_id` AND status pre-active |
| `game_registration_requests` | INSERT | `self request pending` | `registration_mode = 'manual_approval'` AND status pre-active |
| `game_registration_requests` | UPDATE | `admin updates request` / `self withdraw` | admin or creator / self-only with status=withdrawn |

Eksisterende `game_players` admin-only INSERT/UPDATE-policies forblir uendret. Approval-action bypasser RLS via `getAdminClient()`.

### 5.10 Rate-limiting

Gjenbruk `consume_admin_rate_limit`-RPC med tre nye buckets:

- `selfreg:user:<user_id>` — 5 påmeldinger per 24 timer per bruker.
- `selfreg:ip:<ip>` — 10 påmeldinger per 24 timer per IP.
- `selfreg:game:<game_id>` — 50 påmeldinger per 24 timer per spill (vern mot brute-force på enkelt-spill).

Implementert i ny [`lib/auth/registrationRateLimit.ts`](lib/auth/registrationRateLimit.ts), mønster identisk med [`lib/auth/loginRateLimit.ts`](lib/auth/loginRateLimit.ts). Fail-open ved transient DB-error.

Honeypot-felt (`website`) på alle public registration-forms, short-circuit-suksess-respons som [`login/actions.ts:19–31`](app/(auth)/login/actions.ts:19).

### 5.11 Notifications utvidelse

Nye `kind`-verdier i [`lib/notifications/types.ts`](lib/notifications/types.ts):

```ts
type NotificationKind =
  | 'invite' | 'peer_approval_request' | 'scorecard_submitted'
  | 'scorecard_approved' | 'game_finished' | 'product_update'
  | 'team_invite'             // payload: { game_id, game_name, team_name, invited_by_name, request_id }
  | 'registration_request'    // payload: { game_id, game_name, requester_name, request_id, message? }
  | 'registration_approved'   // payload: { game_id, game_name }
  | 'registration_rejected'   // payload: { game_id, game_name, reason? }
  | 'team_member_withdrew';   // payload: { game_id, game_name, withdrawn_player_name, team_name }
```

Zod-schema for hver. CHECK-constraint i 0042 matcher.

`NotificationCard.tsx` får rendring for hver ny kind:

- `team_invite` → «🤝 {invited_by_name} inviterte deg til {team_name} i {game_name}» + accept/decline-knapper.
- `registration_request` → «📩 {requester_name} vil bli med i {game_name}» + lenke til admin-side.
- `registration_approved` → «✅ Du er med i {game_name}» + lenke til spill.
- `registration_rejected` → «❌ Søknad til {game_name} ble avslått{reason ? `: ${reason}` : ''}».
- `team_member_withdrew` → «👋 {withdrawn_player_name} trakk seg fra {team_name}» + lenke til team-side.

InboxClient-deeplinks oppdateres tilsvarende.

### 5.12 Mail-flyt

Fire nye mail-templates i [`lib/mail/`](lib/mail/):

- `registrationRequest.ts` — til admin når noen sender request. Subject: «Ny påmelding til {game_name}». Body: requester + valgfri hilsen + lenke til admin-godkjenningsside.
- `registrationApproved.ts` — til søker. Subject: «Du er med i {game_name}». Body: kort velkomst + lenke til /games/[id].
- `registrationRejected.ts` — til søker. Subject: «Søknad til {game_name}». Body: «Din forespørsel ble dessverre ikke godkjent.» + valgfri grunn-tekst.
- `teamInvitation.ts` — til ukjente lag-medspillere. Subject: «Du er invitert til {team_name} ({game_name})». Body: kaptein-info + lenke til /login med next-param.

Alle bruker eksisterende Resend-helper (`getResend()`, `getFromAddress()` fra [`lib/mail/inviteNotification.ts`](lib/mail/inviteNotification.ts)). Best-effort via `Promise.allSettled` + `console.error` — match mønster.

Norsk språk-kvalitet: kjør `humanizer:humanizer`-skillet på alle mail-bodies før commit (per CLAUDE.md). Pre-commit-hooken advarer ved AI-tells.

## Success Criteria

Hver criterion er falsifierbar — evaluatoren skal kunne bekrefte med kommando-output, file:line-ref, eller observert oppførsel (Playwright/manuell).

### Datamodell

- [ ] `games.registration_mode` enum-kolonne finnes med default `invite_only` og non-null-constraint. Eksisterende rader har `invite_only`. **Evidence:** `psql -c "\d public.games"` viser kolonnen; SELECT COUNT viser at alle eksisterende har default.
- [ ] `games.registration_type` enum-kolonne finnes med default `solo`. **Evidence:** samme som over.
- [ ] `games.short_id` er 8-char base32 streng, unik, non-null. Generert via `generate_game_short_id()`-DB-funksjon. **Evidence:** `SELECT short_id FROM games LIMIT 10` viser 8-char strings; duplicate-test feiler.
- [ ] `game_registration_requests`-tabell finnes med kolonner per §5.1 og fire RLS-policies enabled. **Evidence:** `\d game_registration_requests` + `\d public.game_registration_requests` viser policies.
- [ ] `notifications.kind`-CHECK utvidet med 5 nye verdier (`team_invite`, `registration_request`, `registration_approved`, `registration_rejected`, `team_member_withdrew`). **Evidence:** `\d+ public.notifications` viser CHECK.
- [ ] To nye `game_players`-RLS-policies finnes: self-register-open + self-withdraw-pre-start. **Evidence:** `\d public.game_players` viser policies.

### Admin-UI

- [ ] `GameWizard` har «Påmelding»-felt-gruppe med radio for mode + type, med hjelpe-tekst. Vises på både `/admin/games/new` og `/opprett-spill`. **Evidence:** Playwright opens begge ruter og verifiserer radio-felter; screenshot.
- [ ] Type-radio er disabled for game-modes som ikke støtter team (stableford, solo_strokeplay_netto). **Evidence:** Playwright velger stableford og verifiserer team-radio er disabled.
- [ ] `/admin/games/[id]` viser «Påmeldinger»-section når mode != invite_only, med antall + «Kopier lenke»-knapp. **Evidence:** Playwright oppretter open-game, navigerer til detaljside, klikker copy, sjekker clipboard.
- [ ] `/admin/games/[id]/påmeldinger` lister pending requests med approve/reject-knapper. **Evidence:** Playwright simulerer request, navigerer til admin-side, godkjenner.

### Public registration

- [ ] `/påmelding/[shortId]` er public (proxy.ts whitelisted) og redirecter ikke-authed til `/login?next=...`. **Evidence:** curl/Playwright fra logged-out state.
- [ ] Logget inn + open-mode: «Meld meg på»-knapp → POST inserter `game_players`-rad → redirect til `/games/[id]`. **Evidence:** Playwright E2E.
- [ ] Logget inn + manual_approval-mode: request-form → POST inserter `game_registration_requests`-rad → kvittering. Admin får in-app notification + mail (off-app). **Evidence:** Playwright + check notifications-tabell + Resend-call mock.
- [ ] Logget inn + invite_only-mode: viser «krever invitasjon»-melding, ingen påmeldings-knapp. **Evidence:** Playwright.
- [ ] Idempotent dobbel-påmelding viser vennlig «du er allerede påmeldt»-melding. **Evidence:** Playwright submitter to ganger.

### Lag-flyt

- [ ] `registration_type IN ('team', 'both')` viser team-formasjons-form med slots basert på `mode_config.team_size`. **Evidence:** Playwright på texas_scramble-spill.
- [ ] Lookup-felt foreslår eksisterende brukere; manuell e-post-toggle støttes. **Evidence:** Playwright.
- [ ] Kjent medspiller får `team_invite`-notification + mail-backup. **Evidence:** Insert + check notifications-tabell + Resend-mock.
- [ ] Ukjent e-post: `invitations`-rad opprettes med `game_id`-FK satt. Mail sendes. Etter OTP-verify hooks `app/(auth)/login/actions.ts:verifyCode` deferred-notify. **Evidence:** Trigger E2E + check `invitations` + check notifications post-login.
- [ ] Lag-medlem self-DELETE: kapteinen får `team_member_withdrew`-notification; laget eksisterer videre. **Evidence:** Playwright self-withdraw.
- [ ] `mode_config.team_size`-validering blokkerer ikke start, men viser warning. **Evidence:** Admin starter spill med underfullt lag og ser confirm-dialog.

### Approval-flyt

- [ ] Admin approve på `/admin/games/[id]/påmeldinger`: UPDATE-status, INSERT `game_players`-rad via admin-client, notify søker `registration_approved`. **Evidence:** Playwright + DB-inspect.
- [ ] Admin reject med valgfri reason: UPDATE-status, notify `registration_rejected` med reason i payload. **Evidence:** samme.
- [ ] Søker kan trekke egen pending request før admin har bestemt. **Evidence:** Playwright UPDATE `status=withdrawn` fra søker-konto.

### Rate-limit + sikkerhet

- [ ] Per-user rate-limit (5/24h) trigger «for mange forsøk»-melding. **Evidence:** scripted test som spammer 6 påmeldinger.
- [ ] Per-IP rate-limit (10/24h) trigger samme. **Evidence:** scripted med samme IP.
- [ ] Per-game rate-limit (50/24h) trigger. **Evidence:** scripted.
- [ ] Honeypot-felt fanget bot: returnerer succes-shape uten å inserte rad. **Evidence:** test med utfylt `website`-felt; verify ingen rad inserted.
- [ ] RLS forhindrer at en bruker melder seg på et `invite_only`-spill (direkte INSERT via supabase-client returnerer policy-error). **Evidence:** unit-test mot anon-client.

### Notifikasjons-rendring

- [ ] `NotificationCard.tsx` rendrer hver ny kind med rett ikon + tekst. **Evidence:** snapshot-tester eller Playwright på `/innboks`.
- [ ] InboxClient deeplinks team_invite til `/påmelding/[shortId]/team`, registration_request til admin-siden, etc. **Evidence:** click-test.

### Regresjons-vern

- [ ] Eksisterende invite_only-flyt er UENDRET. Admin-invite via `/admin/spillere` fungerer som før. **Evidence:** Playwright på invite-flyten + eksisterende tester grønne.
- [ ] Eksisterende `game_players` admin-only INSERT/UPDATE-policies står — non-admin uten matchende RLS-policy blokkeres fra å INSERT i `invite_only`-spill. **Evidence:** unit-test.

### CHANGELOG + versjon

- [ ] `package.json` bumpet til neste MINOR (`1.32.0` — current er 1.31.1). **Evidence:** diff.
- [ ] `CHANGELOG.md` har ny `## 1.32.y — Selv-påmelding`-tema-heading med blockquote-tagline («Du kan nå dele en lenke …»). Forrige minor-serie (1.31.x) wrapped i `<details>`. **Evidence:** diff.

## Gates

Kjør disse etter hver chunk (scoped til hva som endret seg):

| Gate | Kommando | Når |
|---|---|---|
| Lint | `npm run lint` | Alltid |
| Tests | `npm test` | Alltid |
| Build (incl. typecheck) | `npm run build` | Alltid (fanger Next.js 16-spesifikke errors) |
| E2E | `npm run e2e -- --grep "selv-påmelding"` | Etter UI-chunks |
| Migrasjon-test | `psql ... -f supabase/migrations/0039_*.sql --dry-run` (eller equivalent) | Etter migrasjon-chunks |
| Humanizer | Kjør `humanizer:humanizer`-skill på nye norske strenger | Før commit av .tsx/.ts med ny copy |

Migrasjonsfiler kan testes mot lokal Supabase via `npx supabase db reset` hvis det er satt opp; ellers manuell verifikasjon via Supabase MCP `apply_migration`-tool når kontrakten ferdig.

## Out of Scope

Disse er flagget i issue-body / scout men ikke i denne kontrakten:

- **Offentlig oversikt over åpne turneringer** — ingen `/turneringer`-side som lister alle open-mode spill. Admin deler lenken manuelt. Kan opprettes som egen issue.
- **Slug-basert URL** — ingen lesbar URL (`/turnering/sommercup-2026`). Bruker har valgt 8-char short_id.
- **Mail-preferences-tabell** — alle notifikasjoner bruker felles `shouldAlsoSendMail`-gating (5-min off-app-terskel). Per-kind opt-out er fremtidig.
- **Notification-bell-revisjon for de nye kindene** — vi gjenbruker eksisterende bell. Hvis volum av nye notifikasjoner krever bedre grupperinger, er det egen issue.
- **Tournament-wrapper (#47 Ryder Cup)** — denne kontrakten håndterer ikke multi-game tournaments. Lag-låsing innenfor ett game er nok.
- **Admin per gruppe ([#50](https://github.com/jdlarssen/golf-app/issues/50))** — manual_approval delegerer ikke til underadmin. Kun `games.created_by` + global admin kan godkjenne.
- **Kill-switch env-flag for hele selv-påmeldings-feature** — vi stoler på per-spill `registration_mode`-feltet. Hvis abuse rammer, kan admin sette mode tilbake til `invite_only` på enkelt-spill.

## Open Questions / Decisions Locked

Avklart i pre-kontrakt-diskusjon (2026-05-26):

| Spørsmål | Beslutning |
|---|---|
| Scope-cut | Full epic: alle 3 modi + alle 3 typer inkl. lag-låsing |
| Pending requests-lagring | Ny tabell `game_registration_requests` |
| URL-pattern | `/påmelding/[shortId]` med 8-char base32 short_id-kolonne |
| Lag-formasjon UX | Kaptein-flyt med dynamisk handling: kjent → in-app notification, ukjent → mail-invitasjon med game_id i invitations-rad |
| Lag-medlem trekker seg | Self-DELETE; lag eksisterer videre; kapteinen får varsel |
| Mail-strategi | In-app notification primær; mail som backup via standard `shouldAlsoSendMail`-mønster |
| Admin pending-UI | Egen `/admin/games/[id]/påmeldinger`-side; section-summary på game-detaljside med link |
| Auth-gate | Redirect til `/login?next=...` for uautentiserte; bygger på #166-flagget |
| PR-strategi | Én stor PR med flere atomic commits; PR-body `Closes #199` |

## Phase Breakdown (commit chunks)

Foreslått commit-rekkefølge for `/forge:auto`-loopen. Hver chunk skal være atomic (kompiler + test før neste).

1. **Datamodell — migrasjoner 0040–0043.** Kjør gjennom Supabase MCP. Inkluder rollback-script i kommentar. Verify constraints + policies.
2. **Notifikasjons-typer + Zod-schemas + NotificationCard-rendering.** TS-typer, Zod, UI-card per kind. Tester.
3. **Game payload + GameWizard-skjema-utvidelse.** Felt-typer, validation, form-rendering. `gamePayload.ts` aksepterer registration_mode + registration_type. Tester.
4. **Admin pending-requests-side + section-summary på game-detalj.** UI + server actions for approve/reject.
5. **Public landing page `/påmelding/[shortId]`.** Server-component, proxy-whitelist, redirect-flyt for unauthed/no-profile.
6. **Solo open-modus + RLS-policy for self-INSERT.** Server action register, idempotens-håndtering.
7. **Solo manual-approval-modus.** Server action requestApproval, notification + mail til admin.
8. **Lag-formasjon UI + kjent-bruker-flyt.** Form med slots, user-lookup, team_invite-notification.
9. **Ukjent-bruker-team-flyt + deferred-notify i verifyCode.** invitations.game_id-utvidelse + `lib/auth/login/actions.ts`-hook.
10. **Rate-limit (registrationRateLimit.ts) + honeypot-felter.**
11. **Self-withdraw-flyt (game_players DELETE-policy + team_member_withdrew-notification).**
12. **Mail-templates (4 nye filer i `lib/mail/`).** Humanizer-pass på alle norske strenger.
13. **CHANGELOG-tagline + version-bump til 1.30.0.** I siste user-visible-chunk-commit (eller egen `chore`-commit hvis hooken tillater det).
14. **E2E-tester for åre flows.**

Hver chunk har sin egen commit med `Part of #199` i body. Siste commit (eller PR-body) bruker `Closes #199` for å auto-close issuen ved merge.

## References

- Self-registration shipped: [#166](https://github.com/jdlarssen/golf-app/issues/166), [`app/(auth)/login/actions.ts:39–63`](app/(auth)/login/actions.ts:39)
- Trusted creators shipped: [#198](https://github.com/jdlarssen/golf-app/issues/198), `requireAdminOrTrustedCreator`
- Notifications infrastructure: [`lib/notifications/notify.ts`](lib/notifications/notify.ts), [`supabase/migrations/0032_notifications.sql`](supabase/migrations/0032_notifications.sql)
- Rate-limit pattern: [`supabase/migrations/0026_admin_action_rate_limit.sql`](supabase/migrations/0026_admin_action_rate_limit.sql), [`lib/auth/loginRateLimit.ts`](lib/auth/loginRateLimit.ts)
- Mail pattern: [`lib/mail/inviteNotification.ts`](lib/mail/inviteNotification.ts)
- Related (deferred): [#182](https://github.com/jdlarssen/golf-app/issues/182) game-scoped invites
