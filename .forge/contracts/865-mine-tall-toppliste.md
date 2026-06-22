# Spec: Personlig «Mine tall» på profilen + flytt global tavle til Hjem som «Toppliste» (#865)

**Issue:** [#865](https://github.com/jdlarssen/golf-app/issues/865) · milestone Backlog · `high · M`
**Branch (denne runden):** `claude/amazing-shaw-45539d` (bølge 1, profil-trio)
**Forgjenger-kontrakt:** issue-kommentar på #865 (branch `claude/infallible-meitner-d1f04b`) — research båret videre, men re-validert mot live kode (2026-06-23).

## Problem
Raden «Klubbstatistikker» ligger inne på golferens **egen** profil, men åpner en **global** toppliste over alle spillere — ikke spillerens egne tall. Ingen steder på profilen ser golferen sitt eget snitt, antall runder, beste runde eller bragder. Det er det tydeligste forventningsbruddet på flaten, og treffer rett i slutten av kjernesløyfa (spill → ferdig → reflekter → spill igjen).

Eier-beslutninger (denne sesjonen, 2026-06-23):
1. **Flytt** den globale tavla bort fra profilen, døp den om til **«Toppliste»**, med inngang på **Hjem (/)** — KUN i fylt Hjem-tilstand (en fersk bruker uten spill får ren velkomst-hero).
2. Bygg ekte personlig **«Mine tall»** på profilen: tre tall (runder spilt, brutto-snitt, **beste runde = laveste brutto-score**) + **bragder nå** (brutto, fullt sett).
3. Når Toppliste-inngangen legges på Hjem, **kompakter** de avsluttede spillene (`slice(0,5)` → `slice(0,3)`) så Hjem ikke blir scroll-tung.

## Research Findings (re-validert mot live kode 2026-06-23)
- **#887 er shippet/CLOSED.** `lib/stats/clubStats.ts` (`isWinningSummary`, `aggregateFinishedGame`, `tallyClubStats`) finnes på main, og `statistikk/page.tsx` leser nå `result_summary` per modus via `unstable_cache` (revalidate 300) + admin-client. Tredjeperson-undertitlene har landet (`no.json:299/302`). **«Mine tall» trenger IKKE clubStats/result_summary** — beste runde er laveste **brutto**-score (eier-valg), ikke et modus-resultat. clubStats forblir Topplistens domene.
- **`game_players.tee_gender` finnes** (enum `mens|ladies|juniors`, `ScoringGender`) og brukes allerede til par-valg i alle context-byggere (`buildSoloStrokeplayContext.ts:16,77`). Birdie/eagle/snowman MÅ regnes mot riktig kjønns-par.
- **Gjenbrukbare query-fragmenter (#815):** `lib/supabase/queryFragments.ts` har `COURSE_HOLES_SELECT` (`hole_number, par_mens, par_ladies, par_juniors, stroke_index`), `SCORES_SELECT` (`user_id, hole_number, strokes`), + `CourseHoleRow`/`ScoreRow`. Bruk disse, ikke ny copy-paste-projeksjon.
- **`cacheComponents` (Next 16.2, stabil):** request-scoped data strømmer bak shell-en i en Suspense-grense. Profilsiden bruker mønsteret per seksjon (`ProfileFormCard`, `InviteAFriendCard`, `GenderSoftPrompt`). «Mine tall» følger samme — Suspense-wrappet, ucachet, request-scoped (RLS gjelder).
- **Side-turnerings-Turkey er IKKE gjenbrukbar:** `lib/scoring/sideTournament.ts` definerer Turkey som en **netto**-streak vevd sammen med lag/config. Profil-bragder er **brutto** og universelle → egen ren modul fra bunnen (TDD).

## Prior Decisions (carry-forward)
- **#869 (ubunden club-scale-fetch) er ALLEREDE fikset** (PR #888). Perf-argumentet for å flytte tavla er borte — flyttet er ren IA. **Ikke rør cache-laget på Toppliste-siden.**
- **«Én dør per rom» ([[feedback_one_door_per_room]]):** Toppliste-inngangen legges KUN på Hjem (fylt tilstand). Profil-raden fjernes helt. Ingen duplikat i Klubbhuset.
- **#866 (historikk netto + format) og #870 (venn-dører)** er egne issues i samme bølge — ikke dra inn her. **Netto holdes utenfor «Mine tall»** (#866 eier netto).
- **Drift:** profilens innstillinger er nå gruppert i merkede seksjoner (Sosialt / Aktivitet / App / Konto). `statistikkRow` ligger under **«Aktivitet»** (`profile/page.tsx:149-152`) sammen med «Min historikk» — det er DENNE raden som fjernes. `no.json` har fortsatt `statistikkRow: "Klubbstatistikker"`.

## Design

### Del 1 — Flytt + døp om global tavle → «Toppliste» på Hjem
- **Behold siden på `/profile/statistikk`** (ingen URL-flytt → ingen døde lenker). Endre kun chrome + inngang i `app/[locale]/profile/statistikk/page.tsx`:
  - `heading` «Klubbstatistikker» → **«Toppliste»**; `kicker` → «Toppliste».
  - `backHref` `/profile` → **`/`**; `backLabel` «Tilbake til profil» → «Tilbake til hjem». (begge steder: `StatistikkPage` + `EmptyStateView`).
  - Subtitle, vinner-/aktiv-seksjoner, empty-state og **hele cache-laget = uendret**.
- **Fjern** `<SettingRow href="/profile/statistikk" .../>` fra profilens «Aktivitet»-`SettingList` (`profile/page.tsx:151`). «Min historikk» blir da alene i seksjonen — greit.
- **Legg til inngang på Hjem** (`app/[locale]/page.tsx`), **kun i den fylte tilstanden** (ikke empty-state-hero-grenen): en `Section label={t('sectionToppliste')}` med ett `Card`-`SmartLink` til `/profile/statistikk`, samme kort-mønster som «Finn turneringer»-fallback-kortet (`page.tsx:431-445`). Plasser den i den fylte `<div className="space-y-6">`-stacken — Claude's discretion på nøyaktig rekkefølge, men naturlig: etter oppdag-seksjonen, ved/over de avsluttede.

### Del 2 — Kompakter avsluttede spill på Hjem
I `finishedGames`-grenen (`page.tsx:448-471`): `slice(0, 5)` → **`slice(0, 3)`**, og «Se alle»-betingelsen `finishedGames.length > 5` → **`> 3`**. Oppdater kode-kommentaren («Vis de siste 5» → «de siste 3»). Netto-effekt: 3 kompakte avsluttet-kort + 1 Toppliste-lenkekort = mindre scroll enn dagens opptil 5 fulle kort.

### Del 3 — «Mine tall»-kort på profilen (3 nøkkeltall)
Nytt Suspense-wrappet kort i `profile/page.tsx`, **mellom `ProfileFormCard` og `InviteAFriendCard`** (`page.tsx:118-124`). Tre stat-fliser (`tabular-nums`):
- **Runder spilt** — antall ferdige spill spilleren er deltaker i (paritet med `/profile/historikk` `finishedCount` — filtrerer IKKE trukket, for å unngå «historikk sier 12, Mine tall sier 11»).
- **Brutto-snitt** — gjennomsnittlig total brutto over **komplette 18-hulls-runder** (18 ikke-null slag), avrundet til heltall. «–» hvis ingen komplett runde.
- **Beste runde** — **laveste** total brutto over komplette 18-hulls-runder. «–» hvis ingen.
- **Empty-state** (0 ferdige runder): vennlig «Spill din første runde, så dukker tallene dine opp her.» istedenfor 0/–/–.
- **Header-ekko (Claude's discretion):** «· {N} runder spilt» ved siden av hcp i avatar-kortet (`page.tsx:283-294`) — KUN hvis det kan mates fra den delte `cache()`-henten uten å forsinke header-kortets paint. Hvis det treger, dropp ekkoet; «Mine tall»-kortet er kanonisk hjem.

### Del 4 — Bragder (brutto, fullt sett)
Kompakt stripe i samme «Mine tall»-kort, under tallene. Livstids-antall fra spillerens egne **brutto**-scorer over alle ferdige runder. Fem bragder:
| Bragd | Predikat (brutto, par = kjønns-par for hullet) |
|---|---|
| **Hole-in-one** | `strokes === 1` |
| **Eagle** | `par - strokes >= 2` (eagle eller bedre; inkl. albatross + HiO på par ≥ 3) |
| **Birdie** | `par - strokes === 1` |
| **Turkey** | ikke-overlappende vindu av 3 sammenhengende hull (stigende hull-nr i samme spill) som hver er birdie-eller-bedre (`par - strokes >= 1`). Null-slag/manglende hull bryter rekka. |
| **Snowman** | `strokes === 8` på et hull |

Stripe viser ikon/etikett + antall per bragd. **Bragder med 0** dempes eller skjules (Claude's discretion); vis alltid minst de spilleren har ≥1 av. Aldri en tom stripe ved 0 runder (da gjelder kortets empty-state).

### Datahenting (én kombinert, request-scoped, RLS-trygg, Suspense)
Én `cache()`-wrappet henter (React per-request dedup → header-ekko + kort deler ett round-trip):
1. `game_players` (egne, ferdige): `game_id, tee_gender` + `games!inner(id, course_id, status='finished')`.
2. `course_holes` (`COURSE_HOLES_SELECT`) for de aktuelle `course_id`-ene.
3. `scores` (egne): `game_id, hole_number, strokes` for de spillene (filtrer `user_id = meg`).

Bruk **request-scoped cookie-client** (`getServerClient`) — RLS dekker «egne scores» + «alle finished-scores» + `course_holes`-lese. **Ingen admin-client, ingen `unstable_cache`** (per-bruker data; følger `historikk`-mønsteret). Ved kallstedet: velg riktig par per hull per `tee_gender` (`par_mens`/`par_ladies`/`par_juniors`, fallback `par_mens`) FØR det sendes inn i den rene modulen.

### Ren logikk (TDD — Type A)
Ny `lib/stats/playerStats.ts` (+ `.test.ts`), søsken av `clubStats.ts`. Pure, ingen I/O:
```ts
type HoleScore = { holeNumber: number; strokes: number | null; par: number };
type RoundInput = { holes: HoleScore[] };           // par allerede kjønns-valgt
type Achievements = { holeInOne: number; eagle: number; birdie: number; turkey: number; snowman: number };
type MyStats = { roundsPlayed: number; grossAverage: number | null; bestRound: number | null; achievements: Achievements };
export function computePlayerStats(rounds: RoundInput[]): MyStats;
```
Følg `lib/scoring/AGENTS.md`: test-som-feiler-først, `it.each` for predikat-matrisen, direkte assertions (ingen snapshot), aldri mock internt.

## Edge Cases & Guardrails
- **Null-slag (uspilt hull):** ekskluder fra alle predikater; bryter Turkey-rekka.
- **Ufullstendig runde:** individ-hull-bragder teller likevel (en birdie er en birdie). Brutto-snitt/beste-runde teller KUN komplette 18-hulls-runder.
- **9-hulls-baner/-runder:** birdie/eagle/HiO/snowman/turkey teller (par-relative). Brutto-snitt + beste-runde gjør IKKE (komplett-18-kravet) — bevisst, for ikke å blande 9- og 18-snitt. Dokumentér i kode-kommentar.
- **Par mangler/0:** guard — hopp over hull med ugyldig par i predikater.
- **Withdrawn:** «runder spilt» speiler `/profile/historikk` (filtrerer ikke trukket). Dokumentér.
- **Tomt felt:** 0 ferdige runder → kortets empty-state, ingen krasj. Toppliste beholder sin egen empty-state.
- **RLS:** ingen ny policy. Ren lese-flate. Verifiser at request-scoped client kun returnerer egne scores + finished-scores.
- **Tall:** alltid `tabular-nums`.

## Key Decisions
- **Beste runde = laveste brutto-score** (eier-valg) — naturlig makker til brutto-snitt, ett sammenlignbart tall, handicap-uavhengig. IKKE modus-resultat (det overlapper «Flest spill vunnet» på Toppliste og gir ikke ett score-tall). Sidesteg netto-feilen siden det er rent brutto.
- **Toppliste-inngang på Hjem KUN i fylt tilstand** (eier-valg) — fersk bruker uten spill får ren velkomst-hero; støtter scroll-bekymringen. Lett å flippe til «alltid» senere.
- **Kompakter avsluttede 5→3 på Hjem** (eier-valg) — motvirker høyden Toppliste-kortet legger til.
- **Flytt + døp om, behold URL** — ingen redirect/døde-lenker.
- **Brutto, ikke netto** — bragder + snitt er brutto, universelt. Netto er #866.
- **Fullt bragd-sett (5)** — eier valgte fullt sett over minimal.
- **Komplett-18 for snitt/beste** — ærlig, apples-to-apples.

**Claude's Discretion:**
- Header-ekko av «runder spilt» (kun hvis gratis via delt `cache()`).
- Skjul vs. demp 0-bragder.
- Ett «Mine tall»-kort med tall + bragd-underseksjon (hold til ÉTT kort).
- Om `MyStats`-renderen ekstraheres til presentasjons-komponent for én Type-C render-test, eller holdes inline. **Maks én** render-test.
- Eksakt plassering av Toppliste-`Section` i den fylte Hjem-stacken.
- Eksakt copy (kjøres gjennom humanizer-mønstre før commit).

## Success Criteria
- [ ] Profilen har INGEN «Klubbstatistikker»-rad; Hjem (fylt tilstand) har en «Toppliste»-inngang som åpner tavla. (`grep -n statistikk app/[locale]/profile/page.tsx` → 0 i `SettingList`; staging-observasjon)
- [ ] Toppliste-siden viser heading «Toppliste», kicker «Toppliste», og `backHref="/"` (begge i `StatistikkPage` + `EmptyStateView`).
- [ ] Hjem viser maks 3 avsluttede kort med «Se alle»→`/spill-arkiv` når >3. (`page.tsx` + staging)
- [ ] Profilen viser «Mine tall» med runder spilt + brutto-snitt + beste runde (laveste brutto), vennlig empty-state ved 0 runder. (staging-klikkrunde)
- [ ] Bragd-stripa viser de fem brutto-bragdene med livstids-antall. (staging-klikkrunde)
- [ ] `lib/stats/playerStats.ts` har unit-tester for hvert bragd-predikat + brutto-snitt + beste-runde + edge-cases (null-slag, ufullstendig runde, 9-hull, Turkey-vindu-grenser, par per kjønn). (`npx vitest run lib/stats`)
- [ ] Ingen ny RLS/admin-client; data via request-scoped cookie-client. (kode-lesning)
- [ ] Versjon MINOR-bumpet + CHANGELOG-oppføring i samme commit som feature-en.

## Gates
- [ ] `npx tsc --noEmit` passerer
- [ ] `npm run lint` passerer (endrede filer)
- [ ] `npx vitest run lib/stats app/[locale]/profile` passerer
- [ ] `npm run e2e:gate` (3-flyt-smoke mot staging; berører Hjem + profil) — hvis tilgjengelig i sesjonen
- [ ] humanizer-mønstre (docs/copy-style.md) anvendt på alle nye/endrede norske strenger før commit
- [ ] Staging-klikkrunde: `/profile` (Mine tall + bragder), Hjem (Toppliste-inngang + 3 avsluttede), `/profile/statistikk` (heading + back-til-hjem)

## Files Likely Touched
- `lib/stats/playerStats.ts` (NY) + `lib/stats/playerStats.test.ts` (NY) — ren aggregering + bragd-deteksjon, TDD.
- `app/[locale]/profile/page.tsx` — fjern statistikk-`SettingRow`; legg til Suspense-wrappet «Mine tall»-kort (+ skeleton); henter-helper (`cache()`); evt. header-ekko.
- `app/[locale]/profile/statistikk/page.tsx` — heading/kicker → «Toppliste», `backHref`→`/`, `backLabel`→hjem (begge funksjoner).
- `app/[locale]/page.tsx` — Toppliste-`Section`-inngang (fylt tilstand); kompakter avsluttede 5→3.
- `messages/no.json` + `messages/en.json` — fjern `profile.statistikkRow`; rename `profile.statistikk.{heading,kicker,backLabel}`; legg til `home.{sectionToppliste,topplisteCard}` + `profile.myStats.*` (heading, tre tall-etiketter/enheter, fem bragd-etiketter, empty-state, evt. header-ekko). no/en-paritet.
- `package.json` + `CHANGELOG.md` — MINOR bump (neste ledige; forvent kollisjon med parallell #864-branch, løses ved merge) + oppføring.

## Out of Scope
- **URL-flytt av tavla** til f.eks. `/toppliste` (beholder `/profile/statistikk`).
- **Netto** i «Mine tall»/historikk → #866.
- **Side-turnerings-baserte bragder** (netto, sparsomt).
- **Brutto-snitt/beste for 9-hulls-runder** (komplett-18 only).
- **«Seire»/vinst-antall i «Mine tall»** (deferred idé; finnes på Toppliste).
- **Toppliste-inngang i empty-state-hero / Klubbhuset** (én dør, fylt-tilstand-valg).
- **#870 (venn-dører), #871 (a11y), #873 (copy)** — egne issues.
