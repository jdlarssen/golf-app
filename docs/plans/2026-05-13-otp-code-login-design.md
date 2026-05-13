# OTP-kode-innlogging — design

**Status:** godkjent 2026-05-13
**Erstatter:** dagens magic-link-URL-flyt

## Bakgrunn

Magic-link-URL-flyten kollapser på iOS PWA av to grunner som vi har bekreftet i Supabase auth-logger:

1. **PKCE-handoff brytes mellom browser-kontekster.** Bruker initierer innlogging i PWA-shellen — `code_verifier`-cookien lagres i PWA-ens cookie-jar. Mail.app åpner lenken i Safari, som ikke har den cookien. `exchangeCodeForSession` feiler lokalt før den engang gjør nettverkskallet — derfor ser vi `grant_type=authorization_code`-kallet aldri i loggene, kun `refresh_token`-fallbacks som returnerer 400.

2. **Mail-pre-fetchere konsumerer one-time-token.** Mail-scannere og link-previewere kan GETe magic-link-URL-en før brukeren faktisk klikker. Supabase markerer token-en som brukt på første hit. Når brukerens reelle klikk lander, returnerer Supabase «One-time token not found».

Begge problemene løses av å bytte til OTP-kode-flyt: brukeren får en 6-sifret kode i mailen og taster den inn på siden hvor de allerede står. Ingen URL å konsumere, ingen browser-kontekst å forholde seg til, ingen PKCE-cookie å miste.

## Arkitektur

### Login-flyt — én side, to steg

`/login` har én delt UI-flate som rendrer ulikt basert på `?step=`-search-param:

**Step 1 — `step` ikke satt eller `email`:**
- Bruker ser e-post-input + «Send meg kode»-knapp (uendret fra i dag)
- Submit kjører server-action `sendCode(formData)`:
  - `email = formData.get('email').trim().toLowerCase()`
  - Sjekk om e-post er registrert eller invitert:
    - Registrert = finnes i `auth.users` (sjekk via SECURITY DEFINER RPC `email_is_registered`)
    - Invitert = har åpen rad i `public.invitations` med `accepted_at IS NULL` (sjekk via ny RPC `email_is_invited`)
  - Hverken eller → `redirect('/login?error=user_not_found')`
  - `signInWithOtp({email, shouldCreateUser: isInvited && !isRegistered})`
  - Hvis Supabase-feil: `redirect(/login?error=...)` (rate_limited / unknown)
  - Hvis OK: `redirect('/login?step=verify&email=<email>&next=<next>')`

**Step 2 — `step=verify`:**
- Bruker ser 6-sifret kode-input + «Logg inn»-knapp
- Banner: «Skriv inn 6-sifret kode vi sendte til [email]»
- Sekundær lenke: «Send ny kode» (tilbake til step 1 med samme e-post pre-fylt)
- Submit kjører server-action `verifyCode(formData)`:
  - `verifyOtp({email, token, type: 'email'})`
  - Feil:
    - «expired» → `redirect('/login?step=verify&email=X&error=code_expired')`
    - «invalid» / «token mismatch» → `redirect('/login?step=verify&email=X&error=code_invalid')`
  - Suksess:
    - Mark invitations.accepted_at = now() for denne e-posten (samme RLS-policy 0012 som vi allerede har — `auth.jwt() ->> 'email'` er satt etter verifyOtp)
    - Hvis bruker mangler `public.users`-rad → `redirect('/complete-profile')`
    - Ellers → `redirect(next ?? '/')`

### Invitasjons-flyt

`admin/invitations` server-action endres til å gjøre **kun database-arbeid**:

1. `insert into public.invitations (email, token, invited_by, expires_at)` (uendret)
2. Send notifikasjons-mail via Resend (egen mal, ikke Supabase auth-mail):

   **Subject:** «Du er invitert til Tørny»

   **Body:** kort tekst som forklarer at de er invitert, lenke til `https://tornygolf.no/login`, instruks om at de bare skal taste e-posten sin der.

