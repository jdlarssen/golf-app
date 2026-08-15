# Evaluation: Veiviser-restanser etter #1379 (#1384 · #1398 · #1399 · #1400)

**PR:** #1659 (draft) · **Branch:** `claude/veiviser-restanser-1384-1398-1399-1400` · 4 commits
**Kontrakt:** `.forge/contracts/1384-1398-1399-1400-veiviser-restanser.md`
**Evaluert:** 2026-08-15, fresh context, staging-ref `snwmueecmfqqdurxedxv` (prod aldri berørt)

## VERDICT: NEEDS WORK

Tre av fire issues er ferdige og bevist. #1400 er **halvferdig**: dataene overlever en
mislykket publisering, men radioen arrangøren ser gjør det ikke — og de to er nå uenige.

---

## Success Criteria

| # | Kriterium | Verdikt | Bevis |
|---|---|---|---|
| 1 | **#1384** uten navn: hint-linje under utkast-knappen + `aria-describedby`; med navn borte | **PASS** | Staging: `{"hintVisible":true,"draftDisabled":true,"draftDescribedBy":"draft-missing-name","hintText":"Sett et spillnavn først — trykk på navnet over."}` → med navn `{"hintPresent":false,"draftDisabled":false,"draftDescribedBy":null}`. Kode: `sections/ReadyStep.tsx:604-628`. Skjermbilder `A-empty-name.png`, `A-named.png` |
| 2 | **#1398** pending-tekst + `aria-busy` på knappen som kjører; den andre disabled imens | **PASS** | Staging (MutationObserver-polling à 10 ms rundt klikket): `{"publishAriaBusySeen":true,"publishLabelWhileBusy":"Publiserer …","publishDisabledWhileBusy":true,"draftDisabledWhilePublishBusy":true}`. Kode: `ReadyStep.tsx:211,221,562-568,610-616`; `components/ui/Button.tsx:40-47` (`disabled \|\| pending`, `aria-busy`). Skjermbilde `B-C-error-banner.png` |
| 3 | **#1399** `opprett-spill/page.tsx` leser verken `error` eller `emails`; ingen error-Banner; grep = 0 | **PASS** | `grep -rn "sp.emails\|sp.error\|buildErrorMessage" "app/[locale]/opprett-spill/page.tsx"` → exit 1 (0 treff). Ingen produsent: `grep -rn "opprett-spill" app lib \| grep -i error` treffer kun en test-kommentar (`admin/games/new/actions.test.ts:232`). `Banner` beholdt og fortsatt i bruk (`page.tsx:9,248,299`) |
| 4 | **#1400** velg «Avslør på slutten» → publiseringsfeil → **radioen står fortsatt på «Avslør på slutten»** | **FAIL** | Staging: før feilen `visibility:[{checked:false},{checked:true}]`; etter feilen `visibility:[{checked:true},{checked:false}]` — radioen har hoppet tilbake. Skjermbilde `C2-after-failed-publish.png` (fylt radio står på «Vis alt under runden» under feilbanneret). Se Funn F1 |
| 4b | **#1400** publisert spill får `score_visibility='reveal'` | **PASS (men se F1)** | SQL-orakel staging: `{"id":"e81f0ea3-…","name":"E2E-1400-1786818803182","score_visibility":"reveal","status":"scheduled"}` — publisert rett etter feilen, uten å røre radioen |
| 5 | Låst spill (edit aktivt) sender ikke `score_visibility` | **PASS (kodenivå)** | `GameWizard.tsx:1059-1061` monterer inputen bak `{!lockScoreVisibility && …}`; `gamePayload.ts:282-284` faller til `'live'`. Ingen kjørbar rute: `lock_score_visibility` settes hardkodet `false` i `lib/games/editGameInitialValues.ts:131`, så grenen er defensiv, ikke nådd i praksis. **VERIFICATION GAP:** ikke drevet på staging |
| 6 | Nye nøkler i BOTH `no.json` + `en.json`; ingen MISSING_MESSAGE på steg 5 | **PASS** | `wizard.ready.draftMissingName` / `publishPending` / `draftPending` finnes i begge; begge filer `JSON.parse`-er. Konsoll-orakel: **0 console errors** i alle tre staging-kjøringene |
| 7 | `.changes/`-notat for 1384/1398/1400 (type fix); #1399 refactor uten notat | **PASS** | `node scripts/weekly-release.mjs --dry-run` går grønt og rendrer alle tre linjene under `1.233.0`; ingen 1399-linje |
| 8 | `npm run build`, `npm run lint`, co-located vitest grønt | **PASS** | Se Gates |

