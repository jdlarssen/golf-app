# Forge-kontrakt: #659 — email_is_invited må gjenkjenne club_invitations

## Problem (verifisert)

`email_is_invited(check_email)` (prod-RPC, def fra migrasjon 0013, sist rørt 0091) sjekker kun `public.invitations`. `sendCode` gater `shouldCreateUser = Boolean(isInvited) || allowSelfReg`. En uregistrert e-post med kun en åpen `club_invitations`-rad (feature #644, migrasjon 0099, shippet 2026-06-16) får `isInvited=false` → blokkeres på OTP-steg 1 → når aldri `verifyCode` der `accept_club_invitations()` (login/actions.ts:378) ville gjort dem til medlem.

Verifisert: `verifyCode` kaller `accept_club_invitations` korrekt. Eneste manglende ledd er `email_is_invited`.

## Scope

ÉN ny migrasjon: `supabase/migrations/0100_email_is_invited_club_aware.sql` — `CREATE OR REPLACE FUNCTION public.email_is_invited(check_email text)` som returnerer true også ved åpen, ikke-utløpt `club_invitations`-rad. Bevarer eksisterende `invitations`-gren byte-for-byte. Påføres prod via Supabase MCP `apply_migration`.

Ingen TS-kodeendring (funksjonen returnerer fortsatt boolean; `sendCode` uendret). Ingen bruker-synlig copy → ingen versjon-bump (DB-migrasjon + ev. test = `fix(auth)` som ikke trigger CHANGELOG-hook? — NB: `fix(...)` trigger hook. Se «Gates».).

## Gray areas — besluttet

1. **Klubb-utløp (`groups.valid_until`)?** → NEI. Speiler `invitations`-mønsteret: gate kun på invitasjonens egen `accepted_at is null and expires_at > now()`. Klubb-gyldighet håndteres ved accept-tid i `accept_club_invitations`. Holder funksjonen enkel og symmetrisk.
2. **Test av ren SQL-funksjon** → Primær gate = live SQL-verifikasjon i transaksjon (insert fake club_invitations → assert true → rollback), pluss re-query av `pg_get_functiondef` for å bekrefte club-grenen. Ingen ny vitest (SQL-funksjon, ingen passende Type-A-flate; over-testing unngås per test-disiplin).

## Success criteria

- [ ] Ny migrasjonsfil `0100_email_is_invited_club_aware.sql` med `CREATE OR REPLACE` + forklarende kommentar som peker på #659/#644
- [ ] Funksjonen returnerer `true` for e-post med åpen, ikke-utløpt `club_invitations`-rad (verifisert: insert→select→rollback i prod)
- [ ] Funksjonen returnerer fortsatt `true` for åpen `invitations`-rad (game-invite, uendret) og `false` for e-post uten noen invitasjon
- [ ] Migrasjon påført prod via Supabase MCP; `pg_get_functiondef` bekrefter club-grenen er live
- [ ] `npm run build` grønt (ingen TS-regresjon)

## Gates (scoped to change)

- `npm run build` (tsc) — må passere
- Live SQL-verifikasjon (3 tilfeller over) — evidens før checkbox
- Commit: `fix(auth): ...` trigger versjon-bump-hook. Endringen er DB-only/ikke bruker-synlig på en måte som krever CHANGELOG, MEN hook blokkerer `fix(...)` uten bump. Beslutning: dette ER bruker-synlig (klubb-invitasjon begynner å virke) → bump PATCH + CHANGELOG-oppføring. Alternativt prefiks `fix` beholdes med bump.

## Out of scope

- Self-reg-flagg-status i Vercel (eier sjekker; fix virker uansett)
- #660–#664 (egne issues)
- database.types.ts regenerering (#488; funksjonen er allerede typet boolean)
