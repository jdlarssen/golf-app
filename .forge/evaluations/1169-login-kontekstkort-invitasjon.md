# Evaluering — #1169 Kontekstkort på /login for inviterte spillere

**Dato:** 2026-07-10
**Evaluator:** skeptisk, fresh context — uavhengig verifisert (kommandoer + kode + live curl mot prod-bygg på staging)
**Branch-topologi:** origin/main har rykket forbi branchens base (merge-base `9dab37b9`). Ekte feature-diff er `9dab37b9..HEAD` (2 commits: feat `869428d6` + docs `4408fb28`). `origin/main..HEAD` er forurenset av ikke-relaterte 1207/loops/discord-slettinger og ble ignorert.

# VERDIKT: ACCEPT

Alle 6 suksesskriterier og alle gates PASS med uavhengig evidens. Ingen substansielle funn.

---

## Suksesskriterier

### 1. Game-scoped invite-mail har login-lenke med `invite=<token>` — PASS

- `lib/mail/inviteNotification.ts`: ny valgfri `inviteToken?: string`; `if (inviteToken) loginQs.set('invite', inviteToken)` (linje ~120). Lenke ellers uendret.
- Snapshot-testene (`inviteNotification.test.ts`) viser eksplisitt `…/login?email=venn%40example.com&invite=11111111-2222-3333-4444-555555555555` i BÅDE no- og en-tekst.
- Alle 5 kall-steder sender token (verifisert i diff): admin/spillere `sendInvitation` + `resendInvitation` (`select('email, accepted_at, token')` → `inviteToken: inv!.token`), `inviteToGameActions` insert (`const inviteToken = randomUUID()` → insert + mail samme variabel) + retry (`select('id, token')` → `inviteToken: existingInvite.token`), `invite/actions` `sendFriendInvite`.
- Dør-testene binder mail-token === DB-radens token: `inviteToGameActions.test.ts` insert-path (finner `insert`-call, `insertedToken` → `toHaveBeenCalledWith({… inviteToken: insertedToken})`) og retry-path (`inviteToken: 'eeeeeeee-1111-…'`); `invite/actions.test.ts` (`insertedToken` fra insert-call).
- Evidens: `npx vitest run lib/mail …` → **23 filer / 200 tester passed** (inkluderer lib/mail-suiten).

### 2. `/login?invite=<gyldig token>` viser kortet — PASS (uavhengig live-verifisert)

Opprettet staging-testdata (game «EVAL-1169 Kontekstkort», stableford, Byneset North, tee-off 2026-07-16T14:30Z, inviter Test Admin) + invitasjon token `deadbeef-1169-4000-8000-000000000001`. Curl mot kjørende prod-bygg (localhost:3000 → staging):

```
HTTP 200
invite-context-card count = 1
"Test Admin har invitert deg"
"EVAL-1169 Kontekstkort"
Spillformat: Stableford
Bane: Byneset North
Tee-off: 16. juli 2026, 16:30   (14:30 UTC → 16:30 Oslo — korrekt locale-formatering)
```

At det kjørende prod-bygget rendrer den NYE komponenten er samtidig bevis på at `npm run build` lyktes på denne branchen.

### 3. Kortet står på både `step=email` og `step=verify` — PASS

- `step=email`: `invite-context-card count=1` (case 1 over).
- `curl "…/login?step=verify&email=…&invite=deadbeef-…0001"` → HTTP 200, `invite-context-card count=1`.
- Hidden invite-input bekreftet i DOM: `name="invite" value="deadbeef-1169-4000-8000-000000000001"`. `SendCodeForm` + `VerifyCodeForm` har alltid-montert `<input type="hidden" name="invite">`; `sendCode` videreforer `if (invite) qs.set('invite', invite)` i verify-redirect (og honeypot-redirect).

### 4. Ugyldig/utløpt/akseptert/manglende token → siden identisk (ingen kort, HTTP 200) — PASS

Live curl, alle `invite-context-card count=0`, alle HTTP 200:

| Case | Token | HTTP | Kort |
|---|---|---|---|
| Ugyldig format | `not-a-valid-token-format` | 200 | 0 |
| Utløpt | `…0002` (expires_at i fortid) | 200 | 0 |
| Game-løs | `…0003` (game_id NULL) | 200 | 0 |
| Akseptert | `…0004` (accepted_at satt) | 200 | 0 |
| Manglende param | `/login` | 200 | 0 |
| Velformet, ukjent | `abcdef00-0000-4000-8000-000000000999` | 200 | 0 |

Fail-closed bekreftet på alle helperens fem avvisnings-grener (regex-guard, accepted_at, expires_at, game_id, ukjent rad → `maybeSingle` null). Null-stien i `page.tsx` gjør ingen ny `await` utover `isInviteToken('')` (regex) — `invite ? await … : null` short-circuiter.

