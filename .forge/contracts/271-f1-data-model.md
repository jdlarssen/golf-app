# Spec: F1 — Data model for `formats` + `format_intent_mapping`

**Issue:** [#271](https://github.com/jdlarssen/golf-app/issues/271)
**Parent epic:** [#270](https://github.com/jdlarssen/golf-app/issues/270)
**Design-doc:** [`docs/superpowers/specs/2026-05-27-format-katalog-og-wizard-redesign-design.md`](../../docs/superpowers/specs/2026-05-27-format-katalog-og-wizard-redesign-design.md)

## Problem

Tørny støtter i dag 5 hardkodede spilltyper definert som en TypeScript-union i [`lib/scoring/modes/types.ts:5-10`](../../lib/scoring/modes/types.ts) og en DB-CHECK-constraint i [`supabase/migrations/0033_texas_scramble.sql:15`](../../supabase/migrations/0033_texas_scramble.sql). Epic #270 utvider med ~18 nye formats, og admin må kunne styre hvor de dukker opp i wizarden uten kode-deploy. F1 etablerer data-fundamentet — `formats`-tabellen som katalog + `format_intent_mapping`-tabellen for wizard-placement — slik at F2 (wizard-redesign), F3 (admin mapping-side) og alle 18 format-issues kan bygges på toppen.

F1 har **ingen brukersynlig effekt**. Det er ren infrastruktur. Wizarden bruker fortsatt hardkodet liste til F2 lander. Men F1 må være rocksolid fordi alt etterpå er avhengig av schema-stabilitet, og det må bevare historiske spill når formats settes inaktive senere (`is_active = false` skjuler fra wizard, men `games.game_mode = '<slug>'` fortsetter å funke).

## Prior Decisions

Fra epic-design-doc (godkjent 2026-05-27):
- **Ingen FK mellom `games.game_mode` og `formats.slug`** — soft-deactivation må ikke ødelegge historiske spill. UI faller tilbake på "Ukjent format" hvis slug ikke matcher.
- **Tre intent-kategorier** for `format_intent_mapping.intent`: `kompis`, `klubb`, `solo`. Cup-eligibility er en separat boolean på `formats`-tabellen (`is_cup_eligible`), ikke en intent.
- **`primary_implies_visible` CHECK-constraint** på `format_intent_mapping` — et format kan ikke være primary uten å være synlig.
- **Hvert nytt format introduseres via sin egen migrasjon** som inserter format-row + default mapping. F1 seeder kun de 5 eksisterende.

Fra denne diskusjonsrunden:
- **`games_mode_check`-CHECK-constraint droppes** i F1-migrasjonen. Server-action-validering tar over (konsistent med øvrige forretningsregler i Tørny). Begrunnelse: unngår koblingen mellom hver fremtidig format-issue og en CHECK-rebuild, og fjerner dobbel sannhets-kilde (CHECK + formats-tabell).

Fra prior `getGameWithPlayers`-mønster ([lib/games/getGameWithPlayers.ts:1-65](../../lib/games/getGameWithPlayers.ts)):
- `unstable_cache` med tag-basert revalidering og `getAdminClient()` (RLS-bypass) inne i callback.
- Authorization på call-site, ikke inni cache.
- Mutations kaller `revalidateTag('<tag>', 'max')` (Next.js 16 to-arg-form).

## Design

### 1. Migrasjon

Filnavn: `supabase/migrations/0045_formats_and_intent_mapping.sql`

```sql
-- 0045_formats_and_intent_mapping.sql
-- Foundation F1 for epic #270 (format-katalog og intent-først wizard).
-- Etablerer `formats` som master-katalog over spilltyper, og
-- `format_intent_mapping` for å styre hvor hvert format dukker opp i
-- wizardens step 2. Seeder de 5 eksisterende formats med default mapping.
--
-- Bevisst: ingen FK mellom games.game_mode og formats.slug — soft-
-- deactivation av et format skal ikke ødelegge historiske games.

-- 1. formats: master-katalog
create table public.formats (
  slug              text primary key,
  display_name      text not null,
  icon_key          text not null,
  short_description text not null,
  scoring_module    text not null,
  is_active         boolean not null default true,
  is_cup_eligible   boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.formats is
  'Master-katalog over spilltyper. Slug brukes som game_mode i games-tabellen (ingen FK — soft-deactivation må bevare historikk).';

comment on column public.formats.icon_key is
  'Stabil identifier som UI mapper til en ikon-komponent. For nå: ofte lik slug. Holdes som egen kolonne for å åpne for ikon-bytting uten slug-endring.';

-- 2. format_intent_mapping: wizard-placering per intent
create table public.format_intent_mapping (
  format_slug  text not null references public.formats(slug) on update cascade,
  intent       text not null check (intent in ('kompis', 'klubb', 'solo')),
  is_visible   boolean not null default true,
  is_primary   boolean not null default false,
  sort_order   int not null default 100,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (format_slug, intent),
  constraint primary_implies_visible
    check (not is_primary or is_visible)
);

comment on table public.format_intent_mapping is
  'Per intent (Kompis/Klubb/Solo): er formatet synlig, og er det primary (stort kort)?';

-- 3. updated_at-trigger for begge tabeller (samme pattern som ellers i appen)
create or replace function public.set_updated_at()
  returns trigger
  language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
-- Ikke duplicate-erklær om allerede finnes i tidligere migrasjon. Builder
-- må sjekke om public.set_updated_at finnes; hvis ja, hopp denne blokken.

create trigger formats_set_updated_at
  before update on public.formats
  for each row execute function public.set_updated_at();

create trigger format_intent_mapping_set_updated_at
  before update on public.format_intent_mapping
  for each row execute function public.set_updated_at();

-- 4. RLS: read for alle authenticated, write kun for admin
alter table public.formats enable row level security;
alter table public.format_intent_mapping enable row level security;

create policy formats_read
  on public.formats for select
  using (auth.role() = 'authenticated');

create policy formats_admin_write
  on public.formats for all
  using (public.is_admin())
  with check (public.is_admin());

create policy format_intent_mapping_read
  on public.format_intent_mapping for select
  using (auth.role() = 'authenticated');

create policy format_intent_mapping_admin_write
  on public.format_intent_mapping for all
  using (public.is_admin())
  with check (public.is_admin());

-- 5. Drop games_mode_check — server-action-validering tar over
alter table public.games
  drop constraint if exists games_mode_check;

-- 6. Seed eksisterende 5 formats
insert into public.formats (slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible) values
  ('stableford',            'Stableford',    'stableford',            'Solo, poeng vs par. Klassisk.',                       '@/lib/scoring/modes/stableford',          true, false),
  ('best_ball_netto',       'Best ball',     'best_ball_netto',       'Lag à 2, beste netto per hull. Tørnys flaggskip.',    '@/lib/scoring/modes/bestBall',            true, false),
  ('texas_scramble',        'Texas scramble','texas_scramble',        'Lag à 4. Alle slår, beste velges.',                   '@/lib/scoring/modes/texasScramble',       true, false),
  ('solo_strokeplay_netto', 'Slagspill',     'solo_strokeplay_netto', 'Individuell, lavest total vinner.',                   '@/lib/scoring/modes/soloStrokeplayNetto', true, false),
  ('singles_matchplay',     'Matchplay',     'singles_matchplay',     '1v1, vinn flest hull.',                               '@/lib/scoring/modes/singlesMatchplay',    true, true);

-- 7. Seed default format_intent_mapping per design-doc-tabellen
-- Format: (slug, intent, is_visible, is_primary, sort_order)
insert into public.format_intent_mapping (format_slug, intent, is_visible, is_primary, sort_order) values
  -- Stableford: primary under Kompis, Klubb, Solo
  ('stableford',            'kompis', true,  true,  10),
  ('stableford',            'klubb',  true,  true,  10),
  ('stableford',            'solo',   true,  true,  10),
  -- Best Ball Netto: primary under Kompis, Klubb
  ('best_ball_netto',       'kompis', true,  true,  20),
  ('best_ball_netto',       'klubb',  true,  true,  20),
  -- Texas Scramble: sekundær under Kompis, primary under Klubb
  ('texas_scramble',        'kompis', true,  false, 30),
  ('texas_scramble',        'klubb',  true,  true,  30),
  -- Solo Strokeplay: primary under Klubb og Solo
  ('solo_strokeplay_netto', 'klubb',  true,  true,  40),
  ('solo_strokeplay_netto', 'solo',   true,  true,  20),
  -- Singles matchplay: sekundær under Kompis (cup-eligible håndteres via formats.is_cup_eligible)
  ('singles_matchplay',     'kompis', true,  false, 40);
```

### 2. Server-helper

Filnavn: `lib/formats/getFormatsForIntent.ts`

```ts
import 'server-only';
import { unstable_cache } from 'next/cache';
import { getAdminClient } from '@/lib/supabase/admin';

export type Intent = 'kompis' | 'klubb' | 'solo';

export type FormatForIntent = {
  slug: string;
  display_name: string;
  icon_key: string;
  short_description: string;
  is_primary: boolean;
  sort_order: number;
};

/**
 * Tag-cached fetch av aktive formats for en gitt wizard-intent.
 *
 * Returnerer alle synlige (is_visible) formats for intent-en, sortert på
 * (is_primary desc, sort_order asc). UI partisjonerer selv på is_primary
 * for å rendre 4 primary-kort + sekundære.
 *
 * Tag: `format-mapping`. Mutasjons-server-actions i F3 må kalle
 * `revalidateTag('format-mapping', 'max')` etter endring.
 *
 * Bruker getAdminClient() fordi cookies() ikke kan kalles inne i
 * unstable_cache. RLS er allerede strengere på write-siden (admin only).
 * Read er åpent for alle authenticated så bypass via admin-client gir
 * samme tilgang som en vanlig user-client ville gjort.
 */
export const getFormatsForIntent = unstable_cache(
  async (intent: Intent): Promise<FormatForIntent[]> => {
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('format_intent_mapping')
      .select(`
        format_slug,
        is_primary,
        sort_order,
        formats!inner (slug, display_name, icon_key, short_description, is_active)
      `)
      .eq('intent', intent)
      .eq('is_visible', true)
      .eq('formats.is_active', true)
      .order('is_primary', { ascending: false })
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[getFormatsForIntent] query failed', { intent, error });
      throw new Error(`Failed to fetch formats for intent ${intent}`);
    }

    return (data ?? []).map((row) => ({
      slug: row.formats.slug,
      display_name: row.formats.display_name,
      icon_key: row.formats.icon_key,
      short_description: row.formats.short_description,
      is_primary: row.is_primary,
      sort_order: row.sort_order,
    }));
  },
  ['format-mapping'],
  { tags: ['format-mapping'], revalidate: 60 * 60 * 24 /* 24t safety net */ }
);
```

Sekundær helper for Cup-flyten:

```ts
/**
 * Returnerer alle aktive formats som er cup_eligible. Brukes av Cup-step 2
 * for multi-select av tillatte match-formats.
 */
export const getCupEligibleFormats = unstable_cache(
  async (): Promise<Pick<FormatForIntent, 'slug' | 'display_name' | 'icon_key' | 'short_description'>[]> => {
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('formats')
      .select('slug, display_name, icon_key, short_description')
      .eq('is_active', true)
      .eq('is_cup_eligible', true)
      .order('display_name', { ascending: true });

    if (error) {
      console.error('[getCupEligibleFormats] query failed', { error });
      throw new Error('Failed to fetch cup-eligible formats');
    }
    return data ?? [];
  },
  ['format-mapping'],
  { tags: ['format-mapping'], revalidate: 60 * 60 * 24 }
);
```

### 3. Type-generering

Etter migrasjon: kjør `mcp__supabase__generate_typescript_types` for å oppdatere `lib/supabase/types.ts` med nye tabell-typer.

### 4. Server-action-validering (forberedes for F2)

F1 leverer en valideringshelper som F2 senere bruker når wizarden submitter:

```ts
// lib/formats/validateGameMode.ts
import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * Validerer at en game_mode-slug refererer et aktivt format.
 * Brukes av server-actions som oppretter games (erstatter dropped CHECK-constraint).
 */
export async function isValidActiveGameMode(slug: string): Promise<boolean> {
  const supabase = getAdminClient();
  const { data } = await supabase
    .from('formats')
    .select('slug')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  return data !== null;
}
```

Server-actions i F2 og senere (alle `createGame`-actions) kaller denne **før insert** og kaster `INVALID_GAME_MODE`-feil hvis slug ikke matcher.

For F1 sin del: helper-en lages, men ingen call-site bruker den ennå. Den eksisterende `app/admin/games/new/actions.ts` har sin egen validering basert på hardkodet enum — vi rører ikke den i F1.

### 5. CHANGELOG-oppføring

Patch-bump til neste versjon (`1.8.7 → 1.8.8`) med chore-stil oppføring (ingen brukersynlig effekt):

```markdown
### [1.8.8] - 2026-MM-DD

> Klargjort under panseret for en mye større format-katalog. Du ser ingenting nytt ennå — alt blir aktivert etter hvert som de nye spilltypene lander.

<details><summary>Teknisk</summary>

#### Added
- `formats`-tabell som master-katalog over spilltyper
- `format_intent_mapping`-tabell for admin-styrt wizard-placement
- Server-helpere `getFormatsForIntent`, `getCupEligibleFormats`, `isValidActiveGameMode`
- Default seed for de 5 eksisterende formats

#### Removed
- `games_mode_check`-CHECK-constraint på `games`-tabellen (server-action-validering tar over)

</details>
```

## Edge Cases & Guardrails

### Eksisterende games må fortsatt fungere
- `games.game_mode` har ingen FK og ingen constraint etter F1 — gamle rader er upåvirket.
- `formats`-tabellen seedes med de 5 eksisterende slug'ene, så all UI som joiner på format-info fungerer.
- Verifisering: kjør en eksisterende game-leaderboard etter migrasjon i staging. Skal være identisk med før.

### Hva hvis migration kjøres på et tomt prod-env?
- Hele migrasjonen er i én transaksjon (Supabase default). Seed-inserts er en del av samme TX som table-create.
- Hvis seed feiler, ruller hele migrasjonen tilbake. Ingen halvferdig state.

### Hva hvis admin sletter en aktiv format-rad direkte i DB?
- Eksisterende games fortsetter å funke (ingen FK).
- UI som joiner mot `formats` mister display_name → fallback i UI til "Ukjent format" (slug eller "—"). F2/F3 må implementere dette fallback-mønstret.
- Spec-eier (Jørgen) skal aldri slette format-rader direkte; bruk `is_active = false`.

### Hva hvis to formats prøver å være primary på samme intent?
- Ingen DB-constraint på "kun N primary per intent". F3's UI håndhever soft (validering: minst 1 primary per intent, ingen maks).
- For F1: ikke et problem. Seed gir naturlig fordeling.

### RLS-policy mot anon
- Ikke nødvendig — `auth.role() = 'authenticated'` ekskluderer anon.
- Public surfaces (eks. lansering-tile, om noen) som trenger format-info uten innlogging må bruke admin-client server-side.

### `set_updated_at`-funksjon eksisterer kanskje allerede
- Builder må sjekke om `public.set_updated_at` finnes i prior migrasjon. Hvis ja, hopp `create or replace function`-blokken i 0045.
- Min sjekk i `supabase/migrations/` viste ingen — men trygt å bruke `create or replace` så det er idempotent.

### Server-helper kallt før seed er kjørt (lokal dev)
- Returnerer tom array, ikke krasj. UI viser tom-state ("Ingen formats konfigurert").
- F2 og F3 må håndtere tom-state gracefully.

## Key Decisions

- **Drop `games_mode_check`-CHECK** — server-action-validering tar over. Begrunnelse: unngår koblingen mellom hver fremtidig format-issue og en CHECK-rebuild, fjerner dobbel sannhets-kilde, og er konsistent med "no FK"-prinsippet vi allerede etablerte.
- **Ingen audit-log i F1** — F3 (admin mapping-UI) implementerer audit-log som en del av sitt eget arbeid. F1 sørger kun for at `created_at`/`updated_at` finnes på tabellene.
- **`icon_key` er en string-identifier, ikke selve SVG-en** — UI mapper key til komponent. For nå er icon_key = slug for de 5 eksisterende. Nye formats kan ha annen key hvis flere formats deler ikon.
- **Helper returnerer flat liste, ikke pre-partisjonert** — UI partisjonerer på `is_primary`. Hold helper-shape enkel.

**Claude's Discretion:**
- Eksakte `short_description`-strenger for de 5 eksisterende formats — kopier fra design-doc-tabellen eller fra dagens `ModeSelector`-komponent, hva som ser ryddigst ut.
- `sort_order`-tall (10, 20, 30, ...) — gap på 10 så fremtidige formats kan inserts mellom uten å renumber.
- Om `set_updated_at`-funksjon allerede finnes i en eldre migrasjon — hvis ja, hopp `create or replace`-blokken.
- Test-organisering: én test-fil per helper (`getFormatsForIntent.test.ts`, `getCupEligibleFormats.test.ts`) eller ett samlet (`formats.test.ts`) — velg det som er mest lesbart.

## Success Criteria

- [ ] Migrasjon `0045_formats_and_intent_mapping.sql` finnes og kjører grønt mot lokal Supabase (`supabase db reset` i lokal env)
- [ ] `select count(*) from public.formats where is_active = true` returnerer `5` etter seed
- [ ] `select count(*) from public.format_intent_mapping` returnerer `10` etter seed (per mapping-tabellen over)
- [ ] `\d public.games` viser at `games_mode_check` ikke lenger eksisterer
- [ ] `lib/formats/getFormatsForIntent.ts` finnes og eksporterer `getFormatsForIntent(intent)` + `getCupEligibleFormats()`
- [ ] `lib/formats/validateGameMode.ts` finnes og eksporterer `isValidActiveGameMode(slug)`
- [ ] `lib/supabase/types.ts` inneholder `formats` og `format_intent_mapping`-typer (verifiser med `grep -l "format_intent_mapping" lib/supabase/types.ts`)
- [ ] Eksisterende game-leaderboard rendres identisk med før migrasjon (manuell sjekk i Safari mot staging — eller en eksisterende E2E test som åpner en game-side passerer)
- [ ] CHANGELOG.md har ny `### [1.8.8]` (eller riktig neste patch-versjon) med chore-stil oppføring
- [ ] `package.json` versjon er bumpet patch fra dagens

## Gates

Etter hver chunk:
- [ ] `npx tsc --noEmit` passerer (typecheck etter ny generert types-fil)
- [ ] `npx vitest run lib/formats/` passerer (Type A unit-tester for helpers)
- [ ] `npm run lint` passerer (hvis eksisterer — sjekk `package.json` scripts)
- [ ] Eksisterende test-suite kjører grønt: `npx vitest run` (regressionsbeskyttelse)

Mobil-/E2E-gates er ikke relevant for F1 — ren backend.

## Files Likely Touched

- `supabase/migrations/0045_formats_and_intent_mapping.sql` — ny
- `lib/formats/getFormatsForIntent.ts` — ny
- `lib/formats/getFormatsForIntent.test.ts` — ny (Type A: mocker getAdminClient, asserter shape + sortering + tom-state)
- `lib/formats/validateGameMode.ts` — ny
- `lib/formats/validateGameMode.test.ts` — ny (Type A: valid + invalid + inactive slug)
- `lib/supabase/types.ts` — regenerert (legger til `formats` og `format_intent_mapping`-typer)
- `package.json` — version-bump
- `CHANGELOG.md` — ny `[1.8.8]`-oppføring

## Out of Scope

- **Admin mapping-UI** — F3 (#273). F1 leverer kun datalaget; UI til å endre mapping kommer senere.
- **Wizard-redesign** — F2 (#272). F1 sin server-helper kan brukes umiddelbart av wizarden, men wizarden er ikke endret i denne issuen.
- **Audit-log på mapping-endringer** — F3.
- **Bytte ut `app/admin/games/new/actions.ts` til å bruke `isValidActiveGameMode`** — F2. F1 lever bare helper-en; eksisterende validering forblir uendret.
- **`getFormatUsageCount(slug)`-helper** for F3's "are you sure?"-warning — flyttes til F3 hvis ikke trivielt å legge til her.
- **Eksisterende games's `mode_config` JSONB** — uendret.
- **Sideturnering-system** — uendret.

## Deferred Ideas

Ingen scope-creep dukket opp i denne diskusjonsrunden.
