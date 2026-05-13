# Admin-flate for invitasjoner og spillere — designdokument

**Dato:** 2026-05-13
**Status:** Godkjent design, klart for implementeringsplan
**Foranliggende:** TODO.md «Invitasjons-administrasjon» + brukerens behov for å rette opp invitasjoner/brukere uten å gå via rå SQL

## Bakgrunn

`/admin/invitations` har i dag kun send-skjema + en statisk liste over siste 20 invitasjoner. Når en mail feiler eller admin må rette opp en feilstavet e-post / testbruker, er rå SQL eneste vei. Det er ikke en akseptabel UX for en bruker uten programmeringsbakgrunn.

Vi bygger en samlet **spilleradministrasjon** som dekker hele livssyklusen fra invitasjon til registrert spiller, inkludert oppryddings-handlinger.

## Beslutninger (med begrunnelser)

### 1. Hard-slett, blokkert hvis spilleren har spilt

Når admin sletter en spiller:
- Slettes `auth.users`-raden via service-role-kall (`auth.admin.deleteUser`)
- `public.users`-raden cascade-slettes automatisk (FK fra 0001)
- E-posten frigjøres til ny invitasjon

**Sletting blokkeres på app-nivå hvis spilleren har én eller flere `game_players`-rader** (aktiv eller ferdig spill). Begrunnelse: slett er primært et oppryddings-verktøy for invitasjoner og testbrukere som aldri startet å spille. Spillere som har spilt har historikk som bevisst skal være vanskelig å rive ut. Hvis det virkelig trengs: admin sletter spillene først (egen TODO), så spilleren.

Vi gjør IKKE FK-cascade på `game_players.user_id` / `scores.user_id` — appens block-betingelse betyr at cascade aldri kan trigge, og fraværet av cascade er en ekstra sikkerhetsnett mot stray dashboard-actions.

### 2. Selvbeskyttelse mot admin-selvsletting

- Admin (Jørgen) er per d.d. eneste super-admin.
- Slett-knappen er disabled på egen detalj-side med teksten «Du kan ikke slette din egen konto».
- Server-action gjenkjenner `user.id === target.id` og avviser uansett.

Hvis super-admin-rollen noen gang skal overdras: gjøres via manuelt SQL-inngrep eller egen migrasjon. Ikke verdt et tillegg-UI nå.

### 3. Ingen UI-toggle for `is_admin`

Super-admin-statusen administreres ikke via redigeringsformet — det reduserer risiko for utilsiktet eskalering eller deeskalering. Kolonnen `is_admin` består i databasen og kan endres via SQL hvis det noen gang trengs.

### 4. Arrangør-rolle utsatt til egen brainstorming

Brukeren foreslo en mellomrolle («turneringsadministrator») som kan opprette spill og baner men ikke endre brukere. Vi anerkjenner behovet, men det krever RLS-revisjon på praktisk talt alle tabeller (`games`, `game_players`, `courses`, `course_holes`, `tee_boxes`, `invitations`) og fortjener egen designrunde. Logges som TODO.

I dagens leveranse bruker vi labelen «Super-admin» i intern dokumentasjon for å klargjøre semantikken, men UI-en eksponerer ikke rollen — det er kun én rolle som har admin-tilgang i UI-laget per nå.

### 5. Bekreftelses-UX

- **Send på nytt:** ingen bekreftelse (idempotent og reversibel — det er bare en ekstra mail).
- **Trekk tilbake invitasjon:** inline to-trinn på samme rad — første klikk forvandler knappen til «Sikker? [Bekreft] [Avbryt]».
- **Slett spilleren:** dedikert bekreftelses-side (`/admin/spillere/[id]/slett`) med navn, forklaring, og to knapper. Mest tydelig form for endelig handling — ingen modal-infra trengs.

### 6. Slått sammen til én flate

Opprinnelig forslag var separate tiles for «Invitasjoner» og «Spillere». Etter UX-diskusjon: én tile «Spillere» med tre seksjoner — registrerte spillere (med søk), ventende invitasjoner (med handlinger), inviter-ny-skjema (nederst som lite ekspanderende felt).

Konsept: invitasjon og spiller er to faser i samme livssyklus, ikke to konsepter. En akseptert invitasjon ER en registrert spiller — derfor vises akseptert-historikk ikke; aktivitets-loggen på `/admin/`-hjem dekker det.

