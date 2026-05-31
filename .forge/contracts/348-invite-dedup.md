# Forge-kontrakt — #348: Invitasjon — unngå dobbel-mail (delt dedup på tvers av begge dører)

**Issue:** [#348](https://github.com/jdlarssen/golf-app/issues/348) · Part of [#344](https://github.com/jdlarssen/golf-app/issues/344) («Én vei til rom», siste barn) · labels: `design`, `area:mail`
**Branch:** `issue-348-invite-dedup`
**Type:** correctness/mail-fix · PATCH-bump

## Problem (rot-årsak funnet i koden)

To dører skriver plattform-invitasjon til samme `invitations`-tabell:
- **Admin** (`app/admin/spillere/actions.ts` → `sendInvitation`): dedup = inline `invitations`-query (`accepted_at IS NULL`) → `already_invited`. Fanger en tidligere venne-invite.
- **Venn** (`app/invite/actions.ts` → `sendFriendInvite`): sjekker `email_is_registered` + `email_is_in_auth_users` → `already_user`, men **sjekker ALDRI `invitations`-tabellen for en åpen invitasjon**.

**Dobbel-mail-vektoren:** admin inviterer `X` (skriver rad, sender mail). `X` har ikke bedt om kode ennå (ingen `auth.users`/`public.users`-rad). En spiller venne-inviterer `X` → begge user-sjekkene er false → venne-døra sender en ANDRE invite-mail. Motsatt vei er allerede trygg (admin-døra sjekker `invitations`).

**RLS-felle:** etter migrasjon 0020 kan en vanlig bruker kun SELECT-e `invitations`-rader der de er invitee eller inviter. En naiv `.from('invitations')`-sjekk i venne-døra ville IKKE se admin-radens invitasjon → fortsatt dobbel-mail. Løsningen må bypasse RLS.

## Sannhets-anker

- **`email_is_invited(check_email)`** (migrasjon 0013) er en `SECURITY DEFINER`-RPC, granted `authenticated`, som returnerer true hvis det finnes en åpen (`accepted_at IS NULL AND (expires_at IS NULL OR expires_at > now())`) invitasjon. Brukes allerede av login-flyten (`shouldCreateUser`-gate). **Eksisterende kanonisk «er denne adressen invitert»-primitiv** — bypasser RLS.
- Venne-døra kaller allerede søsken-RPC-er (`email_is_registered`, `email_is_in_auth_users`) i `Promise.all`.
- Etiketter er ALLEREDE distinkte: admin «Inviter ny spiller» (onboarding), venn «Inviter en venn» (viral). Issue-ens valgfrie «vurder ulike etiketter» krever ingenting → ingen relabel (ikke gold-plate).
- `tests/serverActionMocks.ts` `buildSupabaseMock` mangler `.rpc()`-støtte.

## Beslutning (gray-area avklart)

Bruker valgte **«Samle begge på RPC-en»**: begge dører bruker `email_is_invited` som delt dedup → én sannhetskilde. Akseptert bivirkning: admin-døra blokkerer ikke lenger på UTLØPTE invitasjoner (i dag gjør den det via inline `accepted_at IS NULL`). Det er arguably riktigere — en utløpt invitasjon er død, og admin har egen «Send på nytt» for gjenoppliving.

## Akseptkriterier

- [ ] **AC1** — Venne-døra (`sendFriendInvite`) kaller `email_is_invited`; hvis true → `redirect('/profile?invite_error=already_invited')`, INGEN `invitations.insert`, INGEN invite-mail. *Evidens: kode + test.*
- [ ] **AC2** — Admin-døra (`sendInvitation`) bruker `email_is_invited`-RPC for dedup (erstatter inline `invitations`-query); hvis true → `redirect(...error=already_invited)`, ingen insert, ingen mail. *Evidens: kode + test.*
- [ ] **AC3** — Begge flyter gir en forståelig «allerede invitert»-melding. Admin: eksisterende `already_invited`-melding. Venn: ny `already_invited`-entry i `INVITE_ERROR_MESSAGES` (`app/profile/page.tsx`), vennlig + uten å lekke hvem som inviterte. *Evidens: file:line + humanizer.*
- [ ] **AC4** — Ingen dobbel-mail på tvers: (admin→så venn) blokkeres av venne-døra; (venn→så admin) blokkeres av admin-døra. Begge gater på samme RPC. *Evidens: begge dører kaller `email_is_invited`.*
- [ ] **AC5** — `email_is_invited` er den delte primitiven brukt av begge dører (single source of truth). *Evidens: grep.*
- [ ] **AC6** — `buildSupabaseMock` utvidet med `.rpc()`-støtte (additivt, bakoverkompatibelt). Co-located tester: venne-dør (blokkerer ved invited; går videre når ikke-invitert) + admin-dør (blokkerer ved invited). Grønne. *Evidens: vitest.*
- [ ] **AC7** — Norsk copy passerer humanizer. *Evidens: humanizer.*
- [ ] **AC8** — `package.json` PATCH-bump (1.60.3 → 1.60.4) + `CHANGELOG.md`; commit-msg-hook grønn. *Evidens: hook.*

## Filer

- `app/invite/actions.ts` — legg `email_is_invited` til `Promise.all`-batchen; redirect `already_invited` hvis true.
- `app/admin/spillere/actions.ts` — bytt inline `invitations`-dedup med `email_is_invited`-RPC.
- `app/profile/page.tsx` — ny `already_invited`-melding i `INVITE_ERROR_MESSAGES`.
- `tests/serverActionMocks.ts` — `.rpc()`-støtte (additiv).
- `app/invite/actions.test.ts` (ny) + `app/admin/spillere/actions.test.ts` (utvid) — dedup-tester.
- `package.json` + `CHANGELOG.md`.

## Gates (scoped)

```bash
npm run lint
npx tsc --noEmit
npx vitest run app/invite app/admin/spillere tests/   # co-located dedup + mock-helper
npm run build
```

## Ut av scope (ikke gold-plate)

- Ingen relabel av de to dørene (allerede distinkte).
- Ingen endring i quota-logikk, RLS-policyer, eller `email_is_invited`-RPC-en selv.
- Ingen endring i admin sin registrert-bruker-håndtering (admin sjekker fortsatt ikke `email_is_registered` — eget tema, ikke dobbel-mail-vektoren).
