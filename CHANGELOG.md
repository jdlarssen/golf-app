# Changelog

Alle bruker-synlige endringer i Tørny logges her. Versjonering følger [Semantic Versioning](https://semver.org/lang/no/).

Pre-1.0.0 (`0.x.y`) regnes som alpha — vi er fortsatt under uttesting med kompisgjengen. Disiplinen ble innført ved `0.2.0`; alt før det er samlet under «Pre-disiplin».

Hver entry begynner med én **bold setning på vanlig norsk** — hva endringen betyr for deg som bruker — etterfulgt av en sammenfoldbar **Teknisk**-seksjon med utvikler-prosa i [Keep a Changelog](https://keepachangelog.com/no/)-stil. Minor-serier (`0.X.y`) er gruppert under et tema-heading med kort sammendrag; eldre serier er sammenfoldet by default for å holde fila lett å scrolle.

Regler for når en bump utløses er beskrevet i [CLAUDE.md](CLAUDE.md) under «Versjonering / CHANGELOG».

---

## 0.10.x — Resultat-mail og closing-the-loop

Mail begge veier rundt godkjennings-flyten: admin får mail når en spiller leverer, spillere får mail når admin avslutter. Ingen polling av appen for å vite om det er noe nytt å gjøre. Pilot-polish underveis: ærligere feilmeldinger i admin når noe går galt med å lese spillerlisten, og første pass på personvern-siden.

### [0.10.6] - 2026-05-14

**Vennsinvitasjoner blokkeres nå korrekt hvis mottakeren allerede har startet en innlogging hos Tørny, ikke bare hvis de har fullført profilen.**

<details>
<summary>Teknisk</summary>

#### Fixed

- **Friend-invite-gate i `app/invite/actions.ts`** sjekket bare `public.users` via `email_is_registered`-RPC-en. Brukere som var igjen i `auth.users` etter den retired magic-link-flyten (uten å fullføre `/complete-profile`) slapp gjennom — invitasjons-mailen ble sendt, og det påfølgende `signInWithOtp`-kallet overskrev deres `user_metadata.inviter_name`. Lagt til ny `email_is_in_auth_users(text)`-RPC som sjekker `auth.users` direkte, og gate-en kjører nå begge RPC-ene parallelt i `Promise.all`. Hvis enten returnerer true, blokkeres invitasjonen med samme «Denne personen er allerede på Tørny»-melding.

#### Added

- **Migrasjon `0017_email_in_auth_users_rpc.sql`** — ny SECURITY DEFINER-funksjon `public.email_is_in_auth_users(email_to_check text)` som returnerer bool. Eksplisitt `search_path = public, auth, pg_catalog` for å unngå search-path-injection. GRANT EXECUTE til anon + authenticated for defensiv symmetri med `email_is_invited`. Applied til prod via Supabase MCP.

</details>

---

### [0.10.5] - 2026-05-14

**Kontakt-lenken på personvern-siden går nå til en faktisk e-postadresse (`personvern@tornygolf.no`) i stedet for en admin-bare side spilleren ikke kunne nå.**

<details>
<summary>Teknisk</summary>

#### Fixed

- **Kontakt-seksjonen på `app/legal/privacy/page.tsx`** pekte til `https://tornygolf.no/admin/spillere`, som er auth-gated til admin-brukere. En vanlig spiller som klikket for å utøve GDPR-rettighetene sine endte på en innloggingsvegg de ikke kom forbi. Erstattet med `mailto:personvern@tornygolf.no`. Domeneshop-aliaset må settes opp manuelt for at adressen skal motta mail.

</details>

---

### [0.10.4] - 2026-05-14

**Ny personvern-side på `/legal/privacy` forklarer hvilke data Tørny lagrer om deg, hvor de lagres, og hvilke rettigheter du har.**

<details>
<summary>Teknisk</summary>

#### Added

- **Ny rute `app/legal/privacy/page.tsx`** — server-rendret Server Component, ingen auth-gate (offentlig tilgjengelig). Bruker eksisterende `AppShell` + `PageHeader` + `BackLink`-primitives. Norske bokmål-tekst, Fraunces serif for h1/h2 og Inter sans for body. Dekker: (1) hvilke data Tørny lagrer (navn, e-post, kallenavn, handicap, scorekort, invitasjoner), (2) hvor de lagres (Supabase EU/Frankfurt), (3) hvem som ser dem (medspillere ser navn/kallenavn/handicap/resultater, admin ser e-post), (4) hvor lenge (inntil sletting), (5) GDPR-rettigheter (innsyn, retting, sletting, portabilitet), (6) kontakt-info.
- **`export const metadata`** setter `<title>`-tag for siden.

</details>

---

### [0.10.3] - 2026-05-14

**Hvis admin-handlinger feiler på å lese spillerlisten fra databasen, sier banneret nå «Klarte ikke å lese» i stedet for misvisende «Klarte ikke å lagre».**

<details>
<summary>Teknisk</summary>

#### Fixed

- **Splittet `db_players`-feilkoden i to.** Tidligere brukte alle databasefeil i admin/games-flyten samme `db_players`-key, så bruker så «Klarte ikke å lagre spillerne. Prøv igjen.» selv når det egentlige problemet var en SELECT-feil på roster. Innført ny `db_roster: 'Klarte ikke å lese spillerlisten fra databasen.'`-key som emit-es fra read-paths i tre server-actions: `app/admin/games/new/actions.ts` (publish-mode roster read), `app/admin/games/[id]/edit/actions.ts` (publish/update_scheduled roster read), og `app/admin/games/[id]/actions.ts` (start-game gamePlayers + roster reads). Write-paths (INSERT/UPDATE/DELETE på `game_players`) beholder `db_players`-meldingen.

#### Changed

- **Konsolidert duplisert `ERROR_MESSAGES` og `buildErrorMessage`-helper.** Tre admin/games-sider (`new/page.tsx`, `[id]/edit/page.tsx`, `[id]/page.tsx`) deklarerte hver sin egen kopi av samme error-message-objekt og helper. Trukket ut til `lib/admin/gameErrorMessages.ts` med to eksporterte map-er: `ERROR_MESSAGES_NEW_GAME` (brukt av new + edit, sier «kan publiseres») og `ERROR_MESSAGES_EXISTING_GAME` (brukt av detail-siden, sier «kan startes»). JSDoc dokumenterer denne kopi-variasjonen så fremtidig refaktor ikke uniformerer den ved et uhell.

</details>

---

### [0.10.2] - 2026-05-13

**SyncBanner viser nå norsk, lesbar forklaring («Mistet nett-tilkoblingen», «Innloggingen er utløpt») i stedet for tekniske Safari-feilmeldinger som «TypeError: Load failed».**

<details>
<summary>Teknisk</summary>

#### Changed

- **`SyncBanner` — friendly error-mapping.** Raw `lastError` fra Supabase RPC mappes nå til norsk forklaring spilleren kan forstå og handle på:
  - `Load failed` / `Failed to fetch` / `NetworkError` → «Mistet nett-tilkoblingen»
  - `JWT` / `expired` / `session` / `401` / `unauthorized` → «Innloggingen er utløpt — logg inn på nytt»
  - `permission` / `forbidden` / `row-level` / `403` → «Tillatelse manglet»
  - `rate limit` / `429` / `too many` → «For mange forespørsler — vent litt»
  - Catch-all: «Lagring mislyktes»
- **Banneret går fra to-linjet (heading + raw-error subtext) til én-linjet** («Mistet nett-tilkoblingen. N slag venter.»). Renere på smale skjermer, ingen jargon.
- **Raw error bevares som `title`-attribute** på banner-elementet — admin kan long-press/hover for å se den eksakte underliggende meldingen til feilsøking, men spilleren ser ikke jargon-en før de eksplisitt graver i den.

</details>

---

### [0.10.1] - 2026-05-13

**Du får nå en mail hver gang en spiller leverer scorekortet sitt — du slipper å åpne appen for å sjekke om det er noe å godkjenne.**

<details>
<summary>Teknisk</summary>

#### Added

- **`lib/mail/scorecardSubmittedNotification.ts`** — Resend-mail-helper med samme brand-stil som de andre mail-malene. Subject: `Scorekort levert: <playerName> — <gameName>`. CTA-button til `https://tornygolf.no/admin/games/<id>`.
- **`submitScorecard`-action** ([app/games/[id]/submit/actions.ts](app/games/[id]/submit/actions.ts)) fyrer mail til alle admin-brukere etter at submit-update lykkes. Henter submitter's navn + admin-emails i parallell (Promise.all) etter DB-update, filtrer ut submitter selv (slik at en player-admin ikke mailer seg selv), og sender via Promise.allSettled. Feil logges, blokkerer aldri.

#### Changed

- **Initial game-fetch i `submitScorecard`** inkluderer nå `name`-feltet (trengs som mail-subject).

</details>

---

### [0.10.0] - 2026-05-13

**Når du avslutter et spill får alle spillerne automatisk en mail med «Resultatet er klart» og lenke til leaderboard — du trenger ikke lenger sende beskjeden manuelt.**

<details>
<summary>Teknisk</summary>

#### Added

- **`lib/mail/gameFinishedNotification.ts`** — ny Resend-mail-helper med brand-stilet HTML + plaintext-fallback. Subject: `Resultatet er klart — <gameName>`. Body: «Hei <fornavn>!» + kort hook + grønn CTA-button til `https://tornygolf.no/games/<id>/leaderboard`. Bruker samme palette + struktur som `inviteNotification.ts`.
- **`endGame`-action** ([app/admin/games/[id]/actions.ts](app/admin/games/[id]/actions.ts)) sender nå mail til alle spillere etter status-flippen til `finished`. Henter spillerne sammen med de eksisterende `submitted_at` / `approved_at`-validerings-queriene (én query, ikke to), filtrer på `users.email` ikke-tom, og fyrer `Promise.allSettled` over alle send-kall. Feil logges til Vercel via `console.error` og blokkerer aldri actionen — leaderboard er nådd in-app uavhengig av om mailen kom fram.

#### Changed

- **Initial game-fetch i `endGame`** inkluderer nå `name`-feltet (trengs som subject + body i mailen). Marginal data-overhead, sparer en re-fetch.

</details>

---

## 0.9.x — Sync-feedback under runden

Hvis et slag ikke kommer fram til serveren, sier appen ifra. Ny sticky banner viser hvor mange slag som mangler synk, surface'r faktiske feilmeldinger fra Supabase, og lar deg manuelt prøve igjen — i stedet for at sync-køen stille henger i bakgrunnen. Pilot-polish underveis: scorekort wiper ikke lenger settet score hvis du tilfeldigvis trykker på det igjen.

### [0.9.4] - 2026-05-13

**Game-hjem-sidens to gate-queries kjører nå parallelt, og audit av leaderboard/submit/scorecard bekrefter at de allerede gjorde det.**

<details>
<summary>Teknisk</summary>

#### Changed

- **`app/games/[id]/page.tsx` — game + me i Promise.all.** Sekvensiell awaits (`game` deretter `me`) er nå én parallel-bølge. Sparer én Supabase round-trip per load. Side-en treffes på app-åpning, fra hjem-tile, fra hver «Hjem»-tap fra hull-pages, og fra leaderboard/submit-tilbakeknappen — ofte. Estimert ~200ms spart per load.
- **Pilot-instrumentering** lagt til samme sted (`game.page game=X · gate`), parallel med hole-page-instrumenteringen.

#### Audit

- **`app/games/[id]/leaderboard/page.tsx`** — allerede parallel (Promise.all på game + profile, deretter Promise.all på players + holes + scores i suspended body). Ingen endring trengs.
- **`app/games/[id]/submit/page.tsx`** — allerede parallel (Promise.all på game + me, deretter Promise.all på holes + scores i suspended body). Ingen endring trengs.
- **`app/games/[id]/scorecard/page.tsx`** — allerede parallel (Promise.all på game + me). Ingen endring trengs.

</details>

---

### [0.9.3] - 2026-05-13

**Hull-bytte er ~60% raskere — server-rundene som tidligere kjørte sekvensielt går nå parallelt, og to av dem er slått sammen til én.**

<details>
<summary>Teknisk</summary>

#### Changed

- **Hull-page server-fetch-grafen refaktorert fra 7 sekvensielle awaits til 2 parallel-bølger.** Måling på production via instrumentering fra v0.9.2 viste at hver hull-bytte kostet 1.2–2.1s server-side med median fetch ~150–200ms og outliers opp i 800ms+ (Supabase round-trip-overhead, ikke query-kompleksitet). Nye struktur ([app/games/[id]/holes/[holeNumber]/page.tsx](app/games/[id]/holes/[holeNumber]/page.tsx)):
  - **Runde 1 (Promise.all):** `games`, ALL `game_players` for spillet (med users-join), `scoreCount`. Tre uavhengige queries fyres samtidig — max-tid er den tregeste enkelt-queryen i stedet for summen.
  - **In-memory:** finn `me` blant alle game_players, derive flight ved å filtrere `flight_number === me.flight_number`. Dette fjerner én helt round-trip (tidligere kjørte vi en separat `me`-query, deretter en flight-query med WHERE flight_number=X).
  - **Runde 2 (Promise.all):** `course_holes` for gjeldende hull + `scores` for flight-medlemmer på gjeldende hull. Begge avhenger av runde 1 men er uavhengige av hverandre.
- **Estimert speedup:** fra ~1.5s gjennomsnitt til ~600ms (–60%). Trade-off: allGamePlayers-queryen returnerer 8 rader i stedet for 4 fra den gamle flight-queryen — marginal data-overhead, men én round-trip spart. RLS er upåvirket: brukere ser fortsatt kun det `game_players`-policy-en allerede tillater.
- **Instrumentering oppdatert:** logger nå `round1`, `round2` og total i stedet for syv enkelt-fetches. Verifiserer at parallellisering faktisk skjer i prod.

</details>

---

### [0.9.2] - 2026-05-13

**Skjermlesere identifiserer nå ventende invitéer korrekt i opprett-spill-flyten, og lange e-postadresser dytter ikke lenger «Venter»-pillen ut av synsfeltet.**

<details>
<summary>Teknisk</summary>

#### Fixed

- **A11y på `/admin/games/new` spiller-picker.** Checkboxen får nå `aria-label={`${playerLabel(p)}${p.pending ? ' — venter på å fullføre profil' : ''}`}` slik at skjermlesere annonserer status semantisk koblet til raden i stedet for å rapportere «Venter»-pillen som flytende tekst etter check-boxen. Pillen får `aria-hidden="true"` for å unngå dobbel-annonsering.
- **Truncation på `/admin/games/new` spiller-picker label-spannet.** La til `min-w-0 truncate` så patologisk lange e-postadresser (over container-bredde) klippes med ellipsis i stedet for å dytte «Venter»-pillen ut av viewportet på smale skjermer (iPhone SE 320px).

#### Changed

- **Server-side timing instrumentering på hull-siden** ([app/games/[id]/holes/[holeNumber]/page.tsx](app/games/[id]/holes/[holeNumber]/page.tsx)). `console.time/timeEnd` rundt hver av de syv server-side awaitsene (auth, game, me, hole, flight, scores, scoreCount) + en total-wrapper, med label-prefix `hole.page game=X hole=N · <step>`. Loggene fanges av Vercel og kan pulles etter pilot-runden for å bestemme om hull-bytte-latency dominans er på Supabase-runden, RSC-serialisering, eller cold-start. Ingen brukerflate-effekt — kun observasjon. Fjernes (eller gates bak dev-flag) når arkitektur-valget i TODO.md er gjort.

</details>

---

### [0.9.1] - 2026-05-13

**Et score du har justert med + eller − blir ikke lenger nullstilt til par hvis du tilfeldigvis trykker på kortet igjen — og onboarding-banneret beskriver knappene som faktisk finnes.**

<details>
<summary>Teknisk</summary>

#### Fixed

- **`ScoreCard.onCardClick` no-op'er når score allerede er satt.** Tidligere kalte tap-på-kort-body alltid `onSetScore(par)` uansett current score, så et tilfeldig touch-event etter at brukeren hadde brukt + / − wipet justeringen tilbake til par. Card-tap er nå en first-entry-snarvei kun: hvis `score == null` setter den par som baseline, ellers er kortet en no-op-flate. +/− og «…» er fortsatt full-spektrum-redigerings-overflater. Ny test (`ScoreCard.test.tsx`) verifiserer at tap når `score` er satt ikke kaller `onSetScore`.
- **Onboarding-banner-copy speiler virkeligheten.** Tidligere tekst: «Klikk det øverste kortet for å sette par. Klikk-og-dra opp eller ned for +1/−1.» — men klikk-og-dra finnes ikke i koden (kun + / − / ⋯-knapper). Ny tekst: «Trykk det øverste kortet for å sette par. Bruk + og − for å justere.»

</details>

---

### [0.9.0] - 2026-05-13

**Hvis et slag ikke kommer fram til serveren, sier appen ifra — og du kan trykke «Prøv igjen» i stedet for å lure på om scoren ble lagret.**

<details>
<summary>Teknisk</summary>

#### Added

- **`SyncBanner`-komponent ([components/sync/SyncBanner.tsx](components/sync/SyncBanner.tsx))** mounted i `app/games/[id]/layout.tsx`. Sticky-top på alle game-sider (hull, leaderboard, submit, approve, scorecard, venterom). Observerer `localDb.syncQueue` via `useLiveQuery` og rendrer kun når køen har items som enten har hatt minst ett feilet forsøk (`attemptCount > 0` eller `lastError != null`) ELLER har stått i køen > 30 sekunder. Inneholder «Prøv igjen»-knapp som kaller `drainQueue()` direkte — bruker eksisterende sync-listener-disiplin, krever ingen RLS- eller migrasjonsendringer.
- **Bruker-synlig feilmelding** når Supabase RPC `upsert_score_if_newer` feiler. Banneret ekstraherer `lastError`-feltet fra første queue-item med feil og viser det som sekundær-tekst under tagline-en (eks. «Failed to fetch» ved offline, «JWT expired» ved utløpt session). Hjelper Jørgen feilsøke under pilot uten å åpne devtools.
- **«X slag venter på lagring»**-banner med 30-sekunders threshold. Internal `setInterval(1000)`-tick reaktiv-evaluerer alder på eldste queue-item slik at banneret dukker opp uten å vente på neste sync-drain.

#### Changed

- **Retry-knapp**: minimum 500ms feedback-tid via `Promise.all([drainQueue(), sleep(500)])` så «Sender…»-state ikke flasher forbi når retry blir no-op'et av `inFlight`-guarden i syncWorker. Brukeren får visuell bekreftelse på at klikket ble registrert.

</details>

---

## 0.8.x — Sletting og «trekk tilbake»-flyt

Dedikert slett-side for spillere, fulgt av tre iterasjoner på «trekk tilbake»-bekreftelsen for å få den robust på iPhone-PWA. Pilot-polish på topp: tydeligere tekst utendørs i sol.

### [0.8.5] - 2026-05-13

**Hull-nummer og sekundær-tekst er nå tydeligere å lese på telefon utendørs — viktig før pilot-runden.**

<details>
<summary>Teknisk</summary>

#### Changed

- **Bumpet `--text-muted` (#5C5347 → #4A3F30)** i light mode. Token brukes av tournament-name i hull-headeren, sync-status-linja, score-kort-helpere og ~20 admin-kickers — alle får en touch mer kontrast mot linen-bg (#F8F6F0). Hierarkiet bevares (#4A3F30 er fortsatt klart sekundært mot #1A2E1F text), men perseptuell vekt øker nok til at uppercase-tight-labels og 10–12px sekundær-tekst leses bedre i direkte sollys. Dark mode-tokenet er urørt.
- **`HoleStrip` future-state nummer: font-weight 500 → 600.** Hull som ikke er spilt enda (typisk 17 av 18 ved runde-start) hadde tynne 13px serif-tall som forsvant i sol. Bumpen fra 500 → 600 sharpenser nummer-rendering uten å endre farge eller hierarki — current og completed er fortsatt visuelt distinkte.

</details>

---

### [0.8.4] - 2026-05-13

**Du kan nå trekke tilbake en invitasjon fra iPhone uten at knappene oppfører seg rart.**

<details>
<summary>Teknisk</summary>

#### Fixed

- **«Trekk tilbake»-flyten fungerer nå på iPhone-PWA.** Forrige fix (v0.8.3) erstattet `<details>`-popouten med en URL-toggle inline (Bekreft + Avbryt på samme rad), men brukeren rapporterte at Bekreft-knappen ikke var trykkbar på iPhone, og at Avbryt-knappen i stedet utløste tilbaketrekkingen — antagelig på grunn av en kollisjon mellom server-action form-submit og SmartLink-prefetch på samme touch-event. Bytter nå til samme mønster som slett-bruker (`/admin/spillere/[id]/slett`): «Trekk tilbake»-lenken navigerer til en dedikert bekreftelses-side på `/admin/spillere/invitations/[id]/trekk-tilbake/` med stor Bekreft-knapp og separat Avbryt-lenke. Ingen knapper deler tap-target, ingen flyktige toggle-tilstander.

</details>

---

### [0.8.3] - 2026-05-13

**Forsøk på å fikse «trekk tilbake»-bekreftelsen for iPhone — viste seg å ikke fungere helt, og ble erstattet av løsningen i 0.8.4.**

<details>
<summary>Teknisk</summary>

#### Fixed

- **«Trekk tilbake»-bekreftelsen fungerte ikke på iPhone-PWA.** Den brukte `<details>`/`<summary>` for inline-popout, men iOS Safari håndterer tap-events inni open-state-popouten upålitelig (tap kan boble til summary og lukke popouten før Bekreft-knappen registrerer klikket). I tillegg ble popouten klippet av kortets `overflow-hidden`, og kunne overlappe nabo-radens knapper slik at et klikk for «Bekreft» traff «Send på nytt» på raden under. Erstattet med en server-rendret URL-toggle: trykk på «Trekk tilbake» legger til `?confirm=<id>` i URL-en, og den raden rendres i confirm-modus inline med tydelige Bekreft + Avbryt-knapper. Ingen JS, ingen popout-quirks, fungerer likt på alle nettlesere og PWA-shells.

</details>

---

### [0.8.2] - 2026-05-13

**Ventende invitéer dukker ikke lenger opp dobbelt i admin-spillerlista, og «trekk tilbake» frigjør e-postadressen som forventet.**

<details>
<summary>Teknisk</summary>

#### Fixed

- **Spillerliste på `/admin/spillere` viser ikke lenger ventende invitéer dobbelt.** Etter at migrasjon `0014_pending_users` begynte å auto-opprette `public.users`-rader for hver `auth.users`, dukket ventende invitéer (de uten `profile_completed_at`) opp som «registrerte spillere» i tillegg til å være i ventende-invitasjoner-seksjonen. Spillerlista filtrerer nå på `profile_completed_at IS NOT NULL`, og «X registrert»-tellingen matcher.
- **«Trekk tilbake»-orphan-cleanup tilpasset trigger-baserte `public.users`-rader.** Sjekken var «hvis `public.users`-raden mangler, slett `auth.users`» — men siden trigger nå alltid oppretter raden, ble den sjekken alltid usann. Logikken bruker nå `profile_completed_at IS NULL` som signal på «invitéen fullførte aldri profil», så `auth.users` ryddes som forventet.
- **Null-safe visning av navn** på spiller-detalj og slett-bekreftelses-sider — invitéer uten utfylt navn vises med e-postadressen i stedet for en tom overskrift.

</details>

---

### [0.8.1] - 2026-05-13

**Hvis sletting av en spiller mislykkes, sier appen nå hvorfor — i stedet for å se ut som om ingenting skjedde.**

<details>
<summary>Teknisk</summary>

#### Fixed

- **Silent banner-feil ved feilet sletting.** Detalj-siden (`/admin/spillere/[id]`) viste ingen tilbakemelding når slett-flyten feilet eller ble blokkert av self-protect — den manglet meldinger for `self_delete_forbidden`, `still_has_games` og `auth_delete_failed` i sin `ERROR_MESSAGES`-tabell. Nå viser banneret en ærlig forklaring i alle tre tilfeller, inkludert hint om mulige FK-grunner («data knyttet til seg — invitasjoner sendt, baner opprettet eller scores skrevet»).
- **Ærligere kode-kommentar om FK-cascade-grensene** i `deleteUser`-action: dokumenterer at `public.users`-cascaden kun cleaner opp én rad, og at andre FK-er (`scores.entered_by`, `invitations.invited_by` osv.) er trygt dekket i dagens admin-modell men må sjekkes eksplisitt når arrangør-rollen lander.

</details>

---

### [0.8.0] - 2026-05-13

**Du kan slette en spiller fra admin — nyttig hvis du sendte invitasjon til feil e-postadresse.**

<details>
<summary>Teknisk</summary>

#### Added

- **Slett-flyt for spillere på `/admin/spillere/[id]/slett`.** Dedikert bekreftelses-side viser navn, e-post og forklaring. Slett-knappen kaller `auth.admin.deleteUser` via service-role-klienten — `auth.users`-raden slettes, `public.users` cascade-slettes automatisk, og e-posten frigjøres for ny invitasjon.
- **Block-betingelser** på server-side: kan ikke slette deg selv (self-protect), kan ikke slette en spiller som har en eller flere `game_players`-rader.

</details>

---

<details>
<summary><strong>0.7.x — Bruker-detalj-redigering (1 entry) — klikk for å vise</strong></summary>

Klikk på en spiller i admin for å redigere navn, kallenavn og handicap. Faresone-seksjon på detalj-siden forbereder slett-flyten som lander i 0.8.0.

### [0.7.0] - 2026-05-13

**Klikk på en spiller i admin for å redigere navn, kallenavn og handicap-indeks.**

#### Added

- **Bruker-detalj på `/admin/spillere/[id]`.** Klikkbar rad i spillerlista åpner form for å redigere navn, kallenavn og handicap-indeks. Lagre-knapp gir ærlig success/feil-banner.
- **Faresone-seksjon** på detalj-siden viser slett-lenken som disabled inntil neste leveranse aktiverer den. Forklarende tekst hvis spilleren har historikk eller hvis det er deg selv.

#### Changed

- **RLS:** Ny policy `users admin update` lar admin oppdatere andre bruker-rader (tidligere kun egen rad). Migrasjonen heter `0015_admin_user_management` (filnavn-kollisjon med `0014_pending_users` ble rensket opp ved merge).

</details>

---

<details>
<summary><strong>0.6.x — Samlet spilleradministrasjon (1 entry) — klikk for å vise</strong></summary>

Erstatter den gamle `/admin/invitations`-flata med `/admin/spillere`, som samler registrerte spillere, ventende invitasjoner og invitasjons-form på ett sted og legger til «Send på nytt» og «Trekk tilbake»-actions.

### [0.6.0] - 2026-05-13

**Ny «Spillere»-side i admin samler registrerte spillere, ventende invitasjoner og invitasjons-form på ett sted, og du kan re-sende eller trekke tilbake invitasjoner derfra.**

#### Added

- **Ny samlet spilleradministrasjon på `/admin/spillere`.** Erstatter gamle `/admin/invitations`. Tre seksjoner i én flate: registrerte spillere (med søk på navn/kallenavn/e-post), ventende invitasjoner, og en sammenfoldet «Inviter ny spiller»-form nederst.
- **«Send på nytt»-knapp på ventende invitasjoner.** Trigger ny notifikasjons-mail via Resend til samme adresse. Ingen ny DB-rad.
- **«Trekk tilbake»-knapp på ventende invitasjoner** med inline to-trinn-bekreft. Sletter `invitations`-raden; hvis invitéen hadde bedt om kode men aldri fullført profil (`profile_completed_at IS NULL`), ryddes også `auth.users`-raden via service-role slik at e-posten er ledig igjen.

#### Changed

- **Admin-hjemmeside-tile «Invitasjoner» erstattet av «Spillere»** med kombinert telling («12 registrert · 4 venter»).
- **Lenker fra «Opprett spill» og «Rediger spill»** når man trenger flere spillere peker nå til `/admin/spillere` i stedet for `/admin/invitations`.

#### Removed

- **Rute `/admin/invitations`** — funksjonaliteten finnes nå på `/admin/spillere`.

</details>

---

<details>
<summary><strong>0.5.x — Pending-invitees-integrasjon (11 entries) — klikk for å vise</strong></summary>

Ventende invitéer kan nå velges til lag og flight før de selv har logget inn. Ti patch-bumps fulgte for å rydde fallouten fra migrasjon 0014, som auto-oppretter `public.users`-rader for hver `auth.users` og som dermed brøt onboarding-gate, picker-filter, draft-validering og start-spill-guard.

### [0.5.10] - 2026-05-13

**«Akseptert»-statusen på en invitasjon stemmer nå med om spilleren faktisk har fullført profilen sin.**

#### Fixed
- `Akseptert`-pille på `/admin/invitations` reflekterer nå faktisk onboarding (`profile_completed_at IS NOT NULL`), ikke bare at invitasjons-raden ble markert akseptert ved OTP-verify. Stoppet misvisende «Akseptert»-status for brukere som klikket gammel magic-link-mail uten å fullføre profil.

### [0.5.9] - 2026-05-13

**Beskytter mot at en bruker blir hengende som «Venter» selv etter at de har lagret profilen sin.**

#### Fixed
- Profil-oppdateringen stamper nå `profile_completed_at` som defence-in-depth, så en bruker som havner på `/profile` uten å ha fullført onboarding (deploy-vindu-race i tidligere release) blir ikke sittende fast som «Venter» i picker-en.

### [0.5.8] - 2026-05-13

**Du kan ikke starte et planlagt spill hvis noen av deltakerne fortsatt mangler å fullføre profilen.**

#### Fixed
- «Start spillet» (draft → aktiv) blokkeres nå hvis ikke alle valgte spillere har fullført profil — samme guard som scheduled-pathen.
- Invitér-en-venn-actionen sjekker `profile_completed_at` i stedet for "rad finnes ikke" som ble dødt etter migrasjon 0014.

### [0.5.7] - 2026-05-13

**Ventende invitéer uten utfylt navn vises med e-postadressen i stedet for tom plass.**

#### Fixed
- Rendring av ventende invitéer (uten utfylt navn) faller tilbake til e-postadressen i stedet for å vise tom tekst — gjelder admins spill-detaljside (lag/flight-oversikt) og spillernes venterom-visning av draft-spill.

### [0.5.6] - 2026-05-13

**Nye brukere sendes igjen til onboarding-skjermen ved første innlogging.**

#### Fixed
- Nye brukere ble ikke sendt til onboarding på `/` og `/profile` etter at trigger-en fra migrasjon 0014 begynte å pre-opprette `public.users`-rader. Gate-en sjekker nå `profile_completed_at` i stedet for "rad finnes ikke".

### [0.5.5] - 2026-05-13

**Førstegangs-onboarding fungerer igjen for nye brukere — var midlertidig brutt etter en bakgrunnsendring.**

#### Fixed
- `complete-profile` oppdaterer nå den auto-opprettede `public.users`-raden i stedet for å forsøke å sette inn på nytt. Uten denne ville migrasjon 0014 brutt all ny brukerregistrering.

### [0.5.4] - 2026-05-13

**Feilmeldingen for ventende spillere på opprett-spill-siden viser nå e-postadressene i stedet for «{LIST}».**

#### Fixed
- Feilmelding for ventende spillere viste `{LIST}`-plassholderen bokstavelig på opprett-spill-siden. Bruker nå samme `buildErrorMessage`-helper som rediger-spill og spill-detalj.

### [0.5.3] - 2026-05-13

**Ekstra sikkerhets-sjekk: et publisert spill kan ikke startes med ventende spillere selv om databasen blir manuelt redigert.**

#### Fixed
- Start spill blokkeres også (defence-in-depth) hvis et publisert spill noensinne skulle få ventende spillere via direkte DB-redigering.

### [0.5.2] - 2026-05-13

**Du kan ikke endre et eksisterende spill til publisert hvis det fortsatt har ventende invitéer.**

#### Fixed
- Publisering/oppdatering fra rediger-spill blokkeres med tydelig e-postliste hvis ventende invitasjoner står på rosteret.

### [0.5.1] - 2026-05-13

**Du kan ikke publisere et nytt spill hvis noen av deltakerne ikke har fullført profilen sin.**

#### Fixed
- Publisering av nytt spill blokkeres nå hvis ikke alle valgte spillere har fullført profil.

### [0.5.0] - 2026-05-13

**Du kan nå velge ventende invitéer til lag og flight før de selv har logget inn.**

#### Added
- Inviterte spillere som ikke har logget inn ennå dukker opp i game-picker-en med en gul `Venter`-pille. Admin kan velge dem til lag og flight og lagre utkast.

</details>

---

<details>
<summary><strong>0.4.x — OTP-kode-innlogging (4 entries) — klikk for å vise</strong></summary>

Bytte fra magic-link til 6–8-sifret kode i mail, som fjernet to iOS-PWA-blokkerings-bugs samtidig. Inkluderer ærligere admin-invitasjons-banner ved Resend-feil og forberedelse for pending-invitees-sporing i 0.5.x.

### [0.4.3] - 2026-05-13

**Tørny vet nå hvilke spillere som har fullført profilen — forberedelse for å vise ventende invitéer riktig i spill-pickeren.**

#### Added

- Inviterte spillere som ikke har fullført registrering blir nå sporet via `profile_completed_at`. Forberedelse for å vise dem i game-picker-en.

### [0.4.2] - 2026-05-13

**Hvis «Du er invitert»-mailen ikke kommer fram, sier admin-banneret det ærlig i stedet for å lyve «Invitasjon sendt».**

#### Fixed

- **Admin-invitasjons-banneret lyver ikke lenger om mail-utsending.** Tidligere viste `/admin/invitations` alltid «✓ Invitasjon sendt»-banner etter at raden var lagret, selv om Resend-utsendingen faktisk feilet — feilen ble bare stille logget i Vercel-runtime-loggene. Hvis Resend kaster nå, vises et ærlig feil-banner: «Invitasjonen ble lagret, men «Du er invitert»-mail kom ikke ut. Sjekk Vercel-loggene for detaljer.» Raden i `invitations`-tabellen bevares fortsatt (admin kan re-sende manuelt når mail-konfigen er fikset).

### [0.4.1] - 2026-05-13

**Innloggings-kode-feltet godtar nå 8-sifrede koder, som er Supabase' faktiske standard.**

#### Fixed

- **Kode-input godtar nå 6–8 sifre, ikke bare 6.** Supabase' default OTP-lengde er 8 sifre (endret i mai 2024) — vi hardkodet 6 sifre i kode-feltet, så brukere som fikk en 8-sifret kode kunne kun skrive inn de første 6 og fikk feilmelding. Pattern og maxLength er nå fleksible, hjelpe-tekst sier «kode» i stedet for «6-sifret kode».

### [0.4.0] - 2026-05-13

**Du logger inn med en 6–8-sifret kode du taster inn, i stedet for å klikke en lenke i mailen. Inviterte spillere får først en notifikasjons-mail og må be om innloggings-kode selv etterpå.**

#### Changed

- **Innlogging går nå via 6-sifret kode i mail i stedet for å klikke lenke.** Du skriver inn e-post som før, men i stedet for å klikke en lenke i mailen mottar du en kode (f.eks. `482 619`) som du taster inn på samme side. Fjerner to pre-existing problemer som blokkerte PWA-innlogging på iPhone: (a) magic-link åpnet seg i Safari i stedet for PWA-en og brøt PKCE-handoff-en, (b) mail-scannere konsumerte engangs-token-en før brukeren faktisk klikket. Begge problemene forsvinner når det ikke finnes noen URL å konsumere — bare en kode som leses med øynene og tastes inn.
- **Invitasjons-mailen er ny.** Når admin inviterer en kompis sender Tørny nå en kort notifikasjons-mail («Du er invitert. Gå til tornygolf.no og logg inn med din e-post.») via Resend. Selve innloggings-koden får invitéen først når de kommer til /login og taster e-posten sin der. To mailer per invitasjon (notifikasjon + kode), men én og samme innloggings-flyt for alle.

#### Removed

- **Magic-link-URL-flyten.** `/auth/callback`-route-en redirecter alle gamle klikk til `/login?error=link_expired` i en 30-dagers overgangsperiode. Etter 2026-06-13 fjernes route-en helt (tracked in TODO.md).

</details>

---

<details>
<summary><strong>0.3.x — Logo og pre-OTP-fixes (4 entries) — klikk for å vise</strong></summary>

Tørny fikk sin egen visuelle identitet (wordmark med champagne-prikk på login og app-ikoner), pluss tre fixes som ryddet opp før OTP-omleggingen: invitasjoner som sto som «VENTER» etter aksept, tee-off-tider som lå 1–2 timer feil, og «lagre utkast» som låste seg på native HTML5-validering.

### [0.3.3] - 2026-05-13

**Invitasjoner flippes nå korrekt til «Akseptert» når mottakeren logger inn første gang — før dette sto alle som «Venter» uansett.**

#### Fixed

- **Invitasjoner sto som «VENTER» selv etter aksept.** Hele tabellen `public.invitations` hadde `accepted_at = NULL` på alle 8 rader — ingen kode skrev til kolonnen noensinne. Auth-callback (`app/auth/callback/route.ts`) markerer nå alle ventende invitasjoner for innlogget brukers e-post som akseptert etter vellykket `exchangeCodeForSession`. Best-effort: feil i side-effekten blokkerer aldri innloggingen. Ny RLS-policy (`migration 0012`) lar bruker UPDATEe sin egen invitasjon — kun `accepted_at`-flippen er tillatt, alle andre kolonner må forbli identiske. Backfill kjørt mot 4 stranded rader som hadde `auth.users.confirmed_at` satt.

### [0.3.2] - 2026-05-13

**Tee-off-tider viser nå riktig tid på alle skjermer — var av med 1–2 timer i et kort vindu rett etter sideinnlasting.**

#### Fixed

- **Tee-off-tider rendret 1–2 timer feil under hydration.** `lib/format/teeOff.ts` brukte lokal-TZ `Date.getHours/getMinutes/getDate/getMonth` — på Vercel-serveren (UTC) ga det feil tid i HTML-en før hydration på iPhone (Europe/Oslo) tok over. Rammet hjem-skjermen, runde-siden og leaderboarden. Bytter til `Intl.DateTimeFormat` med eksplisitt `timeZone: 'Europe/Oslo'`, så server og klient nå renderer identiske strenger uavhengig av host-TZ. DST håndteres riktig (UTC → Oslo sommer +02, vinter +01). 11 nye tester verifiserer oppførselen under flere host-TZ-er.

### [0.3.1] - 2026-05-13

**Du kan lagre et halvferdig spill-utkast uten at bane- og handicap-feltene må fylles ut først.**

#### Fixed

- **«Lagre utkast» låste seg på native HTML5-validering.** Knappen blokkerte sending så snart et `<select required>`-felt (bane/tee/handicap-allowance) var tomt, selv om hele poenget med utkast er å lagre delvis utfylt skjema. Lagt til `formNoValidate` på utkast-knappen — publiser-knappen validerer fortsatt normalt, og server-siden tar fortsatt vare på `name` som eneste obligatoriske felt for utkast.

### [0.3.0] - 2026-05-13

**Tørny har fått sin egen logo — wordmark med champagne-prikk på login-skjermen og som app-ikon.**

#### Changed

- **Visuell identitet — Tørny-logoen.** Login-skjermen viser nå hovedlogoen (wordmark «Tørny» + champagne-prikk + tagline *«Fyr opp golfturneringen på et par minutter»*) over innloggings-kortet, sentrert på linen-bakgrunnen. Den ekstra T-flisen og den dekorative medallion-en er fjernet — de duplikerte logoen og bråket mot brand-mark.svg-spec-en.
- **BrandMark-låsen i øverste venstre hjørne** (hjem, profil, admin) er strippet til kun wordmark «Tørny» med en liten champagne-prikk. Den mørke T-flisen og «TURNERING»-undertittelen er fjernet.
- **Tagline-formuleringen** *«Fyr opp golfturneringen på et par minutter»* (med wordplay-«par») er nå canonical i `CLAUDE.md`. Tidligere kortform uten «et par» er erstattet.

#### Added

- **App-ikoner (192×192, 512×512, 180×180)** og `brand-mark-icon-only.svg` har fått en champagne-prikk til høyre for T-en, slik at hjemskjerm-ikonet på iOS/Android og favicon-en bærer samme brand-aksent som logoen i appen.

#### Removed

- «Logg inn»-overskriften på `/login`. Hero-en + «Send meg lenke»-knappen + hjelpeteksten gir nok kontekst.

</details>

---

## [0.2.0] - 2026-05-12

**Innfører versjonerings-disiplin: hver bruker-synlig endring skal bumpe versjonen og legge til CHANGELOG-entry i samme commit.**

<details>
<summary>Teknisk</summary>

#### Added

- Versjonerings-disiplin: hver commit som endrer bruker-synlig oppførsel bumper `package.json` og legger til entry i denne fila. Reglene står i `CLAUDE.md`.

#### Notes

- Versjonen som vises i app-footeren (`AppVersionFooter.tsx`) er allerede koblet til `package.json` via `next.config.ts` — fra og med dette bumpet vil footeren reflektere reell release-versjon istedenfor en konstant `v0.1.0`.

</details>

---

## Pre-disiplin (`0.1.0`)

Versjonen `0.1.0` dekker all utvikling fra Phase 0 til og med Phase 12.5. Ingen detaljerte release-notes ble ført i denne perioden. Et grovt sammendrag:

- **Phase 0–4**: prosjektoppsett, datamodell, Supabase + RLS, scoring-bibliotek (`lib/scoring/`) med 40 unit-tester
- **Phase 5–8**: auth-flyt (magic link), invitasjons-system, admin-flate for baner og spill, hull-skjerm med score-input
- **Phase 9–10**: offline-sync via Dexie, realtime-oppdateringer, peer-godkjenning og admin-overstyring
- **Phase 11–12**: PWA-oppsett, premium-stil med forest-and-champagne palett, leaderboard og scorekort
- **Phase 12.5**: draft-mode på venterom med progressive disclosure, fargeharmonisering for status-bannere

Full historikk: `git log` mellom prosjektstart og commit `02cf8c0`.