Dagens `signInWithOtp({shouldCreateUser: true})`-kall fjernes fra admin-actionen. Auth-mailen sendes nå utelukkende av login-flytens step 1 når invitéen kommer dit.

### Gammel `/auth/callback` — graceful deprecation

Beholdes i ~30 dager etter ship. Endres til kun å:
1. Logge en metric/console.log for å se hvor ofte den treffes
2. Redirect til `/login?error=link_expired` — banner sier «Lenken er gått ut. Be om ny kode.»

All invitations.accepted_at-logikken som ligger der nå flyttes til `verifyCode`-actionen.

Etter 30 dager: slett route-filen helt.

## Data flow

```
[Step 1: bruker taster e-post]
   ↓ POST /login (sendCode)
   ↓ email_is_registered / email_is_invited
   ↓ signInWithOtp(email, shouldCreateUser)
   ↓ Supabase sender mail med {{ .Token }}
   ↓ redirect /login?step=verify&email=X

[Step 2: bruker taster kode]
   ↓ POST /login (verifyCode)
   ↓ verifyOtp(email, token, type='email')
   ↓ session-cookie satt (via @supabase/ssr)
   ↓ UPDATE invitations SET accepted_at = now()
        WHERE lower(email) = lower(JWT.email) AND accepted_at IS NULL
   ↓ redirect /complete-profile eller next
```

## Endringer per fil

**Endres:**
- `app/(auth)/login/page.tsx` — rendrer step 1 eller step 2 basert på `?step`. Felles AppShell/BrandHero, ulik Card-innhold per step.
- `app/(auth)/login/actions.ts` — splitt i `sendCode` (step 1) og `verifyCode` (step 2). Legg til invitation-accept-side-effekt i `verifyCode`.
- `app/admin/invitations/actions.ts` — fjern `signInWithOtp`-kallet. Add Resend-mail call.
- `app/auth/callback/route.ts` — strippes ned til redirect-til-login-med-error.
- `app/invite/actions.ts` — friend-invite-flyten. Trolig samme behandling som admin/invitations (Resend-notifikasjon istedenfor Supabase magic-link). Verifiser at flyten ikke har spesielle metadata-krav.

**Nytt:**
- `lib/mail/inviteNotification.ts` — Resend-mail-mal for invitasjons-notifikasjon (forest-and-champagne stil, matcher de andre brand-mailene).
- `supabase/migrations/0013_email_invited_helper.sql` — `email_is_invited(text)` SECURITY DEFINER RPC.

**Uendret:**
- `lib/supabase/server.ts` (cookie-config virker fortsatt med session-cookies fra verifyOtp)
- `proxy.ts` (session-refresh)
- `lib/scoring/` (urørt)
- Eksisterende `email_is_registered` RPC (hvis den finnes — sjekk; ellers lag som del av migration 0013)

## Supabase config — brukeren oppdaterer manuelt

**Authentication → Email Templates → Magic Link:**

Subject:
```
Din kode til Tørny: {{ .Token }}
```

Body — full mal leveres som copy-paste når jeg har bygd Resend-malen så fargene matcher:
```
Din kode til Tørny er:

{{ .Token }}

Skriv koden inn på siden hvor du ba om den.
Koden går ut om 60 minutter.

Har du ikke bedt om en kode? Ignorer denne meldingen.
```

**Authentication → Email Templates → Invite user** — beholdes som-er. Den brukes ikke lenger fordi invitasjons-action ikke trigger Supabase auth-mail. Kan slettes senere.

**Authentication → Providers → Email → OTP Expiration:** settes til 3600 (60 min). Jeg setter denne via direkte Supabase-tilgang — du trenger ikke gjøre det.

## Error handling