### 5. Ingen roster/premie/e-post/hcp i kort-HTML — PASS

Ekstrahert kort-region fra live HTML inneholder KUN de 5 whitelistede feltene (inviter-linje, spillnavn-heading, Spillformat/Bane/Tee-off i `<dl>`). Grep på kort-region: `eval1169-valid@example.com`=0, `handicap|hcp`=0, `premie|prize`=0, `roster|spillerliste`=0. Props-settet i `InviteContextCard.tsx` ER whitelisten (5 strenger, ingen roster/prize/email/hcp-props). Type C-test `InviteContextCard.test.tsx` grønn.

### 6. Copy i no.json + en.json, catalog+apostrophe-paritet, humanizer — PASS

- Diff viser `auth.inviteCard.{invitedBy,invitedByFallback,formatLabel,courseLabel,teeOffLabel}` i BEGGE kataloger (samme nøkkelsett).
- `npx vitest run messages/` → **2 filer / 4 tester passed** (catalogParity + apostropheParity).
- Norsk copy gjenbruker etablerte formuleringer («{name} har invitert deg», «Bane:», «Tee-off:») — konsistent, ingen AI-tells.

---

## Gates

- **`npx tsc --noEmit`** — PASS. Kjørt, `TSC_EXIT=0` (Node v22.23.0).
- **`npm run lint`** — PASS. Kjørt, exit 0: `54 problems (0 errors, 54 warnings)`. Alle 54 er pre-eksisterende complexity/max-depth-warnings i urelaterte filer (sideTournament, wolf, fitsPlayerCount m.fl.); INGEN i de nye filene (getInviteLoginContext, InviteContextCard, login/page). Matcher kontraktens «0 errors, 54 pre-eksisterende warnings».
- **`npm run build`** — PASS (indirekte, sterk evidens). Det kjørende prod-bygget (`next start`) på localhost:3000 er bygget fra denne branchen og serverer den nye kortkomponenten korrekt — bygget lyktes.
- **Co-located vitest** — PASS. `lib/mail` + login-suiten + tre invite-dører + catalogParity: **23 filer / 200 tester passed**.
- **Staging-klikkrunde** — PASS for feature-flaten (kort + alle fem guard-grener uavhengig curl-verifisert mot staging-DB). OTP-innlogging → `game_players`-insert er byggerens claim; feature-overflaten (visning + fail-closed) er uavhengig bevist her.
- **Versjon + CHANGELOG + Refs** — PASS. `package.json` = `1.185.0` (MINOR-bump fra 1.184.0). CHANGELOG-rad «1.185 · Invitasjonen viser hva du blir med på» under Funksjoner. Begge commits har `Refs #1169` i body; feat-commit har korrekt feat-prefiks.

---

## Kritisk kodegjennomgang — `lib/auth/getInviteLoginContext.ts`

- **Felt-whitelist reell:** select henter kun `expires_at, inviter:users(name, nickname), games(name, game_mode, scheduled_tee_off_at, courses(name))`. Ingen e-post/roster/premie/hcp i query eller retur-type. Bekreftet mot live HTML (kriterium 5).
- **UUID-guard før DB:** `isInviteToken()` (streng UUID-regex) kalles først; ikke-UUID → `return null` uten DB-runde. Delt hjem — `page.tsx` og `login/actions.ts` gater på samme funksjon.
- **Fail-closed på DB-feil:** hele oppslaget i try/catch; `if (error) return null`, `if (!data?.games) return null`, `catch → return null`. Aldri 500.
- **Predikater:** `accepted_at IS NULL`, `game_id IS NOT NULL`, `expires_at > now()` — alle tre live-verifisert via case 2/4/5.

## Funn

Ingen substansielle funn. Mindre observasjoner (ikke blokkerende, per kontraktens eksplisitte design — ingen handling nødvendig):

- Game-løse invitasjoner (admin-generell + venneinvitasjon) sender også `&invite=<token>` i mail-lenken, men helperens `game_id IS NOT NULL`-gate gjor token-en inert (ingen kort). Dette er per kontraktens Design-punkt 1 (alle kallere sender token) + Key Decision (gaten bor i helperen). Ingen lekkasje — token løser til null.
- `resendHref` beregnes fortsatt i `page.tsx` og sendes til `VerifyCodeForm` som `@deprecated`/ubrukt prop. Pre-eksisterende (resend er nå inline-form); invite-persistens på resend skjer via hidden input, ikke resendHref. Ikke introdusert av denne PR-en.

## Opprydding

Staging-testdata slettet: `delete … where token like 'deadbeef-1169-%'` + `delete games where id='e7a11169-…'` → verifisert `leftover_invites=0, leftover_games=0`. Ingen skriv mot prod.
