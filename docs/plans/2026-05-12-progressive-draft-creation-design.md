# Design — Progressiv utkast-oppretting

**Status:** Godkjent design (2026-05-12), klar for implementeringsplan
**Forfattere:** Jørgen + Claude

## Oversikt

Admin kan i dag ikke lagre et utkast før alle felter på skjemaet er gyldige: navn, bane, tee-boks, åtte balanserte spillere, tee-off-tid. Det betyr at ideen «la oss planlegge noe og fortsette senere» ikke finnes — du må gjøre alt i én økt eller miste arbeidet ditt.

Vi løser opp dette ved å la admin lagre et utkast med kun et navn, og fylle inn resten progressivt over tid. Idet det er nok info til å publisere (samme strenge regler som i dag), trykker admin «Publiser» og spillet flippes til `scheduled` med samme oppførsel som i dag.

Spillere som er lagt til et utkast ser turneringen umiddelbart på hjem-skjermen — med kun de feltene som faktisk er fylt inn. Et utkast uten bane viser ikke en bane-rad; et utkast uten tee-off viser ikke en nedtelling. Progressiv avsløring både i kortet på hjem-skjermen og i spill-detaljvisningen.

## Hva som er inkludert

- **Løs validering for utkast.** Kun `name` er påkrevd. Alle andre felt kan stå tomme/null.
- **Streng validering uendret for publisering.** Navn + bane + tee-boks + 8 balanserte spillere + tee-off — samme krav som i dag.
- **DB-migrasjon 0011** som gjør `games.course_id` og `games.tee_box_id` `NULL`-able.
- **Én form, to knapper:** «Lagre utkast» (alltid aktiv ved navn) og «Publiser» (disablet med helper-tekst når noe mangler).
- **Progressiv avsløring i hjem-kortet** — viser kun felt som er fylt inn.
- **Progressiv avsløring i spill-detaljvisningen** (`/games/[id]`) — banner «Utkast — planlegges fortsatt», seksjoner kun for felt som er satt, lagblokker kun for lag med 1+ spiller.
- **Status-overgang draft → scheduled er én vei** — kan ikke demoteres tilbake.
- **Tester** for de nye valideringsmodusene og UI-grenser.

## Hva som ikke er inkludert (out of scope)

| Utelatelse | Hvorfor | Når kan det legges til |
|---|---|---|
| Variabelt antall lag/spillere per lag | Egen milestone — `lib/scoring/bestBall` er hardkodet 4×2. Streng publish-validering forutsetter det. | Allerede i TODO som egen større feature |
| Demotering scheduled → draft | Spillere ser allerede turneringen som «planlagt», vi vil ikke at den «forsvinner» tilbake | Hvis det viser seg å være et reelt behov |
| Notifikasjon når draft publiseres | Egen feature (in-app innboks i TODO) | Når notifikasjonssystemet bygges |
| Endring av status fra UI for andre brukere enn opprettende admin | Multi-admin er egen sak | Klubb-tier milestone |
| Auto-save mens admin skriver | Risikerer mange tomme drafts i DB | Hvis admin ber om det |
| Lagre-knapp-state for «du har endringer» | Allerede løst på `/profile`; kan kopieres senere om nødvendig | Trivielt å legge til siden mønsteret finnes |

## Forretningsregler

### Lagre utkast

**Påkrevd:**
- `name` (ikke tom etter trim)

**Frivillig (lagres som null hvis ikke utfylt):**
- `course_id`, `tee_box_id`, `scheduled_tee_off_at`, `hcp_allowance_pct` (defaultes til 100), `require_peer_approval` (defaultes til false)
- Spillere: 0–8 stykker, hver med team_number 1–4 og flight_number 1–4 (uendret DB-CHECK)
- Ingen team-balanse-sjekk, ingen 8-spiller-sjekk

### Publiser (draft → scheduled)

**Påkrevd (alle samtidig):**
- `name`
- `course_id` + `tee_box_id` der tee_box må høre til course
- `scheduled_tee_off_at` (nødvendig for nedtelling)
- Eksakt 8 distinkte spillere, fordelt 2-per-team for team 1–4, én spiller per flight 1–4
- `hcp_allowance_pct` heltall 0–100

