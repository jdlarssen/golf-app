-- 0161_finished_tournament_scores_select.sql
--
-- #1550: deltakerne i en FERDIGSPILT cup får lese scores i alle kampene i den
-- cupen — ikke bare i de kampene de selv spilte.
--
-- Rotårsak: `scores select gating per mode` krever i HVER gren at leseren selv
-- er `game_players` i akkurat den kampen (eller eier scoren, eller er i samme
-- flight). Finished-grenen er `games.status='finished' AND EXISTS(game_players
-- gp WHERE gp.user_id = auth.uid())` — deltakelse i DET spillet. Ingen gren
-- dekker «kampen hører til en turnering jeg er med i, og turneringen er
-- ferdigspilt». I «Ryder Cup 2026» spiller hver deltaker 3 av 12 kamper, så 9
-- av 12 lenker på cup-resultatsiden ga tom tabell.
--
-- Flaten som faktisk stod igjen (verifisert ved kodelesing på HEAD): «Hull for
-- hull»-drilldownen, app/[locale]/games/[id]/leaderboard/holes/. Den slipper
-- ikke-deltakere inn på ferdige spill (holes/page.tsx) men leser scores med
-- BRUKERENS klient (holesData.ts → getDrilldownContext → getServerClient), så
-- RLS ga 0 rader. Hoved-leaderboardet ble allerede reddet av #1542, som lot
-- getResultReadClient() lese ferdige spill med service-role; denne migrasjonen
-- flytter grensen tilbake dit AGENTS.md felle 3 vil ha den — inn i RLS — for
-- den lesestien som fortsatt går via brukerens egen JWT.
--
-- Bevisst IKKE utvidet til: aktive turneringer (spoiler-vernet i
-- cup-presentasjonen består — kortene skal ikke røpe resultatet før seremonien),
-- folk utenfor cupen, eller liga (egen datamodell, eget spørsmål).

-- ─────────────────────────────────────────────────────────────────────────────
-- Del 1 — SECURITY DEFINER-helper
-- ─────────────────────────────────────────────────────────────────────────────
-- Hvorfor helper og ikke en inline EXISTS-kjede i policyen: en policy på
-- `public.scores` som selv slår opp i `games`/`game_players` inline har allerede
-- utløst 42P17-rekursjon i dette repoet (#1595). SECURITY DEFINER-helperen
-- bryter kjeden — den kjører som eieren, uten policy-evaluering på tabellene den
-- leser — og er formen alle de andre grenene i denne policyen bruker
-- (`is_admin`, `same_flight_or_solo`).
--
-- Herding per #1121/0137-mønsteret: STABLE, SECURITY DEFINER, låst search_path.
-- `search_path = ''` (strengeste form, som 0103/0159) er trygt her fordi hver
-- referanse under er skjema-kvalifisert; pg_catalog ligger uansett implisitt
-- først for typer og operatorer.
create or replace function public.is_participant_of_finished_tournament(p_game_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''  -- hardened: every reference below is schema-qualified
as $$
  select exists (
    select 1
    from public.games g
    join public.tournaments t
      on t.id = g.tournament_id
    join public.tournament_participants tp
      on tp.tournament_id = t.id
     and tp.user_id = auth.uid()
    where g.id = p_game_id
      and t.status = 'finished'
  );
$$;

comment on function public.is_participant_of_finished_tournament(uuid) is
  '#1550 (0161): true when the game belongs to a tournament with status = '
  '''finished'' AND auth.uid() is a participant of that tournament. Used by the '
  'scores SELECT policy so a cup participant can open every match in a played-out '
  'cup, not just the ones they played. ACTIVE tournaments deliberately return '
  'false — the cup presentation must not spoil a running cup. SECURITY DEFINER '
  'to avoid the 42P17 recursion an inline games/game_players lookup in a scores '
  'policy causes (#1595).';

-- ACL: policyen under gjelder rolla PUBLIC, altså evaluerer ANON den også. Anon
-- har fulle tabell-grants (RLS er porten), så uten EXECUTE ville en anon-spørring
-- feile med «permission denied for function» FØR RLS rakk å nekte — nøyaktig
-- ground-truth-notatet i 0137. Derfor: fjern det implisitte PUBLIC-grantet og
-- gi de tre Supabase-rollene eksplisitt EXECUTE (samme endelige flate som
-- same_flight_or_solo har live). De to advisory-nøklene dette gir er lagt inn i
-- docs/loops/prod-vakta-baseline.txt med begrunnelse.
revoke execute on function public.is_participant_of_finished_tournament(uuid) from public;
grant execute on function public.is_participant_of_finished_tournament(uuid)
  to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Del 2 — scores SELECT: additiv gren
-- ─────────────────────────────────────────────────────────────────────────────
-- `alter policy ... using (...)` er formen begge de forrige endringene av DENNE
-- policyen brukte (0092 perf-omskrivingen, 0121 live-grenen). Den beholder
-- `for select` + `to public`-bindingen og lar aldri tabellen stå uten policy.
-- De fem eksisterende grenene er kopiert ORDRETT fra live staging
-- (`pg_get_expr(polqual, polrelid)`, 2026-08-14) — identisk med kilden i 0121 —
-- med kun den siste grenen lagt til.
alter policy "scores select gating per mode" on public.scores
  using (
    is_admin()
    -- finished + participant → all scores
    or (exists (select 1 from public.games g
                where g.id = scores.game_id and g.status = 'finished'::game_status)
        and exists (select 1 from public.game_players gp
                    where gp.game_id = scores.game_id and gp.user_id = (select auth.uid())))
    -- reveal-mode active + participant → all scores (view layer hides netto)
    or (exists (select 1 from public.games g
                where g.id = scores.game_id and g.status = 'active'::game_status
                  and g.score_visibility = 'reveal'::text)
        and exists (select 1 from public.game_players gp
                    where gp.game_id = scores.game_id and gp.user_id = (select auth.uid())))
    -- live-mode active + participant → all flights live (cross-flight, #938)
    or (exists (select 1 from public.games g
                where g.id = scores.game_id and g.status = 'active'::game_status
                  and g.score_visibility = 'live')
        and exists (select 1 from public.game_players gp
                    where gp.game_id = scores.game_id and gp.user_id = (select auth.uid())))
    -- own scores always
    or (user_id = (select auth.uid()))
    -- same-flight / solo (covers non-active states + solo games)
    or same_flight_or_solo(game_id, user_id)
    -- NEW (#1550): the match belongs to a FINISHED tournament this reader took
    -- part in → every match in that cup is readable, also the ones they sat out.
    or is_participant_of_finished_tournament(game_id)
  );
