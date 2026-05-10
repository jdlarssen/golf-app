# Golf Best Ball Netto-app — Designdokument

**Dato:** 2026-05-10
**Forfatter:** Brainstorming-økt mellom bruker og Claude

## Bakgrunn og mål

Åtte kompiser skal spille en golfturnering sammen på Stiklestad Golfbane. De spiller i par (4 lag à 2 spillere), én runde på 18 hull på én dag. Konkurranseformen er **best ball netto**. Spillerne har ulike handicap, så ekstra slag per hull må regnes inn i scoringen.

De ønsker en enkel mobil-først web-app der hver spiller har egen innlogging, kan registrere slag løpende under runden, og der resultatet er skjult til alle er ferdige og samlet.

App-en skal være enkel å utvikle, enkel å hoste, og koste lite eller ingenting. Forventet brukermasse første år: 10–15 personer.

## Skopet for første versjon (v1)

**Med:**
- Brukerregistrering via mail-invitasjon fra admin
- Permanente brukerkontoer (gjenbrukbare på tvers av spill)
- Admin oppretter baner med tee-bokser (opptil 5 per bane, hver med eget navn, slope og course rating)
- Admin oppretter spill: velger bane, tee, deltakere, lag (manuell eller tilfeldig trekning), flights og handicap-allowance (0–100 %, default 100)
- Hull-for-hull slag-registrering, hvor én i flighten kan registrere for alle 4
- Offline-toleranse: slag tastet uten dekning lagres lokalt, synkes når nett er tilbake
- Spilleren leverer eget scorekort etter gjennomgang
- Valgfri peer-godkjenning per spill (en annen i flighten må attestere) — admin kan overstyre som fallback
- Admin avslutter spillet → leaderboard åpnes for alle samtidig
- Leaderboard og hull-for-hull-detalj med toggle mellom **netto** og **brutto**
- Mobil-først PWA, installerbar på hjemskjerm

**Ikke med (YAGNI):**
- Push-varsler (kun mail)
- Chat / kommentarer / bilder
- Statistikk over tid på tvers av runder
- Stableford, skins, matchplay
- Eksport (PDF/Excel)
- Multi-språk
- Native mobil-app
- Sponsorvisning / merkevarebygging

## Teknisk valg

**Stack:**
- **Frontend:** Next.js (App Router) + TypeScript + Tailwind, PWA-konfigurert
- **Hosting:** Vercel (hobby-tier, gratis)
- **Backend / database:** Supabase (Postgres + Auth + Row Level Security + Realtime), gratis tier
- **E-post:** Resend, gratis tier (3 000 mail/mnd)
- **Lokal datalagring:** IndexedDB i klienten, Service Worker for Background Sync
- **Domene:** `*.vercel.app` (gratis) til å begynne med

**Begrunnelse:**
Stack-en gir maksimal forenkling ved å samle auth, database og sikkerhetsregler i én tjeneste (Supabase), og gjør CI/CD trivielt via Vercel. Gratis-tier dekker bruksmønsteret med god margin. Strukturen tillater senere utvidelse til multi-tenant (flere grupper og admin-er) eller native app (React Native, gjenbruker Supabase-laget).

**Forventet driftskost:** 0 kr/mnd i overskuelig fremtid.

## Datamodell

```
users                          courses
├─ id (uuid, pk)               ├─ id (uuid, pk)
├─ email (unique)              ├─ name
├─ name                        ├─ created_by → users
├─ nickname (nullable)         └─ created_at
├─ hcp_index (decimal)
├─ is_admin (bool)             course_holes
└─ created_at                  ├─ course_id → courses
                               ├─ hole_number (1..18)
tee_boxes                      ├─ par (int)
├─ id (uuid, pk)               ├─ stroke_index (1..18)
├─ course_id → courses         └─ PK (course_id, hole_number)
├─ name (f.eks. "Gul", "57")
├─ slope (int)                 invitations
├─ course_rating (decimal)     ├─ id, email, token
└─ par_total (int)             ├─ game_id (nullable → games)
                               └─ expires_at
games
├─ id (uuid, pk)               game_players
├─ name                        ├─ game_id → games
├─ course_id → courses         ├─ user_id → users
├─ tee_box_id → tee_boxes      ├─ team_number (1..4)
├─ hcp_allowance_pct (0..100)  ├─ flight_number
├─ require_peer_approval (bool)├─ course_handicap (int, frozen)
├─ status (draft/active/       ├─ submitted_at (nullable)
│         finished)            ├─ approved_at (nullable)
├─ created_by → users          ├─ approved_by_user_id (nullable)
├─ started_at (nullable)       └─ PK (game_id, user_id)
└─ ended_at (nullable)
                               scores
                               ├─ id (uuid, pk)
                               ├─ game_id → games
                               ├─ user_id → users
                               ├─ hole_number (1..18)
                               ├─ strokes (int, nullable)
                               ├─ entered_by → users
                               ├─ client_updated_at (timestamp)
                               ├─ updated_at (server timestamp)
                               └─ UQ (game_id, user_id, hole_number)
```

