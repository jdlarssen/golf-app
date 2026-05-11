# Design — Empty states + scheduled-tilstand

**Status:** Godkjent design (2026-05-11), klar for implementeringsplan
**Pakke:** Quick Win #3 fra Claude Design (`docs/design/incoming/handoff/quick-win-3/`)
**Forfattere:** Jørgen + Claude

## Oversikt

Tørny får tre nye pikselpresise empty states fra Quick Win #3, og samtidig en utvidet spill-livssyklus som lar admin publisere et spill, redigere det fritt fram til runden faktisk starter, og manuelt eller automatisk flippe det til pågående ved tee-off.

Empty states alene ville vært overflatebehandling. Det vi egentlig bygger er en ekte mellomtilstand i livssyklusen — `scheduled` — som rommer hele perioden mellom «admin er ferdig med oppsettet» og «slag tastes inn». State #2 i designpakken kan ikke eksistere uten denne tilstanden.

Vi utvider også leaderboarden med partial-reveal: front 9 låses opp så snart første lag har snudd ved hull 9, men back 9 forblir skjult til runden er ferdig og alle scorekort er levert. Det legger til en ny mellomtilstand på leaderboarden vi kaller «state #3.5».

## Hva som er inkludert

**Tre nye skjermer fra designpakken:**

1. **State #1 — Turneringer-tom.** Hjem-skjermen når spilleren ikke har aktive eller avsluttede spill. Champagne-medaljong med pin-flagg, «Velkommen, {fornavn}.», to CTA-er, pull-quote.
2. **State #2 — Scorekort venter.** Spill-siden i tidsrommet mellom publisering og start. Mail-konvolutt-ikon, banekort med tee-off og flight, pulserende countdown-banner.
3. **State #3 — Leaderboard pre-spill.** Leaderboarden før første lag har fullført front 9. Timeglass-ikon, forventet første-score-tid, startliste, pull-quote.

**En fjerde, avledet skjerm:**

4. **State #3.5 — Front 9 åpen.** Leaderboarden viser front 9-standings med delvise lag merket «n/9», pluss en låst blokk for back 9 («🤫 Vi sees ved hull 18.»).

**Ny spill-livssyklus:**

`draft → scheduled → active → finished` (i dag: `draft → active → finished`)

**Ny admin-capability:** redigering av spill etter publisering, så lenge runden ikke er startet.

**Auto-start fallback:** når en bruker laster en `scheduled`-side og tee-off-tiden er passert, flippes statusen til `active` automatisk.

## Hva som ikke er inkludert (out of scope)

| Utelatelse | Hvorfor | Når kan det legges til |
|---|---|---|
| Spillerstyrte lag-navn | Egen feature med eget UI, krever ny tabell, RLS, validering | Når brukere etterspør det |
| Per-flight (staggered) tee-off | Relevant ved klubb-skala (~150 deltakere) | Når Tørny skalerer utover kompis-tier |
| Per-hull lengde i meter | Pynt, ikke kritisk informasjon | Når admins savner det |
| Pg_cron-basert auto-start | Server-side guard er tilstrekkelig for v1 | Hvis on-read fallback viser seg sårbart |
| Push-notifikasjon ved tee-off | Krever Web Push API-integrasjon | Når sync-arbeidet er stabilt |
| Marketing-style hero-illustrasjoner | Designpakken bruker bevisst rolige motiver | Aldri — bryter med designspråket |

## Spiller-flyt

### Før spillet er publisert
Spilleren ser ingenting. Spillet er fortsatt utkast, kun admin vet at det finnes. Hjem-skjermen viser state #1 hvis det ikke er andre spill.

### Når admin publiserer
Spillet dukker opp i «Aktive spill»-listen på hjem-skjermen med en «Planlagt»-pille i champagne-farge.

Tap på kortet → lander på state #2 (Scorekort venter):
- Turnerings-navn i header
- Banenavn, par-total, banelengde (hvis satt), tee-off-tidspunkt og dato
- Hele flighten med navn og HCP; innlogget bruker har forest-avatar og champagne «DEG»-chip
- Countdown-banner som oppdateres hvert minutt
- Bunntekst: «Vær på 1. tee 10 minutter før start.»

Ingen score-inntasting mulig.

### Når tee-off-tiden passerer
Hvis admin ikke har trykket start: countdown viser «Starter snart». Første bruker som åpner appen utløser server-side guard som flipper status til `active`. Realtime pusher endringen til alle andre tilkoblede klienter.

### Når admin trykker «Start runden nå»
Status flippes umiddelbart til `active`. Alle åpne state #2-skjermer flippes til den vanlige spill-flaten via realtime — ingen refresh nødvendig.

### Under runden
Eksisterende flyt — hull-for-hull, scorekort, levering.

