# Issue #95 — Multi-rating tee-bokser (refactor av #48)

**Status:** Design (godkjent 2026-05-17)
**Issue:** https://github.com/jdlarssen/golf-app/issues/95
**Refactor av:** [#48](https://github.com/jdlarssen/golf-app/issues/48) (shipped som v1.3.0 2026-05-17)

## Bakgrunn

v1.3.0 lagrer én `tee_boxes`-rad pr. fysisk tee × kjønn. Det betyr admin må legge inn samme fysiske tee (f.eks. «Gul») to ganger som «Gul herre» og «Gul dame» med ulike slope/CR. Brukeren oppdaget rett etter shipping at dette føles klønete og ba om refactor til alternativ datamodell jeg vurderte og forkastet under #48-brainstormingen.

## Designvalg

### Multi-rating pr. fysisk tee

`tee_boxes` får én rad pr. fysisk tee med inntil tre rating-sett (mens/ladies/juniors), hver med eget slope/CR/par. Alle gender-rating-sett er nullable — admin kan fylle ut hvilken som helst kombinasjon (kun herre, kun dame, alle tre, osv.) og legge til manglende rating senere.

CHECK-constraint sikrer at minst én komplett rating-sett er satt pr. rad.

### Pr.-spiller gender-flag på game_players

Erstatter `game_players.tee_box_id` (per-tee override) med `game_players.tee_gender` enum. Spillet har én tee; toggle bestemmer hvilken gender-rating som brukes ved course-handicap-utregning.

### Valgfri ratings + add-later

Nullable-kolonnene gjør add-later trivielt: diff-basert edit (allerede shipped) kan fylle inn manglende gender-rating uten ekstra arbeid. Validering ved game-publish: spillerens valgte gender MÅ ha komplett rating på den valgte teen, ellers feilmelding.

## Datamodell

### Nytt `tee_boxes`-skjema

```sql
-- Drop gamle felter
alter table public.tee_boxes
  drop column slope,
  drop column course_rating,
  drop column par_total,
  drop column gender;

drop type tee_box_gender;  -- ikke lenger brukt på tee_boxes

-- Legg til nullable per-gender ratings
alter table public.tee_boxes
  add column slope_mens int check (slope_mens between 55 and 155),
  add column course_rating_mens numeric(4,1),
  add column par_total_mens int check (par_total_mens between 60 and 80),
  add column slope_ladies int check (slope_ladies between 55 and 155),
  add column course_rating_ladies numeric(4,1),
  add column par_total_ladies int check (par_total_ladies between 60 and 80),
  add column slope_juniors int check (slope_juniors between 55 and 155),
  add column course_rating_juniors numeric(4,1),
  add column par_total_juniors int check (par_total_juniors between 60 and 80);

-- Minst én komplett rating-sett må være satt
alter table public.tee_boxes
  add constraint tee_boxes_at_least_one_rating check (
    (slope_mens is not null and course_rating_mens is not null and par_total_mens is not null) or
    (slope_ladies is not null and course_rating_ladies is not null and par_total_ladies is not null) or
    (slope_juniors is not null and course_rating_juniors is not null and par_total_juniors is not null)
  );
```

### Nytt `game_players`-skjema

```sql
-- Drop per-tee override (overflødig nå)
alter table public.game_players
  drop column tee_box_id;

-- Ny gender-enum for game_players (separat fra det vi droppet på tee_boxes)
create type player_tee_gender as enum ('mens', 'ladies', 'juniors');

alter table public.game_players
  add column tee_gender player_tee_gender not null default 'mens';
```

## Datamigrasjon

Eksisterende v1.3.0-data:

**For hver `tee_boxes`-rad** (én rad pr. fysisk tee × kjønn):
- Kopier `slope` → `slope_${gender}`
- Kopier `course_rating` → `course_rating_${gender}`
- Kopier `par_total` → `par_total_${gender}`

**Ingen merging av variant-rader.** Hvis admin har lagt inn «Gul herre» + «Gul dame» som separate rader (per v1.3.0-modellen), blir de to separate rader i ny modell også — men hver med kun én gender-rating utfylt. Admin kan manuelt rydde i bane-admin etter migrasjonen (fyll dame-tall på herre-raden, slett dame-raden).

**For hver `game_players`-rad** med `tee_box_id ≠ NULL`:
- Slå opp tee-en, sett `tee_gender` til den tee-ens gender
- Etter alle rader er konvertert: drop `tee_box_id`-kolonnen

For game_players med `tee_box_id = NULL`: `tee_gender` får default 'mens' (samme oppførsel som før).

## UX-endringer

### Bane-admin (CourseForm)

Hvert tee-kort får tre rating-undersjons-kort (Herrer / Damer / Junior), hver med sine egne slope/CR/par-felter. Tomme felter = ingen rating for den gender.

```
┌─ Tee-boks 1 ─────────────────┐
│ Navn:     [Gul         ]     │
│ Lengde:   [6124       ] m    │
│                              │
│ ┌─ Herrer ─────────────────┐ │
│ │ Slope: [122]  CR: [70.1] │ │
│ │ Par: [72]                │ │
│ └──────────────────────────┘ │
│ ┌─ Damer ──────────────────┐ │
│ │ Slope: [132]  CR: [71.5] │ │
│ │ Par: [72]                │ │
│ └──────────────────────────┘ │
│ ┌─ Junior ─────────────────┐ │
│ │ Slope: [   ]  CR: [    ] │ │
│ │ Par: [  ] (tomme = ingen)│ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

«For hvem»-segmented control fra v1.3.0 fjernes (multi-rating gjør den overflødig).

Validering: minst én rating-undersjons-kort må være fullt utfylt. Hvis admin fyller delvis (eks. slope men ikke CR for damer): valider som «inkomplett — fyll alle eller la stå tom».

### Game-form (GameForm)

- ÉN tee-dropdown (ikke to) — viser fysiske tees på banen, med small badge som indikerer tilgjengelige ratings: `Gul (herre · dame)`, `Hvit (herre)`, osv.
- M/D/J-toggle pr. spiller, alltid synlig, default M
- Ved save: server validerer at hver spillers `tee_gender` har komplett rating på den valgte teen — ellers redirect med feilmelding (`tee_missing_rating` + spillerens navn + gender)

Score-visibility, peer-approval, side-tournament — alt uendret.

### Game-detalj (admin/games/[id])

Viser teen med alle tilgjengelige ratings:

> **Tee:** Gul
> **Herrer:** slope 122 / CR 70.1 / par 72
> **Damer:** slope 132 / CR 71.5 / par 72
> *Junior: ikke konfigurert*

(Eller skjul ikke-konfigurerte gender-rader hvis det er for visuelt støy — bestemmes under implementering.)

### Scorekort (`/games/[id]/scorecard`)

«Du spiller fra»-banner uendret i prinsipp:

> Du spiller fra **Gul (dame)** — slope 132 / CR 71.5

Dataen kommer nå fra `game.tee_box.slope_ladies` + `player.tee_gender` i stedet for en separat ladies-tee-rad.

## Course handicap

```ts
const tee = game.tee_box;
const gender = player.tee_gender;  // 'mens' | 'ladies' | 'juniors'
const slope = tee[`slope_${gender}`];
const cr = tee[`course_rating_${gender}`];
const par = tee[`par_total_${gender}`];

// Server-side validering ved publish — om noen er null, bail med tee_missing_rating
if (slope == null || cr == null || par == null) {
  redirect(`${detailPath}?error=tee_missing_rating&...`);
}

const raw = calculateCourseHandicap({ hcpIndex, slope, courseRating: cr, par });
```

Helper `lib/games/teeRating.ts`:

```ts
export type TeeGender = 'mens' | 'ladies' | 'juniors';

export type TeeBoxRatings = {
  slope_mens: number | null;
  course_rating_mens: number | null;
  par_total_mens: number | null;
  slope_ladies: number | null;
  course_rating_ladies: number | null;
  par_total_ladies: number | null;
  slope_juniors: number | null;
  course_rating_juniors: number | null;
  par_total_juniors: number | null;
};

export type Rating = { slope: number; courseRating: number; par: number };

export function getRatingForGender(tee: TeeBoxRatings, gender: TeeGender): Rating | null {
  const slope = tee[`slope_${gender}`];
  const cr = tee[`course_rating_${gender}`];
  const par = tee[`par_total_${gender}`];
  if (slope == null || cr == null || par == null) return null;
  return { slope, courseRating: cr, par };
}
```

Lib/games/teeResolution.ts (fra v1.3.0) slettes — helpers den eksporterte er ikke lenger relevante.

## Scoring

`calculateCourseHandicap` i `lib/scoring/courseHandicap.ts` uendret — formelen tar slope/CR/par som input. Det er bare HENTINGEN av ratings som endrer seg.

Best-ball-logikken (`lib/scoring/bestBall.ts`) uendret — bruker pr. spillers `course_handicap`, som freezes ved publish.

## Tester

- `lib/games/__tests__/teeRating.test.ts` — NY: unit-tester for `getRatingForGender` (returnerer null hvis manglende rating, returnerer ratings hvis komplett)
- `lib/games/__tests__/teeResolution.test.ts` — SLETT (helper finnes ikke lenger)
- `lib/scoring/courseHandicap.test.ts` — uendret (formelen er den samme)
- `gamePayload.test.ts` — oppdater hvis det refererer tee_gender / tee_box_id-felter

## Filer som endres

- `supabase/migrations/0029_tee_box_multi_rating.sql` — NY
- `lib/database.types.ts` — regen
- `lib/games/teeRating.ts` — NY
- `lib/games/__tests__/teeRating.test.ts` — NY
- `lib/games/teeResolution.ts` — SLETT
- `lib/games/__tests__/teeResolution.test.ts` — SLETT
- `app/admin/courses/CourseForm.tsx` — multi-rating tee-kort
- `app/admin/courses/new/actions.ts` — les multi-rating-felter
- `app/admin/courses/[id]/edit/actions.ts` — samme
- `app/admin/courses/[id]/edit/page.tsx` — last multi-rating-felter inn i initial state
- `app/admin/games/new/GameForm.tsx` — én tee-dropdown, M/D/J-toggle alltid synlig
- `app/admin/games/new/actions.ts` — les `tee_gender` pr. spiller, drop `tee_box_id`-resolusjon
- `app/admin/games/new/page.tsx` — last tees med alle gender-ratings
- `app/admin/games/[id]/edit/page.tsx` — last `tee_gender` pr. spiller
- `app/admin/games/[id]/edit/actions.ts` — mirror new/actions
- `app/admin/games/[id]/actions.ts` — course handicap fra `getRatingForGender(tee, player.tee_gender)`
- `lib/games/startScheduledGame.ts` — samme
- `lib/games/getGameWithPlayers.ts` — utvid types med multi-rating-felter + drop tee_box pr. game_player
- `app/games/[id]/scorecard/page.tsx` — derive fra `game.tee_box[slope_${me.tee_gender}]`
- `app/admin/games/[id]/page.tsx` — vis alle tilgjengelige ratings på teen
- `lib/admin/gameErrorMessages.ts` — bytt `bad_ladies_tee` → `tee_missing_rating`

Estimat: 17 filer + 1 migrasjon.

## Versjon

v1.3.0 → **v1.4.0** (minor — bryter datamodell, men er bruker-synlig forbedret UX). Ingen MAJOR siden ingen brukerinngrep er nødvendig (data-migrasjon skjer automatisk).

## Edge cases

- Spillet er publisert, så endrer admin teen så at spillerens gender-rating forsvinner. → Course handicap er allerede frosset på `game_players.course_handicap`, så pågående spill er trygt. Re-publish ville feile, men det er en uvanlig flyt.
- Tee har bare junior-rating, spillet er opprettet med en M-merket spiller. → Server validerer ved publish: redirect med `tee_missing_rating`.
- Tee fjernes fra bane (delete). → Diff-basert edit (shipped i v1.3.0) blokkerer sletting hvis tee er referert av `games.tee_box_id`. Fortsatt riktig — vi droppet kun `game_players.tee_box_id`, ikke `games.tee_box_id`.

## Hva vi IKKE gjør

- **Manuell merging av variant-rader** ved migrasjonen — admin rydder selv etterpå. Verifisert: dette er minimal-cost siden brukeren ikke har lagt inn varianter i prod-data ennå (kun pilotet på testbane).
- **UI-hint** for hvilke M/D/J-valg som er mulig basert på valgt tees ratings — server-validering med klar feilmelding er tilstrekkelig MVP.
- **Junior-spesifik UX-polish** (egne placeholder-verdier, etc.) — bruker den samme inputmønsteret som mens/ladies.
