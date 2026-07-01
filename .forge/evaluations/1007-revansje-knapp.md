# Evaluation: #1007 Revansje-knapp (+ #1011 side-felt-serialisering)

**Kontrakt:** `.forge/contracts/1007-revansje-knapp.md`
**Evaluert:** 2026-07-02. Runde 1 mot HEAD `1b113d2d` → **NEEDS WORK** (F1 blocker). Runde 2 (re-verifisering) mot HEAD `427e6f85` etter fix-commit.
**Evaluator:** fresh-context skeptisk subagent

## Slutt-verdict: **ACCEPT**

Runde 1-blockeren (F1: GameForm-flytene mistet all side_*-serialisering) er fikset i `427e6f85` med riktig mekanisme, ny regresjonstest på eksakt den ødelagte pathen, og alle gates er grønne med verifiserte exit-koder. F3 (stale kommentar + full-form-passthrough) er lukket i samme commit. F2 (feilaktig commit-melding i `1b113d2d`) er erkjent og noteres i PR-body — historikk skrives ikke om, akseptabelt.

---

## Gates (runde 2, HEAD `427e6f85`, Node 22.23.0)

| Gate | Resultat | Bevis |
|---|---|---|
| `npx tsc --noEmit` | ✅ PASS | `TSC_EXIT=0` |
| `npm run lint` | ✅ PASS | `LINT_EXIT=0`; 0 errors, 50 warnings (= baseline 50) |
| `npx vitest run "app/[locale]/admin/games/new" lib/games components messages/catalogParity.test.ts` | ✅ PASS | `VITEST_EXIT=0` — **99 filer / 1180 tester, alle grønne** (exit-kode fanget direkte, ingen pipe-maskering) |
| `npm run build` | ✅ | Verifisert av hovedchat på 89482f79; commits etter er test-only + komponent-props uten nye moduler/exhaustive-map-medlemmer; tsc grønn på HEAD |

Runde 1-regresjonen spesifikt:
- `GameForm.test.tsx > form-data-invariant: kollapsede paneler beholder skjema-feltene i DOM` — **✓ grønn** (var rød på 1b113d2d).
- Ny regresjonstest `GameForm — #1011 sideturnering serialiseres inline > FormData fra GameForm har alle side_*-felter …` — **✓ grønn** (kjørt isolert, EXIT=0).

---

## Runde 1-funn og status

### F1 — BLOCKER: GameForm-flytene mistet all side_*-serialisering → **LUKKET i 427e6f85**

Runde 1: `AdvancedSettingsSection` er ikke død kode utenfor wizarden — `GameForm.tsx:857` rendrer den live i admin-edit (`admin/games/[id]/edit/page.tsx:273/288`), creator-rediger (`games/[id]/rediger/page.tsx:148/163`) og wizardens full-form-view (`GameWizard.tsx:437`). GameForm har ingen FormDataInputs-speiling; da `c6c70622` fjernet radio-names og `89482f79` fjernet checkbox-name + gatet pickerens hidden-inputs bak `isControlled`, mistet edit-lagring alle fire side_*-felt → `parseSideTournamentFromFormData` fikk `null` → **stille wipe av sideturnering ved hver edit-lagring**. Bevist av pre-eksisterende test `GameForm.test.tsx:1586` (rød på 1b113d2d, grønn på base).

Fixen (427e6f85), verifisert i detalj:
- `AdvancedSettingsSection` fikk `serializedExternally`-prop (default **false**): GameForm-pathen beholder inline `name="side_tournament_enabled"`/`value="true"` på checkboxen og `name="side_ld_count"`/`name="side_ctp_count"` + `value` på radioene (:163-171, :205-210, :228-233).
- Kun `ReadyStep.tsx:236` setter `serializedExternally` → wizard-pathen deduper fortsatt mot FormDataInputs-speilingen (eksakt-én-kilde-testene `GameWizard.test.tsx:611-651` fortsatt grønne).
- `SideCategoriesPicker` fikk eksplisitt `emitHiddenInputs`-prop (default **true**) som erstatter `isControlled`-heuristikken; i GameForm-pathen rendres hidden inputs fra den controlled `disabledSet` → speiler state korrekt.
- Parser-kompatibilitet: GameForm-pathen submitter nå identisk med pre-regresjons-oppførselen (checkbox til stede kun når huket; fraværende → `enabled=false`).
- Ny regresjonstest på GameForm-pathen bruker `getAll`-assertions (én entry per felt, riktige verdier) — riktig bevisnivå.