### Leaderboard under runden
- Før første lag har fullført front 9: state #3 (timeglass)
- Etter første lag har fullført front 9: state #3.5 (front 9-tabell + låst back 9-blokk)
- Etter spillet er avsluttet: full 18-hulls leaderboard med konfetti

## Admin-flyt

### Opprette spill
Eksisterende skjema, med ett nytt felt: tee-off (dato + tid). Knappene endres:
- **«Lagre og publiser»** — spillet får status `scheduled`, blir synlig for alle spillerne. Tee-off er påkrevd.
- **«Lagre som utkast»** — uendret. Tee-off er valgfritt.

### Redigere et publisert spill
Mens status = `Planlagt`:
- «Rediger»-knapp på admin-spill-siden åpner eksisterende skjema med dagens verdier
- Admin kan endre alt: bane, tee-box, tee-off, spillere, lag, flighter, allowance, peer-godkjenning
- Endringer pushes til spillernes telefoner via realtime — state #2 oppdateres uten refresh

Når status = `Pågående` eller `Avsluttet`: «Rediger»-knappen er borte. Spillet er låst.

### Starte runden manuelt
Mens status = `Planlagt`: «Start runden nå»-knapp med bekreftelses-prompt («Starter du runden nå? Spillere kan begynne å taste slag. Redigering låses.»). Når admin bekrefter: status → `Pågående`, spillere flippes til hull-skjermen.

### Sjekkliste-aktig oppførsel
Admin kan publisere uten å være ferdig. Typisk flyt:
1. Mandag: opprett og publiser
2. Onsdag: kompis ringer og kan ikke spille — rediger spillerlisten
3. Fredag: bekreft endringer
4. Lørdag: «Start runden nå»

Hele uken er spillet synlig for alle deltakere med oppdatert status.

## Datamodell-endringer

**Ny migrasjon:** `supabase/migrations/0008_scheduled_status_and_tee_off.sql`

```sql
alter type game_status add value 'scheduled' before 'active';

alter table public.games
  add column scheduled_tee_off_at timestamptz;

alter table public.tee_boxes
  add column length_meters int check (length_meters between 1000 and 12000);
```

**RLS:** Player-visible policies for `games`, `game_players`, `course_holes`, `tee_boxes` utvides til å inkludere `'scheduled'`. Helper-funksjoner som `is_in_active_game` får oppdatert intent.

**Scores-policy beholdes:** Score-inntasting krever fortsatt `status = 'active'`.

**TypeScript:** `GameStatus`-unionen utvides til `'draft' | 'scheduled' | 'active' | 'finished'`.

**STATUS_LABELS:** `'scheduled': 'Planlagt'`, med champagne status-pill.

## Akseptkriterier

### State #1 — Turneringer-tom
- Vises på hjem-skjermen når brukeren ikke har aktive eller avsluttede spill
- Champagne-medaljong med pin-flagg, kicker «KLUBBHUSET ER ÅPENT»
- «Velkommen, {fornavn}.» — fornavn = `users.name.split(' ')[0]`
- CTA-stack: «Sjekk innboksen for invitasjon» (primary), «Opprett en turnering» (secondary)
- Pull-quote: «En god runde begynner med god planlegging.»
- Admin-bruker: empty-state øverst, admin-seksjon (Baner / Invitasjoner / Spill) under
- «Min profil» og «Logg ut» fortsatt tilgjengelig (footer)
- Fungerer i både light og dark mode

### State #2 — Scorekort venter
- Vises når spillets status = `Planlagt`
- Header viser spillnavnet i champagne-kicker
- Mail-konvolutt-ikon (forest stroke, champagne notification dot), kicker «DU ER PÅMELDT», heading «Scorekortet åpner ved tee-off.»
- Bane-kort: banenavn, «18 hull · Par 72 · {N} m» (lengde droppes hvis ikke satt på tee-box)
- Tee-off-tid og dato til høyre i kortet
- Flight-liste: 1–4 spillere, innlogget bruker med forest-avatar + champagne «DEG»-chip
- Countdown-format:
  - > 24t: `Starter om X dager`
  - 1–24t: `Starter om X t Y min`
  - 1–60 min: `Starter om Y min`
  - < 60s: `Starter om Z s`
  - Tee-off passert: `Starter snart`
- Bunntekst: «Vær på 1. tee 10 minutter før start.»
- Champagne-dot pulserer (softPulse 2.4s ease-in-out infinite), ingen annen animasjon
- Realtime: status-endring til `active` → flipper til hull-skjermen

### State #3 — Leaderboard pre-spill
- Vises når:
  - status = `Planlagt`, ELLER
  - status = `Pågående` OG ingen lag har fullført front 9
