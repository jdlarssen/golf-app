# Evaluering: #1562 Ukentlig versjonsrutine — .changes/-notatfiler + mandags-rollup

**Verdikt: ACCEPT**

Uavhengig evaluering med friskt kontekstvindu, egne fixtures og eget engangs-git-repo
(byggerens fixtures/rigg ikke gjenbrukt). Branch: `claude/weekly-changelog-version-update-6d2605`,
målt mot merge-base `95d43987` (origin/main hadde 3 nyere commits — driften er skilt ut;
`origin/main..HEAD`-statens `app/`- og `package.json`-linjer er fra main-siden, ikke branchen).

## Gates (kjørt selv, Node v22.23.0)

| Gate | Resultat | Bevis |
|---|---|---|
| `npx tsc --noEmit` | PASS | exit 0 |
| `npm run lint` | PASS | `✖ 55 problems (0 errors, 55 warnings)`; grep på `weekly-release\|ukesversjon` i lint-output: 0 treff — alle warnings pre-eksisterende |
| `npx vitest run scripts/` | PASS | `Test Files 1 passed (1) · Tests 42 passed (42)` |

## Per Success Criterion

### 1. Vitest-dekning — PASS
42/42 grønne. Verifisert ved lesing av `scripts/weekly-release.test.mjs` at alle kontraktens
punkter dekkes: bump-valg (feat-miks → minor, kun fix/perf → patch, tom → throw),
Funksjon-rad-render (med og uten ↳-linje), Feilrettings-linje inkl. kommaliste
(`[#1539](…), [#1551](…)`), månedsskuff-rollover (ny skuff «September 2026 · 1 retting»,
gamle skuffer urørt) + teller-oppdatering, valideringsfeil (10 `it.each`-cases + lengdegrenser,
alle med filnavn-prefiks i feilmeldingen).

### 2. Lokal `--dry-run` med syntetiske notater — PASS (egne fixtures)
Fixture A (ekte CHANGELOG.md-kopi, August-skuff finnes; 2 feat + 2 fix + 1 issue-løst perf-notat):
- `Bump: minor (1.231.2 → 1.232.0)`, exit 0.
- Funksjon-rader byte-likt formatet i CHANGELOG.md: `<summary><strong>1.232 · Testfunksjon A</strong></summary>`,
  `[#1601](…) — brødtekst`, `↳ /admin/cup · «Åpne cupene»`; feat uten destinasjon dropper ↳-linja.
- Skuff-teller 37 → 40; kommaliste `[#1603](…), [#1604](…)`; issue-løs perf-linje uten lenkesegment:
  `` - `1.232.0` — Leaderboardet laster raskere. ``

Fixture B (nyeste skuff = Juli 2026): ny skuff `<summary><strong>August 2026 · 2 rettinger</strong></summary>`
øverst, Juli-skuffen urørt. `Bump: patch (1.231.2 → 1.231.3)`.

Full skrive-kjøring (uten `--dry-run`) på fixture A-kopi: package.json → 1.232.0 (via `npm version`,
assertert etterpå), 5 notater slettet, README.md står.

### 3. Hook-røyktest — PASS (eget engangsrepo, `core.hooksPath` → kopi av ny hook)
Kontraktens fem + seks egne varianter, alle riktige:
- (a) feat uten notatfil → BLOKKERT
- (b) feat med ny notatfil → OK
- (c) feat med `[no-changelog]` → OK
- (d) docs-commit som endrer `"version"` → BLOKKERT
- (e) `chore(release)` med version-endring → OK
- (f) feat med KUN rename av eksisterende notat → BLOKKERT (rename er R, ikke A)
- (g) feat med kun slettet notat → BLOKKERT
- (h) feat med kun endret (ikke ny) notatfil → BLOKKERT
- (i) feat der eneste nye fil er `.changes/README.md` → BLOKKERT
- (j) feat uten `Refs #N` → BLOKKERT (H2 beholdt)
- (k) `docs:` uten noe ekstra → OK
(Første kjøring av (i) ga falsk OK pga. gjenlevende utracket fil i MIN rigg — re-kjørt rent: blokkert.)
Diff mot gammel hook: kun bump/CHANGELOG-krav og bump-type-vakt fjernet (begge sanksjonert i
kontrakten), issue-ref-regelen beholdt uendret.

