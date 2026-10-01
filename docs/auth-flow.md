# Auth-flyt

> Flyttet ordrett fra CLAUDE.md (#2100). Realtime-fella (`setAuth()`) står i `lib/sync/AGENTS.md`.

**OTP-kode** (6–8 sifre i mail, ingen URL-er). Bytte fra magic-link skjedde 2026-05-13 fordi magic-link-URL-en brøt iOS PWA-innlogging på to måter samtidig: (a) PKCE-handoff feilet når Mail.app åpnet lenken i Safari istedenfor PWA-shellen (cookie-jar-mismatch), (b) mail-scannere konsumerte one-time-token-en før brukeren rakk å klikke. Begge forsvinner når det ikke finnes URL å klikke.

Login-flyten er to-stegs på samme `/login`-side (styrt av `?step=` search-param):
1. `sendCode`-action: kaller `sendLoginCode` (`lib/auth/sendLoginCode.ts`), som etter fartsgrensen og engangs-sperren gateer `shouldCreateUser` på `email_is_invited` RPC (eller bryteren for nye kontoer) og kaller `signInWithOtp` → Supabase sender kode-mail
2. `verifyCode`-action: `verifyOtp({type: 'email'})` → setter session-cookie, kjører `afterLogin` (`lib/auth/afterLogin.ts`: gjest-flagget, invitasjonene med `accepted_at` via RLS-policy 0012, vennskap, klubbinvitasjoner), redirecter til `next` eller `/`

**Appen (#2216)** går gjennom de samme to kjernene: `POST /api/auth/send-code` kaller `sendLoginCode`, appen kjører `verifyOtp` selv, og `POST /api/auth/after-login` kjører `afterLogin` med id og e-post fra Bearer-tokenet. En ny e-post får altså konto i appen på samme vilkår som på nettsiden. Wire-kontraktene står i `docs/native/app-spike.md` («Innloggingen gjennom nettsiden»).

Invitasjoner: admin/invite-flyten inserter rad i `public.invitations` og sender en separat **notifikasjons-mail via Resend** (`lib/mail/inviteNotification.ts`). Selve kode-mail-en sendes først når invitéen kommer til `/login` og ber om kode — to mailer per invitasjon (notifikasjon + kode), én UX-flyt for alle.

Auth state via cookies (`@supabase/ssr`). Proxy (`proxy.ts`) refresher session.

**Mail-debug:** Kode-mail går via Supabase Auth (sjekk Auth Logs). Invite/gameFinished/scorecardSubmitted går via Resend (sjekk Resend dashboard + Vercel runtime logs for `[endGame]` / `[submitScorecard]` / `[admin/spillere]`-prefiks). Alle tre Resend-helpers er best-effort med `Promise.allSettled` + `console.error` — feil blokkerer ikke brukerflyten.
