# Evaluering: #1381 resend utløpt invitasjon

**Verdikt: ACCEPT**

Evaluert 2026-08-14 mot `.forge/contracts/1381-resend-expired.md` (Alternativ A), diff `origin/main..HEAD` (3 commits: 4db12537 refactor, 43bb61f7 fix resend, 025f7a99 fix badge).

## Kriterier

- **S1 — Utløpt-badge, riktig retning: PASS.** Selecten henter nå `expires_at` (PendingInvitations.tsx:57), badgen beregnes i RSC-en via `isInviteExpired(inv.expires_at)` (server-tid, per render); helperen returnerer `expMs <= nowMs` — eksakt speiling av DB-porten `expires_at > now()`, og grensetilfellet (nøyaktig utløps-instant = utløpt) er låst av egen test i `lib/auth/inviteExpiry.test.ts`. Gyldige rader: `expiredLabel = null` → rendres uten badge.
- **S2 — resend forlenger + mailer ny frist: PASS.** `actions.ts:135-145`: `inviteExpiresAtFromNow()` → UPDATE scopet `.eq('id', id).is('accepted_at', null)` kjedet `.select('id')` + `expectAffected` (signatur verifisert mot `lib/supabase/affectedRows.ts`). `sendInviteNotification` får den NYE `expiresAt` (:160). Test i `actions.test.ts` asserter stemplet ligger i `[before+TTL, after+TTL]`, at update er scopet på både id og `accepted_at IS NULL`, og at mail-payloaden bærer nøyaktig patch-verdien.
- **S3 — akseptert rad avvises før skriv: PASS.** `if (inv!.accepted_at) redirect(resend_failed)` (:129) står FØR UPDATE-en; test asserter null update-kall og null mail.
- **S4 — 0-row → resend_failed, aldri error.tsx: PASS.** try/catch rundt `expectAffected` (:136-153); catch logger og kaller `redirect(?error=resend_failed)` — redirect-throwet kastes INNE i catch og propagerer fritt (mail-try-en lenger ned fanger det ikke). Ingen mail sendt ved feil (redirect skjer før `sendInviteNotification`); test dekker 0-row-caset eksplisitt.
- **(a) Delt TTL-konstant: PASS.** `grep '7 \* 24'` i actions.ts = tomt; både `sendInvitation` (:84) og `resendInvitation` (:135) kaller `inviteExpiresAtFromNow()`; konstanten bor i `lib/auth/inviteExpiry.ts` (`INVITE_TTL_DAYS = 7`).
- **(b) Mail-template urørt, snapshots grønne: PASS.** `git diff origin/main..HEAD -- lib/mail/` = 0 linjer; `npx vitest run ... lib/mail ...` grønn uten snapshot-drift (del av 227/227).
- **(c) Ingen migrasjon/RLS: PASS.** `git diff -- supabase/migrations/` = 0 linjer.
- **(d) Kataloger: PASS.** Nøyaktig én linje lagt til i hver av `messages/no.json` («Utløpt») og `messages/en.json` («Expired») — nøkkelen `expiredBadge` i `admin.players`; ingenting annet endret.
- **(e) Klokke i default-argument: PASS.** `nowMs: number = Date.now()` evalueres ved hvert kall — RSC-en kaller helperen per rad per render, altså fersk server-tid hver gang (semantisk identisk med bar `Date.now()` i RSC-body, uten purity-lint-treffet). Semantikken er testet med injisert `nowMs`: fremtid/fortid/eksakt grense/ferskt stempel/uparsbar input (5 tester).
- **(f) Badge-pille og radlayout: PASS.** Pillen er `inline-block shrink-0` ved siden av e-post-`<p class="truncate">` i en `flex min-w-0 items-center gap-1.5`-wrapper — `truncate` (overflow-hidden) nuller flex-items automatiske minstemål, så lange e-poster trunkeres og badgen forblir synlig. Danger-tinten (`rgba(180,60,60,0.3)`-border + `var(--danger)`) er samme par som «trekk tilbake»-mønsteret ellers i samme fil (:193). Ikke-interaktiv → 44px-krav gjelder ikke.
- **(g) Rate-limit før update: PASS.** `consumeAdminInviteRateLimit` (:115-121) står før både SELECT-en (:123) og UPDATE-en (:137).

## Gates (kjørt i denne økten, Node 22)

- `npx vitest run "app/[locale]/admin/spillere" lib/mail messages lib/auth` → **24 filer / 227 tester grønne**.
- `npm run lint` → **0 errors** (55 pre-eksisterende warnings; ingen i berørte filer — `spillere/[id]/actions.ts`-treffet er en annen, urørt fil).
- `npx tsc --noEmit` → **rent**.
- `node scripts/weekly-release.mjs --dry-run` → begge 1381-notatene parser (fail-closed-vakten fornøyd).
- **`npm run build` trenger IKKE re-kjøring:** tsc er grønn i denne økten (dekker type-drift/exhaustive-switch-klassen), og diffen har ingen ny rute, ingen `export const runtime`, ingen ny client/server-grense og ingen config-endring — feilklassene kun build fanger har ingen berørt flate her.
- Staging-klikk (kontraktens gate 2) gjenstår som pre-merge-gate i hovedøkten (staging-verified-label, #1076) — utenfor denne evalueringens mandat.

## Commit-hygiene

- 3 commits, alle med `Refs #1381` i body.
- Fix-commit 43bb61f7 bærer `.changes/1381-send-pa-nytt-forlenger.md`, fix-commit 025f7a99 bærer `.changes/1381-utlopt-merke.md` — to notater med unike navn, gyldig fix-frontmatter (type+issue).
- Refactor-commit 4db12537 har `[no-changelog]` (passerer uansett fritt).
- Ingen commit rører `package.json`-versjonen eller `CHANGELOG.md`.

## Funn

Ingen.
