# Spec: Streak-/konsistens-mekanikk for retention (runder på rad / sesong) (#1194)

**Issue:** [#1194](https://github.com/jdlarssen/golf-app/issues/1194) · UX-psykologi: konsistens/Zeigarnik (en påbegynt serie dytter deg til å fortsette) · Retention/sesong (utenfor kjerne opprett→spill→avslutt, driver gjenbruk)
**Type:** `feat` (bruker-synlig) → MINOR-bump + CHANGELOG Funksjoner-rad

## Problem

Appen har ingen streak-/konsistens-mekanikk. Forover-kontinuitet finnes kun som
Revansje-pill (#1020) og liga-runde-vinduer — ingen «X runder på rad», ingen «du har spilt
hver uke denne måneden». Det er en kjent, sterk retention-lever, og den mangler helt.

## Research Findings (verifisert)

- **«Ferdig runde» er alt definert i datamodellen:** deltakelse = `game_players`-rad på et
  spill med `games.status = 'finished'`, `withdrawn_at is null`. Dette er EKSAKT hvordan både
  `admin_key_metrics` teller deltakelse
  ([supabase/migrations/0126_admin_key_metrics.sql:46-54](supabase/migrations/0126_admin_key_metrics.sql))
  og historikk-siden henter runder
  ([profile/historikk/page.tsx:121-127](app/[locale]/profile/historikk/page.tsx)).
- **Effektiv runde-dato finnes:** `effectiveDate(game) = scheduled_tee_off_at ?? ended_at`
  ([profile/historikk/page.tsx:497-501](app/[locale]/profile/historikk/page.tsx)) — samme
  fallback som rundelista, sorteringen og sesong-recap-en. `games` har begge kolonnene
  ([lib/database.types.ts:672,690](lib/database.types.ts)).
- **Sesong = Oslo-kalenderår finnes alt:** `computeSeasonStats`
  ([lib/stats/seasonStats.ts:47](lib/stats/seasonStats.ts)) bøtter på `osloParts(date).year`
  ([profile/historikk/page.tsx:325](app/[locale]/profile/historikk/page.tsx)). **Sesong-telleren
  (c) kan gjenbruke `SeasonSummary.rounds` for inneværende Oslo-år — ingen ny bøtting.** («Season»
  i `lib/league/` er et EGET, urelatert liga-begrep — ikke bland dem.)
- **Oslo-uke-primitiv finnes og er DST-stabil:** `osloIsoWeek(date)`
  ([lib/format/osloCalendar.ts:23](lib/format/osloCalendar.ts)) gir ISO-8601 uke fra
  Oslo-veggklokke uansett host-TZ. `osloParts` gir Oslo y/m/d.
- **Historikk-siden fetcher alt alle ferdige runder + datoer** (`gamesWithStats`,
  `effectiveDate`) — streaken kan avledes on-read der uten et eneste nytt DB-kall.
- **Etter-runde-flaten bor i game-home:** `games/[id]/(home)/page.tsx` har en `finished`-gren
  (`game.status === 'finished'`, [page.tsx:1078](app/[locale]/games/[id]/(home)/page.tsx)) med
  leaderboard-lenker og #1007 «Revansje?»-CTA — den naturlige feirings-flaten når en spiller
  ser en nettopp avsluttet runde.
- **Hjem-header har en chip-plass:** `HandicapChip` rendres i header
  ([app/[locale]/page.tsx:233,270](app/[locale]/page.tsx)) — en streak-chip kan sitte ved siden.
- **Stats-hub-mønsteret (#936/#940/#946/#947):** nye personlige stats = nye seksjoner i
  Statistikk-fanen på `/profile/historikk` (ren Type A-aggregator i `lib/stats/` + presentational
  komponent i `components/stats/`, én Type C-test).

## Prior Decisions

- **Eier (denne økten) — Key Decision:** FULL mekanikk (ikke minimal teller): (a) «runder på
  rad»-momentum, (b) ukentlig konsistens («spilt hver uke i N uker»), (c) sesong-teller, med
  feirings-momenter.
- **HARD guardrail (issuet + merkevaren):** FEIR streaken, ALDRI straff/tru bruddet — ingen
  nedtelling, ingen «du mister streaken!», ingen skam-copy. Brudd = **stille reset**, neste
  runde starter en ny streak positivt. (Grenser mot tap-aversjons-mørkemønsteret #1174.)
- **#946 (SHIPPED) + #947 (SHIPPED):** `SeasonRecapPanel` + `AchievementWall` bor alt i
  Statistikk-fanen. Streaken komponeres ved siden av dem, gjenbruker sesong-tallet, bygger dem
  ikke på nytt.

## Design

**Ny ren aggregator `lib/stats/streak.ts` (Type A):** input er ferdige runders effektive
datoer (allerede filtrert/sortert av kallstedet); output er streak-tilstanden. Ren og I/O-fri
(`lib/scoring/AGENTS.md`-disiplin), Oslo-avledet via `osloIsoWeek`/`osloParts`.

```ts
export type StreakInput = { dates: Date[]; now: Date };
export type StreakSummary = {
  weeklyStreak: number;      // (b) sammenhengende Oslo-ISO-uker med ≥1 runde
  weeklyStreakActive: boolean; // true hvis siste runde er i inneværende ELLER forrige Oslo-uke (grace)
  roundsThisSeason: number;  // (c) ferdige runder i inneværende Oslo-kalenderår
  roundsInStreak: number;    // (a) ferdige runder som faller i det sammenhengende uke-løpet
  lastRoundWeekKey: string | null; // «YYYY-Www» for debugging/tester
};
export function computeStreak(input: StreakInput): StreakSummary;
```

- **(b) Ukentlig streak (headline):** grupper runder på Oslo-ISO-uke-nøkkel (`YYYY-Www` via
  `osloIsoWeek` + ISO-uke-år); tell det lengste sammenhengende løpet av uker som ender i uken
  for den SISTE runden. **Grace for inneværende uke:** streaken brytes ikke fordi denne uka
  ennå er tom — `weeklyStreakActive = true` når siste runde er i inneværende eller forrige
  Oslo-uke. Eldre → `active = false` (stille reset; vis som 0 for «nå», aldri som tap).
- **(c) Sesong-teller:** antall ferdige runder i inneværende Oslo-år (gjenbruk `computeSeasonStats`
  for året, eller tell direkte).
- **(a) «Runder på rad»-momentum:** antall ferdige runder som faller innenfor det sammenhengende
  uke-løpet (b) — leser naturlig som «3 runder på rad» (recent momentum), ikke en degenerert
  «alle runder er per definisjon sammenhengende»-teller.

**Presentational `components/stats/StreakPanel.tsx` (Type C):** props inn (StreakSummary +
i18n-strenger), rendrer de aktive signalene positivt; `tabular-nums`. Ingen tom/negativ-tilstand
med skam — ved 0 aktiv streak vises en nøytral, oppmuntrende linje eller ingenting.

**Flater:**
1. **`/profile/historikk` (Statistikk-fane):** ny «Streak»-seksjon via `StreakPanel`, matet fra
   eksisterende `gamesWithStats.map(effectiveDate)` — ingen nytt DB-kall.
2. **Hjem (`app/[locale]/page.tsx`):** liten chip/linje ved `HandicapChip` — krever et slankt
   server-oppslag (finished `game_players` → datoer) via ny helper `lib/stats/getUserStreak.ts`.
3. **Etter runde (`games/[id]/(home)/page.tsx` finished-gren):** feiring KUN når denne runden
   fikk streaken til å vokse (beregn streak med vs. uten denne runden via `computeStreak`) —
   positiv anerkjennelse, aldri «ikke bryt den»-press.

## Edge Cases & Guardrails (Type A-tabell)

| Case | Forventet |
|---|---|
| Tom historikk | `weeklyStreak 0`, `active false`, `roundsThisSeason 0`, ingen feiring, ingen skam |
| Én runde (denne uka) | `weeklyStreak 1`, `active true`, `roundsInStreak 1` |
| To runder samme uke | teller som ÉN uke (streak 1), `roundsInStreak 2` |
| To runder samme dag | som over — dag-granularitet påvirker ikke uke-tellingen |
| Hull i uker (uke uten runde midt i) | løpet brytes ved hullet; streak = løpet som ender ved siste runde |
| Siste runde forrige uke, denne uka tom | `active true` (grace) — brytes IKKE før uka er over |
| Siste runde eldre enn forrige uke | `active false`, stille reset (vis 0 for «nå», ingen tap-copy) |
| Årsskifte (uke 52 → uke 1) | ISO-uke-nøkkel spenner nyttår; streaken fortsetter på tvers |
| Uke som krysser årsskifte | ISO-uke 52/53/1 telles som én uke uansett kalenderår |
| DST-overgang (mars/oktober) | uke-nøkkel er Oslo-veggklokke via `osloIsoWeek` — DST-uavhengig |
| Flere runder samme dag/uke | idempotent på uke-nivå; `roundsInStreak` teller runder, `weeklyStreak` teller uker |

- **Merkevare-guardrail:** ingen nedtelling, ingen «du mister streaken», ingen negativ ramme.
  Brudd = stille reset. All ny copy er positiv/nøytral (humanizer + sporty kompis-tone).
- **`weeklyStreakActive`** styrer hvorvidt streaken vises som «pågående» — en stale streak
  vises aldri som noe man er i ferd med å tape.

## Key Decisions

- **«Runde» = deltakelse i `status='finished'`-spill, `withdrawn_at is null`** (samme som
  `admin_key_metrics`/historikk); effektiv dato = `scheduled_tee_off_at ?? ended_at`.
- **Streak-granularitet = Oslo-ISO-kalenderuker med ≥1 runde** (ikke ren runde-på-runde-rekke,
  som ville vært degenerert siden runder alltid er «sammenhengende»). Uke-vinduet gir et ekte
  brudd-kriterium (en uke uten runde) og matcher issuets «spilt hver uke i N uker». De tre
  eier-signalene avledes alle fra dette ene uke-løpet + sesong-året.
- **Sesong = Oslo-kalenderår** (gjenbruk `seasonStats`/`osloParts.year`, #946-paritet).
- **Avledet on-read** fra eksisterende `games/scores/game_players` — INGEN ny tabell. Kostnaden
  er triviell på dagens volum (≤hundretalls runder per bruker); materialiser kun ved MÅLT behov.
- **Grace for inneværende uke:** en tom pågående uke bryter aldri streaken (unngår utilsiktet
  straff mid-uke) — kjernen i den positive rammen.

**Claude's Discretion:**
- Eksakt grace-vindu (inneværende + forrige uke anbefalt) og om `active`-terskelen skal være
  «forrige uke» vs. strengere.
- Om (a) «runder på rad» presenteres som `roundsInStreak` eller droppes til fordel for kun (b)+(c)
  hvis det leser klarere — velg det ærligste/minst forvirrende.
- Hjem-chip vs. -linje, og om den kun vises når `weeklyStreakActive`.
- Etter-runde-feiringens form (inline-linje i finished-grenen vs. eget lite kort) og trigger
  (kun streak-vekst vs. også sesong-milepæler).
- All copy (humaniseres) og hvilke signaler som vises i StreakPanel ved 0.

## Success Criteria

- [ ] `lib/stats/streak.ts` `computeStreak` er en ren funksjon som gir korrekt `weeklyStreak`,
      `weeklyStreakActive`, `roundsThisSeason`, `roundsInStreak` for edge-tabellen over.
- [ ] Type A-test dekker hele edge-tabellen (tom / én / to samme uke / hull / grace / stale /
      årsskifte / uke over årsskifte / DST / flere samme dag) — grønn.
- [ ] `/profile/historikk` viser en Streak-seksjon matet fra eksisterende runde-data (ingen
      nytt DB-kall der) — staging-klikkrunde.
- [ ] Hjem viser en streak-chip/linje når en aktiv streak finnes; etter-runde feires KUN når
      runden fikk streaken til å vokse.
- [ ] INGEN nedtelling / tap-aversjon / skam-copy noe sted; brudd = stille reset (review + copy-gate).
- [ ] Maks én Type C-rendertest på `StreakPanel` (aldri norsk copy); ingen re-assert av Type A-tall.
- [ ] Copy i `no.json` + `en.json` (catalogParity grønn), norsk humanizer-kjørt.

## Gates

- [ ] `npx tsc --noEmit` grønn · `npm run lint` grønn · `npm run build` grønn.
- [ ] `npx vitest run lib/stats components/stats` grønn (inkl. uendret `seasonStats.test.ts`).
- [ ] Bruker-synlig → staging-klikkrunde av `/profile/historikk` + hjem + etter-runde før merge.
- [ ] `feat` → MINOR-bump + CHANGELOG Funksjoner-rad; alle commits `Refs #1194`.

## Files Likely Touched

- `lib/stats/streak.ts` (+ `streak.test.ts`) — NY Type A-aggregator + edge-tabell
- `lib/stats/getUserStreak.ts` (+ evt. test) — NY slank server-helper for hjem-chippen
- `components/stats/StreakPanel.tsx` (+ Type C-test) — NY presentational
- `app/[locale]/profile/historikk/page.tsx` — wire StreakPanel (gjenbruk `effectiveDate`-runder)
- `app/[locale]/page.tsx` — hjem-chip/linje
- `app/[locale]/games/[id]/(home)/page.tsx` — etter-runde-feiring (finished-gren, streak-vekst)
- `messages/no.json` + `messages/en.json` — `profile.historikk.streak*` / `home.streak*`
- `package.json` + `CHANGELOG.md`

## Out of Scope (noter grensesnittet — ikke bygg)

- **#946 season recap** (SHIPPED) — streaken GJENBRUKER `seasonStats`-tallet for året, bygger
  ikke recap-en på nytt.
- **#947 achievement wall** (SHIPPED) — en streak-milepæl kan senere bli en badge der; hold det
  ute av denne PR-en.
- Push/varsel om streak, streak-leaderboard (sosial sammenligning), andre spilleres streaks.
- Ny tabell / materialisering / cache (start avledet; materialiser kun ved målt behov).
- Nedtelling, påminnelse-om-å-ikke-bryte, tap-aversjons-copy (#1174) — eksplisitt forbudt.
