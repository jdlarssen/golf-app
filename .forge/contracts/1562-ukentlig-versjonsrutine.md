# Spec: Ukentlig versjonsrutine — .changes/-notatfiler + mandags-rollup

**Issue:** #1562 · **Design-dok:** `docs/superpowers/specs/2026-08-11-ukentlig-versjonsrutine-design.md` (eiergodkjent 2026-08-11 — kontrakten bygger på den, re-åpner ikke designvalg)

## Problem

Hver bruker-synlig commit MÅ i dag bumpe `package.json` og legge en linje i `CHANGELOG.md` (håndhevet av `.githooks/commit-msg`). To filer alle PR-er rører → systematisk rebase-konflikt mellom parallelle økter (kjent, tilbakevendende — jf. MEMORY «CHANGELOG/version conflict on rebase»). I tillegg gir det versjonsstøy: flere bump daglig i footeren. Eieren vil ha ett versjonsnummer per uke og konfliktfri parallell-bokføring — uten å røre deploy-rytmen (merge til `main` → prod, som i dag).

## Research Findings (ground truth lest i økta 2026-08-11)

- **Mal for ukentlig Action:** `.github/workflows/dok-skjema.yml` + `.github/scripts/dok-skjema.sh` — cron + `workflow_dispatch`, `permissions: contents/issues/pull-requests: write`, branch `claude/<navn>-$DATE`, PR via `gh`, fail-closed: dedupet alert-issue (milestone 9) + Discord-varsel via `.github/scripts/discord-notify.sh`. Actions kjører UTEN git-hooks — branch+PR-disiplinen må bo i skriptet.
- **CI-trigger-fella:** PR-er opprettet med `github.token` fyrer ikke CI-workflows. Repoet har allerede dispatch-fallback for tomt check-rollup (#1469, brukt av Discord-PR-kortet). Ops-forutsetningen «Allow GitHub Actions to create and approve pull requests» er på (jf. dok-skjema-headeren).
- **CHANGELOG-format (nye seksjoner):** Funksjon-rad = `<details><summary><strong>X.Y · Tittel</strong></summary>` + `[#N] — brødtekst` + `↳ /lenke · «cta»`. Feilrettings-linje = `- \`X.Y.Z\` · [#N](…) — setning`, i månedsskuff `<details><summary><strong>August 2026 · 37 rettinger</strong></summary>` (teller må vedlikeholdes). Én linje kan bære FLERE issue-lenker (`[#1539], [#1551]` — se `1.231.2`-linja).
- **`.githooks/pre-commit` CHANGELOG-kilde-tag-sjekk** (linje 158–177) matcher kun det GAMLE formatet (`### [X.Y.Z]`-overskrifter) — sovende for nye oppføringer. Røres ikke.
- **Vitest:** jsdom-miljø, colocated tests, `@`-alias til repo-rot. Ingen tester på `scripts/` i dag; ny test kan ligge som `scripts/weekly-release.test.ts`.
- Gjeldende versjon: `1.231.2`. Ingen CI-workflow sjekker versjonsbump — disiplinen er kun i lokale hooks.

## Prior Decisions (eier, økta 2026-08-11)

- Alternativ **A** valgt (bokføringsrutine); fullt/hybrid release-tog = fase 2, eget issue senere. **Deploy-rytmen røres ikke.**
- Slippdag: **mandag tidlig morgen Oslo** → cron `0 3 * * 1` (05:00 sommer/04:00 vinter).
- Changelog-format, stemme og lanserings-flyt (`/admin/lanseringer`) skal være uendret.

## Design

### 1. Notatfiler i `.changes/`

Hver `feat`/`fix`/`perf`-commit legger én ny fil `.changes/<issue>-<slug>.md` (issue-løs: `x-<slug>.md`; flere notater fra samme issue → ulik slug):

```markdown
---
type: feat            # feat | fix | perf
issue: 1463           # ett nummer eller kommaliste (1539, 1551); utelates kun ved [no-issue]
title: Cupene dine samlet på ett sted   # kun feat, ≤120
link: /admin/cup      # kun feat; kan utelates per unntaksregelen i changelog-conventions
cta: Åpne cupene      # kun feat, ≤40, kun sammen med link
---
Én setning på Jørgen-språk (brødtekst for feat / feilrettings-linje for fix/perf).
```

`[no-changelog]` i commit-body → ingen notatfil (som i dag). `.changes/README.md` (committes med mappa, kort) forklarer formatet og peker på `docs/changelog-conventions.md`.

### 2. Ukerutinen — `.github/workflows/ukesversjon.yml` + `scripts/weekly-release.mjs`

Workflow etter dok-skjema-mønsteret (cron over + `workflow_dispatch`, fail-closed-steg). Skriptet, på `main`:

1. Ingen notatfiler → exit 0 uten sideeffekter (ingen tom versjon).
2. Valider alle notater (kjente frontmatter-felt, grenser, feat har title). Ugyldig → fail-closed med filnavn i alert-issuet; INGEN delvis release.
3. Bump: ≥1 feat-notat → `minor`, ellers `patch` (`npm version <type> --no-git-tag-version`; stage også `package-lock.json`).
4. Render CHANGELOG: feat-notater → én Funksjon-rad hver øverst i `## Funksjoner` (`X.Y · title`, delt versjon ved flere feats); fix/perf → linjer øverst i inneværende måneds skuff med full versjon `X.Y.Z` (ny måned → ny skuff; oppdater skuff-telleren).
5. Slett notatfilene skriptet leste (kun dem — notater merget etter lesing overlever til neste uke).
6. Branch `claude/ukesversjon-<dato>`, commit `chore(release): vX.Y.Z — uke <ISO-uke>`, PR mot `main` med body som sier ren bokføring (ingen produktvalg-heading → Discord-PR-kortet auto-merger på grønt). Sjekk at CI faktisk fyrer på PR-en; gjør den ikke det (token-fella), dispatch `ci.yml` + `secret-scan.yml` selv (samme kall som #1469-fallbacken).

Render-/bump-/valideringslogikken skrives som rene, eksporterte funksjoner i skriptet (eller nabo-modul) så vitest kan teste dem uten git/nettverk. Skriptet støtter `--dry-run` (print diff, ikke commit) for lokal verifisering.

### 3. Hook-omskriving — `.githooks/commit-msg`

- `feat`/`fix`/`perf`: krev minst én NY fil under `.changes/` i commiten (`git diff --cached --name-only --diff-filter=A`), ELLER `[no-changelog]` i body. Feilmelding viser notatfil-malen.
- NYTT vern: alle commits UNNTATT prefiks `chore(release)` blokkeres hvis de endrer `"version"`-feltet i `package.json` (samme diff-grep som dagens H1-sjekk) — feltet eies av ukerutinen.
- Bump-type-vakta (feat→minor osv.) fjernes fra hooken — logikken bor nå i skriptets steg 3.
- Issue-referanse-regelen (`Refs #N`/`[no-issue]`) beholdes uendret. Gamle bump/CHANGELOG-krav og tilhørende feilmeldinger fjernes.

### 4. Dokument-oppdateringer (samme PR)

| Fil | Endring |
|---|---|
| `CLAUDE.md` → «Versjonering / CHANGELOG» | Omskriv til notatfil-regimet (commit-krav, hook-håndheving, peker til ukerutinen) |
| `docs/changelog-conventions.md` | Nytt avsnitt: notatfil-format + ukentlig versjonssemantikk; oppføringsformatene består |
| `docs/agent-discipline/bindings.md` (§T6 metadata) | prefix → bump erstattes med prefix → notatfil |
| `docs/loops/nattkjoreren.md` (~139) | «versjonsbump/CHANGELOG per commit» → notatfil per commit |
| `docs/loops/kontrakt-smeden.md` | Ordlyd «ville fått en CHANGELOG-linje» → «ville fått en notatfil (= CHANGELOG-linje ved ukesslipp)»; regelen i substans uendret |

## Edge Cases & Guardrails

- Tom uke → ingen commit, ingen PR, grønn kjøring.
- Ugyldig notatfil → hele kjøringen fail-closed (alert-issue m/ filnavn); aldri delvis release eller stille hopp.
- Månedsskifte: første fix-notat i ny måned oppretter ny `<details>`-skuff med teller 1; eksisterende skuffers innhold røres aldri.
- Flere feats samme uke: alle rader deler ukas `X.Y`; rekkefølge = filnavn-sortering (deterministisk).
- `issue`-kommaliste rendres som `[#a](…), [#b](…)`.
- Ukesslipp-PR-en må IKKE trigge notatfil-kravet i egen hook lokalt: `chore(release)`-prefikset er unntatt både notat-krav og version-vern (Actions kjører uansett uten hooks; unntaket er for manuell re-kjøring lokalt).
- Implementasjons-PR-en for dette issuet er selv `chore`/`ci`/`docs`-typet → trenger ingen notatfil, og skal IKKE bumpe versjon.
- Åpne PR-er under gammelt regime: ved rebase etter merge må bump+CHANGELOG-linje konverteres til notatfil — nevnes i PR-body.
- `AppVersionFooter.tsx`, Utroperen og morgenbriefen røres ikke (leser CHANGELOG/`package.json` som før).

## Key Decisions

- Hand-rullet skript, ikke `@changesets/cli` — changelog-formatet er sterkt tilpasset (norsk, skuffer, lanserings-felt); null nye avhengigheter. Frontmatter er strengt formatert med faste nøkler → håndparsing er sanksjonert.
- Fail-closed-mønsteret og milestone 9 for alert-issues gjenbrukes fra dok-skjema.

**Claude's Discretion:** eksakt slug-konvensjon i README-eksemplene, workflow-jobbnavn, fixture-form i testene, om render-funksjonene bor i `.mjs`-fila eller en nabo-`.ts`-modul, eksakt dispatch-mekanikk for CI-fallbacken.

## Success Criteria

- [ ] `npx vitest run scripts/` grønn med dekning for: bump-valg (feat-miks/kun fix/tom), Funksjon-rad-render, Feilrettings-linje inkl. kommaliste-issues, månedsskuff-rollover + teller, valideringsfeil på ugyldig frontmatter.
- [ ] Lokal `--dry-run` med syntetiske notater (minst 2 feat + 2 fix, én i «ny» måned) viser korrekt CHANGELOG-diff + riktig bump — diff limes som bevis i PR-en.
- [ ] Hook-røyktest dokumentert i PR-en: (a) feat-commit uten notatfil blokkeres, (b) med notatfil passerer, (c) med `[no-changelog]` passerer, (d) commit som rører `"version"` blokkeres, (e) `chore(release)`-commit med version-endring passerer.
- [ ] `ukesversjon.yml` har cron `0 3 * * 1`, `workflow_dispatch`, fail-closed-steg med Discord + dedupet alert-issue (verifiserbart ved lesing mot dok-skjema-mønsteret).
- [ ] Alle fem dokument-oppdateringene i tabellen er gjort; `grep -rn "npm version" docs/ CLAUDE.md` viser ingen gjenlevende per-commit-bump-instruks utenfor historiske loggfiler.
- [ ] `.changes/README.md` finnes og viser notatfil-malen.

## Gates

- [ ] `npx tsc --noEmit` passerer
- [ ] `npm run lint` passerer
- [ ] `npx vitest run scripts/` passerer (+ colocated tester for evt. andre endrede filer)

## Files Likely Touched

- `.changes/README.md` — ny
- `scripts/weekly-release.mjs` (+ evt. nabo-modul + `scripts/weekly-release.test.ts`) — ny
- `.github/workflows/ukesversjon.yml` — ny
- `.githooks/commit-msg` — omskrives
- `CLAUDE.md`, `docs/changelog-conventions.md`, `docs/agent-discipline/bindings.md`, `docs/loops/nattkjoreren.md`, `docs/loops/kontrakt-smeden.md` — doks
- `docs/superpowers/specs/2026-08-11-ukentlig-versjonsrutine-design.md` — allerede committet (design)

## Out of Scope

- Fase 2: hybrid/fullt release-tog, staging-miljø for feature-slipp («mindre risiko», «samlet testing») — eget issue når eieren vekker det.
- Retro-migrering av eksisterende CHANGELOG-innhold eller versjonshistorikk.
- Endringer i Utroperen, morgenbriefen, `AppVersionFooter.tsx` eller pre-commit-hookens CHANGELOG-kilde-tag-sjekk.
- Automatisk in-app-lansering fra ukesslippet (Utroperen dekker løpet som før).
