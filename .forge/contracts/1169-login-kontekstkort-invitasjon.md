# Spec: Kontekstkort på /login for inviterte spillere (#1169)

**Issue:** [#1169](https://github.com/jdlarssen/golf-app/issues/1169) · UX-psykologi: resiprositet (gi verdi før du ber om noe) · Tier 1 vekstsløyfa
**Type:** `feat` → MINOR-bump + CHANGELOG Funksjon-rad

## Problem

En invitert spiller får en mail med kontekst (hvem, hvilket spill), men lenken går til
`/login?email=…` — og selve login-siden ([app/[locale]/(auth)/login/page.tsx:53-102](app/[locale]/(auth)/login/page.tsx))
viser kun BrandHero + kodeskjema + demo-lenke. Null turneringskontekst før kode-veggen.
Den offentlige plakaten (`PublicLandingView.tsx`) viser derimot full kontekst før pålogging.
Vi gir invitasjons-stien det samme: et kontekstkort over kodeskjemaet.

## Research Findings

- `invitations.token` er NOT NULL UNIQUE (`lib/database.types.ts:1016`), skrives med
  `randomUUID()` i alle tre invite-dørene, men **leses aldri** (grep `.eq('token'` = 0 treff).
  Gratis høy-entropi capability for å identifisere invitasjonen i login-URL-en.
- Invitasjonstabellen har INGEN navn-kolonne — kun `email/token/game_id/invited_by/
  expires_at/accepted_at/opened_at` ([lib/database.types.ts:1006-1017](lib/database.types.ts)).
  Inviterer-navn må joines via `invited_by → users(name, nickname)`.
- Mail-lenken bygges i [lib/mail/inviteNotification.ts:112-113](lib/mail/inviteNotification.ts):
  `mailUrl(locale, '/login')?email=<to>` — ingen token/game-param i dag. 20 approval-snapshots
  i `inviteNotification.test.ts` låser subject/text/body-linje (Type B, én chrome-lås).
- `/login` ligger i `PUBLIC_PATH_PATTERN` ([proxy.ts:23-24](proxy.ts)) og page er server-
  component → kan kalle `getAdminClient()` direkte (anon har ingen RLS-lesetilgang til
  `invitations`/`games`; felt-whitelist er sikkerhetsgrensen, jf. `getGameByShortId.ts`).
- `sendCode` videresender `email`+`next` til verify-steget via qs
  ([login/actions.ts:159-161](app/[locale]/(auth)/login/actions.ts)); error-redirects
  (`?error=X`) dropper alle params (pre-eksisterende).
- Datoformatering: `formatTeeOff`-mønsteret i [signup/[shortId]/page.tsx:589-604](app/[locale]/signup/[shortId]/page.tsx)
  (formatDate + formatTime, locale-aware).

## Prior Decisions

- **#1022:** felt-whitelistet admin-client-helper er mønsteret for anon-synlige spilldata;
  offentlig flate viser kun navn/bane/tee-off-nivå — aldri e-post/hcp/scores.
- **#318 (åpen kontrakt, ikke bygget):** planlegger `redeem_token` i mail-URL. Denne
  kontrakten bruker den EKSISTERENDE token-kolonnen kun til lesing (visning) — ingen
  innloggings-semantikk, ingen konflikt. #318 kan senere gjenbruke samme param-navn.
- **#166/#199:** login-siden er også selv-reg-inngang — kortet er additivt og må ikke
  forstyrre standard-flyt.

## Design

1. **Mail:** `InviteNotificationParams` får valgfri `inviteToken?: string`. Satt → login-URL
   blir `…/login?email=<to>&invite=<token>`. De tre kallerne (admin/spillere `sendInvitation`
   [actions.ts:83-92], game-invite [inviteToGameActions.ts:246-271], venne-invite
   [invite/actions.ts:112-128]) holder allerede token-en i en lokal variabel ved insert —
   send den med. `resendInvitation` selecter token og sender med.
2. **Ny helper `lib/auth/getInviteLoginContext.ts`** (server-only, admin-client, felt-
   whitelist): oppslag på `token` der `accepted_at IS NULL`, `expires_at > now()` og
   `game_id IS NOT NULL`; joiner inviterer (`users.name, nickname`) og spill
   (`name, game_mode, scheduled_tee_off_at, courses(name)`). Returnerer null ved ethvert
   avvik (fail-closed). Ta med `expires_at` i retur-typen (#1179 bygger på den).
3. **Login-siden:** les `?invite=` (via `first()`), kall helperen, og render et
   `InviteContextCard` (ny presentasjons-komponent à la `PublicLandingView`: inviterer-navn,
   spillnavn, modus-label fra `modes`-namespace, bane, tee-off) OVER `<Card>` med skjemaet.
   Ingen kort ved manglende/ugyldig token — siden er ellers bit-for-bit som i dag.
4. **Param-persistens:** `SendCodeForm` får hidden `invite`-felt (som `next`); `sendCode`
   videresender den i verify-redirecten, og `resendHref` tar den med — kortet står på begge steg.

## Edge Cases & Guardrails

- Ugyldig/utløpt/akseptert token, eller token uten `game_id` → ingen kort, ingen feilmelding,
  ingen logg-støy. Aldri 500 — helperen svelger DB-feil med `console.error`.
- **Ingen lekkasje utover mailens eget innhold + plakat-nivå:** kortet viser inviterer-navn,
  spillnavn, modus, bane, tee-off. IKKE roster, premier, betaling, e-poster eller hcp —
  token-holderen vet allerede hvem/hva fra mailen; bane/tee-off er plakat-nivå.
- Error-redirect fra `sendCode` mister `invite`-param (som den mister `email` i dag) —
  akseptert, pre-eksisterende mønster; ikke fiks i denne PR-en.
- Kortet må ikke dytte skjemaet under folden på mobil — kompakt (maks ~4 linjer + heading).
- `escapeHtml`-disiplinen i mailen består; token er URL-safe (UUID).

## Key Decisions

- **Capability = eksisterende `invitations.token`**, ikke e-post-oppslag: et `?email=`-basert
  oppslag ville latt hvem som helst som kjenner en adresse sniffe hvilke spill personen er
  invitert til. Token finnes kun i mottakerens mail. Ingen migrasjon nødvendig.
- **Kort kun for game-scopede invitasjoner** (`game_id IS NOT NULL`): åpne venne-/admin-
  invitasjoner har ingen turneringskontekst å vise; mailen dekker «hvem inviterte».
- **Ren visning, ingen auth-semantikk:** token logger ingen inn og konsumeres ikke —
  innloggingsflyten (OTP) er urørt.

**Claude's Discretion:** eksakt kort-layout/copy (humanizer-pass); om `opened_at`-stemplingen
i `sendCode` også skal skje ved kort-visning (default: nei, behold dagens semantikk «ba om
kode»); param-navn (`invite` foreslått); om helperen får én Type A-test på
gyldighets-predikatet eller kun Type C på kortet; CHANGELOG-tagline.

## Success Criteria

- [ ] Game-scoped invite-mail har login-lenke med `invite=<token>` — snapshot-diff reviewd
      visuelt, `npx vitest run lib/mail` grønn etter `npx vitest -u`.
- [ ] `/login?invite=<gyldig token>` viser kortet (inviterer, spillnavn, modus, bane, tee-off)
      over kodeskjemaet — verifisert med staging-klikkrunde (send invitasjon → åpne lenke).
- [ ] Kortet står på både `step=email` og `step=verify` (param følger sendCode-redirecten).
- [ ] Ugyldig/utløpt/akseptert/manglende token → siden identisk med i dag (ingen kort, 200 OK).
- [ ] Ingen roster/premie/e-post/hcp-data i kort-HTML-en (review + Type C-test på props).
- [ ] Copy i `messages/no.json` + `en.json` (catalogParity grønn); norsk copy humanizer-kjørt.

## Gates

- [ ] `npx tsc --noEmit` grønn · `npm run lint` grønn · `npm run build` grønn
- [ ] Co-located vitest for endrede filer grønn (inkl. oppdaterte mail-snapshots)
- [ ] Staging-klikkrunde av invitasjons-flyten (mail-lenke → kort → OTP-login) FØR merge
- [ ] feat-commit: MINOR-bump + CHANGELOG Funksjon-rad; alle commits `Refs #1169`

## Files Likely Touched

- `lib/mail/inviteNotification.ts` (+ `.test.ts`-snapshots) — `inviteToken`-param i login-URL
- `app/[locale]/admin/spillere/actions.ts`, `app/[locale]/admin/games/[id]/inviteToGameActions.ts`,
  `app/[locale]/invite/actions.ts` — send token med (+ resend-select)
- `lib/auth/getInviteLoginContext.ts` — NY felt-whitelistet helper (+ evt. test)
- `app/[locale]/(auth)/login/page.tsx` + `_components/InviteContextCard.tsx` (NY, + Type C-test)
- `app/[locale]/(auth)/login/_components/SendCodeForm.tsx` + `actions.ts` — param-videreføring
- `messages/no.json` + `messages/en.json` — `auth.inviteCard.*`
- `package.json` + `CHANGELOG.md`

## Out of Scope

- Frist-linje på kortet (#1179 — bygger oppå dette kortet)
- Profilskjema-veggen etter innlogging (#1176)
- Sømløs innlogging / token-innløsning (#318) — kortet endrer ikke auth
- Kort for game-løse invitasjoner; roster/premiebord på kortet
- Fiks av at error-redirects mister query-params (pre-eksisterende)
