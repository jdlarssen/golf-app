# Design — Player-to-friend invitations

**Status:** Approved, ready for implementation planning
**Date:** 2026-05-11

## Problem

I dag kan kun admin (Jørgen) invitere nye brukere til Tørny via `/admin/invitations`. Det skaper en flaskehals: spillere som vil dra med en kompis må be admin gjøre det, eller la være. For en sosial kompis-app er det dumt — vi mister viral vekst og legger uforholdsmessig mye arbeid på én person.

Vi vil at innloggede spillere skal kunne invitere venner direkte, med rimelig misbruks-vakt (kvote) og en personlig touch i mailen (vennens navn).

## Goals

- Hvilken som helst innlogget spiller kan sende en venneinvitasjon
- Maks 10 invitasjoner per spiller per rullende 24-timersperiode (stille mot brukeren, kun feilmelding ved overskridelse)
- Personalisert mail: subject + intro nevner inviter ved navn
- Discoverable men ikke påtrengende — lever som en Card på `/profile` som lenker til dedikert `/invite`-side
- Trygg mot misbruk uten å kreve admin-godkjenning per invitasjon
- Gjenbruker eksisterende `invitations`-tabell, mail-template og auth-flyt — minimal ny overflate

## Non-goals (v1)

- Game-spesifikke invitasjoner (admin gjør dette via eksisterende `/admin/invitations`)
- Personlig melding fra inviter inkludert i mail (HTML-injection-risiko, kan vurderes senere)
- Post-game prompt ("invitér en kompis etter et spill") — kan komme i fase 2 hvis dette beviser konseptet
- "Pending invitations"-liste der inviter kan se status på sine venneinvitasjoner — kan legges til hvis ønskelig
- Push-varsel når en invitert venn registrerer seg

## Architecture

```
User på /profile
  └─> "Invitér en venn" Card → klikk → /invite
        └─> Form (email) → server action: sendFriendInvite
              ├─> auth-sjekk
              ├─> validér email-format
              ├─> kvote-sjekk (count siste 24t mot 10)
              │     └─> hvis ≥10: redirect /invite?error=quota
              ├─> sjekk om mailen allerede er på Tørny (public.users)
              │     └─> hvis ja: redirect /invite?error=already_user
              ├─> lookup inviter.name fra users-tabellen
              ├─> signInWithOtp(email, { shouldCreateUser:true,
              │                          emailRedirectTo,
              │                          data:{ inviter_name } })
              ├─> insert invitations (game_id=NULL, invited_by=me,
              │                       token=uuid, expires_at=now()+7d)
              └─> redirect /invite?status=sent&email=<email>

Mail (Supabase Auth, Magic Link-template med conditional):
  └─> {{ if .Data.inviter_name }} personalisert {{ else }} login-tekst {{ end }}

Recipient → klikker mail → /auth/callback?code=... → session → /
  (Hvis ny bruker: trigger oppretter public.users-rad, → /complete-profile)
```

**Designvalg:**

- **Rullende 24t-vindu** for kvote (ikke midnatt-reset) — fair, ingen 23:59-spam-loophole, samme query-form som eksisterende kode-stil
- **App-level kvote-sjekk** primær, **RLS** som backup mot direkte DB-manipulasjon
- **Eksisterende-bruker-vakt** før vi sender — hindrer både metadata-pollution i `user_metadata.inviter_name` for eksisterende brukere og forvirrende "X har invitert deg"-mail til folk som allerede har konto

## Database

Ingen schema-endring. Eksisterende `invitations` har alt vi trenger: `email`, `token`, `invited_by`, `game_id` (nullable → vi setter NULL for venneinvitasjoner og bruker som diskriminator), `expires_at`, `accepted_at`, `created_at`.

### Ny migrasjon: `supabase/migrations/0008_player_friend_invites_rls.sql`

```sql
-- Allow any authenticated user to insert a friend-invite (game_id NULL).
-- App-level quota is the primary enforcement; this policy only ensures
-- the invitation row truthfully attributes itself to the inviter and is
-- not game-scoped (game-scoped invites remain admin-only).
create policy "invitations player friend-invite insert" on public.invitations
  for insert
  with check (
    invited_by = auth.uid()
    and game_id is null
  );

-- Allow inviter to read their own outgoing friend-invites (for
-- /profile quota state and future "pending invites" list).
create policy "invitations select own outgoing" on public.invitations
  for select
  using (invited_by = auth.uid() and game_id is null);
```

Eksisterende policies (`invitations admin write`, `invitations select by token`) står uendret.

## Mail-template (Supabase Auth → Magic Link)

Vi utvider eksisterende "Magic Link"-template med Go-templating-conditional på `{{ .Data.inviter_name }}`. Samme template håndterer:

