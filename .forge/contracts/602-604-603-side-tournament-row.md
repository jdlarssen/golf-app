# Spec: Sideturnering-raden — vinnernavn, solo-navn og lag-copy (#602 + #604 + #603)

Bundle av tre display-feil i sideturnerings-fanen, alle etterdønninger av #576
(generisk sideturnering på alle poeng-/podium-formater). Samme flate
(`SideTournamentView`), én ren pass. Branch: `claude/kind-beaver-8def20`.

## Problem

Etter at #576 wiret sideturneringen inn på alle formater (inkl. individuelle/solo)
viser den utvidede spiller-/lag-raden tre feil:

- **#602 (bug):** De telle-/sum-baserte INDIVIDUELLE kategoriene rendres med en
  literal `?` i stedet for vinnernavn: «Flest birdier **(?)**: 1p», «Flest eagles+
  **(?)**: 2p», «Flest pars+ **(?)**». Navnet mangler fordi scoring-laget aldri
  setter `winnerUserId` på disse awardene.
- **#604 (design):** I solo-spill (hver spiller = eget «1-manns-lag») vises
  fornavnet to ganger (tittel `Jørgen` + undertittel `Jørgen`), og kallenavnet som
  brukes ellers i appen (`Jørgen "Jørg"`) droppes.
- **#603 (design):** I solo-spill står det «hele laget +5 på hull 7» på snowman, og
  «Slik gis poengene»-panelet lister `Xp lag / Yp individ`-varianter — selv om
  lag-kategoriene aldri kan fyre når alle lag har ett medlem.

## Research Findings

Ingen tredjeparts-bibliotek involvert. Kodebase-funn fra scout (avgjør scope):

- **`*_team`-kategoriene fyrer ALDRI for solo.** Alle lag-aggregerte kategorier
  (`best_brutto_*_team`, `king_par*_team`, `most_*_team`, `team_all_birdied_bonus`,
  `team_no_bogey_hole_coord`) er gardet av `userIds.length >= 2` i
  `lib/scoring/sideTournament.ts` (linjene 521/572/621/670/715/760/811/860/1161/
  1223/1274, samt `n < 2`-guards for de to coord-bonusene ~1565/1597). **Ingen
  dobbel-telling i solo, ingen scoring-bug.** → #603 er rent kosmetisk.
- **Snowman har ingen lag-størrelse-guard** (sideTournament.ts ~1126–1152, bevisst:
  «solo players get a snowman»). Det er den ENESTE lag-flavored awarden som faktisk
  fyrer for et 1-manns-lag → derav «hele laget»-copyen i solo.
- **#602-rotårsak:** 11 individuelle award-konstruksjoner har vinnerens `userId` i
  scope (i en `for (const userId of winners)` / `for (const w of winners)`-løkke)
  men passerer den ikke i award-objektet. De som fungerer (`turkey`, `solid`,
  `comeback_kid`, `hardest_hole_winner`, `worst_single_hole_brutto`,
  `most_double_bogeys_individual`, `clean_front_9`/`clean_back_9`,
  `all_par_groups_birdie`, `even_par_round`, `back_to_back_birdies`) setter
  `winnerUserId: userId`/`w.userId`. Fixen er mekanisk: legg til samme felt på de 11.
- **`SideTournamentView.tsx` finnes ingen test for** (kun
  `MatchplaySideTournamentSection.test.tsx`). Én ny Type C render-test er innenfor
  test-disiplinen («maks én render-test per komponent»).
- `winnerName(award)` → `firstNameOf(award.winnerUserId, teamById)` slår opp i
  `teams[].members[].userId`. For solo har hvert lag ett medlem = spilleren, så
  `winnerUserId` resolver alltid. For ekte lag er vinneren et medlem av laget.
- `messages/catalogParity.test.ts` håndhever at `no.json` og `en.json` har identiske
  nøkkel-sett → nye nøkler MÅ inn i begge.

## Prior Decisions (videreført)