**Designnotater:**
- `users.hcp_index` er Golfbox-tallet. WHS-caps (soft/hard) håndteres av Golfbox før tallet kommer inn — vår app bruker det som er.
- `game_players.course_handicap` fryses når admin starter spillet. Senere HCP-endringer i `users.hcp_index` påvirker ikke en pågående eller avsluttet runde.
- Kun rådata (brutto slag) lagres. Netto, lag-totaler og rangering beregnes alltid on-the-fly fra rådata.
- `client_updated_at` brukes til konfliktløsning (sist-vinner per hull).

**Row Level Security (RLS) i Postgres:**

| Status | Spiller (deltaker) ser | Admin (deltaker) ser | Admin (ikke deltaker) ser |
|---|---|---|---|
| `draft` | egen `game_players`-rad | egen rad + alt for sitt spill | alt for sitt spill |
| `active` | egen `scores` + samme flights' `scores` | samme som spiller (ingen totaler) | aggregert fremgang, *ingen* score-verdier |
| `finished` | alle `scores` for spillet | alle `scores` for spillet | alle `scores` for spillet |

Reglene håndheves på databasenivå — ingen frontend-bypass mulig.

**Skrivetillatelser:**

| Tilstand | Spiller kan endre eget | Spiller kan endre andre i flight | Admin kan endre alle |
|---|---|---|---|
| `active`, ikke levert | ✅ | ✅ | ✅ |
| `active`, har levert | ❌ | ❌ | ✅ |
| `active`, alle levert | ❌ | ❌ | ✅ |
| `finished` | ❌ | ❌ | ❌ (men admin kan åpne på nytt) |

## Scoring-logikk

### Course handicap (spillende handicap)

WHS-formel:

```
Course Handicap = round(HCP_index × (Slope / 113) + (Course_Rating − Par))
```

Deretter, hvis admin har satt `hcp_allowance_pct < 100`:

```
Justert = round(Course_Handicap × (allowance_pct / 100))
```

Den justerte verdien lagres i `game_players.course_handicap` ved start av spillet.

### Slag-allokering per hull

For en spiller med course handicap **H** og et hull med stroke index **SI** (1..18):

```
slag_på_hull = floor(H / 18) + (1 hvis SI ≤ (H mod 18) ellers 0)
```

Spesialtilfelle: H < 0 (plus-spiller) gir −1 slag på hullene med høyest SI.

### Netto og best ball

For hvert hull:

1. `netto_for_spiller = brutto − slag_på_hull`
2. Lagets score på hullet = **min** av lagets to spilleres netto-verdier («best ball»)
3. Hvis kun én spiller har et brutto-tall, brukes den. Hvis ingen har, markeres hullet som manglende.

Lagets totalsum = sum av lagets score over 18 hull. Lavest sum vinner.

### Tiebreaker

Bakerste 9 (hull 10–18) → bakerste 6 (13–18) → bakerste 3 (16–18) → hull 18 → delt seier.

### Brutto-modus

Samme logikk, men uten å trekke fra slag-allokering. Toggle i UI-en.

## Hovedflyt