## Gates

| Gate | Kommando | Resultat |
|---|---|---|
| Enhetstester (hele veiviser-katalogen) | `npx vitest run "app/[locale]/admin/games/new"` | ✅ **20 filer / 246 tester passert** |
| Typer | `npx tsc --noEmit -p .` | ✅ exit 0, 0 linjer output |
| Lint | `npx eslint <8 endrede filer>` | ✅ 0 errors (4 complexity-**warnings**; `npm run lint` har ingen `--max-warnings`) |
| CHANGELOG-notater | `node scripts/weekly-release.mjs --dry-run` | ✅ ingen fail-closed |
| Staging-klikkrunde steg 5 | Playwright mot `localhost:3141` (worktree-cwd verifisert via `lsof -a -p <pid> -d cwd`) | ⚠️ A og B grønne, C rød (F1) |

Test-disiplin: én ny Type A-`it` i `useGameFormState.test.ts:387`, én linje utvidet fikstur i
`wizardStatePersistence.test.ts:35` (dekkes av eksisterende round-trip-assertions). Ingen nye
testfiler, ingen render-tester lagt til. I samsvar med `docs/test-discipline.md`.

## Staging-bevis

| Akseptansepunkt | Struktur-orakel | Feillogg | SQL-orakel |
|---|---|---|---|
| A · #1384 hint + aria under «Lagre utkast» | `#draft-missing-name` synlig, knapp `disabled`, `aria-describedby="draft-missing-name"`; med navn: hint borte, knapp aktiv ✅ | tom ✅ | N/A |
| B · #1398 pending på publiser, utkast sperret | `aria-busy="true"` + label «Publiserer …» + begge knapper `disabled` under forsøket ✅ | tom ✅ | N/A |
| C · #1400 «Avslør på slutten» overlever feilet publisering | radioen hopper tilbake til «Vis alt under runden» ❌ (skjult felt beholder `reveal`) | tom ✅ | 1 rad ✅ (`score_visibility='reveal'`) |

Prod-vakt: alle Supabase-kall mot staging-ref ✅ (9 kall over 3 kjøringer, 0 avvik).
Innloggingen brukte en staging-mintet OTP som ble godtatt (303) — bekrefter at også
server-siden peker på staging.
Opprydding: 1 `games`-rad + 2 `game_players`-rader slettet; `games?name=like.E2E-1400*` → `[]` ✅.
Dev-server (pid 73281) stoppet, port 3141 fri. `git status` rent (kun `.forge/`-filer).

## Findings

### F1 — `sections/AdvancedSettingsSection.tsx` + `sections/ReadyStep.tsx` · kriterium #1400 · **BLOCKER**

Radioene ble controlled, men publiseringen går fortsatt via `formAction={publishAction}`.
React-doms `requestFormReset` nullstiller da DOM-ens `checked` tilbake til `defaultChecked`
(satt ved mount, altså `'live'`), og React skriver ikke `checked` på nytt fordi propen ikke
har endret seg mellom rendringene. Resultatet:

- **Skjermen viser** «Vis alt under runden» etter feilen (`C2-after-failed-publish.png`).
- **Skjemaet sender** `reveal` — det skjulte feltet i `GameWizard.tsx:1060` er urørt.
- Publiserer arrangøren på nytt uten å røre radioen, blir spillet `score_visibility='reveal'`
  (SQL-orakel over), stikk i strid med det skjermen sa.

Før PR-en var UI og data i det minste enige (begge falt til `live`). Nå kan en arrangør som
etter feilen tenker «greit, live da» ende opp med en runde der scorene er skjult hele veien.
Det er en ny, stille feil-utgang — ikke bare et manglende fikset symptom.