- **#169/#576:** `calculateSideTournament` er ren funksjon; `*_team`-kategorier
  filtreres bort for lag med `userIds.length < 2`. **Ikke rør denne semantikken** —
  den er nettopp grunnen til at #603 er kosmetisk.
- **#576 solo-grouping:** solo = team-of-1 med `label: firstName(name) ?? name`,
  `userIds: [uid]` (page.tsx ~1494). Det er kilden til #604-dubletten.
- **Side tournament `position` = slot, ikke rank** — urørt.
- **Matchplay-familien** har bevisst ingen sideturnering/podium — utenfor scope.
- **CHANGELOG: patch-bugfix kan nestes under åpen tema-serie** (eier 2026-06-06).

## Design

### Del 1 — #602: `winnerUserId` på de 11 individuelle kategoriene (scoring, TDD)

I `lib/scoring/sideTournament.ts`, legg `winnerUserId: userId` (eller `w.userId` der
løkkevariabelen heter `w`) på award-objektet for disse 11 kategoriene — `userId`/
`w.userId` er allerede i scope ved `award(...)`-kallet:

| Kategori | ca. linje | løkkevariabel |
|---|---|---|
| `most_birdies_individual` | 557 | `userId` |
| `most_eagles_individual` | 606 | `userId` |
| `most_pars_individual` | 655 | `userId` |
| `best_brutto_18_individual` | 700 | `userId` |
| `best_brutto_f9_individual` | ~745 | `userId` |
| `best_brutto_b9_individual` | ~790 | `userId` |
| `king_par3_individual` | 843 | `userId` |
| `king_par5_individual` | ~889 | `userId` |
| `king_par4_individual` | ~1303 | `userId` |
| `most_albatrosses_individual` | 1195 | `userId` |
| `most_hole_in_ones_individual` | 1257 | `userId` |

**TDD (mandatory — `lib/scoring/` rør ikke uten ny test først):** Skriv test FØRST
i `lib/scoring/sideTournament.test.ts` som feiler mot dagens kode, så fix. Test-form:
for hver av de 11 kategoriene, kjør et minimalt scenario der kategorien fyrer for en
kjent spiller, og assert at den emitterte awarden har `winnerUserId` lik den
spillerens `userId` (ikke `undefined`/`null`). `it.each` over de 11 hvis et felles
scenario kan trigge flere; ellers små dedikerte cases. Ved uavgjort (flere lag med
samme maks) får hvert lag sin egen award med DET lagets representant-`userId` — det
er korrekt og skal også dekkes av minst én assertion.

Ingen poeng-/totalsum-endring — kun `winnerUserId`-feltet tilføyes. Eksisterende
tester skal forbli grønne.

### Del 2 — #604: solo-rad viser kallenavn-form én gang (view)

I `SideTournamentView.tsx`, summary-headeren (~L184–195): når laget har nøyaktig ett
medlem (`team.members.length === 1`), vis `team.members[0].displayName`
(kallenavn-formen, f.eks. `Jørgen "Jørg"`) som tittel-linja og DROP
member-undertittelen. For ekte lag (2+): behold dagens `label` + `memberNames`.

`displayName` finnes allerede på hvert medlem (bygges i page.tsx ~786/1560 via
`formatRevealName`) men er i dag «kept for future surfaces» og ubrukt — nå brukes den.

### Del 3 — #603: full opprydding av lag-copy i solo (view + i18n)

Avled `const isIndividual = teams.length > 0 && teams.every((t) => t.members.length === 1)`
i `SideTournamentView`. (Dekker fullt solo-spill; et blandet spill med ett odde
1-manns-lag gir `false`, som er riktig.)

**a) Snowman-copy.** Snowman-raden (~L913–938) bruker `snowmanDetail` /
`snowmanDetailHole` («hele laget +{delta} på hull {hole}»). Når den eiende radens lag
er solo (medlem-antall 1, praktisk = `isIndividual`), bruk individuelle varianter
(uten «hele laget»). Snowman-regelteksten (`achievementRules.snowman` i raden og
`panel.rules.snowman` i panelet, «hele lagets brutto ≥ par+5») får tilsvarende
solo-variant.

