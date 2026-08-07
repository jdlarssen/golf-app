# Spec: Mail-kvote skilles fra 60-sekunders-throttlen i login-feilmatchingen

**Issue:** #1434 · **Branch (kontrakt):** claude/contract-issue-1434-4921e1

## Precondition (hard)

**PR #1435 (`claude/natt-1347-rate-limit-copy`, #1347 alternativ B) må være merget til
main før bygging starter.** Denne fiksen endrer kode som i dag KUN finnes på den
PR-branchen (`rate_limited_minute`-grenen). Er #1435 fortsatt åpen ved byggetid: STOPP og
løs den først (den står som CONFLICTING mot main — rebase-konfliktene er de vanlige
CHANGELOG/messages/package.json-radene, jf. minnenotatet om rebase-flyt), eller eskalér.
Aldri bygg #1434 mot main uten #1347-endringene — da gjenskaper du gammel kode og
skaper en umulig merge.

## Problem

Supabase-feilmatchingen i `sendCode` (`app/[locale]/(auth)/login/actions.ts`,
`msg.includes('rate') || 'too many' || 'security purposes'`) behandler to semantisk ulike
feil som én:

- **60-sekunders-throttlen** (per adresse): en kode ER sendt og ligger i innboksen.
  Riktig håndtering (#1347, bygget i PR #1435): kode `rate_limited_minute`, tvungen
  `step=verify`, copy «Du kan be om ny kode om ett minutt.»
- **Prosjektnivå-mailkvoten** (hele appen): INGEN mail ble sendt. Etter #1347 rutes også
  denne til `rate_limited_minute`: brukeren parkeres på kodefeltet der instruksjonen sier
  «Skriv inn koden vi sendte til …» og feilmeldingen lover ny kode om ett minutt — begge
  usanne. Eneste knapp («Send ny kode») brenner i tillegg av egen-bucketens kvote.

Lav frekvens (kvoten treffes sjelden), men når den treffer, treffer den alle samtidig —
og copyen lyver aktivt.

## Research Findings (verifisert mot supabase/auth master, 2026-08-07)

- **Begge feilene deler feilkoden `over_email_send_rate_limit`** — splitting på
  `error.code` er umulig. Kilde: `internal/api/mail.go` — kvote-grenene (linje 341 m.fl.)
  og frekvens-grenen (linje 724) bruker samme `ErrorCodeOverEmailSendRateLimit`.
- **Eksakte meldingsstrenger:**
  - Kvote: `"email rate limit exceeded"` (`mail.go:29`, allerede lowercase).
  - Throttle: `"For security purposes, you can only request this after %d seconds."`
- **Diskriminatoren er meldingsteksten**, og kvote-strengen inneholder selv ordet «rate»
  — kvote-sjekken MÅ derfor ligge FØR den generelle heuristikken, ellers sluker
  `msg.includes('rate')` den.
- **Kjent rest-impostor (utenfor scope):** `over_request_rate_limit` («Too many requests
  have been sent by this client (IP address)…») matcher fortsatt `'too many'` →
  `rate_limited_minute`. Sjelden (IP-nivå-limit hos Supabase), bevisst uendret her.

## Prior Decisions

- **#1347-kontrakten fredet heuristikken** («behold matchingen som i dag … ikke stram inn
  regexen»). Denne fiksen RESPEKTERER fredningen: den generelle heuristikken står urørt
  som fallback; vi legger kun én mer spesifikk gren FORAN den. Ingen eksisterende match
  blir smalere.
- **#1347 alternativ B** (eiervalgt 5. aug): meldingssplitt + `emailMax` 3→5 — røres ikke.
- **#1345-mønsteret:** alle feil-redirects bærer `errorCtx` (email/next/invite, `step`
  kun ved `from=verify`) — kvote-grenen bruker det som det er, uten step-overstyring.

## Design

Alle endringer i `sendCode`-feilgrenen etter `signInWithOtp` (post-#1435-kode):

1. **Ny feilkode `rate_limited_quota`.** Før dagens heuristikk-if:
   `if (msg.includes('email rate limit exceeded'))` → `code = 'rate_limited_quota'`.
   Legges i den eksplisitte `code`-unionen i `actions.ts` og i `KNOWN_ERROR_CODES` i
   `page.tsx` (glemmes settet → fallback «unknown», fanget av kriterium 4).
2. **Ingen verify-parkering.** Kvote-grenen redirecter med `loginErrorRedirect(code,
   errorCtx)` — altså steg 1 når brukeren kom fra steg 1, verify kun når de trykket
   «Send ny kode» (`from=verify`, der kodefeltet uansett er ærlig kontekst: en eldre kode
   kan fortsatt være gyldig, og copyen lover ingen ny). `rate_limited_minute`-grenens
   tvungne `step: 'verify'` består uendret for throttle-treff.
3. **Ærlig copy i begge locales** (`auth.errors.rate_limited_quota`):
   - no: «Vi får ikke sendt flere koder akkurat nå. Prøv igjen senere.»
   - en: "We can't send more codes right now. Try again later."
   Ingen tidsangivelse — vi vet ikke når kvoten åpner. Kjør humanizer på endelig ordlyd.
4. **Juster kommentaren** over `rate_limited_minute`-grenen: «the 60-second throttle only
   fires when a code … is already in the user's inbox» er nå nesten sann (kvoten er
   skilt ut), men nevn rest-impostoren `over_request_rate_limit` i én bisetning så neste
   leser ikke overdriver garantien.

