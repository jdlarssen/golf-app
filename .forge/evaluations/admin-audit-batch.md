# Forge-evaluering — admin-audit batch (#918, #905, #904, #910, #908)

**Evaluator:** skeptisk forge-evaluator (uavhengig verifisering)
**Worktree:** `/Users/jdl/Dokumenter/GitHub/golf-app/.claude/worktrees/eager-wozniak-dfba7c`
**Base→HEAD:** `df16bafc..38a0031e` (5 commits, én per issue)
**Dato:** 2026-06-23

## VERDICT: ACCEPT

Alle 5 issues oppfyller kontrakt-kriteriene. Begge gates grønne på Node 22. Den kritiske #908-skeptiker-feiingen (helapp-skann) fant **0** default-rendrede native checkbox/radio som fortsatt mangler accent-primary (ekskl. sr-only). Ingen sr-only-input fikk feilaktig accent-primary. Versjon/CHANGELOG/Refs-disiplin overholdt.

---

## #918 — Avsluttet spill ber fortsatt om handling (status/page.tsx)

✅ **Ubekreftet-purr gated på isActive.**
`app/[locale]/admin/games/[id]/status/page.tsx:245` — `{isActive && unconfirmedCount > 0 && (`. Borte på BÅDE finished og scheduled (kun `active` passerer). Matcher den eksisterende leverings-purr-vakten på L219 (`{isActive && (`).

✅ **ready_not_delivered muted på finished, ingen ⚠️, ingen accent-topp-sort.**
- statusLabels (L150-153): `ready_not_delivered: isFinished ? { label: tDetail('statusNotSubmitted'), className: 'text-muted' } : { … 'text-accent' }`. På finished → muted, gjenbruker `statusNotSubmitted`. ✅
- ⚠️ render (L301): `{isTarget && !isFinished ? '⚠️ ' : ''}` — ⚠️ undertrykt på finished. ✅
- Sort (L141-146): `isFinished ? a.name.localeCompare(b.name,'nb') : SORT_ORDER[a.status]-SORT_ORDER[b.status] || …` — ren alfabetisk på finished, accent-sort beholdt ellers. ✅

✅ **readyMissingDelivery-suffiks droppet på finished.**
L193: `{!isFinished && targetCount > 0 && \` ${t('readyMissingDelivery', …)}\`}`.

✅ **Aktive spill uendret (skeptiker-sjekk).**
For `isActive`: purr-seksjon (L219), ⚠️ (isTarget true), `text-accent`, og SORT_ORDER-sortering alle uendret — `isFinished` er false så hver else-gren er identisk med før-tilstanden. Bekreftet ved diff-lesing.

---

## #905 — Scheduled spill viser premature felt (page.tsx + messages)

✅ **«Levert scorekort»-raden skjult unntatt active/finished.**
`page.tsx:531` — `{isPlayPhase && (<Row label={tRows('submittedScorecard')} … />)}`, der `isPlayPhase = status === 'active' || status === 'finished'` (L519).

✅ **CH-kolonne header OG celle begge gated (ingen header/celle-mismatch).**
- Header L815-817: `{isPlayPhase && (<th …>{tDetail('colCH')}</th>)}`
- Celle L887-891: `{isPlayPhase && (<td …>{p.course_handicap ?? '—'}</td>)}`
Begge på samme `isPlayPhase`-betingelse → kolonne-antall konsistent. ✅

✅ **colCH relabel.** `messages/no.json` `colCH: "Banehcp"`, `messages/en.json` `colCH: "Course HCP"`.

✅ **statusScheduled = «Påmeldt»/«Enrolled».**
no.json/en.json har ny key `statusScheduled`. Branch L833-838: `} else if (game.status === 'scheduled') { statusLabel = tDetail('statusScheduled'); statusClass = 'text-muted'; }`.

✅ **Scheduled-grenen presederer korrekt `!p.submitted_at` (skeptiker-sjekk).**
If/else-rekkefølge (L829-857): `withdrawn_at` → `scheduled` → `!submitted_at` (finished→statusNotSubmitted, ellers statusPlaying) → peer-approval → submitted. Scheduled fanges FØR `!p.submitted_at`, så scheduled-spillere får aldri «⏳ Spiller». ✅

✅ **Active/finished-visning uendret.** Ingen av active/finished-grenene endret; status-kolonnen rendres uansett når `status !== 'draft'`, så scheduled viser den nye teksten i samme kolonne. ✅

---

## #904 — Dobbel «Påmelding»-overskrift (page.tsx + messages)

✅ **Kort 1 ribbon = ny key `sections.overview` («Oversikt»/«Overview»).**
`page.tsx:526` — `<SectionCard ribbon={tSections('overview')}>`. messages: `admin.game.sections.overview = "Oversikt"/"Overview"`.