1. Vanlig login (no data → faller på "Logg inn på Tørny"-tekst)
2. Admin-invite (no data → samme som login)
3. Friend-invite (data.inviter_name satt → personalisert tekst)

### Subject

```
{{ if .Data.inviter_name }}{{ .Data.inviter_name }} har invitert deg til Tørny{{ else }}Logg inn på Tørny{{ end }}
```

### Body — kun deler som muteres

**H1:**

```html
<h1 style="font-family: Georgia, 'Times New Roman', serif; font-size: 24px; font-weight: 500; color: #1A2E1F; margin: 0 0 12px 0; line-height: 1.3;">
  {{ if .Data.inviter_name }}{{ .Data.inviter_name }} vil ha deg med på Tørny{{ else }}Klikk for å logge inn{{ end }}
</h1>
```

**Intro-paragraf:**

```html
<p style="font-size: 15px; color: #1A2E1F; margin: 0 0 24px 0; line-height: 1.5;">
  {{ if .Data.inviter_name }}{{ .Data.inviter_name }} har invitert deg til Tørny — fyr opp golfturneringen på minutter. Klikk knappen under for å lage din konto. Lenken er gyldig i 1 time.{{ else }}Hei! Klikk knappen under for å åpne Tørny. Lenken er gyldig i 1 time.{{ end }}
</p>
```

**CTA-knapp:**

```html
<a href="{{ .ConfirmationURL }}" style="display: inline-block; background-color: #1B4332; color: #FFFFFF; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-size: 16px; font-weight: 500; letter-spacing: -0.01em;">
  {{ if .Data.inviter_name }}Lag konto{{ else }}Logg inn på Tørny{{ end }}
</a>
```

Resten av templaten (logo-lockup, footer, fallback-link) står uendret.

`docs/email-templates.md` oppdateres med den fulle conditional-versjonen så brukeren har én autoritativ kilde å lime inn i Supabase Dashboard.

## UI

### Filer

| Fil | Action | Hva |
|---|---|---|
| `lib/invitations/quota.ts` | NEW | `getQuotaState(supabase, userId)` + `formatTimeUntil(date)` |
| `app/invite/page.tsx` | NEW | Invite-form, defensiv kvote-sjekk, søsken-bevisste feilbannere |
| `app/invite/actions.ts` | NEW | `sendFriendInvite(formData)` server-action |
| `app/profile/page.tsx` | EDIT | Legg invite-Card under eksisterende profil-form |

### `lib/invitations/quota.ts`

```ts
export const DAILY_INVITE_LIMIT = 10;
export const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;

export type QuotaState = {
  count: number;
  limit: number;
  isExhausted: boolean;
  nextSlotAt: Date | null;  // null hvis count < limit
};

export async function getQuotaState(
  supabase: SupabaseClient,
  userId: string,
): Promise<QuotaState>;

export function formatTimeUntil(date: Date): string;
  // "5 t", "45 min", "snart"
```

`getQuotaState` returnerer eldste invite i 24t-vinduet hvis kvoten er full, og bruker `oldest.created_at + 24t` som `nextSlotAt`.

### `/profile` — Card-tilstander

**Aktiv (0-9 invitasjoner siste 24t):**

```
┌─────────────────────────────────┐
│ Invitér en venn            →    │
│ Dra med kompiser inn på Tørny   │
└─────────────────────────────────┘
```

Hele Card-en er klikkbar (`<Link href="/invite">` rundt Card-innholdet). Bruker eksisterende `Card`-primitiv.

**Disabled (10+ invitasjoner siste 24t):**

```
┌─────────────────────────────────┐
│ Invitér en venn  (gråtonet)     │
│ Ny invitasjon om ~5 t           │
└─────────────────────────────────┘
```

`opacity-60`, `aria-disabled="true"`, ingen lenke. Bunntekst byttes ut med relativ tid via `formatTimeUntil(nextSlotAt)`.

Ingen kvote-counter når kvoten ikke er oppbrukt — silent rate-limiting (slik bruker spesifiserte).

### `/invite`-siden

Layout følger eksisterende `AppShell` + `PageHeader`-mønster fra `/profile`:

```
PageHeader: "Invitér en venn"
            "Send en lenke så vennen kan lage konto"

[Banner — error eller success, hvis applicable]

Card:
  Form:
    Input: E-post (required, type="email", autoComplete="email")
    Button: "Send invitasjon" [primary, full-width]

  Hjelpetekst:
    "Vi sender vennen en mail med en lenke.
     De kan lage konto med ett klikk."

Tilbake: "Avbryt" → /profile
```