## Edge Cases & Guardrails

- **Rekkefølge:** kvote-sjekk FØR generisk heuristikk (kvote-strengen inneholder «rate»).
- **Tom/ukjent melding** → «unknown» som før; throttle-meldingen → `rate_limited_minute`
  som før (eksisterende test på PR-branchen skal bestå UENDRET — den er regresjonsvernet
  for at splitten ikke lekker).
- **Egen-bucketen** (`consumeLoginRateLimit`, FØR Supabase-kallet) er uberørt — koden
  `rate_limited` og 15-min-copyen består.
- **Ikke stram inn noe:** ingen eksisterende match-gren fjernes eller smalnes.

## Key Decisions

- **Match på meldingstekst, ikke `error.code`:** verifisert at begge feil deler samme
  kode — tekst er eneste diskriminator. Eksakt substring `'email rate limit exceeded'`
  er presis (GoTrue-strengen er ordrett denne).
- **Kodenavn `rate_limited_quota`:** sorterer med søsknene `rate_limited` /
  `rate_limited_minute` i union, sett og katalog.
- **Ingen produktvalg:** det finnes én ærlig oppførsel (ikke påstå at kode er sendt);
  ordlyd-mikrovalg er ikke et produktvalg.

**Claude's Discretion:** endelig ordlyd etter humanizer; om en/no-formuleringene deles i
to setninger eller én med tankestrek.

## Success Criteria

1. [x] Ny Type A-test i `actions.test.ts`: `signInWithOtpMock` returnerer
   `{ error: { message: 'email rate limit exceeded' } }` fra steg 1 →
   `lastRedirect()` er `/login?email=…&error=rate_limited_quota` (INGEN `step=verify`).
   *Evidens: «maps the project-wide mail quota to rate_limited_quota WITHOUT
   verify-parking (#1434)» — grønn i `npx vitest run "app/[locale]/(auth)/login"`,
   40/40 passed (commit 6affd82e).*
2. [x] Tilsvarende med `from=verify` i formdata → redirect
   `/login?step=verify&email=…&error=rate_limited_quota` (errorCtx-stien, ikke
   overstyring).
   *Evidens: «quota hit from «Send ny kode» (from=verify) stays on the verify step
   via errorCtx (#1434)» — grønn i samme kjøring.*
3. [x] Eksisterende throttle-test («For security purposes …» → `rate_limited_minute` +
   `step=verify`) består uendret.
   *Evidens: `actions.test.ts:433` uendret (diff rører den ikke); grønn i 40/40-kjøringen.*
4. [x] `/login?error=rate_limited_quota&email=x@y.no` rendrer den nye no-copyen (ikke
   «noe gikk galt»-fallbacken) — verifiseres på staging via URL-param på begge steg.
   *Evidens: torny-staging dev-server, begge steg lest via a11y-tre — alert-en viser
   «Vi får ikke sendt flere koder akkurat nå. Prøv igjen senere.» på steg 1 OG
   `step=verify`; skjermbilde tatt for PR-bevis.*
5. [x] `messages/no.json` + `messages/en.json` har begge nøkkelen
   (`catalogParity`-testen grønn).
   *Evidens: `npx vitest run messages/catalogParity.test.ts` — 2/2 passed.*
6. [x] `npm run build` grønn (unionen + KNOWN_ERROR_CODES konsistente).
   *Evidens: `npm run build` EXIT: 0 (med pipefail).*

## Gates

- [x] `npx vitest run "app/[locale]/(auth)/login"` — co-lokaliserte tester grønne
      *(40/40 passed, 4 filer)*
- [x] `npm run build` (full gate, jf. bindings §T2 — ikke bare tsc) *(EXIT: 0)*
- [x] `npm run lint` *(0 errors, 56 pre-eksisterende warnings)*
- [x] Staging-klikkrunde: kriterium 4 (URL-drevet render-sjekk; kvoten kan ikke trigges
      reelt på staging uten å brenne den — URL-param-rendringen ER den brukersynlige
      flaten, og rutingen er dekket av Type A-testene) *(begge steg verifisert)*

## Files Likely Touched

- `app/[locale]/(auth)/login/actions.ts` — ny gren + union-medlem + kommentar-justering
- `app/[locale]/(auth)/login/page.tsx` — `KNOWN_ERROR_CODES` + ny kode
- `messages/no.json`, `messages/en.json` — `auth.errors.rate_limited_quota`
- `app/[locale]/(auth)/login/actions.test.ts` — to nye tester (kriterium 1–2)
- `package.json` + `CHANGELOG.md` — patch-bump + én Feilrettinger-linje (bruker-synlig fix)

## Out of Scope

- `over_request_rate_limit`-impostoren (IP-nivå «too many requests» → feil minutt-copy)
  — eget issue hvis den noen gang observeres i praksis.
- Endringer i egen-bucketen (`emailMax`/`ipMax`/vindu) — #1347 B står.
- Generell regex-stramming av heuristikken — fredet i #1347-kontrakten.
- Retry-informasjon fra Supabase-headere (`retry-after`) — supabase-js eksponerer den
  ikke på AuthError; ikke verdt en egen fetch-vei for et sjeldent tilfelle.
