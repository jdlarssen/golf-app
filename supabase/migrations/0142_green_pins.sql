-- 0142_green_pins.sql
-- #1210 avstand til green: crowdsourced green centers. One row per one-tap pin
-- dropped at score-entry time; the green center is NEVER materialized — it is
-- derived on read as the per-axis median in lib/geo/greenCenter.ts (design doc
-- docs/superpowers/specs/2026-07-10-avstand-til-green-design.md).
--
-- FK goes to courses(id), NEVER to course_holes: course editing does a
-- delete+reinsert of course_holes inside update_course_with_layout, so a
-- composite FK there (with CASCADE) would wipe every pin on each «Lagre».
-- hole_number is validated by CHECK instead (same 1..18 as course_holes).
--
-- Pattern reference: 0119_game_reactions.sql (insert/delete-only, no UPDATE
-- policy). The 0119 policy EXPRESSIONS are participant-scoped and deliberately
-- NOT copied — pins are global crowdsourced course data (same world-read as
-- courses).

create table public.green_pins (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses(id) on delete cascade,
  hole_number  int not null,
  lat          double precision not null,
  lng          double precision not null,
  accuracy_m   real null,
  -- ON DELETE SET NULL: the crowdsourced data survives account deletion, the
  -- traceability does not (#1012). The real delete flow is a soft delete that
  -- never removes the users row, so anonymize_user below nulls this too.
  user_id      uuid null references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint green_pins_hole_number_check check (hole_number >= 1 and hole_number <= 18),
  constraint green_pins_lat_check check (lat >= -90 and lat <= 90),
  constraint green_pins_lng_check check (lng >= -180 and lng <= 180),
  -- Sanity bound only. The real accuracy cap (30 m) has ONE home: the pin
  -- server action, pre-checked client-side via lib/geo/pinRules.ts.
  constraint green_pins_accuracy_m_check check (accuracy_m is null or accuracy_m >= 0)
);

create index green_pins_course_hole_idx on public.green_pins (course_id, hole_number);

comment on table public.green_pins is
  '#1210 (0142): crowdsourced green pins, one row per one-tap pin at score-entry. '
  'Green center = per-axis median, derived on read (lib/geo/greenCenter.ts) — never '
  'materialized. Append-only: no UPDATE policy; DELETE own-row only. user_id is not '
  'client-readable (column privilege) — raw who-was-where rows are a presence surface.';

alter table public.green_pins enable row level security;

-- SELECT: every signed-in user — global dugnadsdata across Tørny (that is the
-- crowdsourcing point; same world-read as courses).
create policy "green_pins select authenticated"
  on public.green_pins for select to authenticated
  using (true);

-- INSERT: only as yourself. Also blocks NULL user_id (null = auth.uid() is
-- never true), so anonymous-shaped rows can only come from the service role.
create policy "green_pins insert own"
  on public.green_pins for insert to authenticated
  with check (user_id = auth.uid());

-- DELETE: only your own pin (undo a mispin). Policy-only in v1 — no UI yet,
-- the policy keeps that door open cheaply.
create policy "green_pins delete own"
  on public.green_pins for delete to authenticated
  using (user_id = auth.uid());
-- No UPDATE policy: pins are immutable after insert (bug-prevention trap #3,
-- same stance as 0119:81).

-- ── Column privileges: user_id is server-only ────────────────────────────────
-- Raw pins with who-was-where are a presence surface. The client never needs
-- user_id (the median is computed server-side), so authenticated may read every
-- column EXCEPT user_id. RLS policies may still reference the column (policy
-- expressions are not subject to column privileges). App reads must name their
-- columns explicitly — select * will be rejected.
revoke all on table public.green_pins from anon;
revoke select, update on table public.green_pins from authenticated;
grant select (id, course_id, hole_number, lat, lng, accuracy_m, created_at)
  on public.green_pins to authenticated;

-- ── Gate backstop: green_pins_gate ───────────────────────────────────────────
-- The chip is gated app-side on freshPinCount < PIN_GATE_MAX_PINS, but that
-- gate alone is client-advisory — a hostile direct POST could mass-insert pins
-- and move the median by volume. This BEFORE INSERT trigger is the DB home of
-- the same rule (one rule, two homes, parity-tested — bug-prevention trap #4;
-- 0119 pattern: the DB is the outer guard). Only pins newer than the window
-- count: hole placements move over time, so collection reopens as pins age out.
-- Two racing inserts can both see room and land pin #4 — accepted (append-only,
-- harmless; the median is derived on read).
create or replace function public.green_pins_gate()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
  declare
    -- Mirrors lib/geo/pinRules.ts (parity test: lib/geo/pinRules.test.ts).
    pin_gate_max_pins constant int := 3;
    pin_gate_window_days constant int := 30;
    fresh_count int;
  begin
    select count(*) into fresh_count
      from public.green_pins
      where course_id = new.course_id
        and hole_number = new.hole_number
        and created_at > now() - make_interval(days => pin_gate_window_days);
    if fresh_count >= pin_gate_max_pins then
      raise exception
        'green_pins_gate: course % hole % already has % pins in the last % days',
        new.course_id, new.hole_number, fresh_count, pin_gate_window_days
        using errcode = 'check_violation';
    end if;
    return new;
  end;
