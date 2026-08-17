# Spec: CHANGELOG som ukeblokker — «## Ukeslipp» med én blokk per slipp, historikk foldet under «Før ukeslippene»

**Issue:** #1702 · **Branch:** `claude/1702-changelog-ukeslipp` · **Lagre denne fila som** `.forge/contracts/1702-changelog-ukeslipp.md` på branchen (første commit).

Eierbeslutning 2026-08-17 (drodlet ferdig, ingen produktvalg igjen — alle valg under er tatt og
begrunnet). Bygges av Opus-agent uten videre avklaring; uklarheter løses etter
`ASSUMPTION:`-linjene her, ikke ved å spørre. Kontrakt-linjenumre er mot HEAD `ec0d6104`
(= origin/main 2026-08-17 kveld) — grep før du redigerer.

## Problem

Ukesrutinen (#1562, `scripts/weekly-release.mjs`) folder alle ukas notater til ÉN versjon, men
CHANGELOG-formatet ble laget for «én versjon = én endring». Første reelle slipp (v1.233.0, PR
#1699) ga:

- `## Funksjoner`: fire `<details>`-rader på rad med `<summary><strong>1.233 · Tittel</strong>` —
  prefikset stammer, og eldre rader (1.232, 1.231 …) leses fortsatt som «én versjon = én
  funksjon» → to logikker i samme liste.
- `## Feilrettinger` → august-skuffen: 70 av 111 linjer med identisk `` `1.233.0` ``-badge.
  Badge-kolonnen (som før skilte patcher) er nå støy, og «alt dette kom samme mandag» står
  ingen steder.
- Header-kommentaren i CHANGELOG (:1–5), intro (:11), `docs/changelog-conventions.md`,
  CLAUDE.md:230 og PR-body-malen i `.github/scripts/ukesversjon.sh:147–150` sier fortsatt «én
  linje per utgivelse» / «Funksjon-rader øverst i ## Funksjoner».

Ingen kode leser versjonen ut av CHANGELOG (footeren leser `NEXT_PUBLIC_APP_VERSION`,
produktnytt-banneret leser varsler, publish_lansering leser tavle-kommentaren) — endringen er
rendering i skriptet + engangsflytt av fila + docs. Utroperen (`docs/loops/utroperen.md`) leser
CHANGELOG **ordrett** som LLM-routine og må få oppdaterte felt-løftingsregler.

## Design (valgt: én blokk per uke)

### Målform for CHANGELOG.md

```
<!-- (ny header-kommentar, se «Engangsflytt» steg 1) -->

# Changelog

Alle bruker-synlige endringer i Tørny. Versjonering følger [Semantic Versioning](https://semver.org/lang/no/).

Ett **ukeslipp** per mandag med innhold: nyeste øverst, funksjonene som rader du kan brette ut, rettingene samlet i én skuff under. Alt fra før ukeslippene (1.0–1.232) og alfa-historikken ligger foldet nederst.

---

## Ukeslipp

### 1.233.0 · mandag 17. august 2026

<details>
<summary><strong>Hele scoreskalaen i spesifikk score</strong></summary>

[#1354](https://github.com/jdlarssen/golf-app/issues/1354) — Trykk ⋯ på et hull, …

↳ /demo · «Prøv i demoen»
</details>

<details>
<summary><strong>Beskjed når kortet ditt åpnes igjen</strong></summary>
…
</details>

<details>
<summary>70 rettinger</summary>

- [#1352](https://github.com/jdlarssen/golf-app/issues/1352) — Hull-stripa viser nå …
- [#1353](https://github.com/jdlarssen/golf-app/issues/1353) — Hull-velgeren øverst …
…
</details>

## Før ukeslippene (1.0 – 1.232)

<details>
<summary><strong>Versjon per endring — 1.0 til 1.232</strong></summary>

### Funksjoner

<details>
<summary><strong>1.232 · Hvorfor Tørny?</strong></summary>
…(dagens rader, urørt)…
</details>

### Feilrettinger

<details>
<summary><strong>August 2026 · 41 rettinger</strong></summary>
…(dagens linjer minus de 70 flyttede, urørt ellers)…
</details>
…(alle eldre måneds-skuffer urørt)…

</details>

## Før 1.0 — alfa-historikk
…(urørt)…
```

Regler for **ukeblokken** (én per kjøring av ukesrutinen):

- Overskrift `### <X.Y.Z> · <ukelabel>` med **full versjon** (matcher footerens `v1.233.0`;
  patch-uker blir `1.233.1`). `ukelabel` = kjøringens dato i Oslo-tid, norsk langform:
  `new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date)`
  → `mandag 17. august 2026` (verifisert på Node 22 lokalt). Ingen «uke NN» i overskriften
  (eiervalg A) — ukenummeret bor i PR-tittelen som i dag.
- Så alle `feat`-notater som funksjonsrader (samme rekkefølge som i dag: filnavn-sortert), hver
  som `<details><summary><strong>{title}</strong></summary>` + tom linje + `[#N](…) — {body}`
  (+ tom linje + `↳ {link} · «{cta}»` når `link` finnes) + `</details>` — **uten versjonsprefiks**.
  De fire lanseringsfeltene er dermed urørt.
- Så, hvis uka har `fix`/`perf`-notater, ÉN skuff: `<details>` + `<summary>{N} retting(er)</summary>`
  (**uten** `<strong>` — bevisst annen form enn funksjonsradene, så Utroperen og øyet skiller dem)
  + tom linje + én linje per notat `- [#N](…) — {body}` (issue-løs: `- {body}`) + `</details>`.
  Filnavn-sortert som i dag.
- Tom linje mellom hver `<details>`-blokk og etter siste; blokken settes inn rett under
  `## Ukeslipp` + tom linje (dvs. på `at + 2`, som features gjør i dag), så nyeste uke står
  øverst. Uke med bare funksjoner = overskrift + rader; bare rettinger = overskrift + skuff;
  tom uke = ingen blokk (som i dag: `planRelease` returnerer null).
- Måneds-skuffene og «samme måned → øk telleren»-logikken forsvinner helt.

`ASSUMPTION:` overskriftsnivå `###` under ett fast anker `## Ukeslipp` (ikke `## <versjon>` per
uke) — skriptet trenger ett unikt anker å sette inn under, og GitHubs outline blir «Ukeslipp →
uke → uke» i stedet for 52 toppnivå-overskrifter i året.
`ASSUMPTION:` `Før ukeslippene`-folden demoterer de gamle seksjonene til `### Funksjoner` /
`### Feilrettinger` så toppnivået i fila er `Ukeslipp / Før ukeslippene / Før 1.0` — ingen
`## Funksjoner`/`## Feilrettinger` finnes etterpå (skriptet skal heller ikke lete etter dem).

### Skriptet — `scripts/weekly-release.mjs` (481 linjer)

- **Fjern:** `MONTHS_NB` (:44–57), `DRAWER_SUMMARY` (:61), `FEATURES_HEADING`/`FIXES_HEADING`
  (:59–60), `monthLabel` (:221–229), `drawerSummary` (:257–259), `fixEdit` (:271–293).
- **Ny konstant** `WEEK_HEADING = '## Ukeslipp'`; **ny eksport** `weekLabel(date)` (Intl som over;
  Oslo-tid — Actions og Vercel kjører UTC, samme grunn som `monthLabel` hadde).
- `renderFeatureBlock(note)` — dropp `featureVersion`-parameteren og prefikset i summary.
- `renderFixLine(note)` — dropp `version`; `- [#N](…) — body` / `- body`.
- **Ny eksport** `renderWeekBlock({ version, notes, now })` → string: overskrift, tom linje,
  funksjonsradene, evt. rettinger-skuff, per reglene over. Ren funksjon, Type A-testbar.
- `applyToChangelog(changelog, { version, notes, now })`: finn `## Ukeslipp` med
  `headingIndex` (behold dens «nøyaktig én + tom linje under»-fail-closed), **fail-closed** i
  tillegg hvis en linje `^### ${version} · ` allerede finnes (samme versjon skal aldri få to
  blokker — kan bare skje ved manuell klussing, men I3), og returnér ÉN edit
  `{ line: at + 2, removed: [], added: [...renderWeekBlock(...).split('\n'), ''] }`. `edits`-arrayet
  består (renderDiff/`--dry-run` er uendret).
- `planRelease`, `main`, `writeSummary`, summary-json-feltene, `npm version`-porten,
  notat-sletting: **uendret**. `describe(plan)` uendret.
- Header-kommentaren øverst i skriptet (:1–15) og JSDoc-ene som nevner måneds-skuff/Funksjoner
  oppdateres til ukeblokk-språk.

### Tester — `scripts/weekly-release.test.mjs` (418 linjer, vitest, Type A)

- `monthLabel`-describen (:192–202) → `weekLabel`: norsk langform i Oslo-tid; Oslo-dato rundt
  midnatt (`2026-08-16T22:30:00Z` → `mandag 17. august 2026`).
- `renderFeatureBlock` (:204–236): forventet summary uten versjon; `↳`-droppen består.
- `renderFixLine` (:238–257): uten badge; komma-liste av issues; issue-løs.
- Ny `describe('renderWeekBlock')`: (a) uke med 2 feat + 2 fix → overskrift, to rader, skuff
  «2 rettinger» — assert hele blokken med én `toBe`/snapshot-streng, ikke 6 `toContain`;
  (b) bare feat → ingen skuff; (c) bare fix → overskrift + skuff «1 retting» (entall);
  (d) issue-løs retting → linje uten lenke.
- `applyToChangelog` (:259–363): skriv om `FIXTURE_CHANGELOG` til målformen (et `## Ukeslipp`
  med én eksisterende blokk `### 1.232.0 · mandag 10. august 2026`, så `## Før ukeslippene …`).
  Cases: ny blokk havner ØVERST under ankeret og den gamle blokken står urørt; kun ÉN edit;
  fail-closed uten `## Ukeslipp`; fail-closed når `### <version> ·` alt finnes; «touches only»
  → alt utenom innsettingspunktet er byte-identisk (behold mønsteret fra :336–347).
- `readNotes`, `parseNote`, `chooseBump`, `nextVersion`: urørt.
- Kjør `npx vitest run scripts/weekly-release.test.mjs` grønt, og
  `node scripts/weekly-release.mjs --dry-run` mot den flyttede CHANGELOG-en med ett midlertidig
  test-notat i `.changes/` (slett notatet før commit) — diffen skal vise én ny ukeblokk rett
  under `## Ukeslipp`. Skriv `EXPECT:` før begge (I8).

### Engangsflytt av CHANGELOG.md (i samme PR, egen commit)

Gjøres med et engangsskript i scratchpad (IKKE committet) med tellinger som port; resultatet
(den nye CHANGELOG.md) committes. Nåværende anker: `## Funksjoner` = :15, `## Feilrettinger`
= :1509 (august-skuff `<summary><strong>August 2026 · 111 rettinger</strong></summary>` = :1512),
`## Før 1.0 — alfa-historikk` = :2013. Tell FØR du starter: nøyaktig **4** linjer matcher
`^<summary><strong>1\.233 · ` og **70** linjer matcher ``^- `1\.233\.0` `` (verifisert 2026-08-17).

1. Header-kommentar :1–5 → ny tekst: «Format: les docs/changelog-conventions.md FØR ny
   oppføring. Ett ukeslipp per blokk under ## Ukeslipp — funksjonsrader (tittel + brødtekst +
   lenke + cta_label, klar for Lanseringer) og én rettinger-skuff. Skrives av
   scripts/weekly-release.mjs; ikke rediger for hånd utenom rettelser i tekst.»
2. Intro :11 → avsnittet i «Målform» over.
3. Bygg ukeblokken `### 1.233.0 · mandag 17. august 2026` av (a) de 4 funksjonsradene med
   `1.233 · ` strippet fra summary — ellers byte-identiske, i samme rekkefølge; (b) de 70
   fix-linjene med ``- `1.233.0` · `` → `- ` (badgen + skilletegnet bort, ellers uendret), i
   samme rekkefølge, i en skuff `<summary>70 rettinger</summary>`.
4. Erstatt alt fra `## Funksjoner` (:15) til linja før `## Før 1.0` (:2013) med:
   `## Ukeslipp` · tom · ukeblokken · tom · `## Før ukeslippene (1.0 – 1.232)` · tom ·
   `<details>` · `<summary><strong>Versjon per endring — 1.0 til 1.232</strong></summary>` · tom ·
   `### Funksjoner` · tom · (de gjenværende funksjonsradene, urørt) · `### Feilrettinger` · tom ·
   (måneds-skuffene, urørt, MEN august-skuffens teller `111` → `41`) · tom · `</details>` · tom.
5. `## Før 1.0 — alfa-historikk` og alt under: byte-identisk.

**Porter (grep mot ny fil — alle må stemme, ellers ikke commit):**
`^## Ukeslipp$` = 1 · `^### 1\.233\.0 · mandag 17\. august 2026$` = 1 · `^## Før ukeslippene` = 1 ·
`^## Før 1\.0 — alfa-historikk$` = 1 · `^## Funksjoner$` = 0 · `^## Feilrettinger$` = 0 ·
`^### Funksjoner$` = 1 · `^### Feilrettinger$` = 1 · `<summary><strong>1\.233 · ` = 0 ·
`` `1\.233\.0` `` = 0 · `<summary>70 rettinger</summary>` = 1 ·
`August 2026 · 41 rettinger` = 1 · antall linjer som matcher `^- ` er **likt** før og etter (de 70
bytter bare prefiks) ·
antall `^<details>$` er **før + 2** (rettinger-skuffen + Før-ukeslippene-folden) ·
antall `^</details>$` også før + 2 · antall `\(https://github\.com/jdlarssen/golf-app/issues/` likt før
og etter (ingen oppføring tapt). Skriv tallene i commit-body-en.

### Papirer (samme PR)

- `docs/changelog-conventions.md`: skriv om «Veien inn»-tabellen (:21–22: begge typer → «i ukas
  blokk under `## Ukeslipp`»), «Versjonssemantikken» (:28–31: overskriften bærer ukas fulle
  versjon), «Strukturen i fila» (:33–39: tre toppseksjoner Ukeslipp / Før ukeslippene / Før 1.0
  + hva en ukeblokk inneholder), «Funksjon-oppføring» (:41–: eksempel uten versjonsprefiks,
  tabellrad «Tittel (i `<summary>`)»), «Feilrettings-oppføring» (:68–78: `- [#N](…) — setning`,
  ingen badge, «i ukas rettinger-skuff», fjern «Ny måned → …»), «Hvem havner hvor» (:80–82:
  begge i samme ukeblokk; «løft en stor patch-funksjon manuelt til funksjonsrad» består). Behold
  «Bare det en bruker ville merke», «Stemme», «Den gamle Teknisk-historikken».
- `CLAUDE.md:230`: «Tynt to-seksjons-feed (Funksjoner / Feilrettinger), én linje per endring» →
  «Én ukeblokk per slipp under `## Ukeslipp` (funksjonsrader + rettinger-skuff), én linje per
  endring».
- `.github/scripts/ukesversjon.sh:147–150`: PR-body-avsnittet → «feat-notater ble
  funksjonsrader og fix/perf-notater én rettinger-skuff i ukas blokk `### $VERSION · <dato>`
  øverst under `## Ukeslipp`».
- `docs/loops/utroperen.md:10–15` (felt-løfting): «tittel = teksten i `<summary>` (på rader
  fra før ukeslippene: teksten etter «X.Y · »-prefikset)»; body/lenke-reglene uendret. Nytt
  kulepunkt under «Ukentlig vedlikehold → Appende nederst» (:45–48): «Nye funksjoner = nye
  `<details>`-rader med `<strong>`-summary og `[#N] —`-brødtekst i ukeblokker under
  `## Ukeslipp`. Rettinger-skuffen (`<summary>N rettinger</summary>`, punktliste) er ALDRI en
  lanserings-kandidat — det er tabell-innhold, ikke funksjoner.» Legg til én setning om at
  «Fra arkivet»-kandidater kan komme fra folden «Før ukeslippene» (samme sannhetssjekk).
- `docs/superpowers/specs/2026-08-11-ukentlig-versjonsrutine-design.md`: én linje øverst:
  «Rendering-formatet er erstattet av ukeblokker — se #1702 / `.forge/contracts/1702-changelog-ukeslipp.md`.»
  Ingen annen omskriving (historisk dokument).
- `.changes/README.md`: sjekk :5 og :72 — nevner bare «én versjon» og «CHANGELOG-diff», så
  sannsynligvis urørt; endre kun hvis en setning blir usann.

## Edge Cases & Guardrails

- To kjøringer samme dag (f.eks. manuell `workflow_dispatch` etter en feil): to versjoner → to
  blokker med samme dato — akseptert (versjonen skiller dem). Samme versjon to ganger → fail-closed.
- Uke med 0 feat: overskrift `1.233.1 · …` + kun skuff. Uke med 1 fix: «1 retting» (entall,
  som dagens `drawerSummary`).
- Body-tekst med `·` eller `—` inni: ingen parsing av eksisterende blokker skjer (skriptet setter
  bare inn) — trygt. Utroperen splitter fortsatt på FØRSTE «—» etter `[#N]` — uendret regel.
- `renderDiff` printer edit-en med 3 linjers kontekst — én edit gir én diff-hunk; verifiser i
  dry-run.
- GitHub rendrer `###`-overskrifter og nestede `<details>` inne i `<details>` (presedens: alfa-
  seksjonen har allerede skuff-i-skuff). Hold en tom linje etter hver `<summary>`-linje og før
  `</details>`, ellers rendres markdown-innholdet ikke.
- Ikke rør `## Før 1.0`-blokken, `.changes/`-notater eller `package.json`-versjon.
- Utroperens sky-prompt kan ha «·»-regelen innskrevet — det er et **eier-steg** etter merge
  (nevn i PR-body under «Til eier»), ikke noe bygger kan gjøre.

## Success Criteria

1. `npx vitest run scripts/weekly-release.test.mjs` grønn; `npm run typecheck`/`lint` uendret
   (skriptet er .mjs — lint-scope som før).
2. `node scripts/weekly-release.mjs --dry-run` med ett midlertidig `feat`- og ett `fix`-notat
   viser én ny blokk `### 1.234.0 · <dagens dato>` rett under `## Ukeslipp` med én funksjonsrad
   uten versjonsprefiks og en «1 retting»-skuff; ingenting annet i diffen. (Notatene slettes
   før commit — `git status` ren i `.changes/`.)
3. CHANGELOG.md består alle grep-portene i «Engangsflytt», og GitHub-preview på PR-en viser:
   «Ukeslipp → 1.233.0 · mandag 17. august 2026 → 4 rader + «70 rettinger»», deretter foldet
   «Før ukeslippene», deretter alfa-historikken.
4. `grep -rn "## Funksjoner\|## Feilrettinger\|måneds-skuff\|Funksjon-rader øverst" docs CLAUDE.md .github scripts`
   gir 0 treff utenom historiske dokumenter (`docs/superpowers/specs/2026-08-11-*`, `docs/loops/logg/**`,
   `.forge/**`, `CHANGELOG.md`-folden selv).
5. `docs/loops/utroperen.md` beskriver felt-løfting for både nye rader (ingen prefiks) og gamle
   (prefiks strippes), og utelukker rettinger-skuffen eksplisitt.

## Gates

`npx tsc --noEmit` + `npm run lint` + `npx vitest run` grønne. Ikke bruker-synlig i appen →
`chore(changelog)`/`docs`/`test`-commits, **ingen** `.changes/`-notat (commit-msg-hooken krever
notat kun for feat/fix/perf). Én commit per del: (1) kontrakt-fil, (2) skript + tester,
(3) engangsflytt av CHANGELOG.md (tellinger i body), (4) docs (conventions, CLAUDE.md,
ukesversjon.sh, utroperen.md, spec-pekeren). Alle med `Refs #1702`. PR: draft-først (#1516),
`Closes #1702`, kort «Fordeler/ulemper»-blokk (valg finnes: ukeblokk vs. dagens to seksjoner —
2 fordeler/2 ulemper holder), seksjon «Til eier» med Utroperen-prompt-sjekken. `.github/**`
røres (ukesversjon.sh) → kortet gir knapp, ikke auto-merge — det er ventet; eier eller økta merger.
Ingen staging-verifisering (ingen app-flate berørt).

## Files Likely Touched

`scripts/weekly-release.mjs`, `scripts/weekly-release.test.mjs`, `CHANGELOG.md`,
`docs/changelog-conventions.md`, `docs/loops/utroperen.md`, `CLAUDE.md`,
`.github/scripts/ukesversjon.sh`, `docs/superpowers/specs/2026-08-11-ukentlig-versjonsrutine-design.md`,
`.forge/contracts/1702-changelog-ukeslipp.md` (ny).

## Out of Scope

- Endring av `.changes/`-notatformatet, versjonsvalget (feat → minor, ellers patch),
  ukesversjon-workflowens tidspunkt/PR-mekanikk, footeren.
- Omskriving av gamle changelog-tekster (1.0–1.232) — flyttes ordrett.
- Utroperens sky-prompt (eier-steg) og publish_lansering-koden.
- Kortets manglende fyring for robot-PR-er (#1701).