Bevis på at staten er intakt hele tiden: går man ett steg fram og tilbake, males radioen
riktig igjen (`AFTER-step-roundtrip` → `reveal.checked=true`, `defaultChecked=true`).
Problemet er utelukkende at DOM-en ikke males på nytt etter reset.

**Repoets egen kur finnes allerede:** `app/[locale]/admin/cup/[id]/oppsett/CupPlanForm.tsx:137-143`
(#1397) — `onSubmit` med `e.preventDefault()` + `startTransition(() => formAction(formData))`,
med kommentaren «React 19 ville ellers auto-resette de ukontrollerte feltene når en feil
returneres». ReadyStep har to submit-knapper med hver sin `formAction`, så fiksen må rute på
`e.nativeEvent.submitter` (eller flytte dispatchen til `onClick` per knapp) — det er et reelt
designvalg og bør bygges bevisst, ikke kopieres blindt.

### F2 — samme fil · sideturnering-feltene fra #1011 · **eget issue, ikke blocker her**

Kontrollgruppa i samme kjøring: «Legg til sideturnering»-checkboxen gikk `checked: true → false`
etter den feilede publiseringen, mens `side_tournament_enabled` fortsatt sto `"true"` i det
skjulte feltet. #1011 har altså nøyaktig samme UI-vs-data-sprik. Utenfor scope for denne PR-en,
men F1-fiksen kurerer begge samtidig — bør files som eget issue per «Reviewer-funn»-regelen.

### F3 — `GameWizard.tsx:964` · **informativt**

`FormDataInputs` krysser complexity-grensa med denne PR-en (25 → 26; på `origin/main` gir fila
kun `WizardBody`-advarselen). Kun en advarsel, `npm run lint` har ingen `--max-warnings`.

### F4 — `AdvancedSettingsSection.tsx:118-144` · **informativt**

I wizard-pathen mister radioene `name`, og dermed også nettleserens radiogruppe-semantikk
(piltast-navigasjon, «1 av 2» hos skjermlesere). Kontrakten foreskriver dette eksplisitt og
#1011 gjorde det samme for `side_*`, så det er ikke et avvik — men det er en liten a11y-kostnad
i en PR som ellers forbedrer a11y. `<fieldset>`+`<legend>` demper det.

## Byggerens dokumenterte avvik — verifisert OK

Radioene beholder `name` når **ikke** `serializedExternally` (GameForm-pathen). Begrunnelsen
holder: `GameForm.tsx:937` sender ikke propen (default `false`), GameForm har ingen
`FormDataInputs`-speiling, og `BasicsSection`s egne radioer er urekkbare (`showAdvancedInline`
er `false` fra begge call-sites: `GameForm.tsx:623`, `GameWizard.tsx:864`). Eksisterende test
låser det: `GameForm.test.tsx:1584` krever `[name="score_visibility"]` i DOM-en. Uten unntaket
ville GameForm-pathen mistet feltet helt.

## Anbefaling

Ship #1384, #1398 og #1399 som de står. #1400 trenger én runde til: la publiser/utkast gå via
`preventDefault` + `startTransition`-dispatchen (CupPlanForm-mønsteret), routet på submitter, og
kjør staging-punkt C på nytt. Vurder å ta F2 i samme slengen eller file den som eget issue før
merge.

---

# Runde 2 — etter fiks `cadb826f`

**Evaluert:** 2026-08-15, fresh context, staging-ref `snwmueecmfqqdurxedxv` (prod aldri berørt)
**Fikset som vurderes:** `cadb826f` — `dispatchManually` (preventDefault + `startTransition`) på
publiser/utkast, `formAction` beholdt som fallback, `onSubmitStart` → `GameWizard.handleSubmitStart`,
radioene beholder `value="live|reveal"`, regresjons-assert i `GameWizard.test.tsx`.

## VERDICT: ACCEPT

Runde-1-blockeren (F1) er borte: radioen arrangøren ser og verdien som sendes er nå enige, både
etter en feilet publisering og i databasen. Kontrollgruppa fra F2 (sideturnering-checkboxen) er
kurert av samme fiks. A, B og #1399 står uendret, og utkast-knappen — som byttet dispatch-vei i
denne fiksen — er verifisert ende-til-ende mot staging.

## Statiske porter (runde 2)

| Gate | Kommando | Resultat |
|---|---|---|
| Enhetstester | `npx vitest run "app/[locale]/admin/games"` | ✅ **Test Files 29 passed (29) · Tests 344 passed (344)**, exit 0 |
| Typer | `npx tsc --noEmit -p .` | ✅ exit 0, 0 linjer output |
| Lint (4 berørte filer) | `npx eslint GameWizard.tsx ReadyStep.tsx AdvancedSettingsSection.tsx GameWizard.test.tsx` | ✅ **0 errors**, 3 complexity-*warnings* (WizardBody 65, FormDataInputs 26, ReadyStep 43 — samme art som F3) |
| CHANGELOG-notater | `node scripts/weekly-release.mjs --dry-run` | ✅ grønt; 1384/1398/1400-linjene rendres fortsatt under `1.233.0` (fiks-commiten er `[no-changelog]`, korrekt — den retter en ennå ikke sluppet fiks på samme branch) |

### Er den nye regresjons-asserten bærende? — ja, bevist

To kast-og-glem-trær (`git archive` + symlinket `node_modules`, worktreet aldri rørt):

1. **Pre-fiks produktkode + ny test** → rød, men på feil grunn: `Unable to fire a "click" event`
   (selektoren `input[type=radio][value=reveal]` fantes ikke før fiksen la tilbake `value`).
2. **Post-fiks radioer + pre-fiks dispatch** (isolerer nøyaktig dispatch-endringen) → rød på selve
   påstanden: `GameWizard.test.tsx:265 · expected false to be true` — altså reproduserer testen den
   ekte runde-1-defekten i jsdom, og det er den manuelle dispatchen som gjør den grønn.
3. **HEAD med `onSubmitStart={handleSubmitStart}` fjernet** → «sletter utkastet når spillet lagres
   som utkast» blir rød (`sessionStorage` beholder utkastet). Beviser at `handleSubmitStart` nå kun
   nås via den manuelle stien, og at eksisterende test vokter koblingen.

### Kode-vurdering av `dispatchManually` (ReadyStep.tsx:245-260)

- **(a) Pre-hydrerings-fallback:** intakt i den forstand den kan være. `formAction` står på begge
  knappene; `dispatchManually` returnerer uten `preventDefault` når `e.currentTarget.form` er
  `null`, og før hydrering finnes ingen `onClick` i det hele tatt → native sti. **Merk (F5):**
  fallbacken er nominell uansett — `publishAction`/`draftAction` kommer fra `useActionState` rundt
  en *klient*-closure (`ReadyStep.tsx:219-234`), så react-dom kan ikke serialisere noen
  progressive-enhancement-action inn i skjemaet. Det var likt før PR-en (formAction var eneste vei),
  så ingen regresjon.
- **(b) `reportValidity()`:** ekvivalent med det native submit gjorde. Publiser-knappen har ingen
  `formNoValidate` → native ville kjørt interaktiv constraint-validering; `form.reportValidity()`
  gjør nøyaktig det (fyrer `invalid`, viser boblen, returnerer `false`). Utkast-knappen har
  `formNoValidate` → `validate: false`. Formen har ikke `noValidate`. Payloaden er også identisk:
  react-dom bruker `new FormData(form, submitter)`, men **ingen** av knappene har `name`, så
  `new FormData(form)` gir samme felt-sett.
- **(c) `handleSubmitStart`:** kjører på den manuelle stien via `onSubmitStart?.()`
  (`ReadyStep.tsx:257` ← `GameWizard.tsx:920`). Form-ens `onSubmit={handleSubmitStart}`
  (`GameWizard.tsx:680`) fyrer ikke lenger, siden `preventDefault` på knappe-klikket avlyser den
  implisitte innsendingen. Probe 3 over viser at testen faktisk låser koblingen.
- **(d) Dobbel-dispatch:** ingen risiko. Per React 19/HTML-semantikk avlyser `preventDefault` på
  submit-knappens klikk knappens aktiveringsatferd → ingen `submit`-hendelse → `formAction` fyrer
  aldri. Gjelder også *implisitt* innsending (Enter i navnefeltet): HTML-spec fyrer da et
  `click` på default-knappen, som treffer samme `onClick` og dermed samme manuelle sti. I
  valideringsgrenen kalles `preventDefault` før `return`, så en ugyldig form heller ikke sniker seg
  ut den native veien.

## Akseptansepunkter — runde 2

| # | Punkt | Verdikt | Bevis |
|---|---|---|---|
| A | **#1384** hint + `aria-describedby` under «Lagre utkast» | **PASS** | Uten navn: `{"hintVisible":true,"hintText":"Sett et spillnavn først — trykk på navnet over.","draftDisabled":true,"draftDescribedBy":"draft-missing-name"}`; med navn: `{"hintPresent":false,"draftDisabled":false,"draftDescribedBy":null}`. `R2-A-empty-name.png`, `R2-A-named.png` |
| B | **#1398** pending + `aria-busy`, søsken-knapp disabled | **PASS** | Publiser (81 samples à 10 ms): `{"publishAriaBusySeen":true,"publishLabelWhileBusy":"Publiserer …","publishDisabledWhileBusy":true,"draftDisabledWhilePublishBusy":true}`. **Utkast (nytt i runde 2, siden dispatchen endret seg):** `{"draftAriaBusySeen":true,"draftLabelWhileBusy":"Lagrer utkast …","draftDisabledWhileBusy":true,"publishDisabledWhileDraftBusy":true}` |
| C | **#1400 (blockeren)** «Avslør på slutten» overlever feilet publisering, og DB-en er enig | **PASS** | Etter banneret «Tee-off-tidspunkt er påkrevd.»: `reveal:{checked:true,defaultChecked:false}`, `live:{checked:false}`, `hidden.score_visibility:"reveal"` — i runde 1 sto dette omvendt. Ingen rad ble skapt av det feilede forsøket (`games?name=eq.…` → `[]`). Ekte publisering etterpå → `{"id":"e3a840aa-…","name":"E2E-1400b2-1786819716097","score_visibility":"reveal","status":"scheduled"}` (1 rad). Visuelt bekreftet i `R2-C2-after-failed-publish.png`: den fylte radioen står på «Avslør på slutten» under feilbanneret. Også `R2-C-after-failed-publish.png`, `R2-C2-after-repair.png`, `R2-C2-published.png` |
| C·F2 | Kontrollgruppe: sideturnering-checkboxen (#1011) | **PASS** | Samme kjøring: `sideCheckbox {checked:true}` FØR og `{checked:true}` ETTER den feilede publiseringen, `hidden.side_tournament_enabled:"true"`. Runde-1-spriket (`true → false`) er borte — F2 er kurert av samme fiks |
| D | **Ny:** utkast-stien når serveren gjennom den manuelle dispatchen | **PASS** | To uavhengige kjøringer: redirect til `/admin/games/<id>?status=draft_created` + SQL-orakel `{"name":"E2E-1400d2-…","status":"draft","score_visibility":"live"}` (1 rad). `R2-D-draft.png`, `R2-D2-draft-created.png` |
| — | **#1399** død søkeparameter | **PASS (uendret)** | `cadb826f` rører ikke `opprett-spill/page.tsx`; runde-1-beviset står |
| — | Låst spill (edit aktivt) sender ikke `score_visibility` | **PASS (kodenivå)** | Uendret av fiksen. **VERIFICATION GAP:** fortsatt ingen kjørbar rute (`lock_score_visibility` hardkodet `false` i `lib/games/editGameInitialValues.ts:131`) — ikke drevet på staging |
| — | Nye i18n-nøkler, ingen MISSING_MESSAGE | **PASS** | 0 console errors i alle tre runde-2-kjøringene; pending-labels rendret på norsk («Publiserer …», «Lagrer utkast …») |

## Staging-bevis

| Akseptansepunkt | Struktur-orakel | Feillogg | SQL-orakel |
|---|---|---|---|
| A · #1384 hint + aria under «Lagre utkast» | `#draft-missing-name` synlig, knapp `disabled`, `aria-describedby="draft-missing-name"`; med navn: hint borte, knapp aktiv ✅ | tom ✅ | N/A |
| B · #1398 pending på begge knappene | publiser: `aria-busy=true` + «Publiserer …» + begge disabled ✅; utkast: `aria-busy=true` + «Lagrer utkast …» + begge disabled ✅ | tom ✅ | N/A |
| C · #1400 «Avslør på slutten» overlever feilet publisering | radioen står fortsatt på «Avslør på slutten» (`checked:true`), skjult felt `reveal`, sideturnering-boksen beholder `checked:true` ✅ | tom ✅ | 1 rad ✅ (`score_visibility='reveal'`, `status='scheduled'`); 0 rader etter det feilede forsøket ✅ |
| D · utkast-knappen når serveren via manuell dispatch | redirect til `/admin/games/<id>?status=draft_created` ✅ | tom ✅ | 1 rad ✅ (`status='draft'`) |

Prod-vakt: alle Supabase-kall mot staging-ref ✅ (10 kall over 3 kjøringer — 4 + 3 + 3 — 0 avvik,
eneste host `snwmueecmfqqdurxedxv.supabase.co`). Service-role-REST-kallene fra driveren går gjennom
`lib2.rest`, som hard-stopper på ikke-staging-URL. Innloggingen brukte staging-mintet OTP (303).
Dev-server booted fra DENNE worktreen (pid 83739, `lsof -a -p 83739 -d cwd` = worktree-stien) på
port 3142 etter `rm -rf .next`; stoppet etterpå (0 lyttere igjen).
Opprydding: 3 `games`-rader + 6 `game_players`-rader slettet; `games?name=like.E2E-1400*` → `[]` i
alle tre kjøringene ✅. Kast-og-glem-probetrærne fjernet. `git status` rent.

## Findings (runde 2)

### F1 — **LØST**
`ReadyStep.tsx:245-260` + `GameWizard.tsx:920`. Bevist på staging (tabellen over) og låst av
`GameWizard.test.tsx:246-270`, som er rød uten fiksen.

### F2 — **LØST i samme slengen**, eget issue ikke lenger nødvendig
Sideturnering-checkboxen fra #1011 overlever nå den feilede publiseringen. Det følger av
konstruksjonen: uten `formAction`-dispatch kjører react-dom aldri `requestFormReset` på veiviser-
formen, så *ingen* felt i den formen nullstilles lenger.

### F5 — `ReadyStep.tsx:242-243` (kommentaren) · **informativt**
Kommentaren selger `formAction` som «fallback før hydrering». Den fallbacken kan ikke fungere som
progressive enhancement, siden `useActionState` her wrapper en klient-closure, ikke en server-action-
referanse. Uskadelig (identisk med situasjonen før PR-en), men kommentaren lover mer enn koden gir.

### F6 — `GameWizard.tsx:1047-1051` · **informativt**
Kommentaren sier fortsatt at radioene «nullstilles av React-doms `requestFormReset` ved hver
action-dispatch». Etter `cadb826f` skjer det ikke på den manuelle stien — hidden-inputen er nå belte
og seler, ikke eneste redning. Ren dokumentasjons-drift.

### F7 — atferdsendring verdt å vite om · **informativt**
Fordi formen ikke lenger resettes, beholder også felt som settes *utenom* React-staten verdien sin
etter et forsøk. Det merkes ikke i produktet (ingen slik flate finnes), men det endret
verifiserings-teknikken: runde-1-trikset «blank det skjulte tee-off-feltet og trykk publiser»
reparerer seg ikke selv lenger, så runde 2 måtte fikse tee-off-en gjennom ekte klikk (tilbake til
steg 3, ny tid) før den ekte publiseringen. Ikke et produkt-funn.

### F3 / F4 — uendret fra runde 1
Complexity-advarslene står (0 errors), og radiogruppe-semantikken i veiviser-stien er fortsatt
`name`-løs per kontraktens design. Ingen av dem blokkerer.

## Anbefaling

Merge. #1384, #1398, #1399 og #1400 er alle dekket, blockeren er borte og #1011-tvillingen fulgte
med. F5/F6 er to kommentar-linjer som kan strammes ved neste berøring av fila — ikke verdt en egen
runde.
