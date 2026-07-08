# Test-disiplin for Tørny

Dette dokumentet binder alt test-arbeid i Tørny — for mennesker og agenter. Lever som referanse-sannhet for de minimale reglene som overstyrer default-vaner.

Bygger på erfaring fra [PR #260](https://github.com/jdlarssen/golf-app/pull/260) (ren approval-konvertering) og [PR #261](https://github.com/jdlarssen/golf-app/pull/261) (partiell regresjon — utvidet test-count selv om jobben var å trimme). Underliggende disiplin lånt fra [Augmented Coding Patterns](https://lexler.github.io/augmented-coding-patterns/) (Ördög/Riegler/Falco/Kesseler).

---

## Kjerneinnsikt

AI er en compliance-bias-drevet, ikke-deterministisk partner uten hukommelse. Jobben er å designe rammer som tvinger fram tidlige feedback-signaler — og være villig til å kaste arbeid når signalene er røde. **«Færre tester» er ikke målet.** Målet er at copy-endringer, bug-fix og nye features har riktig vedlikeholds-fotavtrykk — gjennom hele livssyklusen, ikke bare ved første skriving.

---

## Fire test-typer — én per spørsmål

Hver test skal svare på nøyaktig ett av disse spørsmålene:

| Spørsmål | Type | Stil |
|---|---|---|
| Gjorde matten/logikken det riktige? | **A. Pure logic** | Klassisk TDD, assertion-rik. `it.each` for parametriserte cases. |
| Leser det renderet outputet riktig? | **B. Rendered output** | Approval-snapshot. Subject + text + extracted body. ÉN chrome-lås per template. |
| Vises data-bundet UI som forventet? | **C. Data-rendering UI** | Minimum mulig. Trust Type A på matten. Aldri re-asserter tall som kommer fra A. |
| Funker hele bruker-flyten? | **D. E2E** | Golden-path + 1–2 kritiske edge-cases. Aldri assert på norsk copy — bruk `data-testid`/role. |

Disse er gjensidig utelukkende. **Hvis en test prøver å svare på to spørsmål samtidig, splitt den.**

---

## Regler per type

### Type A — Pure logic

- **Hvor:** `lib/scoring/`, `lib/format/`, `lib/games/`, `lib/courses/derive`, `lib/notifications/types`, validators, alle pure parsing/utility-funksjoner.
- **Disiplin:** TDD. Ny test før ny kode for `lib/scoring/`. For andre Type A-moduler: ny test sammen med koden er greit hvis logikken er enkel nok til å designes uten test-drevet-eksplorasjon.
- **Stil:** Direkte assertions (`toBe`, `toEqual`, `toStrictEqual`). `it.each` for enumererte edge cases. Tabular fixture-data over fluent setup.
- **Mocking:** Aldri mock egne interne utilities. Mock kun ved system-grenser (Supabase, Resend, Dexie, network).
- **Eksempel som passer:** `lib/scoring/sideTournament.test.ts` (154 tester på matrix-baserte poeng-tildelinger).

### Type B — Rendered output

- **Hvor:** `lib/mail/`, framtidige PDF/CSV-generatorer, alt som produserer en streng/dokument-output til en bruker eller ekstern mottaker.
- **Stil:** `toMatchInlineSnapshot()` på det brukeren faktisk leser — `subject` + `text` + en `bodyXxxHtml`-extractor for den personliggjorte HTML-delen. ÉN full-HTML-chrome-lås per template (ikke per case).
- **Forbudt:** Mer enn 3 `toContain`-kall på samme variabel i én test (se toContain-trappa under). Hvis det er fristende — bruk snapshot. Duplikat mock-oppsett på tvers av filer (Resend-mock, Supabase-mock) — lag shared helper i `__tests__/_helpers.ts` heller enn copy-paste.
- **Strukturelle kontrakter** (RFC-headere, URL-encoding, error-propagation, to/from): hører hjemme i ÉN delt fil per familie, aldri duplisert per modul. Eksempel-mønster: `lib/mail/__tests__/resend-contract.test.ts` med parametrisert tabell over alle sendere.
- **Eksempel som passer:** `lib/mail/gameFinishedNotification.test.ts` etter [PR #260](https://github.com/jdlarssen/golf-app/pull/260). 24 tester, 48 snapshots, ÉN chrome-lås, 2 strukturelle assertions.

#### toContain-trappa — ett hjem, tre nivåer

`toContain` har tre terskler på tre forskjellige scope — strengest på det minste. Det er én bevisst trapp, ikke tre løsrevne regler:

| Nivå | Scope | Terskel | Håndhevelse |
|---|---|---|---|
| Test | `toContain`-kall på samme variabel i ÉN test | maks **3** | Hard regel (denne seksjonen) — over grensen: bruk snapshot (Type B) i stedet |
| Fil | `toContain`-kall på samme variabel i ÉN fil | **>5** | Review-signal (§ Hvor reglene håndheves) — vurder konvertering til Type B approval-snapshot |
| Commit | Nye `.toContain()`-kall i ÉN commit | **>10** | Pre-commit-warn, ikke-blokkerende — se `.githooks/pre-commit` |

Eierbeslutning 2026-07-07 (#1104): behold alle tre nivåer — de fanger ulike ting (per-test er en skrive-tids-regel, per-fil er et code-review-signal, per-commit er en mekanisk vakt som ikke kan se på tvers av filer). CLAUDE.md § «Test-disiplin» har kortversjonen (maks 3 per test); denne tabellen er den fulle forklaringen.

### Type C — Data-rendering UI

- **Hvor:** `app/games/[id]/leaderboard/*View|Podium.test.tsx`, score-display-komponenter, podium-komponenter, alt som tar pure data og rendrer det.
- **Stil:** **Maks én render-test per komponent.** Verifiserer kun struktur/layout, ikke konkrete tall (de er allerede dekket av Type A på beregningen).
- **Forbudt:** `toHaveTextContent('Du endte på 3. plass av 12')` — det er Type A på avveie. Det riktige er å teste at `formatPosition(...)` returnerer den strengen (Type A), og at komponenten rendrer det formatPosition returnerer (Type C, generisk).
- **Default ved upassende eksisterende tester:** Foreslå **sletting** etter *Happy to Delete*-mønsteret, ikke konvertering til snapshot. Krever eksplisitt go-ahead fra brukeren før sletting.

### Type D — E2E

- **Hvor:** `e2e/*.spec.ts` (Playwright).
- **Stil:** Én test per kritisk bruker-flyt. Golden path først, deretter de 1–2 edge-cases-ene som faktisk har brutt før.
- **Forbudt:** `getByText('Du er invitert')`. Bruk `data-testid` eller role-baserte locators. **Hvorfor:** norske strenger endres oftere enn data-testid; E2E som låser copy er en av de mest brittle test-typene som finnes.
- **Forbudt:** Vente-på-timing-hack-er. Bruk `await expect(locator).toBeVisible()` med default-timeout.

---

## Beslutningstre — når en endring kommer

```
NY ENDRING
│
├─ NY FEATURE
│   1. Start med Type A på den pure logikken (TDD som vanlig)
│   2. Hvis featuren produserer en output (mail/CSV/PDF) — én Type B approval-snapshot
│   3. Hvis featuren har UI som binder data — maks én Type C render-test, kun layout
│   4. Hvis featuren er en ny bruker-flyt — én Type D E2E
│   STOPP. Spør hvis du tenker «bare én test til».
│
├─ BUG-FIX FRA PROD
│   1. Capture log/payload fra Vercel/Supabase som test-fikstur FØRST (Approved Logs-mønsteret)
│   2. Skriv test som feiler med den fikstur-en
│   3. Fix logikken
│   4. Kun oppdater eksisterende tester hvis logikken faktisk endret seg
│
├─ COPY-ENDRING
│   1. Endre source-strengen i komponenten/templatet
│   2. Kjør `npx vitest -u` på affected snapshots
│   3. Review hver diff visuelt — sjekk om noe annet endret seg utilsiktet
│   4. IKKE legg til nye tester. Aldri.
│
└─ REFACTOR SOM RØRER TESTER (>3 filer)
    1. Check Alignment: vis skjelett på ÉN fil først, få eksplisitt go-ahead
    2. Refinement Loop: start minimal, utvid kun hvis review viser at noe mangler
    3. Atomic commit per fil
    4. Hvis du finner deg selv å legge til tester du ikke ble bedt om — STOPP.
       Flagg eksplisitt i PR-body med begrunnelse, eller spør hovedchat før dispatch.
```

---

## Prosess-disiplin (gjelder alle refactors)

### Check Alignment før batch

For refactor-oppgaver som rører 3+ filer: vis skjelett på ÉN fil først, vent på eksplisitt go-ahead, deretter batch resten. Forhindrer at en feilantakelse multipliseres med antall filer.

**Symptom på brudd:** Når du oppdager etter merge at strategien var feil, og du nå må reversere på N filer.

### Refinement Loop (start minimal)

Første pass skal være den minste uttrykksformen som dekker behovet. Utvid kun hvis review eksplisitt avdekker at noe mangler. Aldri last opp full struktur «for å være på den sikre siden» — det er kilden til *AI Slop*.

**Symptom på brudd:** Hver fil i en batch ender med samme «mens jeg var her, la jeg til X» — duplisert N ganger.

### Happy to Delete

Default-handlingen ved upassende test er **å foreslå sletting**, ikke konvertering til snapshot eller refaktor. Krever eksplisitt go-ahead fra brukeren før sletting. Begrunnelsen for sletting må være «dekket av Type X andre steder», ikke bare «testen er stygg».

### Knowledge Documents (AGENTS.md per område)

Der test-stilen avviker fra default, skriv det ned i den lokale `AGENTS.md`. Den skal være maks 1 side, lese-tid <2 minutter, ha eksplisitte gjør/gjør-ikke-eksempler. Filer som finnes per i dag:

- `lib/mail/AGENTS.md` — Type B-regler for Resend-mailer
- `lib/scoring/AGENTS.md` — Type A-disiplin (mest «ikke rør»)

Lag ny `AGENTS.md` når et område får mer enn én avvikende regel.

### Scope-utvidelse må flagges

Hvis du underveis i en task oppdager at noe burde gjøres som er utenfor scope (test-gap, bug, dead code): **flagg det eksplisitt** — enten ved å spørre hovedchat før dispatch, eller ved å nevne det i PR-body som «utenfor-scope-funn». Aldri smyge det inn i nåværende PR uten å si fra.

---

## Anti-mønstre å se etter

Konkrete eksempler fra tidligere arbeid:

| Anti-mønster | Symptom | Eksempel |
|---|---|---|
| **AI Slop** | Kopier-lim av samme test-setup på tvers av filer | PR #261 la til identiske Resend-kontrakt-tester i 6 filer |
| **Sunk Cost** | «Mens jeg er her, legger jeg til litt ekstra» | PR #261 utvidet scope fra «konverter til snapshots» til «splitt og struktur» |
| **Unvalidated Leaps** | Batch på 6 filer uten Check Alignment | PR #261 dispatchet hele familien uten skjelett-godkjenning |
| **Compliance Bias** | Subagent svarer ja på alt og leverer mer enn etterspurt | PR #261-subagenten utvidet test-count i stedet for å protestere |
| **Obsess Over Rules** | Subagent-prompt lastet opp full struktur i stedet for minimum | PR #261-prompten beskrev hele PR #260-mønsteret heller enn essensen |

---

## Hvor reglene håndheves

| Nivå | Plassering | Lest av |
|---|---|---|
| Universelle | `CLAUDE.md` § «Test-disiplin» (peker hit) | Alle agenter ved oppstart |
| Per område | `<område>/AGENTS.md` | Agent som rører området |
| Mekanisk | `.githooks/pre-commit` (warn) | Git ved commit |

**Pre-commit-hooken** advarer mot (men blokkerer ikke):

- Test-fil med >5 `toContain` på samme variabel → vurder Type B approval-snapshot (fil-nivå i toContain-trappa, § Type B)
- Test-fil med duplikat `vi.mock('resend', ...)`- eller `vi.mock('@/lib/supabase/...')`-oppsett → vurder shared helper
- Playwright-spec med norske string-literals i `toContain`/`toHaveText`/`getByText` → bruk `data-testid` i stedet

Warns bygger vane uten å skape friksjon. Block-nivå reserveres for ting som har klart entydig svar (commit-msg-format, versjons-bump).

---

## Hva som er forbudt på tvers av alle typer

- **Kopier-lim av mock-oppsett mellom filer** — signal om at det skal være shared helper
- **«Mens jeg var her»-tester** — tester som ikke kan forsvares mot scope-en til endringen
- **Quick-fixes som omgår eksisterende disiplin** — `lib/scoring/` krever fortsatt ny test før kode-endring
- **`--no-verify` for å omgå pre-commit-/commit-msg-hook** — alltid investigér og fiks heller

---

## Hva som ikke er ferdig

Eksisterende test-suite er ikke i samsvar med disse reglene. Kandidater for cleanup (eget GitHub issue når det opprettes):

1. **PR #261** — re-evaluer mot Type B-regelen. De 12 strukturelle Resend-kontrakt-testene som ble lagt til på tvers av 6 filer er kandidater for konsolidering til én shared `resend-contract.test.ts`, eller fjerning hvis ikke verdt det.
2. **Leaderboard-klyngen** — 8 filer, ~104 tester under `app/games/[id]/leaderboard/`. Bør evalueres mot Type C-regelen. Sterk hypotese om at flertallet er kandidater for sletting fordi de re-asserter `lib/scoring/`-output via DOM.
3. **Admin-form-trioen** — `CourseForm.test.tsx` (54), `GameForm.test.tsx` (38), `CoursesLedgerClient.test.tsx` (38). Split per Type — Type A for validering (ekstrahert til pure funksjon), Type C for render, Type D for én happy-path E2E.
4. **Andre `toContain`-tunge tester** — alle filer over fil-nivået i toContain-trappa (§ Type B).
5. **Mail-test-familien** — vurder konsolidering av Resend-kontrakt-tester til én delt fil hvis PR #261 ikke gjør det.

Sekvens og prioritering tas i et eget cleanup-issue. **Inntil det issue-et er åpnet og prioritert, gjelder disse reglene kun nye endringer.**