- Timeglass-ikon (forest stroke, champagne upper-sand fill), kicker «STILLE FØR STORMEN»
- «Første score forventet kl HH:MM.» = tee-off + 30 min, rundet til nærmeste 5 min
- «{N} lag er på vei ut.» (dynamisk)
- Startliste: rang (Fraunces tabular-nums), lag-navn («Lag 1»…«Lag 4»), spillernavn (Inter muted, ` · ` joined), tee-off-tid (samme tid på alle rader)
- Pull-quote: «Lykke til.»

### State #3.5 — Front 9 åpen
- Vises når status = `Pågående` OG minst ett lag har fullført alle hullene 1–9
- Champagne-pille «FRONT 9» under headeren
- Tabell sortert etter beste netto best-ball på front 9
- Delvise lag merket med kursiv tag «{n}/9»
- Låst blokk under tabellen:
  - Krittstrek-ramme i muted, hengelås-glyph
  - Heading: «🤫 Vi sees ved hull 18.»
- «Hull for hull»-visningen: hullene 1–9 vises fullt, hull 10–18 er låst seksjon med samme copy

### Admin
- «Lagre og publiser» erstatter «Lagre og start» i nytt-spill-skjemaet
- Dato/klokkeslett-velger for tee-off (påkrevd ved publisering, valgfritt ved utkast)
- «Rediger»-knapp på admin/games-siden mens status = `Planlagt`
- «Start runden nå»-knapp med bekreftelses-prompt mens status = `Planlagt`
- Status-pille «Planlagt» (champagne) overalt i appen
- Lengde-felt på tee-box (admin/courses), valgfritt

### Auto-start fallback
- Server-side guard ved sidelast: hvis status = `Planlagt` og `scheduled_tee_off_at <= now()`, flipp til `active`
- Realtime push treffer andre tilkoblede klienter
- Ingen cron / bakgrunnsjobb i v1

### Realtime
- State #2 lytter på `games` → ved status-endring til `active`, redirect til hull 1
- State #3/#3.5 lytter på `scores` → ved insert eller når et lag fullfører front 9, re-render

## Risikoer og åpne spørsmål

**Realtime-pålitelighet.** Per CLAUDE.md krever realtime eksplisitt `setAuth()`. Hvis kanalen ikke fyrer, kan state #2 «henge fast» etter at admin har startet. Fallback: sidelast/refresh trigger server-side guard og fanger opp endringen. Vi verifiserer eksplisitt under UAT.

**Lag som taster ut av rekkefølge.** Hvis et lag taster hull 10 før alle på hull 1–9 er ferdig, forblir front 9-tabellen lukket helt til alle hullene 1–9 er tastet. Dette dokumenteres som forventet oppførsel.

**Eksisterende prod-data.** Spill som er `active` ved migrasjonstidspunktet forblir uendret. Bare nye spill går via `scheduled`-fasen. Ingen brukerdata mistes.

## Fremtidig utvidelse

Designet er bevisst åpent for:
1. **Spillerstyrte lag-navn** — legges til via ny tabell `game_teams` med RLS for at lag kun kan endre eget navn
2. **Per-flight tee-off** — `games.scheduled_tee_off_at` beholdes som default, per-spiller-override-kolonne legges til
3. **Pg_cron auto-start** — utfyller server-side guard hvis det viser seg sårbart
4. **Web push ved tee-off** — bygger på eksisterende service worker
5. **Velg-lagnavn-skjerm** — knyttet til (1), egen skjerm før første hull

## Filer påvirket

**Nye filer (estimat):**
- `supabase/migrations/0008_scheduled_status_and_tee_off.sql`
- `app/admin/games/[id]/edit/page.tsx` (+ tilhørende actions)
- `components/icons/PinFlag.tsx`, `MailEnvelope.tsx`, `HourGlass.tsx`
- `components/ui/ChampagneMedallion.tsx`
- `components/ui/EmptyStateScreen.tsx` (shared shell for state #1/#2/#3)
- `lib/format/countdown.ts` (formattering av nedtelling)
- `lib/firstName.ts`
- `lib/leaderboard/frontNineGate.ts` (avgjør om front 9 er åpen)

**Endrede filer (estimat):**
- `app/page.tsx` (state #1)
- `app/games/[id]/page.tsx` (state #2 + server-side guard + realtime)
- `app/games/[id]/leaderboard/page.tsx` (state #3 + #3.5)
- `app/games/[id]/leaderboard/holes/page.tsx` (skjul hull 10–18 under aktiv)
- `app/admin/games/new/{page,actions,GameForm}.tsx` (tee-off-felt, knappe-tekst)
- `app/admin/games/[id]/page.tsx` (Rediger + Start runden nå)
- `app/admin/courses/...` (lengde-felt på tee-box)
- `lib/leaderboard/index.ts` (clip back 9 under `active`)
- `proxy.ts` / RLS-helpers (oppdater `is_in_active_game` etc.)
- Diverse `STATUS_LABELS`-konstanter (5+ filer)