### 4. `ukesversjon.yml` mot dok-skjema-mønsteret — PASS
Lest mot `dok-skjema.yml`: cron `0 3 * * 1` (:19), `workflow_dispatch` (:20), samme
permissions-blokk, fail-closed-steg (:55–75) med Discord + dedupet issue + `milestone=9`;
`ukesversjon.sh` har i tillegg egen `open_or_note_issue`/`fail_closed` (dedupe + milestone 9 + Discord).
CI-trigger-fella: dispatch-fallback i skriptet (:160–173); verifisert at BÅDE `ci.yml` (:30) og
`secret-scan.yml` (:22) faktisk har `workflow_dispatch`-trigger.
Skriptet røyktestet selv med stubbet `gh` + lokal bare-origin (baner byggeren delvis ikke rapporterte):
- **Happy path:** exit 0, branch `claude/ukesversjon-<dato>`, commit `chore(release): v1.231.3 — uke 33`
  med nøyaktig CHANGELOG.md + package.json + package-lock.json + notat-slettinger, pushet, `gh pr create`
  med riktig base/head/tittel, PR-body uten produktvalg-heading.
- **Uka ETTER merge:** simulert merge av release-commiten til «main», nytt notat, ny kjøring →
  `Bump: patch (1.231.3 → 1.231.4)` — regner fra den alt bumpede versjonen; skuff-teller 2 → 3. Riktig.
- **Forrige ukes PR fortsatt åpen:** exit 0, arbeidstre fullstendig gjenopprettet (notater tilbake,
  package.json tilbake), ingen branch, Discord-varsel «Ukesversjon hoppet over». Riktig.
- **Ugyldig notat:** exit 1, `FAIL-CLOSED` med filnavn, varsel-issue forsøkt (milestone 9), tre urørt.
- **Tom uke:** `.mjs` exit 0 med «ingen notatfiler» og null sideeffekter; sh-en leser `released != true` → exit 0.

### 5. Docs-oppdateringene — PASS
Alle fem endringer lest i diff fra merge-base: CLAUDE.md §Versjonering (omskrevet til notatfil-regimet,
inkl. version-vernet), `docs/changelog-conventions.md` (nytt «Veien inn»-avsnitt + ukessemantikk,
oppføringsformatene består), `docs/agent-discipline/bindings.md` §T6 (prefix → notatfil),
`docs/loops/nattkjoreren.md` (~139: notatfil, aldri bump), `docs/loops/kontrakt-smeden.md`
(«ville fått en notatfil … = CHANGELOG-linje ved ukesslipp»). Innbyrdes konsistente; ingen motsigelser
funnet mellom CLAUDE.md og conventions-fila.
`grep -rn "npm version" docs/ CLAUDE.md` utenfor historiske kataloger: **0 treff**. Bredere grep
(`versjonsbump|MÅ bumpe|package.json-versjonen`) utenfor historiske kataloger: 0 instruks-treff.

### 6. `.changes/README.md` — PASS
Finnes; feat- og fix-mal, felt-tabell med grensene (120/40/400), filnavn-konvensjon,
stemme-peker til `docs/changelog-conventions.md`, `--dry-run`-oppskrift.

## Renslighetskontroller (steg 5)

- Ingen `feat`/`fix`/`perf`-commits på branchen: 8 commits, alle `docs`/`chore`/`ci`. PASS
- `git diff <merge-base>..HEAD -- package.json CHANGELOG.md package-lock.json`: **tom**. PASS
- Ingen nye npm-avhengigheter (package.json urørt). PASS

## Funn

Ingen blokkerende funn. Alle Success Criteria består, alle gates grønne, alle Edge Cases fra
kontrakten er håndtert (tom uke, ugyldig notat, månedsskifte, flere feats, kommaliste,
chore(release)-unntak, implementasjons-PR-en selv uten bump/notat, urørte AppVersionFooter/Utroperen-filer).

## Ikke-blokkerende observasjoner

1. `ukesversjon.sh + git add-pathspec` — `git add -A CHANGELOG.md package.json package-lock.json .changes`
   krever at `package-lock.json` finnes; mangler den, feiler add med pathspec-feil og kjøringen ender i
   fail-closed «commit feilet» (høylytt, aldri stille). I det ekte repoet finnes fila alltid — oppdaget som
   artefakt i min egen fixture.
2. `PR-body-forpliktelser` — PR-en for branchen er ikke åpnet ennå (`gh pr list --head …` → tom).
   Kriterium 2/3 sier at dry-run-diffen og hook-røyktesten skal limes/dokumenteres i PR-en, og
   Edge Case-punktet om åpne gammelt-regime-PR-er skal nevnes i PR-body. Substansen er verifisert
   uavhengig her; selve PR-dokumentasjonen er en gjenstående plikt for økta som åpner PR-en.
3. `.githooks/commit-msg + H1` — `git diff --cached package.json` gir «ambiguous argument»-støy på
   stderr i et repo uten package.json (umulig i dette repoet); `|| true` gjør at oppførselen likevel er riktig.
4. `docs/changelog-conventions.md + tidsangivelse` — «Mandag 05:00» stemmer kun i sommertid
   (04:00 vinter); workflow-kommentaren selv dokumenterer begge. Kosmetisk.

*Evaluert 2026-08-11 av skeptisk evaluator med friskt kontekstvindu. Ingenting committet, ingenting fikset.*