```
1. Admin oppretter bane (Stiklestad) med tee-bokser
2. Admin inviterer 8 spillere via mail
3. Spillere klikker invitasjons-lenke, registrerer seg
   (navn, kallenavn valgfritt, HCP-index, passord)
4. Admin oppretter spill:
   - velger bane og tee
   - velger 8 deltakere
   - velger lag (manuelt eller tilfeldig trekning)
   - definerer flights (kan, men trenger ikke, matche lag)
   - velger hcp_allowance_pct (default 100)
   - velger require_peer_approval (default false)
5. Admin trykker "Start spill" → status active
   - course_handicap regnes ut og fryses per spiller
6. Spillerne registrerer slag på hver hull-skjerm
   - hvem som helst i samme flight kan taste for hvem som helst
   - optimistisk UI, IndexedDB-buffer, sync når online
   - leaderboard og totaler er skjult
7. Hver spiller går gjennom eget kort og trykker "Lever scorekort"
   - hvis peer-godkjenning på: kortet venter på attest fra annen flight-medlem
   - admin kan overstyre godkjenning
8. Admin ser review-panel når alle har levert
   - kan redigere ved behov (endringer logges)
9. Admin trykker "Avslutt og vis resultat" → status finished
   - leaderboard åpnes for alle
   - netto/brutto-toggle tilgjengelig
```

## Offline-arkitektur

```
React-state  ←→  IndexedDB  ←→  Supabase Postgres
   (UI)         (lokal,        (sannhetskilde,
                persistent)     RLS-beskyttet)
```

- UI leser alltid fra IndexedDB → ingen loading-tilstander.
- Endringer skrives først til IndexedDB, deretter til en lokal sync-kø.
- Service Worker drainer køen ved online-events og via Background Sync.
- Konfliktløsning: server sammenligner `client_updated_at` med `updated_at`. Nyere vinner.
- Realtime push (Supabase Realtime / WebSocket) holder flight-medlemmer synkronisert i sanntid når online.
- «Avslutt spill» krever online (kritisk operasjon).

## Skjermbilder (oversikt)

1. **Spiller-registrering** — fra invitasjonslink, samler navn/nickname/HCP/passord
2. **Spiller-hjem** — viser pågående og kommende spill
3. **Hull-skjerm** — hjertet av appen, viser flightens spillere og felter for slag, med ekstra-slag-indikator og sync-status per felt
4. **Mitt scorekort** — egen oversikt, ingen lagsummer under aktivt spill
5. **Lever scorekort** — gjennomgangsdialog før innsending
6. **Admin: opprett bane** — skjema for bane + 18 hull + 1..5 tee-bokser
7. **Admin: opprett spill** — bane, tee, deltakere, lag, flights, innstillinger
8. **Admin: spill-admin under aktivt spill** — fremgang og sync-status, *ingen* score-verdier
9. **Admin: review-panel** — fullstendige kort etter at alle har levert, med redigering
10. **Leaderboard** — etter avslutning, med netto/brutto-toggle
11. **Hull-for-hull-detalj** — drill-down per lag/spiller etter avslutning

## Hosting og deploy

**Kontoer:** GitHub, Vercel, Supabase, Resend — alle gratis.

**Deploy-flyt:**
```
git push → Vercel bygger og deployer automatisk → ny versjon live
```

**Førstegangs-oppsett (engangsjobb, ~1–2 timer):**
1. Opprette de fire kontoene
2. Opprette Supabase-prosjekt og kjøre database-migrations (SQL)
3. Sette opp Resend-sender
4. Klone GitHub-repo, sette miljøvariabler i Vercel
5. Opprette første admin-bruker, sette `is_admin = true`
6. Logge inn, opprette Stiklestad som bane

**Backup:** Supabase tar daglig automatisk backup, 7 dagers rullerende historikk på gratis-tier.

**Sikkerhet:** HTTPS via Vercel (automatisk), passord-hashing via Supabase Auth (bcrypt), RLS i Postgres.

## Begrensninger og kjente avveininger

- **iOS Safari Background Sync:** Begrenset støtte. Vi har «sync ved app-åpning» som backup. Praktisk konsekvens: minimal.
- **Konflikt på samme hull av to offline-brukere:** Last-write-wins per `client_updated_at`. Sjelden i praksis. Den som taper får en pen notis om endringen.
- **Cross-device sync av samme bruker:** Antatt at hver spiller bruker én telefon per runde. Hvis de logger inn på en ny enhet, lastes data fra serveren ved første åpning.
- **Admin må være online for «Avslutt spill»:** Bevisst valg for å unngå offline-konflikter på en kritisk operasjon.

## Veivalg for fremtidig utvidelse

Datamodellen er forberedt for:
- Flere admin-er per gruppe (legg til `groups` + `group_members`-tabeller)
- Flere grupper på samme installasjon
- Native mobil-app (React Native + samme Supabase-lag)
- Stats over tid (allerede rådata i databasen, kun nye visninger trengs)
- Andre spillformater (stableford, skins) som lag-på-top av samme score-data
