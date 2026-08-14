# Kontrakt: «Send på nytt» skal virke på utløpte invitasjoner, og ventelisten skal vise utløp (#1381)

## Problem

Ventelisten på /admin/spillere henter ikke `expires_at` (`app/[locale]/admin/spillere/_components/PendingInvitations.tsx:55` — select: `id, email, created_at, opened_at`) — en utløpt invitasjon (TTL 7 dager) ser identisk ut som en gyldig. `resendInvitation` (`app/[locale]/admin/spillere/actions.ts:104-146`) sender mailen uten å sjekke eller forlenge fristen (eksplisitt kommentar «Resend forlenger ikke fristen (#1179 out-of-scope)»). Mottakeren stoppes så i login-porten fordi `email_is_invited` krever `expires_at > now()` (`supabase/migrations/0100_email_is_invited_club_aware.sql:29,36`) og lander på `invite_expired`. Admin tror hen har hjulpet en treg invité; i praksis er mailen en blindvei. HCD-audit funn F40 (P2).

## Design (alternativ A — anbefalt)

1. **Resend forlenger fristen:** i `resendInvitation`, etter rate-limit- og `accepted_at`-sjekkene: `UPDATE invitations SET expires_at = now()+7 dager WHERE id = :id AND accepted_at IS NULL`, kjedet med `.select()` + `expectAffected` (`lib/supabase/affectedRows.ts:53` — 0-row = feil, trap 2). NB: `expectAffected` KASTER (`NoRowsAffectedError`) — pakk i try/catch og oversett til fila sitt redirect-mønster (`?error=resend_failed`), ikke la den boble til error.tsx. Deretter `sendInviteNotification` med den NYE `expiresAt` — frist-linjen i mailen blir riktig igjen.
2. **Utløpt-badge:** `PendingInvitations` henter også `expires_at` (selecten på :55 + typen på :12-17) og viser en «Utløpt»-badge når `expires_at <= now()` (server-tid i RSC-en; kolonnen er NOT NULL). Det finnes INGEN danger-badge-variant på siden i dag (`GuestBadge`/`UnconfirmedBadge` er dempede piller uten tone-prop) — lag en liten lokal pille i samme form som `GuestBadge`, med danger-tint (`--danger` finnes; siden bruker den allerede inline på «trekk tilbake»). Ny copy-nøkkel i `admin.players`-namespacet, no + en.
3. **Én TTL, ett hjem:** 7-dagers-konstanten ligger i dag inline i `sendInvitation` (`actions.ts:82`, `Date.now() + 7*24*60*60*1000`). Trekk ut delt konstant (f.eks. `INVITE_TTL_DAYS = 7`) og bruk den begge steder (AGENTS.md-felle 4).

## Edge Cases & Guardrails

- **RLS er verifisert — ingen migrasjon:** UPDATE-policyen «invitations self mark accepted» (0092_rls_policy_perf.sql:461-470) har `is_admin()`-gren i både USING og WITH CHECK, admin-SELECT-grenen (0092:448) lar `.select()` returnere raden, og kolonne-vakten `guard_invitations_self_update` (0107:151-153) slipper admin forbi. Ingen senere migrasjon (t.o.m. 0142) rører invitations-policyer eller -triggere (0131/0137/0141/0142 er soft-delete-deletes, ACL på guard-funksjonen og en funnel-SELECT). `resendInvitation` kjører bak `loadAdminContext` → admin-sesjon → UPDATE går gjennom. Skulle den likevel treffe 0 rader (rad slettet i mellomtiden), gir try/catch-en feil-redirect, ikke stille suksess.
- Resend på ALLEREDE gyldig invitasjon forlenger også (ny frist fra nå) — det er ønsket: handlingen betyr «gi denne personen en fersk sjanse».
- Akseptert invitasjon: eksisterende `accepted_at`-sperre står (redirect `resend_failed`).
- Badgen beregnes server-side per render — ingen klient-klokke-skjev.
- Mail-templaten (`lib/mail/inviteNotification.ts:186-194`) røres ikke — den håndterer allerede både fremtidig og passert `expiresAt`; snapshot-testene skal stå uendret.
- Etter vellykket resend av utløpt rad forsvinner badgen ved neste render (fristen er ny) — konsistent uten ekstra kode.

## Key Decisions

- Fristen forlenges til `now() + 7 dager` (samme TTL som ny invitasjon) — resend er semantisk «ny sjanse», ikke «purring på gammel frist».
- Ingen skjema-endring, ingen migrasjon, ingen RLS-endring.

## Alternativer (produktvalg)

**Anbefaling: Alternativ A** — «Send på nytt» blir en handling som alltid virker; listen forteller sannheten.

**Alternativ A — resend forlenger fristen + «Utløpt»-badge (bygges):**
- Fordeler: én knapp som alltid gjør det admin tror den gjør; ingen ny flyt å lære; utløp blir synlig der beslutningen tas.
- Ulemper: «utløpt» blir mindre endelig (en frist kan forlenges i det uendelige); fristen i første mail stemmer ikke lenger med den nye (mottakeren får ny mail med ny frist — lite forvirrende i praksis).

**Alternativ B — resend sperres på utløpte rader, med henvisning til ny invitasjon:**
- Fordeler: «utløpt» betyr utløpt — strammere semantikk; ingen UPDATE-sti å vedlikeholde.
- Ulemper: to-stegs friksjon for admin (slett/ignorer + inviter på nytt); knappen som synes må forklares når den er død; hjelper ikke invitéen raskere.
- Ombyggingskostnad: liten — badge-delen er felles, kun resend-grenen endres.

**Reversibilitet:** full — ren oppførselsendring, ingen datatap å angre.

Svar «alternativ B» i PR-en, så bygges det om på samme branch. Ingen hast — PR-en venter til du svarer eller merger.

## Success Criteria

1. Utløpt invitasjon vises med «Utløpt»-badge i ventelisten; gyldige rader er uendret.
2. «Send på nytt» på utløpt rad → `expires_at` = nå + 7 dager (verifisert med `.select()`-retur), mail sendt med ny frist, og mottakeren slipper gjennom login-porten (`email_is_invited` → true).
3. Resend på akseptert rad avvises som før.
4. 0-row UPDATE gir `?error=resend_failed`-redirect (via try/catch rundt `expectAffected`), ikke stille suksess og ikke rå 500.

## Gates

- `tsc` + `lint` + `vitest` grønne; mail-snapshots uendret.
- Staging-klikk: sett en rad utløpt (SQL på staging), se badge, trykk «Send på nytt», bekreft ny frist i DB og at login-porten slipper e-posten gjennom.

## Files Likely Touched

- `app/[locale]/admin/spillere/actions.ts`
- `app/[locale]/admin/spillere/_components/PendingInvitations.tsx`
- `messages/no.json`, `messages/en.json`

## Out of Scope

- TTL-lengden (7 dager står).
- Invitasjons-flyten for spill/lag (game_id-invitasjoner har egne løp) — dette gjelder admin-ventelisten.
- Sømløs invitasjons-innlogging (#318, satt til side).
- Frist-visning til invitéen selv (#1179, lukket).


---

## Drift-sjekk (2026-08-14): kontraktens påstander verifisert mot HEAD — ingen drift. (`PendingInvitations.tsx:55` select uten expires_at; `actions.ts:82` inline TTL; `:134–136` «forlenger ikke»-kommentaren; `expectAffected` på `affectedRows.ts:53`.) Gates-avsnittets implisitte CHANGELOG-regime er uansett #1562-notatfil.

---

## Bygge-evidens (2026-08-14)

S1–S4 + adversarial a–g: PASS (evaluator runde 1 ACCEPT — `.forge/evaluations/1381-resend-expired.md`). Gates: vitest 227/227 (mail-snapshots uendret), lint 0 errors, tsc clean, build exit 0 (builder). Staging-klikk: PR-fasen. Builder-funn filet: #1613 (spill-invite samme mønster), #1614 (TTL-restanse), #1615 (telle-avvik).