Gammel rute `/admin/invitations` slettes (eller redirecter til `/admin/spillere` for bokmerker).

### 7. Redigerbare felter

Bruker-detalj-formet har tre felter: **Navn**, **Kallenavn**, **Handicap-indeks**. Ikke noe mer.

Skip / utsatt:
- E-post-endring (nice-to-have — sjelden i praksis, krever service-role-pattern; logges som TODO)
- `display_pref` (større feature med koordinert UI på tvers av flater — egen brainstorming)
- Aktivitets-statistikk per bruker (sist innlogget, antall spill — logges som TODO)
- «Vis som denne brukeren» (logges som TODO — sannsynligvis for stor)

## Datamodell

### Ny migrasjon: `0014_admin_user_management.sql`

To nye RLS-policies på `public.users`:
- `users admin update` — admin kan oppdatere alle bruker-rader
- `users admin delete` — admin kan slette bruker-rader (selve slettingen går via service-role som cascade-sletter fra `auth.users`, men policyen er eksplisitt om myndighet)

Ingen schema-endringer (ingen nye kolonner, ingen FK-justeringer).

### Service-role-klient

Ny fil `lib/supabase/admin.ts` eksponerer `getAdminClient()` som returnerer en service-role-instans for bruk i server-actions. Klienten brukes til `auth.admin.deleteUser(id)`-kall som krever service-role-nøkkel. Aldri importert fra client components.

Krav på `SUPABASE_SERVICE_ROLE_KEY` i Vercel-env (sjekkes ved Phase 3, instrukser gis brukeren hvis den mangler).

## Flate og flyt

### `/admin/spillere` — hovedside

Mobile-first layout, ovenfra og ned:

1. **Header:** BackLink til /admin, «Sekretariatet»-kicker, BrassRibbon «Spillere · klubblisten», stor serif-tittel «Spillere», statslinje «12 registrert · 4 inviterte venter».
2. **Seksjon: Registrerte spillere.** MiniRibbon-tittel + søkefelt. Liste med en rad per spiller: navn (stor serif), kallenavn i parentes om satt, e-post lite under, hcp + «det er deg»-merke til høyre. Trykk → `/admin/spillere/[id]`. Tom-tilstand: «Ingen registrerte spillere ennå.»
3. **Seksjon: Ventende invitasjoner.** MiniRibbon-tittel. Rader: e-post, dato sendt, knappene «Send på nytt» og «Trekk tilbake» (sistnevnte med inline to-trinn). Tom-tilstand: «Ingen ventende invitasjoner.»
4. **Seksjon: Inviter ny spiller.** Lukket som default — viser bare en muted «+ Inviter ny spiller»-lenke. Klikk → ekspanderer til E-post-input + «Send invitasjon»-knapp. Lukker seg etter suksess.

### `/admin/spillere/[id]` — detalj/redigering

1. BackLink til `/admin/spillere`, kicker «Sekretariatet».
2. Header: spillerens navn (stor serif), kallenavn under hvis satt.
3. Lite info-felt: e-post + opprettet-dato (sist-spilt-info droppes for å holde scope tett — kan tillegges senere som TODO).
4. Form: Navn (text), Kallenavn (text, valgfri), Handicap-indeks (number, 0–54). Lagre-knapp + banner-feedback.
5. **Faresone**-seksjon nederst (visuelt dempet, ikke aggressivt rød). «Slett spilleren»-lenke:
   - Aktiv: hvis spilleren har 0 `game_players`-rader og ikke er deg selv → går til bekreftelses-siden.
   - Disabled med forklaring: «Karl Erik har spilt 3 runder. Slett spillene først.» eller «Du kan ikke slette din egen konto.»

### `/admin/spillere/[id]/slett` — bekreftelses-side

1. BackLink til `/admin/spillere/[id]`.
2. Stor overskrift: «Slett Karl Erik Holm?»
3. Forklaring: «Kontoen og e-postadressen frigjøres. Karl Erik har aldri spilt en runde, så ingen historikk forsvinner.»
4. To knapper: rød primær «Bekreft sletting», nøytral «Avbryt» (tilbake til detalj-siden).
5. Etter slett → redirect til `/admin/spillere` med banner «Karl Erik Holm er slettet.»

### Admin-hjem (`/admin/page.tsx`)

