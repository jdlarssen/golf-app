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