Dette er dagens publish-krav uendret.

### Synlighet

| Rolle | Ser draft? | Ser scheduled? |
|---|---|---|
| Admin som opprettet | ✓ (i admin-listen og som spill-detalj hvis hen er i spillerlista) | ✓ |
| Andre admins | ✓ | ✓ |
| Spiller som er lagt til | ✓ (på hjem-skjerm + kan navigere inn) | ✓ |
| Spiller som ikke er lagt til | ✗ | ✗ |

RLS er allerede `participant or admin`-basert og krever ingen endring.

## Database

### Migrasjon 0011 — `relax_game_drafts.sql`

```sql
-- Make course/tee-box optional so admins can save partial drafts.
-- A draft with `status = 'draft'` may have either column NULL; the publish
-- step still enforces both NOT NULL via application-layer validation.
alter table public.games
  alter column course_id drop not null,
  alter column tee_box_id drop not null;

comment on column public.games.course_id is
  'Course chosen for the round. Required for status=scheduled and beyond; nullable while status=draft.';
comment on column public.games.tee_box_id is
  'Tee-box chosen for the round. Required for status=scheduled and beyond; nullable while status=draft.';
```

Trygg endring — alle eksisterende rader har ikke-null verdier siden de ble skapt med streng validering.

### RLS / policies

Uendret. Eksisterende `select if participant or admin`-policy fungerer for både draft og scheduled.

### `game_players`

Uendret. Hver spillerrad krever fortsatt `team_number` 1–4 og `flight_number` 1–4. En spiller uten lag er semantisk uklart; vi tillater 0–8 spillere på draft-spillet, men hver lagt-til spiller har lag/flight.

## Server-actions

### `app/admin/games/new/actions.ts`

`buildGameInsertPayload(formData)` får en eksplisitt `mode: 'draft' | 'publish'`-parameter (per i dag fanges modus opp av wrapper-funksjonene `createGameDraft` og `createAndPublishGame`, men valideringen er den samme).

I `mode === 'draft'`:
- `name`: påkrevd (samme som i dag)
- `course_id`, `tee_box_id`, `scheduled_tee_off_at`: tolerant. Tom string → null. Ugyldig dato → null (uten å feile)
- `hcp_allowance_pct`: defaulter til 100 hvis ikke gyldig
- `require_peer_approval`: defaulter til false
- Spillere: 0–8 stykker. Hopper over tomme slots i form-data. Validerer team/flight-tall kun for slots som har user_id. Ingen team-balanse-sjekk.

I `mode === 'publish'`:
- Samme oppførsel som dagens streng-validering. Uendret.

`createGameInternal` skiller på `mode` ved INSERT: `status: mode === 'publish' ? 'scheduled' : 'draft'`, og `scheduled_tee_off_at` håndteres som i dag.

### `app/admin/games/[id]/edit/actions.ts`

Eksisterende edit-action utvides:
- Får et nytt `mode: 'save_draft' | 'publish' | 'save_scheduled'`-parameter
- `'save_draft'`: oppdaterer et draft-spill med løs validering. Tillatt kun hvis `games.status = 'draft'`.
- `'publish'`: validerer strengt, oppdaterer status til `'scheduled'`. Tillatt kun hvis `games.status = 'draft'`.
- `'save_scheduled'`: dagens edit-flow for scheduled-spill, uendret.
- `buildGameInsertPayload`-logikken løftes ut til `lib/games/gamePayload.ts` (allerede TODO-merket) for å unngå byte-for-byte duplikat.

## Admin-UI

### `GameForm`-komponent

Komponenten brukes både på `/admin/games/new` og `/admin/games/[id]/edit`. Vi utvider props-typen til en discriminated union (også TODO-merket):

```ts
type GameFormMode =
  | { mode: 'create' }
  | { mode: 'edit-draft' }
  | { mode: 'edit-scheduled' };
```

**Bunn-CTA-er per modus:**