Tile «Invitasjoner» fjernes. Ny tile «Spillere» tar plassen, ikon: silhuett/gruppe-symbol. Meta-tekst teller registrerte spillere + ventende invitasjoner («12 registrert · 4 venter»).

## Server-actions

### Fase 1

- `resendInvitation(invitationId)`: kaller `sendInviteNotification` med samme e-post som raden. Suksess → banner. Feil → banner med ærlig errno.
- `withdrawInvitation(invitationId)`: sletter `invitations`-raden. Hvis det finnes en `auth.users`-rad for samme e-post UTEN tilhørende `public.users`-rad (invitéen ba om kode men fullførte aldri profil): kaller `auth.admin.deleteUser` for å frigjøre e-posten. Service-role brukes her.

### Fase 2

- `updateUser({id, name, nickname, hcp_index})`: oppdaterer `public.users`-raden via cookie-klienten (RLS gater på `is_admin`). Banner-feedback. Ingen self-modify-edge-case (siden `is_admin` ikke er redigerbart).

### Fase 3

- `deleteUser(id)`: 
  - Gate: re-sjekk admin-status.
  - Gate: `user.id !== target.id` (self-protect).
  - Gate: `count(game_players where user_id = target.id) === 0`.
  - Kall: `getAdminClient().auth.admin.deleteUser(target.id)` → auth.users slettes → public.users cascades.
  - Redirect til `/admin/spillere?status=deleted&name=...` med banner.
  - Ved feil: ærlig errno via search-param.

## Versjonering

Hver fase = atomic commit med MINOR-bump + CHANGELOG-entry:
- **Fase 1:** `0.4.2 → 0.5.0` — «Spilleradministrasjon: én samlet flate for invitasjoner og spillere med søk, re-send og trekk tilbake»
- **Fase 2:** `0.5.0 → 0.6.0` — «Spilleradministrasjon: rediger navn, kallenavn og handicap fra admin»
- **Fase 3:** `0.6.0 → 0.7.0` — «Spilleradministrasjon: slett spillere som ikke har spilt»

## Testing og rollout

- Hver fase pushes til main rett etter at den bygger lokalt (`next build`). Vercel auto-deployer.
- Brukeren tester manuelt mot prod etter hver push (etablert mønster).
- Ingen ny vitest-dekning for admin-server-actions (vi har ingen i admin i dag og operasjonene er reversible).
- TypeScript + ESLint kjøres via `next build`-steget før push.

### Manuelle testscenarier per fase

**Fase 1:**
1. Skriv inn en bevisst-feilstavet e-post i «Inviter ny», send → bekreft mail kommer + raden vises under «Ventende».
2. Trykk «Trekk tilbake» på den raden → bekreft den forsvinner og at e-posten kan inviteres på nytt.
3. Send på riktig adresse → bekreft mail + ny rad.
4. Søk i registrerte spillere — bekreft navn/kallenavn/e-post-match fungerer.

**Fase 2:**
1. Trykk på rad i spillerlista → bekreft du kommer til detalj-side.
2. Endre kallenavn fra «Karl» til «Kalle», lagre, refresh → bekreft det stikker.
3. Endre handicap, lagre, refresh → bekreft.

**Fase 3:**
1. Gå til din egen detalj-side → bekreft «Slett spilleren» er disabled med riktig copy.
2. Gå til detalj-siden for en spiller med spillhistorikk → bekreft slett-lenken er disabled med riktig copy.
3. Opprett testbruker (eller inviter ny som aldri har spilt) → gå til detalj → trykk «Slett spilleren» → bekreft → bekreft du havner på `/admin/spillere` med banner og spilleren er borte fra lista.

## TODO-er som logges (utenfor scope)

- Endre e-post på registrert spiller (krever service-role-pattern for `auth.admin.updateUserById`)
- `display_pref`-toggle (`name` / `nickname`) — egen feature, koordinert UI
- Aktivitets-statistikk per bruker (sist innlogget, antall spill, sist hcp)
- «Vis som denne brukeren» (sannsynligvis ikke verdt det)
- **Arrangør-rolle** («turneringsadministrator» med opprett-spill/baner men ikke bruker-endring) — krever egen brainstorming og RLS-revisjon
- Slett spill helt fra admin-panel (forutsetning for å kunne slette en spiller som har spilt)