### F2 — MINOR: Faktafeil i commit-melding `1b113d2d` → **ERKJENT, noteres i PR-body**

`'clean_front_9'` ER gyldig `SideCategoryId` (`sideTournamentConfig.ts:111/160`); meldingens begrunnelse for byttet til `'most_birdies_team'` er feil. Harmløst funksjonelt; historikk skrives ikke om.

### F3 — MINOR: Stale kommentar + tapt state i full-form-passthrough → **LUKKET i 427e6f85**

`GameWizard.tsx:393-395` bærer nå `side_ld_count`/`side_ctp_count`/`side_disabled_categories` fra controlled state ved bytte til full form; kommentaren (:377-381) er oppdatert og korrekt (kun `score_visibility` er fortsatt uncontrolled-passthrough).

### F4 — INFO: Gate-exit-kode maskert av pipe hos builderen → adressert i runde 2 (alle gates re-kjørt med eksplisitt `EXIT=$?`).

---

## Per kriterium (endelig)

### K0 (#1011) — ✅ PASS

- Wizard: controlled side-state i `useGameFormState.ts:512-520`, speilet i FormDataInputs (`GameWizard.tsx:1019-1038`; parser-kompatibel `''` for av). Lukket-disclosure-test + eksakt-én-kilde-test grønne (`GameWizard.test.tsx:567-651`).
- GameForm (edit-flytene + full-form): inline-serialisering gjenopprettet (427e6f85); invariant-test + ny regresjonstest grønne.
- Staging (rapportert av hovedchat): publisert via prefill med lukket panel → DB har `enabled=true`, `ld=2`, `ctp=1`, nøyaktig én kategori-entry. ✔

### K1 — ✅ PASS

Kode-nivå: CTA `app/[locale]/games/[id]/(home)/page.tsx:956-964` — `data-testid="revansje-button"` (LinkButton spreader `...props`, `components/ui/Button.tsx:59-78`), `href=/opprett-spill?fra=<id>`, sekundær-variant, `full` (≥44px); siden er deltaker-gatet (`me`-sjekk + `notFound()` :214-215) så alle deltakere ser den, ikke bare arrangør. Prefill via `buildRevansjeInitialValues` (`lib/games/buildRevansjeInitialValues.ts:42-64`, wrapper `buildEditInitialValues`): bane/tee/format/side_*/players/player_genders/registration beholdes; `name` + `scheduled_tee_off_at` destruktureres bort (:50-51). Auto-navngiving intakt: `GameWizard.tsx:194-196` (`nameTouched` false uten name). Key-remount: `wizardKey={fraId ?? 'blank'}` (`opprett-spill/page.tsx:255` → `<GameWizard key>` :357).
Staging (rapportert av hovedchat): knapp → prefilt veiviser → publish OK, auto-navn virker, dato tom. ✔

### K2 — ✅ PASS

Knapp-gate: `isFinished && !game.tournament_id && !game.league_round_id` (`(home)/page.tsx:956`; feltene i sidens egen `GAME_SELECT` :153 — ikke stale-cache-avhengig). `?fra=`-gate: `loadRevansjeContext` (`opprett-spill/page.tsx:71-102`) sjekker finnes → **deltaker (:78-79)** → `finished` (:82) → `tournament_id`/`league_round_id === null` (:83) FØR noe bygges; ikke-deltaker får stille fallback uten eksistens-lekkasje; uinnlogget redirectes til login før `fra` røres (:174). Cache-nøkkel bumpet `gwp→gwp2` (`getGameWithPlayers.ts:201`) så stale entries uten de nye feltene aldri misklassifiserer cup/liga som frittstående; ingen andre `'gwp'`-konsumenter; nye felt additive (fixture oppdatert `scorecardLayout.test.ts:23-25`).
Staging (rapportert av hovedchat): cup-spill uten knapp; `?fra=` mot cup ignorert → tom veiviser. ✔