**Defensiv kvote-sjekk på load:** Hvis bruker treffer `/invite` med oppbrukt kvote (f.eks. direkte URL), vi viser samme disabled-state inline — form deaktiveres, banner over forklarer "Ny invitasjon om ~5 t".

### Feilstater på `/invite`

| URL-param | Banner |
|---|---|
| `error=email_required` | "Du må skrive inn en e-postadresse." |
| `error=invalid_email` | "Ugyldig e-postadresse." |
| `error=already_user` | "Denne personen er allerede på Tørny. Be admin om å legge dem til et spill." |
| `error=quota` | "Du har brukt opp dagens kvote. Ny invitasjon om ~X t." |
| `error=rate_limited` | "Vent litt før du prøver igjen." |
| `error=unknown` | "Noe gikk galt. Prøv igjen." |
| `status=sent&email=X` | (success-banner) "✓ Invitasjon sendt til X." |

### Stilmessig konsistens

Bruker eksisterende `Card`, `Input`, `Button`, `Banner`, `PageHeader`-primitiver fra `components/ui/`. Ingen nye primitiver. Forest-and-champagne palett via tokens i `globals.css`. Mobile-first, tap-target ≥44px på Card-en (oppfylles naturlig av Card-padding + Link).

## Edge cases

- **Allerede invitert (pending, ikke akseptert):** Vi sender på nytt. Det er én ekstra mail og spiser ett kvote-slot — naturlig rate-limiting.
- **Allerede registrert bruker:** Blokkert med `error=already_user`. Hindrer metadata-pollution og forvirrende mail.
- **Inviter har ikke fullført sin egen profil ennå:** Vi krever at inviter eksisterer i `public.users` med `name` satt. Hvis bruker er midt i `/complete-profile`, har ikke profil-rad enda — `getServerClient().auth.getUser()` returnerer brukeren men `select name` returnerer `PGRST116`. I så fall: redirect til `/complete-profile`. (Samme adferd som eksisterende `/profile`.)
- **Race på kvote:** App-level sjekker count → 9, så insert. To samtidige requests kan begge passere sjekken og ende på 11 i tabellen. Akseptabelt — ingen virkelig skade. DB-trigger kan legges til hvis vi noensinne ser dette mønsteret.
- **Inviter har ingen `name`:** Skal ikke skje (`users.name` er NOT NULL). Defensiv fallback: `'En venn'` i `options.data.inviter_name`.

## Verifisering

End-to-end-test (manuell, etter implementasjon):

1. **Lykke-sti:** Logg inn som ikke-admin, gå til `/profile`, klikk "Invitér en venn"-Card. På `/invite`: skriv test-mail du eier (ikke registrert på Tørny). Klikk "Send invitasjon".
   - Bekreft: success-banner "✓ Invitasjon sendt til X"
   - Bekreft: mail i innboksen viser inviter-navn i subject + body, CTA-knapp sier "Lag konto"
   - Klikk lenken → lander på `/complete-profile`, fullfør, blir vanlig bruker

2. **Kvote-grense:** Send 10 invitasjoner i rask rekkefølge.
   - Bekreft: etter den 10. blir `/profile`-Card-en gråtonet med "Ny invitasjon om ~24 t"
   - Bekreft: direkte navigering til `/invite` viser samme disabled-state
   - Bekreft: i database, `select count(*) from invitations where invited_by=me and created_at >= now() - interval '1 day'` → 10

3. **Eksisterende bruker:** Invitér mail som allerede har Tørny-konto.
   - Bekreft: `error=already_user`-banner, ingen mail sendt, ingen invitations-rad insertet, ingen kvote-trekk

4. **RLS-bekreftelse:** Som vanlig bruker, prøv `insert into invitations (game_id, invited_by, ...) values ('<eksisterende-game-id>', auth.uid(), ...)` direkte via Supabase REST. Skal feile (game-scoped invites er admin-only fortsatt).

## Rollout-rekkefølge

Implementeringen splittes i atomic commits:

1. `feat: friend-invite quota helper + types` — `lib/invitations/quota.ts`
2. `feat: friend-invite server action and page` — `app/invite/{page,actions}.tsx`
3. `feat: friend-invite card on profile page` — `app/profile/page.tsx` edit
4. `feat: friend-invite RLS policies` — `supabase/migrations/0008_player_friend_invites_rls.sql`
5. `docs: conditional magic-link template for friend invites` — `docs/email-templates.md` edit

Etter koden er deployet:
- **Manuell steg for bruker:** lime inn oppdatert Magic Link-template i Supabase Dashboard → Authentication → Email Templates → Magic Link. Eksakt sti + kopier-lim-klar HTML + subject leveres som egen melding når koden er klar.
- **Manuell steg for bruker:** kjøre 0008-migrasjonen i Supabase SQL Editor.
