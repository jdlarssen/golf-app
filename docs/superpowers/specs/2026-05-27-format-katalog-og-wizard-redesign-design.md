# Format-katalog og intent-først wizard-redesign

**Status:** Design — under bygging
**Dato:** 2026-05-27
**Brainstorm-mockups:** `.superpowers/brainstorm/88686-1779890978/content/` (visual companion-session)

## Bakgrunn

Tørny støtter i dag **fem formats**: Stableford, Best Ball Netto, Singles Matchplay, Solo Strokeplay Netto, Texas Scramble — pluss et rikt sideturnering-system. Format-utvalget er hardkodet som en `GameMode`-union i `lib/scoring/modes/types.ts`, og wizarden viser de fem som en flat kort-liste i step 1.

Vi vil utvide til **15+ nye formats** (alternate-shot-familien for klubb/Ryder Cup, sosiale point-games for kompis-runden, format-varianter som Modified Stableford og Ambrose). Hvis vi bare legger dem til som flere kort i samme step 1, blir wizarden uoversiktlig. Det krever en re-tenkning av flyten.

Vi får også behov for å la admin **selv styre hvor formater dukker opp** i wizarden uten kode-deploy, fordi format-katalogen er noe Jørgen vil eksperimentere med over tid.

## Mål

1. Utvide format-katalogen med ~15 nye formats (Wolf, Skins, Nassau, Foursomes matchplay m.fl.) uten å overvelde brukeren.
2. Gjøre opprett-spill-flyten **intent-først**: brukeren velger situasjon (kompis-runde, klubb-turnering, Cup, solo) før format. Filtrerer format-katalogen til det relevante.
3. Smelte sammen dagens `/admin/games/new` og `/admin/cup/new` til én wizard med Cup som en av intent-grenene.
4. Lage en **admin format-mapping-side** som styrer hvilke formats som dukker opp under hvilken intent, om de er primary (stort kort) eller sekundære (mindre kort), og om de kan brukes som match-format i en Cup.
5. Bevare **historiske spill** når et format settes inaktivt: `formats.is_active = false` skjuler fra wizard, men `games.game_mode = '<slug>'` fortsetter å fungere for leaderboards og historikk.
6. Holde alt **mobil-først** — wizarden brukes på telefon. Primary-kort i 2 × 2 = par-tall som balanserer på mobile-screen.

## Ikke-mål (denne runden)

- Tournament-prosedyrer (shotgun-start, two-tee-start). Hører til klubb-skala-arbeidet, ikke format-arbeidet.
- Side-bets som egne kort (Sandies, Barkies, Arnies, Devil Ball). Fortsetter som **sideturnering-kategorier**, ikke som formats. Banner i step 2 informerer.
- 4v4-strukturer. Finnes ikke i golf — alle "lag-vs-lag"-formater er enten 2v2 eller "lag i felt".
- Brand-styling og full visuell polish av wizarden. Det kommer i F2-issuet, men er ikke spec-et her.

## Intent-først-modellen

Wizardens **step 1** spør: «Hva slags arrangement?» og presenterer fire kort.

| Intent | Hvem | Eksempel |
|---|---|---|
| 🧑‍🤝‍🧑 **Kompis-runde** | 2–4 venner som vil gjøre runden mer spennende | Wolf på en torsdag |
| 🏆 **Klubb-turnering** | 8+ deltakere, handicap-jevner | Stableford med 30 spillere |
| ⚔️ **Cup** | To lag, N matcher, lag-totalen vinner | Ryder Cup-helg mellom to klubber |
| 🎯 **Solo / test** | Én spiller | Egen runde med score-tracking |

Cup er ikke en separat entry på dashboard lenger — den er **ett av fire spor** i samme wizard. Det fjerner "Cup vs Turnering"-forvirringen og samler entry-point.

## Format-katalog — inkluderende

Hvert format dukker opp under **hver intent det passer for**, ikke kun under en "kategori". Stableford er primary under både Klubb og Kompis-runde og Solo. Best Ball Netto er primary under både Klubb og Kompis-runde. Singles matchplay er primary under Cup og dukker opp som sekundær under Kompis-runde.