| Modus | CTA-knapper |
|---|---|
| `create` | `[Lagre utkast]` `[Publiser]` |
| `edit-draft` | `[Lagre utkast]` `[Publiser]` |
| `edit-scheduled` | `[Lagre]` (én knapp; spillet er allerede publisert) |

**Knapp-tilstander i create / edit-draft:**

- `[Lagre utkast]`: aktiv så snart `name` er utfylt. Disablet ellers, med tooltip «Skriv inn et navn for å lagre utkast».
- `[Publiser]`: aktiv kun når alle publish-kravene er møtt (klient-side speiling av server-validering). Disablet ellers, med en kort helper-tekst rett under knappen som lister hva som mangler:
  - «Mangler: bane, tee-off-tid, 3 spillere igjen»
- Helper-teksten er live — den oppdateres mens admin fyller inn felt.

**Klient-validering:**
- Løs på alle felt utenom navn — admin kan velge bane uten tee-boks, legge til 1 spiller uten å fylle lag-balanse, osv.
- Felt-feilmeldinger vises kun ved submit (eller når et felt blurres og er ugyldig på en måte som ville feilet selv for draft, f.eks. negativ hcp-allowance).

### `GameFormBody`-layout

Ingen omstrukturering av selve skjemaet — alle dagens felt forblir på samme plass. Endringen er kun i validerings-state og knapp-rendering.

## Spiller-UI

### Hjem-skjerm — kort for kommende turneringer

I `app/page.tsx` rendres kort for `activeGames` (som allerede inkluderer `draft`, `scheduled`, `active`). Vi utvider kortet:

```
┌──────────────────────────────────────┐
│ [Status-pill]                        │
│ Vinter-cup                           │  ← name (alltid)
│ Bjerkholt Golf                       │  ← course.name (kun hvis satt)
│ Lørdag 24. mai · 09:00               │  ← scheduled_tee_off_at (kun hvis satt)
│ Lag 2 · Flight 1                     │  ← din lagrad (alltid hvis du er i game_players)
└──────────────────────────────────────┘
```

**Status-pill:**
- `Utkast` (warning-tone, amber) for `status = 'draft'`
- `Planlagt` (success-tone, sage) for `status = 'scheduled'`
- `Pågående` (primary-tone) for `status = 'active'` (uendret)

**Progressiv avsløring:**
- Bane-rad rendres kun hvis `course != null`
- Dato/tid-rad rendres kun hvis `scheduled_tee_off_at != null`
- Lag/flight-rad rendres alltid (du må være i `game_players` for å se kortet i det hele tatt)

Klikker du kortet → `/games/[id]` (samme rute som i dag for scheduled).

### Spill-detalj `/games/[id]` — venterom utvidet med draft-modus

