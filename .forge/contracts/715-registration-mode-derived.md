# Forge-kontrakt: #715 — Derivér klubb-scope `registration_mode` i stedet for å synke i en effekt

**Issue:** [#715](https://github.com/jdlarssen/golf-app/issues/715) · **Type:** refactor · **Alvor:** P3 · **Flyt:** opprett-spill (kjerne)
**Branch:** `claude/wizardly-banach-4d22ff`
**Bruker-synlig endring:** Ingen tiltenkt → `refactor(...)`-commit, **ingen** version-bump, **ingen** CHANGELOG-oppføring.

---

## Bakgrunn

#692 (lint blocking-gate) avdekket en `react-hooks/set-state-in-effect`-feil i opprett-spill-veiviseren. Den ble undertrykt med en dokumentert `eslint-disable-next-line` for å holde #692 ren, og #715 sporer den ordentlige fixen.

`app/[locale]/admin/games/new/useGameFormState.ts` (linje 504–514) tvinger `registrationMode = 'invite_only'` for klubb-scope (#643) via en `useEffect` som kaller `setRegistrationMode` synkront:

```ts
const isClubScoped = groupId !== '';
useEffect(() => {
  if (isClubScoped && registrationMode !== 'invite_only') {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRegistrationMode('invite_only');
  }
}, [isClubScoped, registrationMode]);
```

React-regelen flagger dette som en cascading-render-risiko («you might not need an effect»). Effekten skriver til state under render-flushen, som trigger en ekstra render — nettopp anti-mønsteret regelen advarer mot.

### Hva som faktisk leser verdien (verifisert ved utforskning)

| Leser | Fil:linje | Rolle |
|---|---|---|
| Skjult input `registration_mode` | `GameForm.tsx:367-368` | **Serialisering** → server-payload |
| Skjult input `registration_mode` | `GameWizard.tsx:1006` | **Serialisering** → server-payload |
| `passthrough.registration_mode` (wizard→full-form) | `GameWizard.tsx:421` | Passeres som `initialValues` (re-deriveres i GameForm) |
| `playersStepOptional = registrationMode !== 'invite_only'` | `useGameFormState.ts:524` | **Publish-gating** (spiller-steg valgfritt) |
| `RegistrationSection`-radioer `checked={registrationMode === mode}` | `RegistrationSection.tsx:119/139/214` | UI-valg (skjult for klubb i wizard via `hideModeChoice={state.isClubScoped}`) |

Ingen leser trenger den **rå** admin-valgte modusen — alle skal ha den **effektive** (klubb-låste) verdien. `RegistrationOverviewSection.tsx` og `gamePayload.ts` leser den persisterte DB-verdien / form-data, **ikke** hooken.

Server-siden (`gamePayload.ts`) gjør **ingen** klubb→invite_only-flip selv — den leser bare `registration_mode` fra form-data (default `invite_only` ved tom). Den klient-deriverte verdien er altså det som faktisk bestemmer hva som persisteres. (`gamePayload.ts:2298` nedgraderer dessuten `publish`→`draft` hvis modus ≠ invite_only, så et klubb-spill MÅ serialisere `invite_only` for å publiseres normalt — bekrefter at riktig verdi på serialiserings-stedet er kritisk.)

---

## Designbeslutning (kode-org, mitt valg per «ingen tekniske beslutninger til bruker»)

**Gjør den returnerte `registrationMode` til den deriverte effektive verdien; behold det rå admin-valget i intern state.**

```ts
// Rå admin-valg (det brukeren faktisk klikket i påmeldings-radioene).
const [registrationModeChoice, setRegistrationMode] =
  useState<RegistrationMode>(initialValues?.registration_mode ?? 'invite_only');

const isClubScoped = groupId !== '';

// #643/#715: en klubb-turnering er medlemskaps-styrt og låses til invite_only.
// Vi DERIVERER den effektive modusen i stedet for å synke state i en effekt
// (react-hooks flagger setState-in-effect som cascading-render-risiko). Det rå
// valget (`registrationModeChoice`) bevares, så et klubb-spill som senere
// løsrives gjenoppretter valget. Alle lesere — serialisering, publish-gating,
// radio-UI — leser den effektive verdien via `registrationMode`.
const registrationMode: RegistrationMode = isClubScoped
  ? 'invite_only'
  : registrationModeChoice;
```

- `useEffect`-blokken (509–514) + `eslint-disable`-en fjernes.
- `useEffect` fjernes fra React-importen (linje 3) — det er den eneste bruken i fila, så ellers oppstår en `unused-import`-lint-feil (og #715 stammer fra lint-hygiene).
- Hookens **retur-form er uendret**: `registrationMode` (nå derivert) + `setRegistrationMode` (setter rå valg). Ingen ny eksport.
- `playersStepOptional` (524) leser allerede `registrationMode` → korrekt uten endring (klubb → derivert `invite_only` → `playersStepOptional = false`, akkurat som effekten ga).

**Hvorfor dette framfor issue-ets bokstavelige «legg til `effectiveRegistrationMode` og rewir payload-sites»:** radio-leseren MÅ uansett lese den effektive verdien for å bevare låsen (ellers ville radioen vise «open» mens payloaden lagret `invite_only`). Når den effektive verdien ER `registrationMode`, faller alle lesere (payload, gating, UI) på plass uten endring. Netto diff: **kun `useGameFormState.ts`** (+ evt. test-justering). Konsument-filer (`GameForm`, `GameWizard`, `RegistrationSection`) røres ikke.

### Bevisst bevart / ikke i scope
- **`GameForm.tsx` (full-form) røres ikke.** Den rendrer `RegistrationSection` uten `hideModeChoice`, så radioene vises for klubb-spill der. Under den deriverte verdien viser radioen `invite_only` og er de-facto uendrelig for klubb (klikk på «open» setter rå valg, men effektiv forblir `invite_only`) — identisk med dagens snap-back, bare uten det ekstra render-flashet. Ingen `hideModeChoice`-tillegg nødvendig.
- **Server-side håndheving** av klubb→invite_only er IKKE i scope (eksisterende gap; egen vurdering hvis ønskelig). Denne PR-en bevarer dagens klient-styrte adferd 1:1.

### Akseptert bi-effekt (ikke en regresjon)
Med effekten var klubb-låsen **destruktiv**: velg «open» → fest klubb → effekten overskrev det rå valget permanent. Løsriver du klubben igjen, sto modusen som `invite_only`. Med derivasjon er den **ikke-destruktiv**: det rå valget bevares og gjenopprettes ved løsriving. Klubb-velgeren er skjult i wizard mens klubb er festet, så forskjellen er kun observerbar i en sjelden fest-så-løsriv-sti og er en forbedring, ikke en bruker-synlig regresjon i kjerneflyten.

---

## Akseptansekriterier

- [x] **AC1 — Effekten fjernet.** `grep -n "useEffect"` → `NONE ✓` (både kall og import borte). Ingen `eslint-disable`-direktiv igjen (kun en prosa-kommentar som navngir regelen — påvirker ikke eslint).
- [x] **AC2 — Derivert effektiv modus.** `useGameFormState.ts:514-516` — `const registrationMode: RegistrationMode = isClubScoped ? 'invite_only' : registrationModeChoice;`. Rå valg i `registrationModeChoice` (`:471`) satt av `setRegistrationMode`. Retur (`:1589-1590`) eksponerer fortsatt `registrationMode` + `setRegistrationMode`.
- [x] **AC3 — Klubb låses i payloaden uavhengig av forrige valg.** `vitest run` → 35 passed; #643-test 1 (open→klubb→invite_only) + test 2 (pre-fylt klubb open→invite_only ved mount) grønne for den nye deriverte grunnen.
- [x] **AC4 — Ikke-klubb bevarer valg.** #643-test 3 grønn (`setRegistrationMode('open')` uten klubb → `'open'`).
- [x] **AC5 — Lint grønn.** `npx eslint "…/useGameFormState.ts"` → `ESLINT CLEAN ✓` (ingen set-state-in-effect, ingen unused import).
- [x] **AC6 — Typecheck grønn.** `npm run typecheck` → `TYPECHECK CLEAN ✓` (tsc --noEmit, hele prosjektet).
- [x] **AC7 — Konsumenter urørt.** `git status --short` → kun `M app/[locale]/admin/games/new/useGameFormState.ts` (+ contract-doc). `GameForm.tsx`/`GameWizard.tsx`/`RegistrationSection.tsx` uendret.

---

## Gates (kjøres scoped til endringen)

```bash
# 1. Co-located hook-test (Type A — pure logic)
npx vitest run "app/[locale]/admin/games/new/useGameFormState.test.ts"

# 2. Lint på den endrede fila (issue-ets kjerne-gate)
npx eslint "app/[locale]/admin/games/new/useGameFormState.ts"

# 3. Typecheck (hele prosjektet — fanger evt. retur-form-brudd hos konsumenter)
npm run typecheck
```

Ingen `next build` nødvendig: endringen legger ikke til noe `GameMode`-union-medlem, så ingen uttømmende switch/Record må oppdateres (jf. tsc-gate-fellen). `tsc --noEmit` over hele prosjektet er tilstrekkelig.

---

## Test-plan (test-disiplin: Type A, refactor < 3 filer → ingen alignment-seremoni)

De **3 eksisterende** `#643`-testene i `useGameFormState.test.ts` (linje 418–466) er sannhets-ankeret og skal passere **uendret** — de validerer nå den deriverte adferden i stedet for effekt-adferden:
1. «tvinger registrationMode til invite_only når en klubb velges» (AC3)
2. «normaliserer et pre-fylt klubb-spill med ikke-invite-modus ved mount» (AC3)
3. «lar ikke-klubb-spill beholde valgt modus (ingen tvang)» (AC4)

**Ingen nye tester** med mindre en gate avdekker et hull. Den ikke-destruktive løsriv-adferden er en akseptert bi-effekt, ikke en kontrakts-garanti — vi låser den ikke med en ny test (unngår «mens jeg var her»-tester per test-disiplin). Hvis evaluator mener løsriv-stien fortjener en regresjons-guard, legges nøyaktig ÉN fokusert test til.

---

## Commit-plan

Én atomisk `refactor(...)`-commit (ingen bump):

```
refactor(wizard): derive club-scope registration_mode instead of syncing in an effect

Replace the setState-in-effect that forced invite_only for club-scoped games
with a derived effective value. The raw admin choice is kept in its own state
and restored if the club is later detached. Removes the
react-hooks/set-state-in-effect eslint-disable. No consumer changes, no
user-visible behavior change.

Refs #715
```