| Format | Kompis | Klubb | Solo | Cup | Status |
|---|---|---|---|---|---|
| Stableford | ★ | ★ | ★ | — | har |
| Best Ball Netto | ★ | ★ | — | — | har |
| Texas Scramble | ✓ | ★ | — | — | har |
| Solo Strokeplay Netto | — | ★ | ★ | — | har |
| Singles matchplay | ✓ | — | — | ★ | har |
| Wolf | ★ | — | — | — | ny |
| Skins (m. carryover) | ★ | — | — | — | ny |
| Nassau | ★ | — | — | — | ny |
| Bingo Bango Bongo | ✓ | — | — | — | ny |
| Nines / Split Sixes | ✓ | — | — | — | ny |
| Acey Deucey | ✓ | — | — | — | ny |
| Round Robin | ✓ | — | — | — | ny |
| Modified Stableford | ✓ | ✓ | ✓ | — | ny |
| 4BBB Stableford | — | ★ | — | — | ny |
| Florida Scramble | — | ✓ | — | — | ny |
| Ambrose | — | ✓ | — | — | ny |
| Shamble (inkl. Champagne) | — | ✓ | — | — | ny |
| Patsome | — | ✓ | — | — | ny |
| Foursomes matchplay | — | — | — | ★ | ny |
| Fourball matchplay | — | — | — | ★ | ny |
| Greensome matchplay | — | — | — | ✓ | ny |
| Chapman / Pinehurst matchplay | — | — | — | ✓ | ny |
| Gruesome matchplay | — | — | — | ✓ | ny |
| Score-tracking (ingen vinner) | — | — | ✓ | — | ny |

★ = primary (stort kort i step 2), ✓ = synlig som sekundær-kort, — = ikke synlig.

**Hele tabellen er admin-styrt** via format-mapping-siden (F3) — den er bare default-seed.

## Wizard step 2 — visuell hierarki

Per intent: **4 primary-kort** (2 × 2 på mobil, med ikon) + **opptil 6 sekundære kort** (kompaktere, 2 kolonner, med mini-ikon). Side-tournaments-banner sitter nederst.

```
┌──────────────────────────────┐
│ Step 2 av 4 — Klubb-turnering │
│                              │
│ Velg format                  │
│                              │
│ ┌──────────┐ ┌──────────┐    │
│ │  📊      │ │   🤝     │    │
│ │ Stable-  │ │ Best Ball│    │ ← 4 primary
│ │  ford    │ │  Netto   │    │   (2 × 2 grid)
│ └──────────┘ └──────────┘    │
│ ┌──────────┐ ┌──────────┐    │
│ │  🎯      │ │   🏌️     │    │
│ │ Texas    │ │  Solo    │    │
│ │ Scramble │ │ Strokepl.│    │
│ └──────────┘ └──────────┘    │
│                              │
│ FLERE FORMATS                │
│ ┌─────┐┌─────┐┌─────┐┌─────┐ │ ← sekundære
│ │4BBB ││Mod  ││Flor.││Ambr.│ │   (2 cols, mini-icon)
│ └─────┘└─────┘└─────┘└─────┘ │
│ ┌─────┐┌─────┐               │
│ │Shamb││Patso│               │
│ └─────┘└─────┘               │
│                              │
│ 💡 Sideturneringer alltid    │
│    mulig — legges på i neste │
│    steg.                     │
└──────────────────────────────┘
```

Antall primary-kort er **alltid par-tall** (2, 4 eller 6) for mobil-balanse. Default 4. Admin kan toggle færre/flere via stjerner i mapping-siden.

## Cup-spesifikk flyt

Cup er en container — admin velger først hvilke match-formats som er tillatte i denne Cup-en, deretter opprettes individuelle matcher med valg fra de tillatte.

**Step 2 (Cup):**
- Lag-navn (to felt)
- Points-to-win (av N matcher)
- **Tillatte match-formats** (multi-select over formats med `cup_eligible = true`)

Sub-flow når admin legger til en match i Cup-en: format-pickeren er begrenset til de tillatte formatene fra Cup-oppsettet. Ryder Cup-mønster: foursomes fredag, fourball lørdag, singles søndag.

Cup støtter både single-day og multi-day — ingen `is_multi_day`-flagg trengs; tidspunkt per match avgjør.

## Admin format-mapping-side

Ny rute: `/admin/formats`.

Matrix-view:
- Rader: hvert format (med ikon, navn, scoring-modul-slug)
- Kolonner: én per intent (Kompis, Klubb, Solo) + én separat Cup-kolonne
- Hver celle har to kontroller: **hake** (synlig under denne intent) + **stjerne** (primary = stort kort)
- Cup-kolonnen har bare "cup-eligible"-hake (Cup bruker ikke star-grid — det er multi-select i Cup-setup)
- Statussøyle: aktiv / ny / inaktiv

Admin kan:
- Skru av/på et format per intent
- Promotere/demotere et format mellom primary og sekundær
- Sette et format `inactive` globalt (skjules fra alle wizard-flater, eksisterende `games` fortsetter å vise riktig)
- Legge til nytt format som "ny" når koden lander en ny scoring-modul (default-rader seedes via migrasjon, admin kan overstyre etterpå)

## Data model

Tre nye tabeller:

```sql
-- 1. formats: master-liste over alle formats Tørny støtter
create table public.formats (
  slug text primary key,              -- 'stableford', 'wolf', 'foursomes_matchplay'
  display_name text not null,         -- 'Stableford', 'Wolf', 'Foursomes matchplay'
  icon_key text not null,             -- key i ModeSelector-ikon-mappet
  short_description text not null,    -- 'Solo, poeng vs par. Klassisk.'
  scoring_module text not null,       -- '@/lib/scoring/modes/stableford'
  is_active boolean not null default true,
  is_cup_eligible boolean not null default false,
  created_at timestamptz default now()
);

-- 2. format_intent_mapping: hvor hvert format dukker opp i wizarden
create table public.format_intent_mapping (
  format_slug text not null references public.formats(slug) on update cascade,
  intent text not null check (intent in ('kompis', 'klubb', 'solo')),
  is_visible boolean not null default true,
  is_primary boolean not null default false,
  sort_order int not null default 100,
  primary key (format_slug, intent),
  -- Et format kan ikke være primary uten å være synlig:
  constraint primary_implies_visible check (not is_primary or is_visible)
);

-- 3. games.game_mode beholder text-typen (ikke enum), referer fritt til formats.slug
-- Ingen FK på games.game_mode → formats.slug (bevisst — soft-deactivation).
-- Hvis et format slettes (sjelden), beholdes game-rader med "ukjent format"-fallback i UI.
```

**Soft-deactivation:** `formats.is_active = false` skjuler bare fra wizard og admin-listinger. Eksisterende `games.game_mode = '<slug>'` fortsetter å fungere — scoring-modul lastes basert på `game_mode`-verdien, ikke filtrert på `is_active`. Leaderboards og historikk er upåvirket.

**FK-strategi:** `games.game_mode` har **ingen foreign key** mot `formats.slug`. Bevisst valg for å unngå at hard delete av et format (worst case) ødelegger historikk. UI faller tilbake på "Ukjent format" hvis slug ikke matcher.

**Migrasjon-seed:** Når et nytt format introduseres i kode (ny `lib/scoring/modes/<slug>.ts` + tester), opprettes en migrasjon som inserter format-raden + default `format_intent_mapping`-rader. Admin overstyrer etterpå via UI hvis nødvendig.

## Sideturneringer

Forblir uendret som system — `lib/scoring/sideTournament.ts` og `sideTournamentConfig.ts`. Eneste endring er at sideturnering-toggle blir tilgjengelig i step 4 for **alle intents** (i dag kun for Klubb-turnering-aktige spill). Banner i step 2 informerer brukeren om at de kan legges på.

Side-bets-typer (Sandies, Barkies, Arnies, Devil Ball) introduseres som **nye sideturnering-kategorier** i et eget oppfølgings-issue når dette landerer.

## Mobil-først

Alle nye flater skal designes mobil-først:
- Wizard-kort: 2-kolonner-grid på mobil (default), 3-kolonner på tablet+
- Mockups som godkjennes av admin må vises på mobil-frame før godkjenning
- Tap-targets minimum 44px
- Admin format-mapping-siden er den ENESTE flaten i dette settet som primært brukes på desktop — matrix-view trenger plass. Mobil-versjonen kollapses til intent-tabs

## Issue-struktur

1 epic + 3 foundation + 18 format-issues = **22 issues**.

**Epic:** `epic: Format-katalog og intent-først wizard-redesign`

**Foundation (må gjøres før noen format-issues):**
- F1: Data model — `formats` + `format_intent_mapping` med soft-deactivation
- F2: Wizard step 1+2 redesign — intent-først, 4 + 6 mobil-grid med ikon
- F3: Admin format-mapping-side — matrix-view

**Format-batcher:**
- Kompis-runde (7): Wolf, Skins, Nassau, BBB, Nines/Split Sixes, Acey Deucey, Round Robin
- Klubb-turnering (6): Modified Stableford, 4BBB Stableford, Florida Scramble, Ambrose, Shamble (inkl. Champagne), Patsome
- Cup matchplay (5): Foursomes match, Fourball match, Greensome match, Chapman/Pinehurst (bundle), Gruesome match

Hver format-issue følger TDD-disiplinen: scoring-modul + Type A unit-tester først, så seed-migrasjon, så minimum Type C render-test i relevant UI-flate.

**Per-issue kontrakt** via `/forge:contract` når vi er klare for å bygge — ikke 22 kontrakter på forhånd.

## Open questions / videre arbeid

- **Default-mapping ved opprett av nytt format:** Når en utvikler lander en ny scoring-modul, hva er default-mapping? Forslag: utvikleren spesifiserer i format-row insert via migration, admin overstyrer etterpå.
- **Mobil-version av matrix:** Hvordan kollapser matrix-view til mobil? Foreslår intent-tabs (én intent vises om gangen). Detaljeres i F3.
- **Wizard step 3+4:** Players + Summary forblir konseptuelt likt som i dag. Eventuelle endringer dekkes i F2 hvis layout-konsekvenser dukker opp.
- **Kompis-runde mode-lock:** Sosiale point-games (Wolf, Skins, Nassau) krever ofte at runden starter umiddelbart — bør de hoppe over schedule-time-feltet i step 2-flyt? Detaljeres i hver format-issue.