Dagens venterom (state #2 «Scorekort venter») antar at alle felt er satt. Vi utvider det til å håndtere null-felt.

**Topp-banner:**
- `status === 'draft'`: amber banner «Utkast — admin planlegger fortsatt. Detaljer kan endre seg.»
- `status === 'scheduled'`: ingen banner (uendret)

**Header:**
- Spill-navn (alltid)
- Status-pill ved siden av navn

**Bane-info-blokk:**
- Rendres kun hvis `course != null`
- Inneholder banens navn, tee-boks-navn hvis satt, lengde i meter hvis satt

**Tee-off-blokk:**
- Rendres som nedtellings-blokk hvis `scheduled_tee_off_at != null` (uendret oppførsel for scheduled)
- For draft uten tee-off: kort tekst «Tidspunkt ikke avklart enda»

**Lag-oversikt:**
- Itererer over team 1–4
- Hvert lag rendres **kun hvis 1+ spiller** tilhører laget
- Hvert lag viser navn + handicap for hver spiller i laget
- Hvis null spillere er lagt til: «Spillere kommer» istedenfor lagblokk
- Eget lag highlightes (uendret)

**Mitt scorekort-CTA:**
- Skjules for draft (ingenting å scorekorte enda)
- Vises for scheduled (uendret)

## Tester

### Server-actions

- **`createGameDraft` med kun navn** lagrer rad med `status = 'draft'`, `course_id = null`, `tee_box_id = null`, 0 spillere
- **`createGameDraft` med 3 spillere** lagrer 3 rader i `game_players`, ingen team-balanse-feil
- **`createAndPublishGame` med kun navn** redirecter til `?error=course_required` (eller første manglende felt)
- **`createAndPublishGame` med 7 spillere** redirecter til `?error=players_required`
- **`updateGameDraft` på et scheduled-spill** redirecter til `?error=already_published`
- **`publishDraft` på et draft uten alle felt** redirecter til samme feilkode som strict publish

### UI-tester

- **GameForm**: «Lagre utkast» disablet uten navn, aktiv med navn alene
- **GameForm**: «Publiser» disablet uten alle publish-felt, viser helper-tekst som lister mangler
- **GameForm**: I `edit-scheduled`-modus vises kun én «Lagre»-knapp
- **Hjem-kort**: rendres uten bane-rad når `course === null`
- **Hjem-kort**: rendres uten dato-rad når `scheduled_tee_off_at === null`
- **Spill-detalj `/games/[id]`**: viser «Utkast»-banner for draft, ikke for scheduled
- **Spill-detalj**: viser ikke lag-blokk for tomme lag

### Ikke berørt

- `lib/scoring/` — uendret
- Score-write/sync — uendret (draft tillater ikke score-input siden status != active)

## Filer som endres

```
NY    supabase/migrations/0011_relax_game_drafts.sql
MOD   app/admin/games/new/actions.ts          (mode-parameter, løs draft-validering)
MOD   app/admin/games/[id]/edit/actions.ts    (mode-parameter, publish-fra-draft-flyt)
MOD   app/admin/games/new/GameForm.tsx        (discriminated mode, knapp-state, helper-tekst)
NY    lib/games/gamePayload.ts                (delt validerings-logikk)
MOD   app/page.tsx                            (status-pill, progressiv kort-rendering)
MOD   app/games/[id]/page.tsx                 (draft-banner, progressive seksjoner)
MOD   components/ui/ … evt. nye små komponenter for status-pill / draft-banner
NY    tests for nye flyter
MOD   TODO.md                                 (fjern punktene som er løst)
```

## Risiko / open questions

- **Eksisterende drafts i DB:** Ingen rader er per d.d. i `status = 'draft'` (alle dagens spill ble laget med streng validering). Migrasjonen er trygg.
- **Klient/server-validering må holde tritt:** Hvis klient sier «alle felt er fylt inn» og server sier nei, eller omvendt, gir det irriterende error-redirects. Vi tester begge sider mot samme regelliste.
- **Helper-teksten under «Publiser»-knappen kan bli lang.** Hvis admin har fylt inn alt unntatt 4 spillere, sier den ikke «Mangler: spiller 5, spiller 6, spiller 7, spiller 8». Den oppsummerer: «Mangler: 4 spillere».
- **Discriminated-union refactor av `GameForm`-props** er allerede TODO-merket og blir levert som del av denne fasen.
- **`buildGameInsertPayload`-duplikat mellom new/edit** er allerede TODO-merket og løses ved å løfte ut til `lib/games/gamePayload.ts`.

## Brand- og UX-noter

- «Utkast»-pillen bruker `--warning` (amber) — kommunikativt «pågående arbeid, ikke sluttført», ikke en feilmelding
- «Utkast — planlegges fortsatt»-banneren bruker samme amber-tone, lett bakgrunn
- Empty-state «Spillere kommer» bruker samme muted-tone som ellers brukes for ikke-utfylt info — ingen drama
- Helper-teksten under «Publiser» er nøktern: «Mangler: bane, tee-off, 4 spillere» — verken truende eller infantil

## Avhengigheter / rekkefølge

1. Migrasjon 0011 først (utvider DB-schemaet)
2. `lib/games/gamePayload.ts` (delt logikk)
3. Server-actions (new + edit)
4. GameForm (UI)
5. Hjem-skjerm-kort
6. Spill-detalj
7. Tester gjennomgående
8. Tom og smoke-test i prod (Jørgen)
