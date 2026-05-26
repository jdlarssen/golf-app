# Kontrakt: Sanity-warning for tee-lengde utenfor typisk norsk range

**Issue:** [#236](https://github.com/jdlarssen/golf-app/issues/236)
**Branch:** `claude/infallible-bardeen-393b0b`
**Utsatt fra:** Fase 1 av #223 (courses-vedlikehold-arbeidet)

## Bakgrunn

`tee_boxes.length_meters` aksepterer 1000–12000 meter (DB CHECK). Norske
herrebaner ligger typisk 5400–6500 m, damer 4800–5800 m, junior 4500–5500 m.
Hvis admin taster 4500 (for en herre-tee) eller 7500 (for en hvilken som
helst tee) ved feiltagelse: ingen advarsel i dag.

Vi vil ha en **soft-warning** under feltet — informerer uten å blokkere
lagring. Inline-tilbakemelding fanger åpenbare typos før de havner i DB.

## Datamodell-kontekst (avgjørende)

`tee_boxes`-tabellen har **ingen** gender-kolonne. Hver rad har slope/CR/par
for opptil tre kjønn samtidig (`*_mens`, `*_ladies`, `*_juniors`). En "gul
herre/dame-tee" er én tee_boxes-rad med to gender-triplets fylt ut.

Konsekvens: warning-rangen må beregnes fra **hvilke gender-blokker som er
fylt ut** for den tee-en — ikke fra tee-navn eller farge.

## Gray areas — beslutninger

### 1. Range-strategi: union av aktive kjønn
For hver tee samles range-en til en union av alle gender-blokker som har
data (slope eller CR fylt). Hvis ingen gender er fylt → ingen warning
(vi vet ikke målgruppen).

| Aktive gender-blokker        | Effektiv range (m) |
| ---------------------------- | ------------------ |
| ingen                        | (ingen warning)    |
| bare mens                    | 5300–6600          |
| bare ladies                  | 4700–5900          |
| bare juniors                 | 4400–5600          |
| mens + ladies                | 4700–6600          |
| mens + juniors               | 4400–6600          |
| ladies + juniors             | 4400–5900          |
| mens + ladies + juniors      | 4400–6600          |

Disse er **±100m romsligere** enn de eksakte tallene i issue-en — fanger
typos uten å gi falske warnings ved grenseverdier (f.eks. 6550 m på
en lang herretee skal ikke utløse).

Gender-blokk regnes som "aktiv" hvis enten slope eller CR er fylt — samme
heuristikk som eksisterende `hasGenderData()`-helper i `CourseForm.tsx`.

### 2. Copy-formuleringer

Warning-strengen avhenger av retning (kort/lang) og hvilke kjønn som er
aktive. Form:

```
Uvanlig <kort|lang> for norsk <gender-tekst> (<min>–<max> m).
```

| Aktive gender-blokker        | gender-tekst             |
| ---------------------------- | ------------------------ |
| bare mens                    | `herretee`               |
| bare ladies                  | `dametee`                |
| bare juniors                 | `juniortee`              |
| mens + ladies                | `dame-/herretee`         |
| mens + juniors               | `herre-/juniortee`       |
| ladies + juniors             | `dame-/juniortee`        |
| mens + ladies + juniors      | `tee for alle kjønn`     |

Retning:
- `length_meters < min` → `kort`
- `length_meters > max` → `lang`

Eksempler:
- 4500 m, bare herrerating: `"Uvanlig kort for norsk herretee (5300–6600 m)."`
- 7000 m, herre+dame: `"Uvanlig lang for norsk dame-/herretee (4700–6600 m)."`
- 4400 m, herre+dame: `"Uvanlig kort for norsk dame-/herretee (4700–6600 m)."`

### 3. UI-pattern: bytte hint til warning-tekst

`Input`-komponenten i `components/ui/Input.tsx` har allerede `hint` (muted)
og `error` (danger-rød). Vi legger til en tredje variant: `warning` —
samme posisjon under feltet, men i `text-warning` (amber-token fra
`globals.css`).

Prioritet (eksisterende + ny):
1. `error` (rød) — server-side validation feil
2. `warning` (amber) — soft sanity warning (vår nye)
3. `hint` (muted) — standard hjelpetekst

Når warning er aktiv: skjul `hint`. Når hverken warning eller error:
vis `hint` som før.

### 4. Scope: kun `CourseForm.tsx`

`CourseForm.tsx` brukes både i `/admin/courses/new` og
`/admin/courses/[id]/edit` (samme komponent, ulik server-action).
Endring her dekker begge flyter. Ingen andre steder taster admin
`length_meters` per d.d.

## Suksess-kriterier

- [ ] **K1 — Pure helper finnes:** `lib/courses/teeLengthWarning.ts`
  eksporterer `getTeeLengthWarning(tee: TeeBoxData): string | null` som
  returnerer warning-tekst eller `null`. Funksjonen er ren (deterministisk,
  ingen side-effekter).

- [ ] **K2 — Helper håndterer alle 8 gender-kombinasjoner:** Unit-tester
  i `lib/courses/teeLengthWarning.test.ts` dekker:
  - Ingen aktiv gender → `null` (selv ved ekstrem length)
  - Bare mens, length innenfor 5300–6600 → `null`
  - Bare mens, length < 5300 → "Uvanlig kort for norsk herretee (5300–6600 m)."
  - Bare mens, length > 6600 → "Uvanlig lang for norsk herretee (5300–6600 m)."
  - Bare ladies, length 5000 → `null`
  - Bare ladies, length 4500 → "Uvanlig kort … dametee (4700–5900 m)."
  - Bare juniors, length 5700 → "Uvanlig lang … juniortee (4400–5600 m)."
  - mens + ladies, length 6700 → "… for norsk dame-/herretee (4700–6600 m)."
  - mens + ladies + juniors, length 7000 → "… for norsk tee for alle kjønn (4400–6600 m)."
  - Tomme/ugyldige length-strenger (`""`, `"abc"`) → `null`
  - Grense-verdier (eksakt min/max) → `null` (inklusiv)

- [ ] **K3 — `Input`-komponenten støtter `warning`-prop:** `components/ui/Input.tsx`
  tar imot `warning?: string` og rendrer den i `text-warning` med samme
  layout som `hint`. Prioritet error > warning > hint. Eksisterende
  bruksområder upåvirket (alle `hint`/`error`-callsites kompilerer som før).

- [ ] **K4 — `CourseForm` viser warning under banelengde:** Tee-boks-input
  `tee_${index}_length_meters` får `warning={getTeeLengthWarning(tee)}` så
  warning reaktivt oppdateres når admin endrer length eller toggler
  gender-blokker.

- [ ] **K5 — Lagring ikke blokkert:** Server-actions
  (`app/admin/courses/new/actions.ts` + `app/admin/courses/[id]/edit/actions.ts`)
  endres ikke; uvanlige verdier (innenfor DB CHECK 1000–12000) lagres som
  før. Verifiseres ved at ingen actions.ts-fil er endret i diffen.

- [ ] **K6 — Versjon + CHANGELOG:** `package.json` bumpes
  (`1.29.0 → 1.30.0` for ny user-visible feature) og `CHANGELOG.md` får
  oppføring i samme commit som den brukervisible endringen. Tagline på
  Jørgen-språk («Når du …»/«Hvis du …»), kjørt gjennom humanizer.

- [ ] **K7 — Norsk språk-kvalitet:** Pre-commit-hook (`.githooks/pre-commit`)
  rapporterer ingen new-line-treff for AI-tells i de norske strengene som
  legges til. `range` ikke brukt; idiomatisk norsk gjennomgående.

## Gates

Kjøres etter hver chunk og før formal evaluate:

```bash
npm run typecheck   # skal være: tsc --noEmit (sjekk om dette finnes)
npm run lint
npm run test -- lib/courses/teeLengthWarning
npm run build
```

Merknad: `package.json` lister ikke en `typecheck`-script. Hvis det
mangler: bruk `npx tsc --noEmit` direkte som gate i stedet.

## Out of scope

- Endring av DB CHECK-grensene (1000–12000 forblir).
- Server-side validation av "uvanlig" length (det er en advarsel, ikke en feil).
- Warning på inline tee-box-redigering andre steder enn `CourseForm`
  (ingen slik flate finnes per d.d.).
- Refaktorering av eksisterende `hint`/`error`-callsites.
- Per-kjønn-separate warnings (forkastet til fordel for union).
- Norske-vs-internasjonale ranges (Tørny er norsk-først, range-en er fast
  basert på norske typiske baner).

## Filer som vil endres

1. **Ny:** `lib/courses/teeLengthWarning.ts` — pure helper
2. **Ny:** `lib/courses/teeLengthWarning.test.ts` — vitest unit tests
3. **Endres:** `components/ui/Input.tsx` — legg til `warning?` prop
4. **Endres:** `app/admin/courses/CourseForm.tsx` — wire helper inn på
   `length_meters`-feltet
5. **Endres:** `package.json` — version bump
6. **Endres:** `CHANGELOG.md` — ny oppføring

## Test plan (manuell, for evidence i evaluate-fasen)

1. `/admin/courses/new`: opprett bane, sett tee 1 navn="Gul", length=4500,
   slope_mens=125, CR_mens=70.5. Forvent warning under feltet: «Uvanlig
   kort for norsk herretee (5300–6600 m).»
2. Skriv length=6000. Warning forsvinner.
3. Skriv length=7500. Warning: «Uvanlig lang for norsk herretee (5300–6600 m).»
4. Trykk "+ Legg til dame-rating", fyll slope_ladies=130, CR_ladies=72.
   Length=7500: warning oppdateres til «… for norsk dame-/herretee (4700–6600 m).»
5. Fjern dame-rating + mens-rating (tøm slope/CR). Warning forsvinner
   (ingen aktive gender).
6. Trykk Lagre med length=4500 og bare herrerating. Banen lagres uten
   feil (warning blokkerer ikke).
7. Naviger til `/admin/courses/[id]/edit` for den banen. Warning vises
   fortsatt på samme felt med samme tekst.
