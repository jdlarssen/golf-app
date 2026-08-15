# Evaluering — #1383 «Foreldet ?step-lenke starter veiviseren på steg 1»

**NEEDS WORK**

PR #1652 · branch `claude/forge-auto-issue-0715fa` · commit `9e8a1f2b`

Kontraktens fem kriterier er alle oppfylt slik de er formulert, og alle fem porter er
grønne når jeg kjører dem selv. Men reset-en fyrer også på en helt legitim, arrangør-
utløst steg-overgang: **første «Neste» i cup-opprettelsen blir spist** — på begge dører
(`/admin/games/new` og `/opprett-spill`). Det er verifisert live mot staging-dev-serveren
på port 3457 (kjører fra denne worktreen — `lsof -a -p 58257 -d cwd` bekreftet), ikke bare
i en mock. Cup er én av fire arrangement-typer i kjerne-sløyfa «opprett → bli med → spill
→ avslutt», så dette er en regresjon som ikke kan merges.

Rot-årsaken er ett ledd: `searchParamsString` ble lagt i effektens dep-array, som gjorde
effekten om fra «kjør én gang ved mount» til «kjør ved hver navigasjon». Reset-avgjørelsen
er bare riktig ved mount. De tre første funnene faller sammen med samme fiks.

---

## Kriterier

