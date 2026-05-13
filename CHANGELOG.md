# Changelog

Alle bruker-synlige endringer i Tørny logges her. Format følger [Keep a Changelog](https://keepachangelog.com/no/), versjonering følger [Semantic Versioning](https://semver.org/lang/no/).

Pre-1.0.0 (`0.x.y`) regnes som alpha — vi er fortsatt under uttesting med kompisgjengen. Disiplinen ble innført ved `0.2.0`; alt før det er samlet under «Pre-disiplin».

Regler for når en bump utløses er beskrevet i [CLAUDE.md](CLAUDE.md) under «Versjonering / CHANGELOG».

---

## [0.8.3] - 2026-05-13

### Fixed

- **«Trekk tilbake»-bekreftelsen fungerte ikke på iPhone-PWA.** Den brukte `<details>`/`<summary>` for inline-popout, men iOS Safari håndterer tap-events inni open-state-popouten upålitelig (tap kan boble til summary og lukke popouten før Bekreft-knappen registrerer klikket). I tillegg ble popouten klippet av kortets `overflow-hidden`, og kunne overlappe nabo-radens knapper slik at et klikk for «Bekreft» traff «Send på nytt» på raden under. Erstattet med en server-rendret URL-toggle: trykk på «Trekk tilbake» legger til `?confirm=<id>` i URL-en, og den raden rendres i confirm-modus inline med tydelige Bekreft + Avbryt-knapper. Ingen JS, ingen popout-quirks, fungerer likt på alle nettlesere og PWA-shells.

---

## [0.8.2] - 2026-05-13

### Fixed

- **Spillerliste på `/admin/spillere` viser ikke lenger ventende invitéer dobbelt.** Etter at migrasjon `0014_pending_users` begynte å auto-opprette `public.users`-rader for hver `auth.users`, dukket ventende invitéer (de uten `profile_completed_at`) opp som «registrerte spillere» i tillegg til å være i ventende-invitasjoner-seksjonen. Spillerlista filtrerer nå på `profile_completed_at IS NOT NULL`, og «X registrert»-tellingen matcher.
- **«Trekk tilbake»-orphan-cleanup tilpasset trigger-baserte `public.users`-rader.** Sjekken var «hvis `public.users`-raden mangler, slett `auth.users`» — men siden trigger nå alltid oppretter raden, ble den sjekken alltid usann. Logikken bruker nå `profile_completed_at IS NULL` som signal på «invitéen fullførte aldri profil», så `auth.users` ryddes som forventet.
- **Null-safe visning av navn** på spiller-detalj og slett-bekreftelses-sider — invitéer uten utfylt navn vises med e-postadressen i stedet for en tom overskrift.

---

## [0.8.1] - 2026-05-13

### Fixed

- **Silent banner-feil ved feilet sletting.** Detalj-siden (`/admin/spillere/[id]`) viste ingen tilbakemelding når slett-flyten feilet eller ble blokkert av self-protect — den manglet meldinger for `self_delete_forbidden`, `still_has_games` og `auth_delete_failed` i sin `ERROR_MESSAGES`-tabell. Nå viser banneret en ærlig forklaring i alle tre tilfeller, inkludert hint om mulige FK-grunner («data knyttet til seg — invitasjoner sendt, baner opprettet eller scores skrevet»).
- **Ærligere kode-kommentar om FK-cascade-grensene** i `deleteUser`-action: dokumenterer at `public.users`-cascaden kun cleaner opp én rad, og at andre FK-er (`scores.entered_by`, `invitations.invited_by` osv.) er trygt dekket i dagens admin-modell men må sjekkes eksplisitt når arrangør-rollen lander.

---

## [0.8.0] - 2026-05-13

### Added

- **Slett-flyt for spillere på `/admin/spillere/[id]/slett`.** Dedikert bekreftelses-side viser navn, e-post og forklaring. Slett-knappen kaller `auth.admin.deleteUser` via service-role-klienten — `auth.users`-raden slettes, `public.users` cascade-slettes automatisk, og e-posten frigjøres for ny invitasjon.
- **Block-betingelser** på server-side: kan ikke slette deg selv (self-protect), kan ikke slette en spiller som har en eller flere `game_players`-rader.

---

## [0.7.0] - 2026-05-13

### Added

- **Bruker-detalj på `/admin/spillere/[id]`.** Klikkbar rad i spillerlista åpner form for å redigere navn, kallenavn og handicap-indeks. Lagre-knapp gir ærlig success/feil-banner.
- **Faresone-seksjon** på detalj-siden viser slett-lenken som disabled inntil neste leveranse aktiverer den. Forklarende tekst hvis spilleren har historikk eller hvis det er deg selv.

### Changed

- **RLS:** Ny policy `users admin update` lar admin oppdatere andre bruker-rader (tidligere kun egen rad). Migrasjonen heter `0015_admin_user_management` (filnavn-kollisjon med `0014_pending_users` ble rensket opp ved merge).

---

## [0.6.0] - 2026-05-13

### Added

- **Ny samlet spilleradministrasjon på `/admin/spillere`.** Erstatter gamle `/admin/invitations`. Tre seksjoner i én flate: registrerte spillere (med søk på navn/kallenavn/e-post), ventende invitasjoner, og en sammenfoldet «Inviter ny spiller»-form nederst.
- **«Send på nytt»-knapp på ventende invitasjoner.** Trigger ny notifikasjons-mail via Resend til samme adresse. Ingen ny DB-rad.
- **«Trekk tilbake»-knapp på ventende invitasjoner** med inline to-trinn-bekreft. Sletter `invitations`-raden; hvis invitéen hadde bedt om kode men aldri fullført profil (`profile_completed_at IS NULL`), ryddes også `auth.users`-raden via service-role slik at e-posten er ledig igjen.

### Changed

- **Admin-hjemmeside-tile «Invitasjoner» erstattet av «Spillere»** med kombinert telling («12 registrert · 4 venter»).
- **Lenker fra «Opprett spill» og «Rediger spill»** når man trenger flere spillere peker nå til `/admin/spillere` i stedet for `/admin/invitations`.

### Removed

- **Rute `/admin/invitations`** — funksjonaliteten finnes nå på `/admin/spillere`.

---

## [0.5.10] - 2026-05-13

### Fixed
- `Akseptert`-pille på `/admin/invitations` reflekterer nå faktisk onboarding (`profile_completed_at IS NOT NULL`), ikke bare at invitasjons-raden ble markert akseptert ved OTP-verify. Stoppet misvisende «Akseptert»-status for brukere som klikket gammel magic-link-mail uten å fullføre profil.

---

## [0.5.9] - 2026-05-13

### Fixed
- Profil-oppdateringen stamper nå `profile_completed_at` som defence-in-depth, så en bruker som havner på `/profile` uten å ha fullført onboarding (deploy-vindu-race i tidligere release) blir ikke sittende fast som «Venter» i picker-en.

---

## [0.5.8] - 2026-05-13

### Fixed
- «Start spillet» (draft → aktiv) blokkeres nå hvis ikke alle valgte spillere har fullført profil — samme guard som scheduled-pathen.
- Invitér-en-venn-actionen sjekker `profile_completed_at` i stedet for "rad finnes ikke" som ble dødt etter migrasjon 0014.

---

## [0.5.7] - 2026-05-13

### Fixed
- Rendring av ventende invitéer (uten utfylt navn) faller tilbake til e-postadressen i stedet for å vise tom tekst — gjelder admins spill-detaljside (lag/flight-oversikt) og spillernes venterom-visning av draft-spill.

---

## [0.5.6] - 2026-05-13

### Fixed
- Nye brukere ble ikke sendt til onboarding på `/` og `/profile` etter at trigger-en fra migrasjon 0014 begynte å pre-opprette `public.users`-rader. Gate-en sjekker nå `profile_completed_at` i stedet for "rad finnes ikke".

---

## [0.5.5] - 2026-05-13

### Fixed
- `complete-profile` oppdaterer nå den auto-opprettede `public.users`-raden i stedet for å forsøke å sette inn på nytt. Uten denne ville migrasjon 0014 brutt all ny brukerregistrering.

---

## [0.5.4] - 2026-05-13

### Fixed
- Feilmelding for ventende spillere viste `{LIST}`-plassholderen bokstavelig på opprett-spill-siden. Bruker nå samme `buildErrorMessage`-helper som rediger-spill og spill-detalj.

---

## [0.5.3] - 2026-05-13

### Fixed
- Start spill blokkeres også (defence-in-depth) hvis et publisert spill noensinne skulle få ventende spillere via direkte DB-redigering.

---

## [0.5.2] - 2026-05-13

### Fixed
- Publisering/oppdatering fra rediger-spill blokkeres med tydelig e-postliste hvis ventende invitasjoner står på rosteret.

---

## [0.5.1] - 2026-05-13

### Fixed
- Publisering av nytt spill blokkeres nå hvis ikke alle valgte spillere har fullført profil.

---

## [0.5.0] - 2026-05-13

### Added
- Inviterte spillere som ikke har logget inn ennå dukker opp i game-picker-en med en gul `Venter`-pille. Admin kan velge dem til lag og flight og lagre utkast.

---

## [0.4.3] - 2026-05-13

### Added

- Inviterte spillere som ikke har fullført registrering blir nå sporet via `profile_completed_at`. Forberedelse for å vise dem i game-picker-en.

---

## [0.4.2] - 2026-05-13

### Fixed

- **Admin-invitasjons-banneret lyver ikke lenger om mail-utsending.** Tidligere viste `/admin/invitations` alltid «✓ Invitasjon sendt»-banner etter at raden var lagret, selv om Resend-utsendingen faktisk feilet — feilen ble bare stille logget i Vercel-runtime-loggene. Hvis Resend kaster nå, vises et ærlig feil-banner: «Invitasjonen ble lagret, men «Du er invitert»-mail kom ikke ut. Sjekk Vercel-loggene for detaljer.» Raden i `invitations`-tabellen bevares fortsatt (admin kan re-sende manuelt når mail-konfigen er fikset).

---

## [0.4.1] - 2026-05-13

### Fixed

- **Kode-input godtar nå 6–8 sifre, ikke bare 6.** Supabase' default OTP-lengde er 8 sifre (endret i mai 2024) — vi hardkodet 6 sifre i kode-feltet, så brukere som fikk en 8-sifret kode kunne kun skrive inn de første 6 og fikk feilmelding. Pattern og maxLength er nå fleksible, hjelpe-tekst sier «kode» i stedet for «6-sifret kode».

---

## [0.4.0] - 2026-05-13

### Changed

- **Innlogging går nå via 6-sifret kode i mail i stedet for å klikke lenke.** Du skriver inn e-post som før, men i stedet for å klikke en lenke i mailen mottar du en kode (f.eks. `482 619`) som du taster inn på samme side. Fjerner to pre-existing problemer som blokkerte PWA-innlogging på iPhone: (a) magic-link åpnet seg i Safari i stedet for PWA-en og brøt PKCE-handoff-en, (b) mail-scannere konsumerte engangs-token-en før brukeren faktisk klikket. Begge problemene forsvinner når det ikke finnes noen URL å konsumere — bare en kode som leses med øynene og tastes inn.
- **Invitasjons-mailen er ny.** Når admin inviterer en kompis sender Tørny nå en kort notifikasjons-mail («Du er invitert. Gå til tornygolf.no og logg inn med din e-post.») via Resend. Selve innloggings-koden får invitéen først når de kommer til /login og taster e-posten sin der. To mailer per invitasjon (notifikasjon + kode), men én og samme innloggings-flyt for alle.

### Removed

- **Magic-link-URL-flyten.** `/auth/callback`-route-en redirecter alle gamle klikk til `/login?error=link_expired` i en 30-dagers overgangsperiode. Etter 2026-06-13 fjernes route-en helt (tracked in TODO.md).

---

## [0.3.3] - 2026-05-13

### Fixed

- **Invitasjoner sto som «VENTER» selv etter aksept.** Hele tabellen `public.invitations` hadde `accepted_at = NULL` på alle 8 rader — ingen kode skrev til kolonnen noensinne. Auth-callback (`app/auth/callback/route.ts`) markerer nå alle ventende invitasjoner for innlogget brukers e-post som akseptert etter vellykket `exchangeCodeForSession`. Best-effort: feil i side-effekten blokkerer aldri innloggingen. Ny RLS-policy (`migration 0012`) lar bruker UPDATEe sin egen invitasjon — kun `accepted_at`-flippen er tillatt, alle andre kolonner må forbli identiske. Backfill kjørt mot 4 stranded rader som hadde `auth.users.confirmed_at` satt.

---

## [0.3.2] - 2026-05-13

### Fixed

- **Tee-off-tider rendret 1–2 timer feil under hydration.** `lib/format/teeOff.ts` brukte lokal-TZ `Date.getHours/getMinutes/getDate/getMonth` — på Vercel-serveren (UTC) ga det feil tid i HTML-en før hydration på iPhone (Europe/Oslo) tok over. Rammet hjem-skjermen, runde-siden og leaderboarden. Bytter til `Intl.DateTimeFormat` med eksplisitt `timeZone: 'Europe/Oslo'`, så server og klient nå renderer identiske strenger uavhengig av host-TZ. DST håndteres riktig (UTC → Oslo sommer +02, vinter +01). 11 nye tester verifiserer oppførselen under flere host-TZ-er.

---

## [0.3.1] - 2026-05-13

### Fixed

- **«Lagre utkast» låste seg på native HTML5-validering.** Knappen blokkerte sending så snart et `<select required>`-felt (bane/tee/handicap-allowance) var tomt, selv om hele poenget med utkast er å lagre delvis utfylt skjema. Lagt til `formNoValidate` på utkast-knappen — publiser-knappen validerer fortsatt normalt, og server-siden tar fortsatt vare på `name` som eneste obligatoriske felt for utkast.

---

## [0.3.0] - 2026-05-13

### Changed

- **Visuell identitet — Tørny-logoen.** Login-skjermen viser nå hovedlogoen (wordmark «Tørny» + champagne-prikk + tagline *«Fyr opp golfturneringen på et par minutter»*) over innloggings-kortet, sentrert på linen-bakgrunnen. Den ekstra T-flisen og den dekorative medallion-en er fjernet — de duplikerte logoen og bråket mot brand-mark.svg-spec-en.
- **BrandMark-låsen i øverste venstre hjørne** (hjem, profil, admin) er strippet til kun wordmark «Tørny» med en liten champagne-prikk. Den mørke T-flisen og «TURNERING»-undertittelen er fjernet.
- **Tagline-formuleringen** *«Fyr opp golfturneringen på et par minutter»* (med wordplay-«par») er nå canonical i `CLAUDE.md`. Tidligere kortform uten «et par» er erstattet.

### Added

- **App-ikoner (192×192, 512×512, 180×180)** og `brand-mark-icon-only.svg` har fått en champagne-prikk til høyre for T-en, slik at hjemskjerm-ikonet på iOS/Android og favicon-en bærer samme brand-aksent som logoen i appen.

### Removed

- «Logg inn»-overskriften på `/login`. Hero-en + «Send meg lenke»-knappen + hjelpeteksten gir nok kontekst.

---

## [0.2.0] - 2026-05-12

### Added

- Versjonerings-disiplin: hver commit som endrer bruker-synlig oppførsel bumper `package.json` og legger til entry i denne fila. Reglene står i `CLAUDE.md`.

### Notes

- Versjonen som vises i app-footeren (`AppVersionFooter.tsx`) er allerede koblet til `package.json` via `next.config.ts` — fra og med dette bumpet vil footeren reflektere reell release-versjon istedenfor en konstant `v0.1.0`.

---

## Pre-disiplin (`0.1.0`)

Versjonen `0.1.0` dekker all utvikling fra Phase 0 til og med Phase 12.5. Ingen detaljerte release-notes ble ført i denne perioden. Et grovt sammendrag:

- **Phase 0–4**: prosjektoppsett, datamodell, Supabase + RLS, scoring-bibliotek (`lib/scoring/`) med 40 unit-tester
- **Phase 5–8**: auth-flyt (magic link), invitasjons-system, admin-flate for baner og spill, hull-skjerm med score-input
- **Phase 9–10**: offline-sync via Dexie, realtime-oppdateringer, peer-godkjenning og admin-overstyring
- **Phase 11–12**: PWA-oppsett, premium-stil med forest-and-champagne palett, leaderboard og scorekort
- **Phase 12.5**: draft-mode på venterom med progressive disclosure, fargeharmonisering for status-bannere

Full historikk: `git log` mellom prosjektstart og commit `02cf8c0`.
