# Contract: #452 Liga — Fase 3 (medlems-initiert «Bli med i ligaen»)

**Issue:** [#452](https://github.com/jdlarssen/golf-app/issues/452) (epic). PR bruker **`Part of #452`** — epicen forblir åpen (Fase 4 gjenstår).
**Branch:** `issue-452-liga-fase3`
**Type:** MINOR (ny bruker-synlig feature) → `1.92.0` → **`1.93.0`**

## Background

Mesteparten av #452 «Fase 3 — klubb-tilknytning» er allerede shipped via **#480 Fase 1**
(v1.86.0: `leagues.group_id` + scopet RLS i migrasjon `0083`, klubb-medlems-sourcet opprett-picker,
medlems-synlig «Klubbens ligaer», medlems-gatet `/liga/[id]`) og **#483 + #485** (begge CLOSED:
klubb-admin styrer egen klubb-liga — runder, roster, vindu-override, slett — via delt
`<LigaManagement>`). Bli-med-lenken finnes allerede på klubb-nivå (`/klubber/bli-med/[shortId]`,
#442/#50).

Den ENESTE gjenstående forskjellen mot #452-brainstormens «medlemmer = deltakere, bli-med-lenke»
er at klubb-liga-rosteret i dag er et **snapshot** klubb-admin plukker ved oppretting (+ legger til
senere via «Styr»). Et klubbmedlem kan ikke selv melde seg på. Denne fasen lukker den løkka med en
**medlems-initiert self-join** (og en angre-self-leave), uten å rive opp snapshot-/#463-modellen.

Snapshot-modellen beholdes bevisst (stabil sesong-roster; ingen retroaktive straffe-runder for
sene påmeldinger). Self-join er derfor **kun mulig før ligaen starter** (`status = 'draft'`).

## Scope (owner decisions, 2026-06-07)

- **Self-join når:** **kun draft** (før ligaen er startet). En aktiv/avsluttet liga kan IKKE
  self-joines — da må klubb-admin legge deg til via «Styr» (eksisterende `addLeaguePlayers`).
  Dette sidesteg straffe-runde-rettferdighets-spørsmålet helt: ingen endring i sesong-beregningen.
- **Self-leave:** **ja, før første spilte runde** — et medlem kan melde seg av så lenge de ikke har
  levert et scorekort i ligaen. Etter første leverte runde må klubb-admin fjerne dem (eksisterende
  `removeLeaguePlayer`). Hindrer dropp-en-dårlig-sesong, gir angre på feil-klikk.
- **Kun klubb-liga:** self-join/-leave gjelder **kun klubb-scopede ligaer** (`group_id IS NOT NULL`).
  Frittstående (venne-)ligaer beholder invitert-liste + admin-only roster (uendret).
- **Bekreftelse (#463):** self-join = selv-bekreftet → `accepted_at = now()` (ikke «Ikke bekreftet»).

## Design (technical — my call per project conventions)

### 1. Schema — `supabase/migrations/0086_league_self_service.sql`

To `SECURITY DEFINER`-RPC-er som speiler `befriend_inviter` (0084) / `decide_join_request` (0075):
samme `language plpgsql security definer set search_path = ''`, `v_uid := auth.uid()` med
`raise exception 'not_authenticated'` ved null, soft-utfall som `text`-returkoder, og samme
grant-lockdown (`revoke all from public` + `revoke execute from anon` + `grant execute to authenticated`).
RPC-ene er det eneste skrive-vinduet en vanlig medlem får mot `league_players` — RLS-write-policyen
(`0083`) forblir admin/klubb-admin-only, så definer-funksjonen er en kontrollert, gatet vei rundt den.

```sql
-- join_club_league: et klubbmedlem melder seg selv på en draft klubb-liga.
create or replace function public.join_club_league(p_league_id uuid) returns text
  language plpgsql security definer set search_path = ''
  as $$
  declare
    v_uid    uuid := auth.uid();
    v_group  uuid;
    v_status text;
  begin
    if v_uid is null then raise exception 'not_authenticated'; end if;
    select group_id, status into v_group, v_status
      from public.leagues where id = p_league_id;
    if not found then raise exception 'league_not_found'; end if;
    if v_group is null then return 'not_club_league'; end if;   -- frittstående: ikke self-join
    if v_status <> 'draft' then return 'not_draft'; end if;     -- kun før start
    if not public.is_group_member(v_group) then return 'not_member'; end if;
    if exists (select 1 from public.league_players
                where league_id = p_league_id and user_id = v_uid) then
      return 'already_member';                                  -- idempotent
    end if;
    insert into public.league_players (league_id, user_id, accepted_at)
    values (p_league_id, v_uid, now())
    on conflict (league_id, user_id) do nothing;               -- self-join = selv-bekreftet
    return 'joined';
  end $$;

-- leave_club_league: et medlem melder seg av en klubb-liga før de har spilt en runde.
create or replace function public.leave_club_league(p_league_id uuid) returns text
  language plpgsql security definer set search_path = ''
  as $$
  declare
    v_uid    uuid := auth.uid();
    v_group  uuid;
    v_status text;
  begin
    if v_uid is null then raise exception 'not_authenticated'; end if;
    select group_id, status into v_group, v_status
      from public.leagues where id = p_league_id;
    if not found then raise exception 'league_not_found'; end if;
    if v_group is null then return 'not_club_league'; end if;
    if v_status = 'finished' then return 'finished'; end if;
    if not exists (select 1 from public.league_players
                    where league_id = p_league_id and user_id = v_uid) then
      return 'not_member';
    end if;
    -- Sperre: har medlemmet levert et scorekort i en av ligaens flights?
    if exists (
      select 1
        from public.game_players gp
        join public.games g on g.id = gp.game_id
        join public.league_rounds lr on lr.id = g.league_round_id
       where lr.league_id = p_league_id
         and gp.user_id = v_uid
         and gp.submitted_at is not null
    ) then return 'already_played'; end if;
    delete from public.league_players
      where league_id = p_league_id and user_id = v_uid;
    return 'left';
  end $$;

revoke all on function public.join_club_league(uuid) from public;
revoke execute on function public.join_club_league(uuid) from anon;
grant execute on function public.join_club_league(uuid) to authenticated;
revoke all on function public.leave_club_league(uuid) from public;
revoke execute on function public.leave_club_league(uuid) from anon;
grant execute on function public.leave_club_league(uuid) to authenticated;
```

**Apply:** rollback-tx-validér (kjør CREATE-ene i en tx, så ROLLBACK), deretter `apply_migration` mot
prod (project `glofubopddkjhymcbaph`). Additivt + ureferert til kode-deploy = trygg klasse.
Regenerér `lib/database.types.ts` (RPC-signaturene havner i `Functions`-blokken). `get_advisors`
(security): de to nye funksjonene faller i samme prosjekt-brede `*_security_definer`-klasse som alle
RLS-helperne — ingen ny finding-klasse.

### 2. Pure logic (TDD, Type A) — `lib/league/selfService.ts` + `selfService.test.ts`

Den eneste rene logikk-biten verdt en enhetstest: hvilke self-service-knapper UI-en skal vise. SQL-en
er sannheten ved klikk; denne avgjør synlighet.

```ts
import type { LeagueStatus } from './types';
export type LeagueSelfServiceInput = {
  groupId: string | null;
  status: LeagueStatus;
  isClubMember: boolean;
  isParticipant: boolean;
  hasPlayed: boolean;
};
export type LeagueSelfServiceState = { canJoin: boolean; canLeave: boolean };
export function leagueSelfServiceState(i: LeagueSelfServiceInput): LeagueSelfServiceState {
  const isClub = i.groupId !== null;
  return {
    canJoin: isClub && i.status === 'draft' && i.isClubMember && !i.isParticipant,
    canLeave: isClub && i.status !== 'finished' && i.isParticipant && !i.hasPlayed,
  };
}
```

Tester (`it.each`): frittstående → begge false; draft+member+!participant → canJoin; draft+participant
→ !canJoin, canLeave; active+participant+!played → !canJoin, canLeave; active+participant+played →
begge false; finished → begge false; draft+!member+!participant → begge false.

### 3. `getLigaSnapshot` — eksponér `hasPlayed` per deltaker

`LeagueParticipant` får `hasPlayed: boolean`. Gjenbruker allerede-hentede `gamePlayers` (selecten har
`submitted_at`): `const playedUserIds = new Set(gamePlayers.filter(p => p.submitted_at !== null).map(p => p.user_id));`
og bygg `participants` med `hasPlayed: playedUserIds.has(userId)`. Krever liten omrokkering siden
`participants` i dag bygges før `gamePlayers` hentes — flytt participant-byggingen ned, eller attach i
en andre pass. Ingen ekstra DB-spørring.

### 4. Server-actions — `lib/league/actions.ts`

```ts
export async function joinClubLeague(formData: FormData): Promise<LeagueActionError> { ... }
export async function leaveClubLeague(formData: FormData): Promise<void> { ... }  // redirect-basert
```

- **`joinClubLeague`** (kalles fra knapp-form på `/liga/[id]`): request-scoped client (så `auth.uid()`
  i RPC = medlemmet); `supabase.rpc('join_club_league', { p_league_id })`. På `'joined'`/`'already_member'`
  → `revalidatePath('/liga/${id}')` + `revalidatePath('/klubber/...')` er unødvendig (siden henter live)
  → returnér `{ error: '' }`. På andre koder → `{ error: <kode> }` (UI mapper til norsk). Hard
  exception (not_authenticated/league_not_found) bobler → generisk feil.
- **`leaveClubLeague`** (kalles fra confirm-siden): `supabase.rpc('leave_club_league', ...)`. På `'left'`
  → `revalidatePath('/liga/${id}')` + `redirect('/liga/${id}')`. På feilkode → `redirect('/liga/${id}/meld-av?error=<kode>')`
  (speiler `leaveClub`-mønsteret i `/klubber/[id]/forlat/actions.ts`).

### 5. `/liga/[id]/page.tsx` — knapper

- Hoist klubb-medlemskap: for klubb-scopet liga, regn `isClubMember` (gjenbruk `group_members`-oppslaget
  som gaten allerede gjør for ikke-deltakere; for deltakere er medlemskap irrelevant for `canJoin`).
- `hasPlayed = me?.hasPlayed ?? false`.
- `const { canJoin, canLeave } = leagueSelfServiceState({ groupId: league.group_id, status, isClubMember, isParticipant, hasPlayed });`
- **canJoin** → et kort/knapp øverst (under header, over sesong-tabell): «Bli med i ligaen» (primary,
  ≥44px), `<form action={joinClubLeague}>` med skjult `league_id`. Hjelpetekst: «Du er medlem i klubben.
  Bli med i ligaen før den starter.» Vis evt. `?error`-melding.
- **canLeave** → diskret «Meld deg av»-lenke (secondary/ghost) → `/liga/${id}/meld-av` (dedikert
  confirm-side, IKKE inline — jf. destructive-confirm-konvensjonen + `/klubber/[id]/forlat`-presedensen).

### 6. `/liga/[id]/meld-av/page.tsx` — dedikert confirm-side

Speiler `/klubber/[id]/forlat/page.tsx`: server-component, last snapshot (eller slank liga-rad) for
navnet, gate til en bruker som faktisk `canLeave` (ellers `redirect('/liga/${id}')`). Render
`TopBar` + `Card` med «Meld deg av {liganavn}?» + forklaring («Du kan bli med igjen så lenge ligaen
ikke har startet.») + `<form action={leaveClubLeague}>` med «Meld meg av»-knapp (destructive-tone) +
«Avbryt»-lenke tilbake. Vis `?error`-melding (already_played/finished → «Du har allerede spilt en
runde — be klubb-admin fjerne deg.»).

### 7. Copy + versjon + flyt

- All ny norsk copy gjennom `humanizer`-skillet før commit (knapper, hjelpetekst, confirm-side,
  feilmeldinger). Norske feiltekster mappet fra RPC-kodene.
- MINOR-bump `1.92.0` → `1.93.0` + CHANGELOG-oppføring (nest under åpen liga-serie hvis en finnes,
  ellers ny serie; tre-lags per `docs/changelog-conventions.md`, tagline-humanizer).
- Flyt: sjekk `docs/flows/06-liga-fremtid.svg`. Hvis medlems-self-join-grenen ikke er representert,
  legg til en liten node («medlem melder seg på før start») + regenerér PNG per `docs/flows/README.md`.
  Hvis grenen i praksis dekkes av eksisterende «medlemmer ser/deltar»-node, noter at diagrammet er
  uendret i closing-kommentaren (ikke tving en kunstig endring).

## Edge Cases & Guardrails

- **Liga flipper draft→active mens medlemmet ser siden:** stale «Bli med»-knapp → RPC re-sjekker
  `status='draft'` → `'not_draft'` → norsk «Ligaen har allerede startet.» Ingen feil-innmelding.
- **Ikke-medlem (global admin uten klubb-medlemskap) ser draft klubb-liga:** `isClubMember=false` →
  ingen «Bli med». (De er arrangør, ikke spiller — korrekt.)
- **Frittstående draft-liga:** `group_id=null` → ingen self-service-knapper (feature er klubb-only).
- **Manipulert POST (self-join aktiv liga / fremmed liga / ikke-medlem):** RPC avviser (returkode),
  RLS-write-policy (0083) er andre forsvarslinje (vanlig medlem kan ikke skrive `league_players` direkte).
- **Self-leave etter spilt runde:** RPC `'already_played'` + confirm-side-gate skjuler knappen.
- **Dobbel-klikk «Bli med»:** `already_member` + `on conflict do nothing` = idempotent.
- **Self-leave på frittstående:** `'not_club_league'` (knappen vises uansett ikke).

## Key Decisions

- **RPC framfor ny RLS-policy:** self-join/-leave krever status- + spilt-runde-gater som hører hjemme i
  én atomisk, gatet funksjon — speiler `befriend_inviter`/`decide_join_request`. Holder `league_players`
  RLS-write admin/klubb-admin-only (forsvar i dybden).
- **Draft-only self-join:** eier-valg; unngår retroaktive straffe-runder og enhver endring i
  `computeLeagueStandings`.
- **`hasPlayed` i snapshot:** gjenbruker allerede-hentede `game_players` — ingen ekstra spørring.
- **Dedikert `/meld-av`-side:** destructive-confirm-konvensjon + `/klubber/[id]/forlat`-presedens;
  ingen inline-toggle/`<details>`.
- **`accepted_at = now()` ved self-join:** medlemmet bekrefter ved å melde seg på selv (#463-konsistent).

**Claude's Discretion:** eksakt markup/plassering av kort + knapper (gjenbruk `Card`/`Button`/`Banner`);
om `isClubMember` regnes via `group_members` eller utvides fra gate-oppslaget; norsk ordlyd (humanizer);
om confirm-siden laster full snapshot eller en slank navne-spørring.

## Success Criteria

- [ ] Migrasjon `0086_league_self_service.sql` (`join_club_league` + `leave_club_league`, grant-lockdown)
  lagt til **og applyt til prod** (rollback-tx-validert først); `lib/database.types.ts` regenerert med
  RPC-signaturene. Verifikasjon: `list_migrations` viser 0086; `grep join_club_league lib/database.types.ts`.
- [ ] `leagueSelfServiceState` dekket av Type-A-tester (alle scope-kombinasjoner grønne).
- [ ] `getLigaSnapshot` returnerer `hasPlayed` per deltaker (true når levert scorekort i en liga-flight).
- [ ] Et klubbmedlem ser «Bli med i ligaen» på en **draft** klubb-liga de ikke er med i, og innmelding
  legger dem i `league_players` med `accepted_at` satt. Ikke synlig på aktiv/avsluttet liga, på
  frittstående liga, eller for ikke-medlemmer.
- [ ] En deltaker som ikke har spilt ser «Meld deg av» → `/liga/[id]/meld-av` → avmelding fjerner raden;
  etter spilt runde er knappen borte og RPC avviser (`already_played`).
- [ ] RLS/sikkerhet håndhevet (live MCP-probe, rullet tilbake): medlem self-join-er draft klubb-liga;
  self-join på aktiv liga avvises (`not_draft`); ikke-medlem avvises (`not_member`); self-join på
  frittstående avvises (`not_club_league`); leave før spilt OK, etter spilt avvist (`already_played`);
  `anon` har ikke execute.
- [ ] MINOR-bump → `v1.93.0` + CHANGELOG; PR bruker **`Part of #452`** (epicen forblir åpen).
- [ ] Flyt-diagram oppdatert ELLER eksplisitt notert uendret.

## Gates

- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] `npm run build` — Compiled successfully (ingen «pre-existing»-filtrering).
- [ ] `npx vitest run lib/league app/liga` + endrede co-lokerte tester grønne.
- [ ] `npm run lint` passerer (ingen nye warnings i mine filer).
- [ ] `.githooks/pre-commit` ingen humanizer-advarsler på nye norske strenger.
- [ ] Skeptisk opus-eval (fresh-context subagent) mot kriteriene → ACCEPT.

## Files Likely Touched

- `supabase/migrations/0086_league_self_service.sql` (ny) + `lib/database.types.ts` (regenerert)
- `lib/league/selfService.ts` + `lib/league/selfService.test.ts` (nye)
- `lib/league/getLigaSnapshot.ts` — `hasPlayed` på `LeagueParticipant`
- `lib/league/actions.ts` — `joinClubLeague` + `leaveClubLeague`
- `app/liga/[id]/page.tsx` — `isClubMember`/state + «Bli med»/«Meld deg av»
- `app/liga/[id]/meld-av/page.tsx` (ny rute)
- `package.json` + `CHANGELOG.md` (MINOR `1.93.0`) · evt. `docs/flows/06-liga-fremtid.svg` (+ PNG)

## Non-goals (egne issues / senere)

- Auto-innmelding ved godkjent klubb-medlemskap / live-avledet roster (eier valgte den lille finpussen).
- Self-join på **aktiv** liga (krever per-spiller join-dato-logikk i sesong-beregningen).
- Self-leave **etter** spilt runde (admin-only fjerning beholdes).
- Self-service på **frittstående** ligaer (invitert-liste beholdes).
- Varsling til klubb-admin når noen melder seg på/av (best-effort notif kan bli eget issue).
- Fase 4 (stableford m.fl. som liga-format).
