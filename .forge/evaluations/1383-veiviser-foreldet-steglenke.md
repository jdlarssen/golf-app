# Evaluering — #1383 «Foreldet ?step-lenke starter veiviseren på steg 1»

**ACCEPT** (runde 2)

PR #1652 · branch `claude/forge-auto-issue-0715fa` · HEAD `348c40c4` (fiks-commit `a1265506`)

Runde 1 sitt HIGH-funn er borte, og jeg har bevist det i begge retninger: med fiksen står
cup + «Neste» på steg 2 på begge dørene; setter jeg dep-arrayet tilbake slik det sto i
`9e8a1f2b`, bouncer den samme klikkesekvensen tilbake til steg 1 igjen — live og i
enhetstesten. Regresjonslåsen er altså ikke pynt: den feiler når feilen gjeninnføres.
Alle fem kriterier og alle porter er grønne på kommandoer jeg selv kjørte. F4 er ikke
rettet, men er nå eksplisitt akseptert restrisiko i kontrakten og filet som #1653 (åpen,
med milestone) — det var runde 1 sitt eneste krav til den.

Ingen nye blokkerende funn. Tre INFO-merknader nederst.

---

## Kriterier

| # | Kriterium | Verdikt | Evidens jeg selv produserte |
|---|---|---|---|
| 1 | `?step=5` i fersk fane → steg 1, URL uten `?step` | **PASS** | Live :3457, tømt sessionStorage: `C1 \| url=http://localhost:3457/admin/games/new \| Steg 1 av 5 \| radios=4 \| ss=[]` |
| 2 | `/opprett-spill?intent=cup&step=3` → steg 1, `?intent=cup` bevart | **PASS** | `C2 \| url=http://localhost:3457/opprett-spill?intent=cup \| Steg 1 av 2 \| ss=[]` |
| 3 | Utkast-gjenopptakelse (#1380-regresjonsvern) | **PASS** | `C3 after Neste \| …?step=2 \| Steg 2 av 5 \| ss=["wizard:/admin/games/new"]`; `C3 after reload \| …?step=2 \| Steg 2 av 5` — ingen reset |
| 4 | Én reset-test; de to endrede testene dokumentert | **PASS** | `GameWizardStepHistory.test.tsx:180–214` (to #1383-tester), `:143` og `:173` (`SEEDED_BY_ROUTE`, assertions ordrett urørt), begrunnelse i `9e8a1f2b`-body. Ny test er bevist bærende — se F6 |
| 5 | `tsc` + `lint` + `vitest` grønn | **PASS** | `npx vitest run "app/[locale]/admin/games/new"` → `Test Files 20 passed (20) / Tests 245 passed (245)`; `npx tsc --noEmit` → `TSC_EXIT=0`; `npm run lint` → `✖ 55 problems (0 errors, 55 warnings)`, ingen i endrede filer; `npm run build` → `BUILD_EXIT=0` |
| Port | Staging-klikkrunde | **PASS** | Egne kjøringer mot :3457 (dev-server verifisert: `lsof -a -p 58257 -d cwd` → denne worktreen, `next-server v16.2.6`). PR-kommentar 12:53:03Z dekker AP4 (cup→Neste) etter fiks-commiten; `staging-verified`-labelen står altså på riktig tilstand |
| — | `.changes/`-notat gyldig | **PASS** | `node scripts/weekly-release.mjs --dry-run` → `DRYRUN_EXIT=0`, notatet listet som `fix: 1383-veiviser-foreldet-steglenke.md` og folder til en #1383-linje |
| — | Scope + `Refs #1383` | **PASS** | Kun `GameWizard.tsx`, `GameWizardStepHistory.test.tsx`, `.changes/`-notatet + forge-bokføring. `a1265506` har `Refs #1383` og `[no-changelog]` (korrekt: retter en regresjon i samme PR) |

---

## Runde 1-funnene — er de faktisk rettet?

### F1 (HIGH) — **RETTET, verifisert i begge retninger**

Fiksen er `GameWizard.tsx:266`: dep-arrayet er `[storageKey, draftContext]`. Begge er
primitive strenger (`wizardDraftStorageKey` → `` `wizard:${pathname}` ``,
`wizardDraftContext` → `join('|')`), så effekten er en ekte mount-avgjørelse igjen.

**Med fiksen** (cup-flisen er `[role=radio]` nr. 2, merket «vs»), tomt utkast-lager:

```
===== CUP CASE on /opprett-spill =====
after cup pick        | url=…/opprett-spill          | Steg 1 av 2 | ss=[]
after 1st Neste (T+1.5s) | url=…/opprett-spill?step=2 | Steg 2 av 2 | ss=[]
after 1st Neste (T+4.0s) | url=…/opprett-spill?step=2 | Steg 2 av 2 | ss=[]
forms on page: 1
===== CUP CASE on /admin/games/new =====
after 1st Neste (T+4.0s) | url=…/admin/games/new?step=2 | Steg 2 av 2 | ss=[]
```

`ss=[]` gjennom hele sekvensen bekrefter at dette er nøyaktig tilstanden som brøt: cup
skriver aldri utkast, så det finnes ingenting å «gjenoppta».

**Kontroll — jeg satte dep-arrayet tilbake til `9e8a1f2b`-formen**
(`[storageKey, draftContext, searchParamsString, seededFlow]`) og kjørte samme probe:

```
after 1st Neste (T+1.5s) | url=…/opprett-spill        | Steg 1 av 2 | ss=[]
after 1st Neste (T+4.0s) | url=…/opprett-spill        | Steg 1 av 2 | ss=[]
forms on page: 0
```

Bouncen kom tilbake på begge dørene. Filen er tilbakestilt (`git checkout --`), `git
status` og `git diff --stat` er tomme.

**Er mount-only dep-arrayet riktig?** Ja, med to forbehold jeg har sjekket:
- *Ingen stale closure.* Effekt-closuren bygges på nytt hver render; React kjører den
  fra SISTE render når en dep endres. `searchParamsString`/`seededFlow` leses derfor
  alltid som de var i den renderen effekten faktisk kjørte i.
- *Kan `storageKey`/`draftContext` endre seg mens komponenten står montert?* Bare hvis
  `pathname`, `initialIntent`, `tournament_id`, `game_mode`, `lock_game_mode` eller
  `group_id`/`defaultGroupId` endres — altså en URL-endring på `?intent=`/`?klubb=`/`?fra=`.
  `urlForStep` (`:410–416`) bevarer alle params og rører kun `step`, og jeg fant ingen
  annen klient-skriving av de paramene (grep over `GameWizard.tsx` + `IntentSelector.tsx`).
  `/opprett-spill` remounter dessuten skallet via `key={wizardKey}` når `?fra=`/`?bane=`
  endres (`opprett-spill/page.tsx:392`). Se N2 for det som teoretisk står igjen.

### F2 (MEDIUM) — **RETTET**

Samme rot-årsak. Verifisert live med et klikk uten opphold (godt innenfor
`DRAFT_WRITE_DEBOUNCE_MS = 400`):

```
F2 fast kompis | url=…/admin/games/new?step=2 | Steg 2 av 5 | ss=["wizard:/admin/games/new"]
```

### F3 (MEDIUM) — **RETTET**

Velg kompis → vent 900 ms (utkastet skrives) → bytt til klubb → «Neste» umiddelbart:

```
F3 after Neste | url=…/admin/games/new?step=2 | Steg 2 av 5
F3 kompis-only counter on step 2 (1 = reverted to kompis, 0 = klubb kept): 0
F3 intent selected after going back: "Klubb-turnering"
```

Ingen midt-i-flyten-remount, ingen tilbakerulling til det 400 ms gamle utkastet.

### F4 (LOW/MED) — **IKKE RETTET, akseptert og sporet — OK**

Fortsatt reproduserbar, akkurat som beskrevet:

```
D4 | url=…/opprett-spill?bane=fb23d113-…&step=5 | Steg 5 av 5
D4 mentions «Klar?»: true | mentions best ball: true
```

Runde 1 krevde ikke en fiks, men at hullet enten dekkes eller skrives ned. Det er gjort:
kontraktens «Runde 2»-seksjon kaller det akseptert restrisiko, og
`gh issue view 1653` → `OPEN`, tittel «Ett-felts rute-seed (?bane=) slipper foreldet
?step forbi #1383-reset-en», labels `bug` + `area:admin`, milestone «Backlog — uplanlagt
/ scale-triggered». Merk at dette ikke er en regresjon fra denne PR-en — det er den
delen av #1383 som ikke ble lukket.

### F5 (LOW) — **RETTET**

`isSeededFlow` (`GameWizard.tsx:186–191`) ser nå på verdien:
`key !== 'scheduled_tee_off_at' && value !== undefined && value !== ''`.

Jeg leste begge konsumentene for å sjekke at ingen bryter:
- `admin/games/new/page.tsx:345–348` — `{ scheduled_tee_off_at }`, evt. + cup-seed
  (`lock_game_mode: true`, `tournament_id`, …) → blank forblir blank, cup forblir seedet.
- `opprett-spill/page.tsx:286–289` — `undefined`, `{ course_id }` eller revansje-objektet.
  `buildRevansjeInitialValues` (`lib/games/buildRevansjeInitialValues.ts:55–63`) setter
  alltid `lock_game_mode: false` — `false` passerer verdi-sjekken, så revansje-flyten
  regnes fortsatt som seedet. Verifisert live: `E1` (cup-lenke) og `D4` (`?bane=`)
  oppfører seg som seedet.

Eneste atferdsendring vs. nøkkel-telling er nøkler satt til `undefined`/`''` — ingen
konsument gjør det. Ingen regresjon.

### F6 (INFO) — **RETTET, og låsen er bevist bærende**

`push`/`replace`-mockene skriver URL-en tilbake til `searchString`
(`GameWizardStepHistory.test.tsx:29–34`), og den nye testen re-rendrer skallet (`:196`).
Jeg reverterte dep-arrayet og kjørte testfila:

```
FAIL  GameWizardStepHistory.test.tsx > #1383 foreldet ?step-lenke >
      rører ikke steget når arrangøren selv går videre fra steg 1
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
  1st vi.fn() call: [ "/admin/games/new", { "scroll": false } ]
 Test Files  1 failed (1) / Tests  1 failed | 6 passed (7)
```

Ikke vakuøs.

### F7 (INFO) — **AVKLART**

Premisset er invertert av fiksen, som kontrakten sier: blank flyt på `?step=2` SKAL nå
resettes. Verifisert live:

```
D1 | url=http://localhost:3457/admin/games/new | Steg 1 av 5 | radios=4 | ss=[]
```

(åpnet på `/admin/games/new?step=2` med tømt sessionStorage). Enhetstesten dekker
`?step=5`-varianten; det er samme gren (`parseStepFromSearch(params) === 1`-guarden), så
jeg regner ikke `?step=2` som en egen udekket sti.

---

## Egne angrep på den nye koden

**`didResetStep`-låsen kan ikke slå til feil.** Den settes kun på linja rett før
`router.replace` (`:250`), altså aldri uten at en reset faktisk skjer. Alle tidlige
returns (`found`, `seededFlow`, `step === 1`) lar den stå `false`. Jeg fant ingen sti der
en legitim reset blir undertrykt: etter en reset er `?step` borte fra history (replace,
ikke push), så det finnes ingen framover-entry å komme tilbake til.

**Ingen back-felle etter reset:**

```
D2 after reset | url=…/admin/games/new | Steg 1 av 5
D2 url after back: http://localhost:3457/
```

**Flyten er brukbar etter en reset** (ikke bare kosmetisk riktig):

```
D3 landed     | url=…/admin/games/new        | Steg 1 av 5
D3 after Neste| url=…/admin/games/new?step=2 | Steg 2 av 5
```

**Reset + cup-lenke i kombinasjon:**

```
E1 after reset | url=…/opprett-spill?intent=cup        | Steg 1 av 2
E1 after Neste | url=…/opprett-spill?intent=cup&step=2 | Steg 2 av 2
```

---

## Nye funn (ingen blokkerende)

### N1 — INFO: det foreldede steget vises et øyeblikk før reset-en lander

Målt på dev-serveren, `/admin/games/new?step=5` med tomt lager (sample hver 250 ms):

```
0ms:(no counter)  250ms:(no counter)  500ms:Steg 5 av 5 … 2000ms:Steg 5 av 5
2250ms:Steg 1 av 5 … 3250ms:Steg 1 av 5
```

Altså ~1,5–1,75 s med den oppdiktede «Klar?»-oppsummeringen før den snapper til steg 1.
Dette er iboende i designet, ikke en feil i implementasjonen: avgjørelsen avhenger av
sessionStorage, som ikke finnes på serveren, så den kan ikke tas som en server-redirect.
Tallet er dessuten dev-oppblåst (RSC-kompilering per navigasjon); i prod er det
RSC-rundturen alene. Sluttilstanden er riktig, og det er uansett strengt bedre enn før
(der skjermen ble stående). Nevnes for ærlighetens skyld, ikke som krav.

### N2 — INFO: teoretisk reset midt i flyten hvis `draftContext` endres mens montert

Endres `?intent=`/`?klubb=`/`?fra=` uten at skallet remounter, kjører effekten på nytt.
`loadWizardDraft` sletter da utkastet på kontekst-mismatch
(`wizardStatePersistence.ts:343–346`) og reset-grenen kan sende en arrangør på steg ≥2
tilbake til steg 1. Jeg fant ingen trigger for det i appen: veiviseren skriver aldri de
paramene, `/opprett-spill` remounter via `key` på `?fra=`/`?bane=`, og
utkast-slettingen ved kontekstbytte er uansett eksisterende #1380-atferd. Ikke
reproduserbart i dag — noteres kun så det ikke oppdages på nytt som «mystisk».

### N3 — INFO: regresjonslåsen bruker kompis-flisen, ikke cup

Testen (`:181–199`) låser rot-årsaken (avgjørelsen skal ikke tas på nytt ved navigasjon),
og det er riktig nivå. Men den cup-spesifikke egenskapen — «denne grenen skriver ALDRI
utkast, så vinduet er permanent, ikke 400 ms» — er kun dekket av staging-runden. Godt nok;
nevnes for framtidig kontekst.

### Observert, ikke relatert

Alle live-kjøringer (også kontroll-kjøringene med gammel kode) logget
`REQFAIL …/rest/v1/notifications?select=id&user_id=eq.…&read_at=is.null` — en
notifikasjons-poll fra app-skallet som avbrytes ved navigasjon/lukking. Ingenting i denne
diffen rører den. Ingen andre console-errors, og eneste Supabase-host var
`snwmueecmfqqdurxedxv.supabase.co` (staging — prod-vakt OK).

---

## Kommandoer jeg kjørte

```
npx vitest run "app/[locale]/admin/games/new"   → 20 filer / 245 tester passed
npx tsc --noEmit                                 → TSC_EXIT=0
npm run lint                                     → 0 errors, 55 warnings (urørte filer)
npm run build                                    → BUILD_EXIT=0
node scripts/weekly-release.mjs --dry-run        → DRYRUN_EXIT=0, notatet gyldig
gh issue view 1653 / gh pr view 1652             → #1653 OPEN m/ milestone; PR head = 348c40c4
```

Live-driving: Playwright via Bash mot `http://localhost:3457` (dev-server verifisert til
DENNE worktreen, PID 58257), OTP mintet med service-role `generate_link` mot
`torny-staging`. Fem probe-kjøringer, inkludert to kontroll-kjøringer med bevisst
reintrodusert feil. Ingen data skrevet — ingen kjøring gikk lenger enn steg 2 i
veiviseren, ingen spill opprettet. Alle probe-filer ligger i scratchpad utenfor repoet og
er slettet; `GameWizard.tsx` er tilbakestilt etter kontroll-eksperimentet, og `git status`
er ren bortsett fra denne evalueringsfila.