✅ **Cleanly renamed, ikke orphaned (skeptiker-sjekk).**
- Eneste konsument av `tSections('registration')` var L526 (nå `overview`) — `grep` over app/components/lib viser INGEN gjenværende `sections.registration`-konsument i `admin.game.*`-namespace.
- `RegistrationSection.tsx:59` bruker `wizard.sections.registration` (ANNEN namespace, `wizard.*`) — uberørt, ikke brutt.
- `admin.game.registration.sectionLabel = "Påmelding"` beholdt (RegistrationOverviewSection.tsx:61 sitt ribbon) — eier «Påmelding». Ingen to nabo-seksjoner deler nå overskrift: Oversikt → Påmelding → Administrer påmelding. ✅

---

## #910 — SideCategoriesPicker: em-dash + lange navn

✅ **Em-dash-kjeder fjernet fra gruppe-hints + preset-hjelpetekst.**
`SideCategoriesPicker.tsx`: L63 (`… sideturneringen. Her er det flest …`), L159 (`… litt mindre sjeldne …`, fjernet både em-dash OG særskriving-bindestreker), L237 (`… som stables. De kan utløses …`), L267 (`Humor og uflaks. Gir trekk …`), L407 (`… i gang, så følger bryterne …`). Alle em-dash-kjeder splittet med punktum/komma. Enkle em-dash andre steder bevisst utenfor scope per kontrakt.

✅ **Lange navn — wrap-vennlige klasser.**
- Navn-span L441: `flex-1 text-pretty text-sm leading-snug text-text` (`text-pretty` + `leading-snug` = wrap-vennlig + snug).
- Poeng-label L444: `shrink-0 whitespace-nowrap …` (nowrap).
- Checkbox fikk også `accent-primary` (#908).

⚠️ **Mindre avvik (ikke blokkerende):** Wrapper-`<label>` (L430) bruker `items-center`, ikke `items-start` som kontrakt-notatet «top-align» antydet. `items-center` sentrerer checkbox mot et 2-linjers navn — et forsvarlig visuelt valg (top-align ville dyttet boksen til linje 1). Kontraktens *eksplisitte* className-kriterier (wrap-vennlig navn + nowrap poeng) er begge oppfylt. **Kan ikke render-verifiseres** uten visuell kjøring; vurdert som akseptabelt skjønnsvalg.

---

## #908 — Native checkbox/radio mangler accent-primary (app-bred)

✅ **accent-primary lagt på default-rendrede native inputs.**
Endrede filer: AdvancedSettingsSection (5), BasicsSection (5), PlayersSection (1), RegistrationSection (3), admin/spillere/[id] (5), complete-profile (5), SideCategoriesPicker (1) — alle diff-bekreftet.

✅ **(a) Ingen sr-only-input fikk accent-primary (KRITISK skeptiker-sjekk).**
Grep over alle endrede filer: 0 linjer med både `sr-only` og `accent-primary`. Diff-lesing bekrefter at hver tilført `accent-primary` traff en synlig, default-rendret input.

✅ **(b) Helapp-feiing komplett — 0 manglende (KRITISK skeptiker-sjekk).**
Python-skript som parser hele `<input … />`-elementet (brace-balansert, håndterer multi-line og `=>`-piler), ekskl. `.test.`-filer og kommentar-strippet:
```
native checkbox/radio (ekte JSX, non-test): 76
  med accent-primary : 52
  sr-only (skippet)  : 24
  MANGLER accent     : 0
```
To førsteomgangs-treff (IntentSelector.tsx:97, ModeSelector.tsx:231) var **falske positiver** — `<input type="radio">` nevnt i JSDoc-kommentarer; begge komponenter bruker `<button role="radio">`-tiles, ikke ekte inputs. Etter kommentar-stripping: 0 reelle manglende. **Feiingen er komplett.**

✅ **(c) Allerede-riktige accent-inputs urørt.**
`CreateLigaForm.tsx` (8 accent), `TeamRegistrationForm.tsx` (2), `klubber/[id]/rolle/[userId]/page.tsx` — ingen i diff (uberørt), alle beholder accent-primary.

---

## Gates (Node 22, v22.23.0)

✅ **`npm run typecheck`** — `tsc --noEmit` grønn, ingen feil.

✅ **`npx vitest run "app/[locale]/admin/games/new" messages/`**
```
Test Files  19 passed (19)
     Tests  189 passed (189)
```
Inkluderer i18n catalogParity + apostropheParity — bekrefter de tre nye keyene (`statusScheduled`, `sections.overview`, relabel av `colCH`) er speilet i både no.json og en.json.

## Disiplin-sjekk (utenfor harde kriterier)

- Versjon: `package.json` = 1.140.5 (5 patches under åpen `## 1.140.y`-serie). ✅
- CHANGELOG: oppføringer per issue (1.140.1–1.140.5). ✅
- Alle 5 commits har `Refs #N` i body. ✅

## Det jeg IKKE kunne verifisere

- **Faktisk visuell rendering** av accent-fargen (forest vs system-blå) og dark-mode-kontrast — krever browser/staging-kjøring; verifisert kun at `accent-primary`-klassen er til stede.
- **Lange-navn-wrap visuelt** (#910) — verifisert className-tilstedeværelse, ikke faktisk layout. `items-center`-valget (vs antydet top-align) er et ikke-blokkerende skjønnsavvik.

Begge er render-only og dekkes av kontraktens preview/staging-verifiseringssteg.