| Tilfelle | Verdi | UI-melding |
|---|---|---|
| Step 1: ukjent e-post | `error=user_not_found` | «Denne mailen er ikke registrert. Be admin om en invitasjon.» |
| Step 1: rate-limit (Supabase 57s-throttle) | `error=rate_limited` | «Vent litt før du prøver igjen.» |
| Step 1: annen feil | `error=unknown` | «Noe gikk galt. Prøv igjen.» |
| Step 2: feil kode | `error=code_invalid` | «Feil kode. Sjekk mailen og prøv igjen.» |
| Step 2: utgått kode | `error=code_expired` | «Koden er gått ut. Be om ny kode.» |
| Gammel magic-link klikket | `error=link_expired` | «Lenken er gått ut. Be om ny kode på login.» |

## Testing

Per `production_only_testing`-policy: smoke-test direkte i prod etter ship.

**Smoke-test 1 — eksisterende bruker innlogging:**
1. Åpne tornygolf.no på iPhone (PWA på hjemskjerm)
2. Tast inn admin-e-post → «Send meg kode»
3. Side rendrer step 2 med kode-input
4. Sjekk mail: subject = «Din kode til Tørny: 482619» (eller lignende)
5. Tast inn koden → «Logg inn»
6. Lander på `/` som logget inn admin

**Smoke-test 2 — invitasjons-flyt:**
1. Som admin, send invitasjon til en testperson (din egen sekundære e-post)
2. Sjekk at notifikasjons-mail kommer fram med riktig stil
3. Følg lenken i mailen, tast inn invitert e-post → «Send meg kode»
4. Sjekk at kode-mail kommer
5. Tast inn kode → lander på `/complete-profile`
6. Fyll inn → lander på `/` som ny bruker
7. Sjekk at `/admin/invitations` viser invitasjonen som «Akseptert»

**Edge-cases verifisert manuelt:**
- Feil kode → ser «Feil kode» banner, kan prøve på nytt
- «Send ny kode»-lenke fungerer (returnerer til step 1 med e-post pre-fylt)
- Gammel magic-link i innboksen → klikker → ser «Lenken er gått ut» banner

## Migrasjons-strategi / ship-rekkefølge

1. **Migration 0013** (email_is_invited RPC) — applies først via Supabase MCP
2. **Code-endringer** (login/page.tsx, actions, callback) — ship samlet i én commit. Bryter ingen eksisterende mail i flight (de redirected til login med error).
3. **Resend-mal** — ship samtidig som koden.
4. **Supabase Auth-mal** — brukeren oppdaterer i UI etter at koden er deployet. I mellomtiden vil mail-en se rar ut (kanskje vise URL-syntax i steden for kode), men siden vi gir copy-paste-ready tekst i melding etter ship, er det en ~5 min-overgangsperiode.
5. **OTP Expiration-config** — jeg setter via Supabase MCP samme dag.

## Versjons-bump

Major UX-endring (innloggings-flyten endres for alle), men teknisk sett er det en fix av login-bug. Pre-1.0.0 (`0.x.y`) regnes som alpha per CLAUDE.md, så **MINOR bump (0.3.3 → 0.4.0)** er passende:
- Eksisterende brukere må venne seg til å taste kode istedenfor å klikke
- Klubb-medlemmer som har Tørny på hjemskjermen vil oppleve at det nå faktisk fungerer
- CHANGELOG-entry under «Changed»

## Definition of done

- [ ] Login fra PWA på iPhone fungerer (smoke-test 1)
- [ ] Invitasjons-flyt fungerer for ny bruker (smoke-test 2)
- [ ] Gammel magic-link i innboks viser «Lenken er gått ut» banner
- [ ] Mail-malene i Supabase oppdatert av bruker
- [ ] `/admin/invitations` viser «Akseptert» etter første verifyOtp
- [ ] CHANGELOG.md har 0.4.0-entry
- [ ] `auth/callback`-route har 30-dagers slette-todo i TODO.md