**b) Rules-panel.** Send `isIndividual` til `ScoringRulesPanel`. I fragment-filteret
(~L1194–1200): når `isIndividual`, dropp lag-variant-ids — alle som ender på `_team`
+ `team_all_birdied_bonus` + `team_no_bogey_hole_coord`. Dual-rader (f.eks. «Most
birdies: 2p lag / 1p individ») viser da kun individ-fragmentet; rene lag-rader
(team-all-birdied, team-no-bogey) får tomt fragment-sett og skjules av den
eksisterende `if (activeFragments.length === 0) return []`-grenen. Bruk en liten
helper `isTeamOnlyCategory(id)` for lesbarhet.

**i18n (additivt, begge kataloger):** nye solo-varianter — forslag til nøkler
(builder kan justere navn, men MÅ i begge `no.json` + `en.json`):
- `snowmanDetailSolo` — no: «+{delta} på hull {hole}» / en: «+{delta} on hole {hole}»
- `snowmanDetailHoleSolo` — no: «på hull {hole}» / en: «on hole {hole}»
- solo snowman-regel (achievementRules + panel.rules) — no: «din brutto ≥ par+5 på
  samme hull» / en: «your gross ≥ par+5 on the same hole»

Additivt ⇒ ingen endring på eksisterende lag-spill-strenger ⇒ eksisterende snapshot/
render-tester upåvirket. Kjør `humanizer`-skillet på de nye norske strengene før commit.

## Edge Cases & Guardrails

- **Uavgjort i count-kategorier:** hvert tied lag får egen award med eget
  representant-`userId`; dekkes av test. For ett-medlems-lag er det entydig.
- **`winnerUserId` resolver ikke** (id ikke i `teamById`): `winnerName` faller fortsatt
  tilbake til `'?'`. Det skal IKKE skje for de 11 etter fixen siden id-en alltid er
  et medlem av et lag i input — men la fallbacken stå som siste skanse.
- **Blandet spill med odde 1-manns-lag:** `isIndividual` = `false` (andre lag har 2+),
  så panel/snowman beholder lag-copy. Akseptabelt — dette er ikke et solo-format.
- **`displayName` uten kallenavn:** `formatRevealName(name, null)` gir rent navn
  «Karl Jensen» — fortsatt bedre enn dublett. OK.
- **Ingen poeng-endring:** verken #602, #603 eller #604 endrer `totalPoints`/
  standings. Lag-totaler og rangering skal være byte-identiske før/etter. (Kun
  `winnerUserId`-felt + view/copy.)
- **Team-spill urørt:** `best_brutto_18_team` osv. fortsetter å vise sin tie-suffiks;
  ingen `winnerUserId` legges på lag-kategorier.

## Key Decisions

- **#604 → kallenavn-form** (`displayName`): matcher hovedturnerings-leaderboarden.
  (eier, denne sesjonen)
- **#603 → full opprydding**: reword snowman til individuell form + skjul
  lag-variant-poeng og rene lag-rader i panelet for solo. (eier, denne sesjonen)
- **#602 = eneste scoring-endring**; kun additivt `winnerUserId`-felt, TDD-først.
- **i18n additivt** (nye solo-nøkler) — ikke muter eksisterende lag-strenger.

**Claude's Discretion:**
- Eksakte i18n-nøkkelnavn og om snowman-regel-solo deler én nøkkel eller to.
- Hvorvidt snowman-solo-gaten leses fra `isIndividual` eller per-lag medlem-antall
  (begge gir samme resultat i fullt solo-spill; velg det reneste).
- Test-struktur for de 11 (`it.each` vs dedikerte cases) — så lenge hver av de 11
  har en `winnerUserId`-assertion.

## Success Criteria

- [x] **#602:** Alle 11 individuelle count/sum-kategorier emitterer award med
  `winnerUserId` lik vinnerens userId. ✓ `git diff` viser `winnerUserId: userId`
  på 11 award-kall (commit d3453010); test grønn.