$$;

comment on function public.green_pins_gate() is
  '#1210 (0142): BEFORE INSERT gate — rejects a pin when the (course_id, '
  'hole_number) pair already has >= 3 pins newer than 30 days. Constants '
  'mirror lib/geo/pinRules.ts (PIN_GATE_MAX_PINS / PIN_GATE_WINDOW_DAYS); '
  'parity-tested. SECURITY DEFINER + pinned search_path per the 0104/1121 '
  'hardening.';

-- Trigger functions are fired by the system, not called by clients (#1121).
revoke all on function public.green_pins_gate() from public;
revoke execute on function public.green_pins_gate() from anon, authenticated;

create trigger green_pins_gate
  before insert on public.green_pins
  for each row execute function public.green_pins_gate();

-- ── anonymize_user: null green_pins.user_id on account deletion ──────────────
-- Account deletion is a soft delete (0131): the users row is scrubbed, never
-- deleted, so green_pins' ON DELETE SET NULL never fires in the real flow.
-- Redefine anonymize_user (0131 is the only prior definition) with a
-- green_pins nulling. CREATE OR REPLACE preserves the existing grants
-- (service_role-only execute). 0 affected pins is legitimate here — a user
-- without pins.
create or replace function public.anonymize_user(p_user_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path to ''
as $$
  declare
    v_email text;
    v_is_admin boolean;
  begin
    select email, is_admin into v_email, v_is_admin
      from public.users where id = p_user_id for update;

    if not found then
      raise exception 'user not found (public.users.id = %)', p_user_id
        using errcode = 'no_data_found';
    end if;

    if v_is_admin then
      raise exception 'admin accounts cannot be anonymized (public.users.is_admin)'
        using errcode = 'insufficient_privilege';
    end if;

    update public.users set
      name = 'Slettet bruker',
      nickname = null,
      email = 'slettet+' || p_user_id || '@deleted.tornygolf.no',
      gender = null,
      locale = null,
      last_seen_at = null,
      hcp_index = 54.0,
      friend_code = public.generate_friend_code(),
      product_updates_unsubscribed_at = coalesce(product_updates_unsubscribed_at, now()),
      deleted_at = coalesce(deleted_at, now())
    where id = p_user_id;

    -- Personlige/sosiale rader: CASCADE-reglene deres fyrer aldri når
    -- users-raden består, så de må slettes eksplisitt her.
    delete from public.friendships
      where requester_id = p_user_id or addressee_id = p_user_id;
    delete from public.push_subscriptions where user_id = p_user_id;
    delete from public.notifications where user_id = p_user_id;
    delete from public.group_members where user_id = p_user_id;
    delete from public.group_join_requests where user_id = p_user_id;
    delete from public.game_registration_requests where user_id = p_user_id;
    delete from public.idea_submissions where user_id = p_user_id;
    delete from public.reactions where user_id = p_user_id;

    -- Green pins (#1210, 0142): dugnadsdataen beholdes, sporbarheten fjernes —
    -- samme SET NULL som FK-en ville gjort om users-raden faktisk ble slettet.
    update public.green_pins set user_id = null where user_id = p_user_id;

    -- Invitasjons-rader med den ekte e-posten er PII og slettes. Ved re-kjøring
    -- er v_email allerede randomisert og matcher ingenting.
    delete from public.invitations where lower(email) = lower(v_email);
    delete from public.club_invitations where lower(email) = lower(v_email);
  end;
$$;

comment on function public.anonymize_user(uuid) is
  '#1012 (0131, utvidet i 0142): GDPR-sletting for brukere med spillhistorikk — '
  'scrubber public.users-raden (navn → «Slettet bruker», e-post → slettet+<uuid>@'
  'deleted.tornygolf.no, deleted_at satt), sletter personlige/sosiale rader '
  '(friendships, push, notifications, klubbmedlemskap, requests, ideer, gitte '
  'reaksjoner, invitasjoner på e-posten) og nuller green_pins.user_id (#1210 — '
  'dugnadsdataen beholdes, sporbarheten ikke) atomisk. Spillhistorikk beholdes. '
  'Kun service_role; app-laget soft-sletter auth-raden separat '
  '(auth.admin.deleteUser(id, true)).';