### K3 — ✅ PASS

Ingen nye server-actions/endpoints i diffen (full diff-stat gjennomgått); prefill er ren RSC-lesing (cached fetch + slim admin-select `opprett-spill/page.tsx:90-101`); `createGameInternal` urørt → publish gjennom alle eksisterende validatorer. Staging (rapportert): `created_by` = klikkeren, vanlig action-path. ✔

### K4 — ✅ PASS

`lib/games/buildRevansjeInitialValues.test.ts` — 8 grønne tester: name/tee-off utelatt, `lock_game_mode=false` for finished, withdrawn filtrert FØR mapping (også ute av `player_genders`), `it.each(['wolf','round_robin'])` team+flight → null, best_ball-motbevis, side-passthrough, course/tee/mode beholdt.

### K5 — ✅ PASS

`game.home.revansjeButton` («Revansje?»/«Rematch?») + `wizard.createDoor.revansjeBanner` i både `messages/no.json` og `messages/en.json`; catalogParity grønn (i 1180-kjøringen). `grep -ril revansje` treffer kun `opprett-spill/page.tsx`, `(home)/page.tsx`, `getGameWithPlayers.ts`, `buildRevansjeInitialValues.ts` — ingenting i `app/[locale]/spectate/` eller leaderboard-komponenter. Humanizer-kjøring ikke verifiserbar fra git; copyen er kort og idiomatisk.

### K6 — ✅ PASS

`docs/flows/05-kjor-og-avslutt-spill-fremtid.svg` (commit `7d2793fa`): revansje-node + kant Avsluttet → «Revansje?» → «Opprett spill (flyt 4), ferdig utfylt», høyre-rail («Hva endret seg» + epic #1006) og spiller-parallell oppdatert; PNG regenerert (450330→510459 bytes). Samme PR.

### K7 — ✅ PASS

| Commit | Type | Versjon | CHANGELOG | Refs |
|---|---|---|---|---|
| `d1d15ba3` docs(forge) | docs | — (1.162.2) | — | #1007 |
| `c6c70622` fix(wizard) #1011 | fix | →**1.162.3** PATCH | Feilrettinger-linje (Juli 2026) m/ #1011-lenke | #1011 |
| `e8210e2d` refactor(games) | refactor | — | `[no-changelog]` | #1007 |
| `90d5652e` refactor(games) | refactor | — | `[no-changelog]` | #1007 |
| `7d2793fa` feat(games) | feat | →**1.163.0** MINOR | Funksjoner-rad «1.163 · Revansje?» m/ ↳ `/opprett-spill · «Revansje?»` | #1007 |
| `89482f79` fix(wizard) | fix | →**1.163.1** PATCH | `[no-changelog]` | #1011 |
| `1b113d2d` test(wizard) | test | — | — | #1011 |
| `427e6f85` fix(wizard) | fix | →**1.163.2** PATCH | `[no-changelog]` (intern regresjonfiks, aldri shippet) | #1011 |

Alle 8 bodies har `Refs #N`; hooksPath `.githooks` aktiv i worktreen (hooks kjørte ved commit); bump-typer matcher commit-msg-hookens regler.

---

## Restnoter (ikke-blokkerende)

- **Valgfri ekstra staging-sjekk:** edit av et scheduled/draft-spill MED sideturnering → lagre → config intakt. FormData-nivået er testbevist og inline-oppførselen er identisk med pre-regresjonen (samme feltnavn/verdier, uendret parser), så risikoen er lav — men det var edit-pathen som faktisk var ødelagt mellom c6c7062 og 427e6f85, og den rapporterte staging-runden dekket create-pathen.
- F2-notatet (feilaktig begrunnelse i `1b113d2d` sin melding) skal med i PR-body per hovedchat.

## Konklusjon

Kontrakten er oppfylt på kode-, test- og staging-nivå. K0–K7: alle PASS. Gates: tsc/lint/vitest grønne med verifiserte exit-koder; build verifisert av hovedchat. **ACCEPT.**