- [x] **#602 TDD:** `winnerUserId`-assertions lagt til på de 11 eksisterende
  enkelt-vinner-testene FØR fixen (feilet 11/154), grønne etter. ✓
  `npx vitest run lib/scoring/sideTournament.test.ts` → 154 passed.
- [x] **#604:** Solo-rad rendrer `displayName` én gang uten member-undertittel;
  lag-rad uendret. ✓ `SideTournamentView.test.tsx` solo-test asserter
  `'Jørgen «Jørg»'` + `Jørgen`-count === 1; lag-test asserter `Lag 1` + `Alice · Bjørn`.
- [x] **#603 snowman:** Solo dropper «hele laget» (`Snowman (+5 på hull 7)`);
  lag uendret (`Snowman (hele laget +5 på hull 7)`). ✓ render-test.
- [x] **#603 panel:** Solo skjuler rene lag-rader (`not.toContain('Alle birdied
  (lag-bonus)')`) + solo snowman-regel (`din brutto ≥ par+5`). ✓ render-test.
- [x] **Catalog-paritet:** `npx vitest run messages/catalogParity.test.ts` grønn.
- [x] **Ingen regresjon:** full `npx vitest run` → 3416 passed (269 filer);
  poeng/standings uendret (kun additivt felt + visning).

## Gates

- [x] `npx vitest run lib/scoring/sideTournament.test.ts` grønn (test-først → fix): 154 passed
- [x] `npx vitest run` grønn: 3416 passed (fanget MatchplaySideTournamentSection-følge → fikset)
- [x] `npx tsc --noEmit` rent (exit 0)
- [x] `npm run build` lykkes (exit 0, full rute-tre prerendret)
- [x] `npm run lint` rent på endrede filer (exit 0)
- [x] `humanizer`-skill kjørt på nye norske strenger — rene (speiler godkjente lag-varianter)
- [x] Versjons-bump: 1.127.0 → 1.127.1 (#602) → 1.127.2 (#604+#603) + CHANGELOG under
  åpen 1.127.y-serie; commit-msg-hook passerte begge fix-commits

## Sideeffekt (utenfor opprinnelig scope, men korrekt)

- **Matchplay singles** sideturnering-seksjon (#585) bruker samme `SideTournamentView`
  med lag-av-1. #604-endringen gjør at singles-radene nå viser spillernavn
  (`displayName`) i stedet for «Lag 1»/«Lag 2» — en konsistent forbedring (lag-av-1
  = solo-rad). Fourball/foursomes (lag-av-2) uendret. Søster-test oppdatert
  (commit a9656187).

## Files Likely Touched

- `lib/scoring/sideTournament.ts` — `winnerUserId` på 11 individuelle awards (#602)
- `lib/scoring/sideTournament.test.ts` — nye `winnerUserId`-assertions (test-først, #602)
- `app/[locale]/games/[id]/leaderboard/SideTournamentView.tsx` — solo-header (#604),
  snowman solo-copy + `isIndividual` + panel lag-rad-skjuling (#603)
- `app/[locale]/games/[id]/leaderboard/SideTournamentView.test.tsx` — NY Type C
  render-test (solo-rad + solo-panel + snowman-solo)
- `messages/no.json` + `messages/en.json` — additive solo snowman-nøkler
- `package.json` + `CHANGELOG.md` — patch-bump 1.127.1

## Out of Scope

- **#600 / #601** — BBB-spesifikke (duell+leaderboard-dublett, B1/B2/B3-vokabular):
  andre filer (`BingoBangoBongoView`, `page.tsx`), egen pass.
- **#605** — «Lykke til»-footer på ferdige spill: tverr-format footer-copy, egen pass.
- **#598** — format-view-dedup + død kode: stor refactor, `lib/scoring`-gated.
- **Poeng-/standings-endring** for solo (team-kategorier fyrer allerede ikke — ingen
  grunn til å røre scoring-totaler).
- **Matchplay-familien** (ingen sideturnering by design).
- Atomiske commits per logisk del (test→scoring fix; #604; #603 view; i18n+bump).
