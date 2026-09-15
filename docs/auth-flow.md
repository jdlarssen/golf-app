# Auth-flyt

> Flyttet ordrett fra CLAUDE.md (#2100). Realtime-fella (`setAuth()`) står i `lib/sync/AGENTS.md`.

**OTP-kode** (6–8 sifre i mail, ingen URL-er). Bytte fra magic-link skjedde 2026-05-13 fordi magic-link-URL-en brøt iOS PWA-innlogging på to måter samtidig: (a) PKCE-handoff feilet når Mail.app åpnet lenken i Safari istedenfor PWA-shellen (cookie-jar-mismatch), (b) mail-scannere konsumerte one-time-token-en før brukeren rakk å klikke. Begge forsvinner når det ikke finnes URL å klikke.

Login-flyten er to-stegs på samme `/login`-side (styrt av `?step=` search-param):
1. `sendCode`-action: gateer `shouldCreateUser` på `email_is_invited` RPC, kaller `signInWithOtp` → Supabase sender kode-mail
2. `verifyCode`-action: `verifyOtp({type: 'email'})` → setter session-cookie, markerer `invitations.accepted_at` (via RLS-policy 0012), redirecter til `next` eller `/`

Invitasjoner: admin/invite-flyten inserter rad i `public.invitations` og sender en separat **notifikasjons-mail via Resend** (`lib/mail/inviteNotification.ts`). Selve kode-mail-en sendes først når invitéen kommer til `/login` og ber om kode — to mailer per invitasjon (notifikasjon + kode), én UX-flyt for alle.

Auth state via cookies (`@supabase/ssr`). Proxy (`proxy.ts`) refresher session.

**Mail-debug:** Kode-mail går via Supabase Auth (sjekk Auth Logs). Invite/gameFinished/scorecardSubmitted går via Resend (sjekk Resend dashboard + Vercel runtime logs for `[endGame]` / `[submitScorecard]` / `[admin/spillere]`-prefiks). Alle tre Resend-helpers er best-effort med `Promise.allSettled` + `console.error` — feil blokkerer ikke brukerflyten.