| # | Kriterium | Verdikt | Evidens jeg selv produserte |
|---|---|---|---|
| 1 | `?step=5` i fersk fane → steg 1, URL uten `?step` | **PASS** | Live Playwright mot :3457, tømt sessionStorage: `C1 /admin/games/new?step=5 → url: http://localhost:3457/admin/games/new \| Steg 1 av 5` |
| 2 | `/opprett-spill?intent=cup&step=3` → steg 1, `?intent=cup` bevart | **PASS** | `C2 → url: http://localhost:3457/opprett-spill?intent=cup \| Steg 1 av 2` |
| 3 | Utkast-gjenopptakelse (#1380-regresjonsvern) | **PASS** | `C3 after Neste → …?step=2 \| Steg 2 av 5`; `C3 after reload → …?step=2 \| Steg 2 av 5`; `sessionStorage keys: ["wizard:/admin/games/new"]` |
| 4 | Én reset-test; de to endrede testene dokumentert i commit-body | **PASS (m/ merknad)** | `GameWizardStepHistory.test.tsx:166–180` (ny test), `:129` og `:159` (seed lagt til, assertions urørt), commit-body avsnitt 3. Se F7 |
| 5 | `tsc` + `lint` + `vitest` grønn | **PASS** | `npx vitest run "app/[locale]/admin/games/new"` → `Test Files 20 passed (20) / Tests 244 passed (244)`; `npx tsc --noEmit` → `TSC_EXIT=0`; `npm run lint` → `✖ 55 problems (0 errors, 55 warnings)` (alle 55 i urørte filer); i tillegg `npm run build` → `BUILD_EXIT=0` |
| Port | Staging-klikkrunde | **UTILSTREKKELIG** | AP1–AP3 dekker de tre mount-tilfellene. Ingen av dem klikker seg framover fra steg 1 — som er nøyaktig der regresjonen bor. Se F1 |
| — | `.changes/`-notat gyldig | **PASS** | `node scripts/weekly-release.mjs --dry-run` → `DRYRUN_EXIT=0`, notatet listet som `fix: 1383-veiviser-foreldet-steglenke.md` |
| — | Scope + `Refs #1383` | **PASS** | 3 filer, alle på oppgaven; ingen drive-by. `git log -1` viser `Refs #1383` |

---

## Funn

### F1 — HIGH: reset-en spiser første «Neste» i cup-opprettelsen (begge dører)

**Hvor:** `app/[locale]/admin/games/new/GameWizard.tsx:226–251` (effekten), sammen med
`:510–518` (cup-grenen i `WizardBody` som med vilje aldri skriver utkast).

**Hva som er galt.** Effekten fikk `searchParamsString` i dep-arrayet (`:251`), så den
kjører nå på nytt ved HVER steg-navigasjon — ikke bare ved mount. Ved hver kjøring er
eneste «finnes det noe å gjenoppta?»-signal sessionStorage-utkastet. Cup-opprettelses-
grenen (`isNewCupFlow`) kaller `clearWizardDraft(storageKey)` og returnerer uten å skrive
(`:511–518`), så i cup-flyten finnes det ALDRI et utkast — uansett hvor lenge arrangøren
venter. Når arrangøren da trykker «Neste» fra steg 1, ser skallet: ingen utkast + ingen
rute-seed (`initialValues` er `{scheduled_tee_off_at}` på admin-ruta, `undefined` på
`/opprett-spill`) + `?step=2` i URL-en → konkluderer «foreldet lenke» → `router.replace`
tilbake til steg 1. Dette er ikke en race: 1,2 sekunders pause endrer ingenting.

**Reproduksjon (live, staging-dev-server på :3457, innlogget som `E2E_ADMIN_EMAIL`):**

`/opprett-spill`, tømt sessionStorage → klikk «Cup» → vent 1200 ms → klikk «Neste»:

```
entry url:  http://localhost:3457/opprett-spill              | Steg 1 av 5
after «Neste» (cup): http://localhost:3457/opprett-spill     | Steg 1 av 2 | draft keys: []
second «Neste»:      http://localhost:3457/opprett-spill?step=2 | Steg 2 av 2
```

Samme på admin-døra:

```
step1 url:           http://localhost:3457/admin/games/new
after Neste (cup):   http://localhost:3457/admin/games/new   | Steg 1 av 2
intent tiles visible (=back on step 1): 1
after 2nd Neste:     http://localhost:3457/admin/games/new?step=2 | Steg 2 av 2
```

**Brukeropplevelsen:** arrangøren velger Cup, trykker «Neste», og ingenting skjer (sidens
steg-teller går 1 → 2 → 1 igjen). Andre trykk virker, fordi `didResetStep`-ref-en har
låst seg. Altså ikke en blokkert flyt, men et dødt første knappetrykk i en kjerne-flyt.

**Hvorfor porten ikke fanget det:** AP1–AP3 tester bare mount-tilfeller, og suiten kan
strukturelt ikke se det (se F6).

---

### F2 — MEDIUM: samme bounce for alle andre intents når navigasjonen slår 400 ms-debouncen

**Hvor:** samme effekt, `GameWizard.tsx:238–249`, mot debouncen i `:510–530`
(`DRAFT_WRITE_DEBOUNCE_MS = 400`).

**Hva som er galt.** For ikke-cup-intents finnes utkastet først 400 ms etter arrangørens
siste endring. Rekker RSC-rundturen å commite `?step=2` før den skrivingen, ser skallet
et tomt lager og fyrer samme reset. Vinduet er `(tid mellom klikk) + (nav-commit-latens)
< 400 ms`.

**Reproduksjon (enhetsnivå, med en router-mock som oppdaterer `searchParams` slik den
ekte gjør — klikk «Kompis», klikk «Neste» umiddelbart, re-render skallet):**

```
PROBE A2 replace calls: [["/admin/games/new",{"scroll":false}]]
```

**Ikke reprodusert live:** på dev-serveren tok nav-commiten > 400 ms, så utkastet rakk å
bli skrevet (`A2 fast kompis → url: …?step=2 | Steg 2 av 5`). Jeg kan altså ikke vise
symptomet i prod-lignende drift — men vinduet er ekte, og en raskere deploy (prefetchet
rute, warm RSC-cache) gjør det bredere. Behandles som samme rot-årsak som F1.

---

### F3 — MEDIUM: første navigasjon etter at et utkast dukker opp remounter hele veiviser-kroppen

**Hvor:** `GameWizard.tsx:226–236` (restore-grenen) + `:255` (`key={draft ? 'restored' : 'fresh'}`).

**Hva som er galt.** Restore-grenen kjører nå også ved hver navigasjon. Første gang den
finner et utkast, flipper `draft` fra `null` til objekt → `key` går `'fresh'` →
`'restored'` → **hele `WizardBody` unmountes og mountes på nytt midt i flyten**, seedet fra
utkastet slik det sto ved siste debouncede skriving. Alt arrangøren endret etter den
skrivingen blir stille rullet tilbake. Før denne PR-en kjørte effekten bare ved mount, så
en mid-flyt-remount var umulig.

**Reproduksjon (enhetsnivå): velg «Kompis» → la 400 ms-skrivingen gå → ombestem deg til
«Klubb» → «Neste» innenfor vinduet:**

```
PROBE B reverted to kompis? true
```

(Steg 2 rendret kompis-only-telleren «Hvor mange er dere?», altså var intent rullet
tilbake til kompis.)

**Ikke reprodusert live** — samme latens-grunn som F2. Selve remounten skjer likevel
alltid; det er datatapet som er tidsavhengig. I tillegg gir dette en `setDraft` med nytt
objekt per navigasjon (unødig render-churn), og utvider rekkevidden til den lokale
`react-hooks/set-state-in-effect`-disablingen fra «én gang per mount» til «per navigasjon».

---

### F4 — LOW/MEDIUM: ett-felts rute-seed viser fortsatt den oppdiktede oppsummeringen

**Hvor:** `GameWizard.tsx:181–185` (`isSeededFlow`).

Predikatet er binært: ett hvilket som helst felt ≠ `scheduled_tee_off_at` betyr «ikke rør
steget». `/opprett-spill?bane=<uuid>&step=5` seeder KUN `course_id`
(`app/[locale]/opprett-spill/page.tsx:286–289`) → ingen reset → «Klar?» viser default-
format (best ball), tomt roster og en bane arrangøren riktignok fikk med seg. Det er
nesten nøyaktig issue-ets egen klage, fortsatt reproduserbar via en delt `?bane=`-lenke.
Evidens i repoet: den nye testkonstanten `SEEDED_BY_ROUTE = { initialValues: { course_id:
'course-1' } }` demonstrerer at et `course_id`-seed alene slår av reset-en
(`GameWizardStepHistory.test.tsx:105–107`).

Ikke nødvendigvis feil valg — men det er et bevisst hull kontrakten ikke nevner, og det
bør enten dekkes eller skrives ned som akseptert restrisiko.

---

### F5 — LOW: `isSeededFlow` teller nøkler, ikke verdier

**Hvor:** `GameWizard.tsx:181–185`.

`Object.keys(initialValues ?? {}).some((key) => key !== 'scheduled_tee_off_at')` regner en
nøkkel med verdien `undefined` som et forvalg. Ingen konsument gjør det i dag (jeg leste
begge: `admin/games/new/page.tsx:345–348` og `opprett-spill/page.tsx:286–289`), så det er
ikke en bug nå. Men dagen noen legger et alltid-tilstedeværende valgfritt felt inn i
`initialValues` (`{ scheduled_tee_off_at, score_visibility: undefined }`), dør hele fiksen
stille, og ingen test fanger det. En verdi-sjekk (`v !== undefined && v !== ''`) eller en
eksplisitt liste over «ikke-signal»-felter ville gjort predikatet robust.

---

### F6 — INFO: testharnessen kan strukturelt ikke fange F1–F3

**Hvor:** `GameWizardStepHistory.test.tsx:23–32`.

`searchString` er en modul-variabel som settes én gang per test; `push`-mocken oppdaterer
den ikke, og ingenting re-rendrer skallet. Derfor ser skall-effekten aldri en endret
`searchParams` — som er nettopp den nye kjøre-stien. Den eksisterende testen «steg-overgang
arrangøren utløser pusher en history-entry» (`:117–125`) klikker akkurat sekvensen som
knekker live, men asserter bare på `push` og ser aldri reset-en. En mock der
`push`/`replace` skriver tilbake til `searchString` + en `rerender()` avslører alle tre
funnene (det var slik jeg reproduserte dem). Anbefales som del av fiksen.

---

### F7 — INFO: de to endrede testene er tilpasset, ikke svekket — men blank-flyt-dekningen forsvant

Assertions i begge (`:133–134` og `:161–162`) er ordrett uendret; det eneste som er lagt
til er et rute-seed i render-konteksten, med en forklarende docstring (`:99–107`) og
begrunnelse i commit-body-en. Det er ærlig håndverk, ikke grønnvasking. Merknaden: «skriver
ikke URL-en når den allerede speiler steget» dekket tidligere blank flyt på `?step=2`, og
den varianten er nå udekket av noen test — den nye #1383-testen dekker mount-tilfellet med
`?step=5`, ikke «blank flyt på `?step=2` skal ikke skrive URL-en».

---

## Retning for fiksen (ikke utført)

`searchParamsString` og `seededFlow` trenger ikke være i dep-arrayet i det hele tatt —
`react-hooks/exhaustive-deps` er allerede disablet på linja over (`:250`), og reset-
avgjørelsen er per definisjon en mount-avgjørelse. Går dep-arrayet tilbake til
`[storageKey, draftContext]`, forsvinner F1, F2 og F3 samtidig, og kriterium 1–3 (som jeg
har verifisert live) består uendret, siden alle tre er mount-tilfeller. Legg på en test
per F6 som beviser at en arrangør-utløst overgang fra steg 1 ikke resettes.

---

## Kommandoer jeg kjørte

```
npx vitest run "app/[locale]/admin/games/new"   → 20 filer / 244 tester passed
npx tsc --noEmit                                 → exit 0
npm run lint                                     → 0 errors, 55 warnings (urørte filer)
npm run build                                    → exit 0
node scripts/weekly-release.mjs --dry-run        → exit 0, notatet gyldig
```

Live-driving: Playwright via Bash mot `http://localhost:3457` (dev-server verifisert til å
kjøre fra DENNE worktreen), OTP mintet med service-role `generate_link` mot
`torny-staging`. Fire probe-kjøringer; ingen data skrevet (ingen spill opprettet — alle
kjøringer stoppet på steg 1/2 i veiviseren). Den midlertidige vitest-proben er slettet;
`git status` er ren bortsett fra den utrackede kontrakt-fila.
