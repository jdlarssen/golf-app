# Spec: Selv-registrering uten invitasjon

**Issue:** [#166](https://github.com/jdlarssen/golf-app/issues/166)
**Berører ruter:** `/login` (server-action), `/` (empty-state-tekst)
**Bump:** neste MINOR etter merge av `main` (bruker-synlig oppførselsendring)

## Problem

I dag gater [`app/(auth)/login/actions.ts:39`](app/(auth)/login/actions.ts:39) på `email_is_invited`-RPC ([supabase/migrations/0013_email_is_invited.sql:11](supabase/migrations/0013_email_is_invited.sql:11)) — bare e-poster som finnes i `public.invitations` får `shouldCreateUser = true`. Alle andre møter «user_not_found»-feilen og blokkeres fra å lage konto.

Det betyr at admin må manuelt invitere hver nye spiller via `/admin/spillere` → fyll inn e-post → send. For en app som tornygolf.no skal vokse ut over Jørgens vennekrets, er det en flaskehals. Målet er å la nye brukere skrive inn e-posten sin på `/login` og få OTP-kode uten admin-mellomledd — bak en kill-switch og med abuse-vern på plass før vi åpner det i prod.

## Research Findings

Ingen eksterne biblioteker er sentrale. Verifisert mot dagens kode:

- **Eksisterende rate-limit-infrastruktur** ([supabase/migrations/0026_admin_action_rate_limit.sql:21](supabase/migrations/0026_admin_action_rate_limit.sql:21)): `admin_action_rate_limit(bucket, count, window_start)`-tabell + `consume_admin_rate_limit(p_bucket, p_max, p_window_seconds)`-RPC. Funksjonen er generisk — bucket er en vilkårlig streng. Brukes i dag for admin-invitasjons-throttling ([lib/admin/rateLimit.ts:25](lib/admin/rateLimit.ts:25)). Vi gjenbruker den med nye buckets for login-flyten.
- **Honeypot finnes allerede** på `sendCode` ([app/(auth)/login/actions.ts:19-31](app/(auth)/login/actions.ts:19)) — kort-circuiterer før RPC-call og returnerer suksess-state for å lure botter. Selvregistrerings-tillegget ligger bak denne, så honeypot beskytter også den nye flyten.
- **`shouldCreateUser`-feltet** er Supabase Auth sin OTP-flagg. Når den er `true`, oppretter Supabase auth-bruker hvis e-posten ikke finnes; når `false`, returnerer `user_not_found`-error. Dette er den eneste mekanismen vi trenger å påvirke.
- **`verifyCode`-action** ([app/(auth)/login/actions.ts:134](app/(auth)/login/actions.ts:134)) markerer alle ventende invitasjoner med matchende e-post som `accepted_at`. Self-registered brukere uten invitasjon hopper bare over dette (ingen rader matcher) — null koden-endring nødvendig der.

## Prior Decisions

- **Fra [#198](https://github.com/jdlarssen/golf-app/issues/198) (trusted creators, shipped 2026-05-24):** Trusted-creator-allowlist + `/opprett-spill`-rute eksisterer. Self-registered brukere får IKKE automatisk creator-tilgang — det er en separat opt-in via allowlist. Hjem-sidens `canCreateGame`-flag ([app/page.tsx:175](app/page.tsx:175)) endres ikke i denne kontrakten.
- **Fra [#22](https://github.com/jdlarssen/golf-app/issues/22) (full RLS-revisjon, ikke startet):** Denne avhengigheten er IKKE løst. Self-registered brukere uten admin/trusted-status får ingen mulighet til å opprette spill selv. Det er bevisst — vi løser onboarding-kanalen først, RLS-åpning er sin egen jobb.
- **Fra [`/complete-profile`-flyten](app/complete-profile/page.tsx:45):** Brukere uten `profile_completed_at` redirectes til onboarding automatisk. Self-registered brukere går samme vei — ingen ny onboarding-rute trengs.

## Design

### 1. Env-flag som kill-switch

Ny env-var: `NEXT_PUBLIC_ALLOW_SELF_REGISTRATION`. Default `false` i [.env.example](.env.example). Slås på i Vercel prod manuelt etter preview-testing.

```ts
// app/(auth)/login/actions.ts:sendCode
const allowSelfReg = process.env.NEXT_PUBLIC_ALLOW_SELF_REGISTRATION === 'true';
const { data: isInvited } = await supabase.rpc('email_is_invited', { check_email: email });
const shouldCreateUser = Boolean(isInvited) || allowSelfReg;
```

Når flagget er `false`: nøyaktig dagens adferd (ingen oppførselsendring). Når `true`: alle e-poster kommer gjennom OTP-flyten. Kill-switch ved abuse: sett flagget til `false` i Vercel + redeploy (~1 min).

**Hvorfor `NEXT_PUBLIC_`-prefiks:** vi vil ha samme flag tilgjengelig server-side OG i client-rendring (for å skjule/vise sub-tekst på `/login`). Det er ingen sikkerhetsrisiko å eksponere flagget — selv om en angriper vet det er på, må de fortsatt gjennom rate-limit + honeypot + Supabase OTP.

### 2. Server-side rate-limit på `sendCode`

Ny helper [`lib/auth/loginRateLimit.ts`](lib/auth/loginRateLimit.ts):

```ts
import { getAdminClient } from '@/lib/supabase/admin';

export async function consumeLoginRateLimit({
  email,
  ip,
}: {
  email: string;
  ip: string;
}): Promise<{ ok: boolean; reason?: 'email' | 'ip' }> {
  const admin = getAdminClient();
  const [emailRes, ipRes] = await Promise.all([
    admin.rpc('consume_admin_rate_limit', {
      p_bucket: `login:email:${email.toLowerCase()}`,
      p_max: 3,
      p_window_seconds: 15 * 60,
    }),
    admin.rpc('consume_admin_rate_limit', {
      p_bucket: `login:ip:${ip}`,
      p_max: 10,
      p_window_seconds: 15 * 60,
    }),
  ]);
  if (!emailRes.data) return { ok: false, reason: 'email' };
  if (!ipRes.data) return { ok: false, reason: 'ip' };
  return { ok: true };
}
```

**Konfigurasjon:**
- Per e-post: 3 forsøk per 15-minutters vindu (dekker typo + ett ekstra forsøk)
- Per IP: 10 forsøk per 15-minutters vindu (dekker hele husstander, men ikke spray-angrep)
- Bruker `getAdminClient` (service-role) for å unngå GRANT-problemer med anon-rolle på RPC-en

**Plassering i `sendCode`:** etter honeypot-sjekken (kvanto cheap-først), før selve `signInWithOtp`-call. Når rate-limit slår inn, returnér samme `rate_limited`-feilkode som Supabase sin egen rate-limit ([line 49-67](app/(auth)/login/actions.ts:49)) — bruker ser ingen forskjell på hvem som blokkerte.

**Funksjons-navn:** Vi gjenbruker `consume_admin_rate_limit` med nytt prefix-mønster i bucket. Funksjonen er teknisk generisk (bucket er en streng). Code-comment forklarer at navnet er historisk. Hvis vi senere vil rename, er det en cosmetic refactor utenfor scope.

### 3. Synlighet på `/login`

Liten sub-tekst under e-post-feltet, kun synlig når `NEXT_PUBLIC_ALLOW_SELF_REGISTRATION === 'true'`:

```
Skriv inn e-posten din. Hvis du er ny her, lager vi en konto.
```

Plassering: rett under input-feltet på sendCode-stage, før «Send kode»-knappen. Bruker eksisterende `text-sm text-muted`-klasse for å passe med eksisterende sub-tekster.

Når flagget er `false`: ingen sub-tekst, /login ser identisk ut med dagens versjon. Når `true`: sub-teksten oppdager at det er en muligheten å lage konto, uten å rope om det.

**Hvorfor ikke egen `/registrer`-rute:** OTP-flyten er identisk for invited og uninvited brukere. Egen rute = duplisering uten verdi. Sub-tekst på samme side gir den oppdagbarheten vi trenger.

### 4. Empty-state-kopi for self-registered uten spill

Eksisterende empty-state i [`app/page.tsx:192-194`](app/page.tsx:192) viser:
- Admin/trusted: «Ingen turneringer enda. Sett opp første runde og kom i gang.»
- Andre: «Du er klar. Admin setter opp neste runde.»

For self-registered brukere som er helt nye (har aldri vært med i et spill) er den andre kopien litt tynn — den antar at brukeren har en admin i tankene. Vi mykner den:

```
Du er klar. Be en arrangør om å invitere deg til neste runde.
```

Same komponent, samme branch — bare ny tekst. Humanizer-pass på final kopi før commit.

Vi differensierer **ikke** mellom «invited men venter» og «self-registered fersk». Begge ser samme empty-state. Det er bevisst — å skille krever ny query («har brukeren noen gang vært i `game_players`?»), og verdien er marginal. Self-registrerte forstår teksten like greit som invited.

### 5. Onboarding-flyten — ingen endring

Self-registered brukere har `profile_completed_at IS NULL` etter `verifyCode`. [`app/complete-profile/page.tsx:45`](app/complete-profile/page.tsx:45) redirecter dem automatisk dit, samme måte som invited brukere. Begge nye felt fra #92 (kjønn + spillerklasse) blir også påkrevd der hvis #92 lander først — uansett rekkefølge fungerer flyten.

Ingen ny welcome-mail. OTP-kode-mail-en er nok — brukeren er allerede engasjert nok til å taste inn koden.

## Edge Cases & Guardrails

- **Bruker med både pending invitation OG self-reg-flag på:** `shouldCreateUser = true || true = true`. Supabase Auth oppretter user (eller bruker eksisterende rad). `verifyCode` markerer pending invitation som `accepted_at`. Ingen oppførselsforskjell fra dagens flyt for invited brukere.
- **Rate-limit slår inn på legitim bruker som tastet feil e-post:** brukeren ser samme `rate_limited`-melding som ved Supabase-rate-limit. Etter 15 min er bucket-en tom. Akseptabel friksjon for sikkerhet.
- **Honeypot-felt fylt ut + self-reg på:** honeypot returner suksess-state uten å treffe RPC eller rate-limit. Botter bortkastes tidlig.
- **Self-reg-flag av i prod, en mistenkelig IP øser inn forsøk:** Supabase sin egen rate-limit slår inn først. Ingen ny eksponering.
- **`getAdminClient()` feiler (mangler `SUPABASE_SERVICE_ROLE_KEY`):** rate-limit-helperen kaster. `sendCode` fanger feilen i samme `try/catch` som RPC-call (linje 49-67). Logges via `console.error`. Brukeren får generisk feilmelding. Skal aldri skje i prod der env-var-en er satt.
- **IP-utleding:** Bruker `request.headers.get('x-forwarded-for')` med fallback til `'unknown'`. Bak Vercel og Cloudflare er denne pålitelig. Trues-by-IP-rate-limit er litt grovt (delte IP-adresser), men 10/15min er romslig nok for husstander.
- **Eksisterende invited bruker mister invitasjons-mail og prøver å logge inn:** dette virket allerede (`email_is_invited`-RPC returnerer true så lenge invitasjonen ikke er akseptert). Ingen endring.
- **Multi-window-test:** to forsøk på samme e-post fra to ulike enheter samtidig — begge inkrementerer samme bucket. Andre forsøket teller mot bucket-en. Akseptabelt for et anti-abuse-tiltak.

## Key Decisions

- **Env-flag default off:** safe default. Slås på i Vercel prod manuelt etter at preview-testing er gjort. Kill-switch ved abuse.
- **Server-side rate-limit (ingen Turnstile/CAPTCHA):** defense-in-depth uten brukerfriksjon. Bruker eksisterende `admin_action_rate_limit`-tabell + RPC, ingen ny dep eller env-var. Turnstile kan legges på senere som separat kontrakt hvis abuse skjer.
- **Rate-limit verdier:** 3/15min per e-post, 10/15min per IP. Generøst nok for legitim bruk, stramt nok mot spray-angrep.
- **Sub-tekst kun:** ingen egen `/registrer`-rute, ingen tab/toggle. OTP-flyten er identisk for begge tilfeller.
- **Empty-state-justering:** små tekst-endring, ingen ny game-code-feature, ingen utvidelse av creator-allowlist. Self-registrerte må vente på å bli invitert/lagt til.
- **`getAdminClient` for rate-limit-RPC:** unngår GRANT-justering på `consume_admin_rate_limit`. Service-role-kall fra server-side er sikkert.

**Claude's Discretion:**
- Eksakt copy-formulering på /login-sub-tekst og empty-state. Humanizer-pass før commit (per CLAUDE.md `### Språk-kvalitet i bruker-rettet copy`). Anti-mønstre å unngå: «registrere deg» (anglisme — «lage en konto» er mer naturlig), «click here»-aktige imperativer.
- Om sub-teksten skal lenke til en hjelp/faq-side (default: nei, det er overkill).
- Om vi vil logge self-registrerte (e-post + tidspunkt) i en lett tabell for observasjons-vinduet. Anbefales: nei i denne kontrakten — Supabase Auth-logger viser allerede registreringer.
- Eksakt IP-utleding (`x-forwarded-for` vs `x-real-ip` vs `cf-connecting-ip`). Velg det som er pålitelig på Vercel + Cloudflare-stacken.
- Om rate-limit-meldingen skal skille mellom «for mange forsøk fra denne e-posten» og «for mange forsøk fra denne IP-en». Default: samme generisk melding, ikke avslør bucket.

## Success Criteria

- [ ] `NEXT_PUBLIC_ALLOW_SELF_REGISTRATION=false` (default): `sendCode` med ikke-invitert e-post returnerer `user_not_found` (akkurat som i dag). Verifikasjon: `npm test -- login.actions` viser passerende test for default-state.
- [ ] `NEXT_PUBLIC_ALLOW_SELF_REGISTRATION=true`: `sendCode` med ikke-invitert e-post lykkes (Supabase OTP-kode sendes). Verifikasjon: integrasjonstest stubber Supabase og asserter at `signInWithOtp` kalles med `shouldCreateUser: true`.
- [ ] Rate-limit per e-post utløses ved 4. forsøk innen 15 min. Verifikasjon: unit-test på `consumeLoginRateLimit` mocker `consume_admin_rate_limit` og asserter at false-svar gir `reason: 'email'`.
- [ ] Rate-limit per IP utløses ved 11. forsøk innen 15 min. Verifikasjon: parallel test.
- [ ] Honeypot-feltet kortcircuiterer flyten før rate-limit-RPC. Verifikasjon: når honeypot er fylt, gjøres ingen DB-call.
- [ ] `/login` viser sub-tekst kun når `NEXT_PUBLIC_ALLOW_SELF_REGISTRATION=true`. Verifikasjon: Playwright-test renderer page med flagget på/av og asserter tilstedeværelse/fravær av teksten.
- [ ] Empty-state på `/` for ikke-creator viser ny kopi («Du er klar. Be en arrangør om å invitere deg til neste runde.»). Verifikasjon: snapshot eller selector-test.
- [ ] Self-registered bruker fullfører end-to-end: skriv inn e-post → motta kode → tast inn → land på `/complete-profile` → fyll inn → `/` viser empty-state. Verifikasjon: manuell test på preview etter Vercel-deploy.

## Gates

- [ ] `npx tsc --noEmit` passerer
- [ ] `npm test -- login.actions loginRateLimit` passerer
- [ ] `npm run lint` passerer på endrede filer
- [ ] Pre-commit-hook `.githooks/pre-commit` ingen humanizer-advarsler på nye norske strenger
- [ ] Playwright `/login`-test passerer (sub-tekst-toggle)
- [ ] Manuell preview-test:
  - [ ] Med flagg av: ny bruker får «user_not_found»-feil (uendret)
  - [ ] Med flagg på: ny bruker fullfører hele flyten
  - [ ] Rate-limit utløses ved 4. forsøk på samme e-post
- [ ] Vercel-preview deployer grønt

## Files Likely Touched

- `app/(auth)/login/actions.ts` — env-sjekk i `sendCode`, rate-limit-call før `signInWithOtp`, IP-utleding fra headers
- `app/(auth)/login/LoginForm.tsx` (eller hvor sendCode-stage rendres) — conditional sub-tekst
- `lib/auth/loginRateLimit.ts` — ny helper med `consumeLoginRateLimit`
- `lib/auth/loginRateLimit.test.ts` — unit-tester
- `app/(auth)/login/actions.test.ts` — utvid med 4-5 nye tester (flag av/på, rate-limit, honeypot-kortcircuit)
- `app/page.tsx` — empty-state-kopi linje 194 (mykere tekst for ikke-creator)
- `.env.example` — legg til `NEXT_PUBLIC_ALLOW_SELF_REGISTRATION=false`
- `lib/env.ts` (hvis env er schema-validert) — legg til feltet
- `package.json` + `CHANGELOG.md` — MINOR bump, ny CHANGELOG-oppføring

**Ingen DB-migrasjon nødvendig.** Vi gjenbruker eksisterende `admin_action_rate_limit`-tabell og `consume_admin_rate_limit`-RPC.

## Out of Scope

- **Cloudflare Turnstile / CAPTCHA / hCaptcha** — vurdert som overkill for current scale. Egen kontrakt hvis abuse-vinduer viser at rate-limit alene ikke holder.
- **Game-invite-kode-flyt** («Bli med i et spill med kode XYZ») — egen feature, krever ny `games.invite_code`-kolonne + join-RPC + RLS. Defer til separat issue.
- **Utvidet creator-tilgang for self-registrerte** — krever [#22](https://github.com/jdlarssen/golf-app/issues/22) full RLS-revisjon. Eksisterende trusted-creator-allowlist er fortsatt curated.
- **Welcome-mail** for self-registrerte — OTP-kode-mail er nok.
- **Domene-allowlist** — for restriktivt mot legitime norske bedrifts-e-poster.
- **Egen `/registrer`-rute** — OTP-flyten er identisk, sub-tekst gir den oppdagbarheten vi trenger.
- **Self-service `/forgot-account`** eller account-recovery uten e-post — utenfor denne kontrakten.
- **Analytics-dashboard for self-registreringer** — Supabase Auth-loggene + `users`-tabellen er nok for nå.
- **Bot-deteksjon basert på adferd** (mus-bevegelse, tastetrykk-mønster) — overkill.
- **GDPR-flow-justeringer** — eksisterende personvern-side dekker self-registrerte likt med invited.
