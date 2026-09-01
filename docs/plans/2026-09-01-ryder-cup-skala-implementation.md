# Ryder Cup-skala (etappe 1, #1883) — implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Personlige cuper rommer et fullt Ryder Cup-oppsett (16 per lag, 8+8+12): takene heves til 36 matcher / 40 deltakere, og genererings-veiviseren lar organisatoren skru ned antall matcher per økt.

**Architecture:** Tak-regelen har ett hjem (`lib/cup/limits.ts`) som alle UI-/action-konsumenter leser — heving er to konstanter + kommentar. Matchantall-overstyringen er et genererings-tids-konsept: klampe-regelen bor i `lib/cup/cupTemplates.ts` (ny `buildSessionCountRows` + utvidet `buildSessions`), veiviseren holder overstyringene som lokal state og mater dem inn i eksisterende `generateCupPlan` (som allerede respekterer `session.matchCount`). Ingen DB-endring.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Vitest + Testing Library, next-intl (`messages/no.json` + `messages/en.json` med paritets-tester).

**Spec:** `docs/superpowers/specs/2026-09-01-ryder-cup-kaptein-uttak-design.md` (etappe 1).

**Avvik fra spec (avklart mot ground truth i plan-økta, 2026-09-01):**
1. Spec-en antok at overstyringene «lagres sammen med planen (`tournament_plans`)». Ground truth: derivert matchantall avhenger av lagstørrelsen, som først finnes når lagene deles i **Generer**-rommet — og matchene selv er det persisterte artefaktet. Overstyringen er derfor engangs-input i veiviseren (som lag-delingen); regenerering starter fra derivert antall igjen. Spec-ens verifiseringspunkt «hvordan lagres overstyringene» er dermed besvart: de lagres ikke.
2. Spec-ens kant-tilfelle «overstyring < 1 / ikke-tall → valideringsfeil» erstattes av defensiv klamping i helperen — stepper-UI-et kan ikke produsere ugyldige verdier, så det finnes ingen form å validere.

Begge avvik gjentas i closing-kommentaren på #1883 under «Teknisk».

## Global Constraints

- Hver commit-body har `Refs #1883` (håndheves av `.githooks/commit-msg`).
- `feat`-commits stager én NY notatfil under `.changes/` — eller har `[no-changelog]` i body for interne mellomsteg. Aldri bump av `package.json`/`CHANGELOG.md`.
- Brukerrettet tekst: norsk bokmål. Kode/kommentarer/commits: engelsk. Nye i18n-nøkler i BÅDE `messages/no.json` og `messages/en.json` (paritets-test håndhever).
- Kjør `humanizer:humanizer`-skillet på ny norsk copy før commiten som innfører den.
- Tall i UI: `tabular-nums`. Nye tap-targets: ≥44px (`min-h-[44px] min-w-[44px]`).
- Aldri `--no-verify`. TDD: test først, se den feile, så implementasjon.
- Splittet-cup-dag-preseten (`isSplitDay`) berøres ikke.

---

### Task 1: Hev personlig-cup-takene

**Files:**
- Modify: `lib/cup/limits.ts`
- Test: `lib/cup/limits.test.ts`
- Create: `.changes/1883-ryder-cup-tak.md`

**Interfaces:**
- Consumes: ingenting fra andre tasks.
- Produces: `MAX_PERSONAL_CUP_MATCHES = 36`, `MAX_PERSONAL_CUP_PLAYERS = 40` (samme exports, nye verdier — alle eksisterende konsumenter følger automatisk).

- [ ] **Step 1: Oppdater testene til de nye grensene**

Erstatt i `lib/cup/limits.test.ts`:

```ts
  it('caps fit a full Ryder Cup with 16-player teams (#1883)', () => {
    expect(MAX_PERSONAL_CUP_MATCHES).toBe(36);
    expect(MAX_PERSONAL_CUP_PLAYERS).toBe(40);
  });

  describe('exceedsPersonalMatchCap', () => {
    it.each<[number, boolean, boolean]>([
      // [totalMatches, isAdmin, expected]
      [36, false, false], // at the cap (#1883: raised from 16) → allowed
      [37, false, true], // over the cap → blocked
      [28, false, false], // the submitted 8+8+12 Ryder Cup setup
      [0, false, false],
      [1, false, false],
      [99, true, false], // admin is uncapped
      [37, true, false],
    ])('total=%i admin=%s → %s', (total, isAdmin, expected) => {
      expect(exceedsPersonalMatchCap(total, isAdmin)).toBe(expected);
    });
  });

  describe('exceedsPersonalPlayerCap', () => {
    it.each<[number, boolean, boolean]>([
      // [distinctPlayers, isAdmin, expected]
      [40, false, false], // at the cap → allowed
      [41, false, true], // over the cap → blocked
      [34, false, false], // 16+16 players + two captains
      [0, false, false],
      [16, false, false],
      [99, true, false], // admin is uncapped
      [41, true, false],
    ])('distinct=%i admin=%s → %s', (distinct, isAdmin, expected) => {
      expect(exceedsPersonalPlayerCap(distinct, isAdmin)).toBe(expected);
    });
  });
```

(Behold describe-rammen `personal cup limits` rundt; kun innholdet over byttes ut.)

- [ ] **Step 2: Kjør testene — se dem feile**

Run: `npx vitest run lib/cup/limits.test.ts`
Expected: FAIL — `expected 16 to be 36` (og tilsvarende for 24/40).

- [ ] **Step 3: Hev konstantene og skriv om doc-kommentaren**

I `lib/cup/limits.ts`: bytt fil-toppens doc-kommentar og de to konstantene (funksjonene under er uendret):

```ts
/**
 * Tak for personlige (frittstående) cuper (#526).
 *
 * En vanlig bruker kan lage sin egen cup blant venner, capped til Ryder
 * Cup-skala (#1883): 16 spillere per lag + kapteiner og et fullt
 * 8 foursomes + 8 four-ball + 12 singler-oppsett (28 matcher / 34
 * deltakere) skal få plass med slingringsmonn. Global admin er uncapped
 * (sekretariatet kjører klubb-skala). Klubb-cuper (#480/#524) har egne,
 * uncappede regler.
 *
 * Historikk: match-taket 4 → 16 i #1441 (splittet-cup-dag-bunten),
 * 16 → 36 i #1883. Spiller-taket delte verdi med Kompis-runde-taket
 * (#525, 24) fram til #1883 — de to er nå frikoblet, og 24-taket for
 * Kompis-runder lever videre der.
 */

/** Maks antall matcher i en personlig cup (ikke-admin). */
export const MAX_PERSONAL_CUP_MATCHES = 36;

/** Maks antall distinkte deltakere i en personlig cup (ikke-admin). */
export const MAX_PERSONAL_CUP_PLAYERS = 40;
```

- [ ] **Step 4: Kjør testene — grønt, inkludert konsumentene**

Run: `npx vitest run lib/cup`
Expected: PASS (limits.test.ts + alle cup-suitene som leser konstantene).

- [ ] **Step 5: Skriv notatfilen**

Create `.changes/1883-ryder-cup-tak.md`:

```markdown
---
type: feat
issue: 1883
title: Cup i Ryder Cup-størrelse
link: /admin/cup
cta: Sett opp cupen
---
Personlige cuper tar nå 40 deltakere og 36 matcher — nok til et fullt Ryder Cup-oppsett med 16 spillere per lag og kapteiner på toppen.
```

- [ ] **Step 6: Commit**

```bash
git add lib/cup/limits.ts lib/cup/limits.test.ts .changes/1883-ryder-cup-tak.md
git commit -m "feat(cup): raise personal cup caps to Ryder Cup scale

36 matches / 40 players (was 16/24) so a full 16-per-team Ryder Cup
setup (8 foursomes + 8 four-ball + 12 singles, plus captains) fits
with headroom. Decouples the player cap from the kompis-round cap
(#525) it used to share a value with.

Refs #1883"
```

---

### Task 2: Klampe-regel for matchantall per økt (ren logikk, TDD)

**Files:**
- Modify: `lib/cup/cupTemplates.ts`
- Test: `lib/cup/cupTemplates.test.ts`

**Interfaces:**
- Consumes: eksisterende `sessionMatchCount`, `SessionPlan`, `CupSessionFormat` (samme fil).
- Produces (Task 3 bruker begge):
  - `export type SessionCountRow = { index: number; format: CupSessionFormat; derived: number; effective: number }`
  - `export function buildSessionCountRows(sessions: CupSessionFormat[], teamSize: number, overrides?: Readonly<Record<number, number>>): SessionCountRow[]`
  - `export function buildSessions(sessions: CupSessionFormat[], teamSize: number, overrides?: Readonly<Record<number, number>>): SessionPlan[]` — utvidet med valgfri tredje parameter; uten den er oppførselen identisk med i dag.

- [ ] **Step 1: Skriv de feilende testene**

Legg til nederst i `lib/cup/cupTemplates.test.ts` (utvid import-blokken øverst med `buildSessionCountRows`):

```ts
describe('buildSessionCountRows / buildSessions with overrides', () => {
  const klassisk = CUP_PRESETS.find((p) => p.id === 'klassisk')!;

  it('the submitted Ryder Cup shape: klassisk @ 16 with singles lowered to 12', () => {
    expect(buildSessions(klassisk.sessions, 16, { 2: 12 })).toEqual([
      { format: 'foursomes_matchplay', matchCount: 8 },
      { format: 'fourball_matchplay', matchCount: 8 },
      { format: 'singles_matchplay', matchCount: 12 },
    ]);
  });

  it.each<[string, Record<number, number>, number, number]>([
    // [case, overrides, sessionIndex, expectedEffective] — klassisk @ teamSize 4
    ['override above derived clamps down', { 2: 99 }, 2, 4],
    ['override below 1 clamps to 1', { 2: 0 }, 2, 1],
    ['negative override clamps to 1', { 2: -3 }, 2, 1],
    ['non-integer override floors', { 2: 2.7 }, 2, 2],
    ['untouched session keeps derived', { 2: 2 }, 0, 2],
  ])('%s', (_case, overrides, sessionIndex, expected) => {
    const rows = buildSessionCountRows(klassisk.sessions, 4, overrides);
    expect(rows.find((r) => r.index === sessionIndex)!.effective).toBe(expected);
  });

  it('rows carry index/format/derived so the UI can render steppers', () => {
    expect(buildSessionCountRows(klassisk.sessions, 4, {})).toEqual([
      { index: 0, format: 'foursomes_matchplay', derived: 2, effective: 2 },
      { index: 1, format: 'fourball_matchplay', derived: 2, effective: 2 },
      { index: 2, format: 'singles_matchplay', derived: 4, effective: 4 },
    ]);
  });

  it('a dropped session (derived 0) stays dropped even with an override', () => {
    // teamSize 1: no 2v2 possible — foursomes/four-ball are gone, override or not.
    expect(buildSessionCountRows(klassisk.sessions, 1, { 0: 5 })).toEqual([
      { index: 2, format: 'singles_matchplay', derived: 1, effective: 1 },
    ]);
  });

  it('duplicate formats are keyed by position, not format', () => {
    // Tilpasset list with foursomes twice (a two-day cup): only the second lowered.
    const sessions: CupSessionFormat[] = [
      'foursomes_matchplay',
      'foursomes_matchplay',
    ];
    expect(buildSessions(sessions, 8, { 1: 2 })).toEqual([
      { format: 'foursomes_matchplay', matchCount: 4 },
      { format: 'foursomes_matchplay', matchCount: 2 },
    ]);
  });

  it('non-finite override is ignored', () => {
    const rows = buildSessionCountRows(klassisk.sessions, 4, { 2: Number.NaN });
    expect(rows.find((r) => r.index === 2)!.effective).toBe(4);
  });
});
```

- [ ] **Step 2: Kjør — se dem feile**

Run: `npx vitest run lib/cup/cupTemplates.test.ts`
Expected: FAIL — `buildSessionCountRows is not a function` (import-feil).

- [ ] **Step 3: Implementer**

I `lib/cup/cupTemplates.ts`: erstatt eksisterende `buildSessions` (behold `sessionMatchCount` uendret) med:

```ts
/** Én rad per økt for veiviserens matchantall-steppere (#1883). */
export type SessionCountRow = {
  /** Posisjon i input-lista — nøkkelen overstyringer adresseres med. */
  index: number;
  format: CupSessionFormat;
  /** Derivert antall for lagstørrelsen — stepperens tak. */
  derived: number;
  /** Klampet effektivt antall: override ∧ [1, derived]. */
  effective: number;
};

/**
 * Bygger radene for en (effektiv) lagstørrelse, med organisatorens
 * per-økt-overstyringer (#1883). Overstyringer er nøklet på posisjon i
 * `sessions` (samme format kan stå flere ganger i en tilpasset liste) og
 * klampes til [1, derivert] — aldri OPP forbi det lagene kan stille med.
 * Økter som ikke kan bemannes (derivert 0) droppes, override eller ei.
 * Ikke-endelige overstyringer ignoreres.
 */
export function buildSessionCountRows(
  sessions: CupSessionFormat[],
  teamSize: number,
  overrides: Readonly<Record<number, number>> = {},
): SessionCountRow[] {
  return sessions
    .map((format, index) => {
      const derived = sessionMatchCount(format, teamSize);
      const override = overrides[index];
      const effective =
        derived > 0 && typeof override === 'number' && Number.isFinite(override)
          ? Math.min(Math.max(1, Math.floor(override)), derived)
          : derived;
      return { index, format, derived, effective };
    })
    .filter((row) => row.derived > 0);
}

/**
 * Bygger den konkrete sesjonsplanen for en gitt (effektiv) lagstørrelse. Bruk
 * `min(lag1, lag2)` som `teamSize` på kall-siden. Sesjoner som ikke får plass
 * (matchCount 0) droppes. Valgfrie `overrides` (#1883) senker antallet per
 * økt — se `buildSessionCountRows` for klampe-regelen.
 */
export function buildSessions(
  sessions: CupSessionFormat[],
  teamSize: number,
  overrides?: Readonly<Record<number, number>>,
): SessionPlan[] {
  return buildSessionCountRows(sessions, teamSize, overrides).map((row) => ({
    format: row.format,
    matchCount: row.effective,
  }));
}
```

- [ ] **Step 4: Kjør — grønt, også de gamle buildSessions-testene**

Run: `npx vitest run lib/cup/cupTemplates.test.ts lib/cup/cupPairing.test.ts`
Expected: PASS (uendret oppførsel uten overrides; cupPairing er uberørt konsument).

- [ ] **Step 5: Commit (internt mellomsteg — ingen notatfil)**

```bash
git add lib/cup/cupTemplates.ts lib/cup/cupTemplates.test.ts
git commit -m "feat(cup): per-session match-count clamp in buildSessions

buildSessionCountRows derives per-session caps and clamps organizer
overrides to [1, derived]; buildSessions gains an optional overrides
parameter on top of it. Groundwork for the generate wizard's steppers —
not user-visible until wired there.

[no-changelog]

Refs #1883"
```

---

### Task 3: Steppere i genererings-veiviseren + copy + én interaksjonstest

**Files:**
- Modify: `app/[locale]/admin/cup/[id]/generer/GenerateMatchesWizard.tsx`
- Modify: `messages/no.json`, `messages/en.json` (under `cup.generate`)
- Test: `app/[locale]/admin/cup/[id]/generer/GenerateMatchesWizard.test.tsx`
- Create: `.changes/1883-matcher-per-okt.md`

**Interfaces:**
- Consumes (fra Task 2): `buildSessionCountRows(sessions, teamSize, overrides)` → `SessionCountRow[]` med `{ index, format, derived, effective }`; `buildSessions(sessions, teamSize, overrides)`.
- Produces: `data-testid`-ene `cup-session-count-<index>`, `cup-session-minus-<index>`, `cup-session-plus-<index>` (stabil kontrakt for tester/staging-verifisering).

- [ ] **Step 1: i18n-nøkler i begge kataloger**

I `messages/no.json`, inne i det eksisterende `cup.generate`-objektet (alfabetisk plassering blant søsken-nøklene):

```json
"sessionCountMinusAria": "Færre matcher: {format}",
"sessionCountPlusAria": "Flere matcher: {format}",
"sessionCountValue": "{count} av {max}",
"sessionCountsHeading": "Matcher per økt",
"sessionCountsHint": "Alle må ikke spille hver økt — skru ned antallet, så står resten over."
```

I `messages/en.json`, samme sted:

```json
"sessionCountMinusAria": "Fewer matches: {format}",
"sessionCountPlusAria": "More matches: {format}",
"sessionCountValue": "{count} of {max}",
"sessionCountsHeading": "Matches per session",
"sessionCountsHint": "Not everyone has to play every session — lower the count and the rest sit out."
```

Kjør `humanizer:humanizer`-skillet på de norske strengene før commit (Global Constraints).

- [ ] **Step 2: Skriv den feilende interaksjonstesten**

Legg til i `app/[locale]/admin/cup/[id]/generer/GenerateMatchesWizard.test.tsx` (inne i eksisterende `describe('GenerateMatchesWizard')`; `BASE` og `PLAYERS` finnes der fra før — `presetId: 'klassisk'`):

```tsx
  it('lar organisatoren skru ned antall matcher per økt (#1883)', () => {
    render(<GenerateMatchesWizard {...BASE} players={PLAYERS} />);

    fireEvent.click(screen.getByTestId('cup-wizard-assign-p1-team1'));
    fireEvent.click(screen.getByTestId('cup-wizard-assign-p2-team1'));
    fireEvent.click(screen.getByTestId('cup-wizard-assign-p3-team2'));
    fireEvent.click(screen.getByTestId('cup-wizard-assign-p4-team2'));

    // klassisk @ 2 per lag: foursomes 1, four-ball 1, singler 2 (indeks 0/1/2).
    expect(screen.getByTestId('cup-session-count-2')).toHaveTextContent('2 av 2');
    // Foursomes står allerede på minimum — minus er død.
    expect(screen.getByTestId('cup-session-minus-0')).toBeDisabled();

    fireEvent.click(screen.getByTestId('cup-session-minus-2'));
    expect(screen.getByTestId('cup-session-count-2')).toHaveTextContent('1 av 2');
    expect(screen.getByTestId('cup-session-minus-2')).toBeDisabled();

    // Opp igjen — men aldri forbi derivert tak.
    fireEvent.click(screen.getByTestId('cup-session-plus-2'));
    expect(screen.getByTestId('cup-session-count-2')).toHaveTextContent('2 av 2');
    expect(screen.getByTestId('cup-session-plus-2')).toBeDisabled();
  });
```

Dette er endringens ENE Type C-tilskudd (wiring stepper ↔ visning); klampe-tallene er Type A-dekket i Task 2 — ikke re-assertér dem her.

- [ ] **Step 3: Kjør — se den feile**

Run: `npx vitest run "app/[locale]/admin/cup/[id]/generer/GenerateMatchesWizard.test.tsx"`
Expected: FAIL — `Unable to find an element by: [data-testid="cup-session-count-2"]`.

- [ ] **Step 4: Implementer i veiviseren**

Alle endringer i `app/[locale]/admin/cup/[id]/generer/GenerateMatchesWizard.tsx`:

**4a — import:** utvid den eksisterende importen fra `@/lib/cup/cupTemplates` (rundt linje 8–13) med `buildSessionCountRows` og `type SessionCountRow`.

**4b — lokal komponent:** legg inn rett FØR `// ─── Step 2: Preview + adjust ───`-skillet (rundt linje 335):

```tsx
// ─── Step 1b: Matcher per økt (#1883) ────────────────────────────────────────

function Step1SessionCounts({
  rows,
  onAdjust,
  t,
}: {
  rows: SessionCountRow[];
  onAdjust: (row: SessionCountRow, delta: 1 | -1) => void;
  t: ReturnType<typeof useTranslations<'cup'>>;
}) {
  // Tredje lokale format-kartet i fila (Step2Preview/Step2BundlePreview har
  // sine): en delt konstant måtte widene CupSessionFormat/CupBundleFormat på
  // tvers — ikke verdt det for tre t()-kart.
  const FORMAT_LABELS: Record<CupSessionFormat, string> = {
    foursomes_matchplay: t('generate.formatFoursomes'),
    fourball_matchplay: t('generate.formatFourball'),
    singles_matchplay: t('generate.formatSingles'),
    greensome_matchplay: t('generate.formatGreensome'),
    chapman_matchplay: t('generate.formatChapman'),
    gruesome_matchplay: t('generate.formatGruesome'),
  };

  return (
    <div>
      <SectionHeading>{t('generate.sessionCountsHeading')}</SectionHeading>
      <p className="font-sans text-xs text-muted mt-1 mb-3">
        {t('generate.sessionCountsHint')}
      </p>
      <div className="space-y-2">
        {rows.map((row) => (
          <Card key={row.index} className="!p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-sans text-sm font-medium text-text truncate">
                {FORMAT_LABELS[row.format]}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  data-testid={`cup-session-minus-${row.index}`}
                  aria-label={t('generate.sessionCountMinusAria', {
                    format: FORMAT_LABELS[row.format],
                  })}
                  onClick={() => onAdjust(row, -1)}
                  disabled={row.effective <= 1}
                  className="min-h-[44px] min-w-[44px] rounded-lg border border-border font-sans text-lg text-text disabled:opacity-40"
                >
                  −
                </button>
                <p
                  data-testid={`cup-session-count-${row.index}`}
                  className="font-sans text-sm tabular-nums text-text min-w-[64px] text-center"
                >
                  {t('generate.sessionCountValue', {
                    count: row.effective,
                    max: row.derived,
                  })}
                </p>
                <button
                  type="button"
                  data-testid={`cup-session-plus-${row.index}`}
                  aria-label={t('generate.sessionCountPlusAria', {
                    format: FORMAT_LABELS[row.format],
                  })}
                  onClick={() => onAdjust(row, 1)}
                  disabled={row.effective >= row.derived}
                  className="min-h-[44px] min-w-[44px] rounded-lg border border-border font-sans text-lg text-text disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

**4c — state:** i `GenerateMatchesWizard`, rett etter `matches`-staten (rundt linje 897):

```tsx
  // #1883: organisatorens nedjusteringer av matchantall per økt, nøklet på
  // øktas posisjon i den effektive sesjonslista. Engangs-input som lag-
  // delingen — lagres ikke; regenerering senere starter fra derivert antall.
  const [sessionCountOverrides, setSessionCountOverrides] = useState<
    Record<number, number>
  >({});
```

**4d — utled rader + mat overstyringene inn i planen:** erstatt dagens `getSessionPlan` (rundt linje 934–937) med:

```tsx
  function getSessionCountRows(): SessionCountRow[] {
    const teamSize = Math.min(team1Count, team2Count);
    return buildSessionCountRows(
      getEffectiveSessions(),
      teamSize,
      sessionCountOverrides,
    );
  }

  function getSessionPlan(): SessionPlan[] {
    const teamSize = Math.min(team1Count, team2Count);
    return buildSessions(
      getEffectiveSessions(),
      teamSize,
      sessionCountOverrides,
    );
  }
```

(`plannedTotal`, cap-gaten og `runGenerate` leser `getSessionPlan()` fra før og følger automatisk.)

**4e — handler:** ved de andre handlerne (rundt linje 1030):

```tsx
  function adjustSessionCount(row: SessionCountRow, delta: 1 | -1) {
    const next = Math.min(Math.max(1, row.effective + delta), row.derived);
    setSessionCountOverrides((prev) => ({ ...prev, [row.index]: next }));
  }
```

**4f — render:** i steg 1-blokken, rett etter `<Step1Roster … />` (rundt linje 1114), inne i samme `space-y-4`-div:

```tsx
            {!isSplitDay && getSessionCountRows().length > 0 && (
              <Step1SessionCounts
                rows={getSessionCountRows()}
                onAdjust={adjustSessionCount}
                t={t}
              />
            )}
```

- [ ] **Step 5: Kjør — grønt**

Run: `npx vitest run "app/[locale]/admin/cup/[id]/generer" messages`
Expected: PASS — ny interaksjonstest, eksisterende veivisertester, og katalog-paritetstestene.

- [ ] **Step 6: Skriv notatfilen**

Create `.changes/1883-matcher-per-okt.md`:

```markdown
---
type: feat
issue: 1883
title: Velg antall matcher per økt
link: /admin/cup
cta: Sett opp cupen
---
Genererings-veiviseren lar deg nå skru ned antall matcher i hver økt — kjør 12 singler selv om lagene har 16 spillere, så står resten over.
```

- [ ] **Step 7: Commit**

```bash
git add "app/[locale]/admin/cup/[id]/generer/GenerateMatchesWizard.tsx" "app/[locale]/admin/cup/[id]/generer/GenerateMatchesWizard.test.tsx" messages/no.json messages/en.json .changes/1883-matcher-per-okt.md
git commit -m "feat(cup): per-session match-count steppers in the generate wizard

Step 1 shows one row per session with the derived count as ceiling and
a -/+ stepper clamped to [1, derived]. Planned total, cap gating and
generation all read the adjusted plan. Split-day preset untouched.

Refs #1883"
```

---

### Task 4: Full portkjøring + PR

**Files:** ingen nye endringer — verifisering og innsending.

- [ ] **Step 1: Full testsuite + typer + lint + build**

Run (Node 22: `source ~/.nvm/nvm.sh && nvm use 22`):

```bash
npx vitest run
npx tsc --noEmit
npm run lint
npm run build
```

Expected: alle grønne. `npm run build` er porten — ingen «pre-existing»-unnskyldning for tsc-feil.

- [ ] **Step 2: Tørrkjør ukesslippet (validerer notatfilene)**

Run: `node scripts/weekly-release.mjs --dry-run`
Expected: begge 1883-notatene listes som gyldige feat-rader; ingen valideringsfeil.

- [ ] **Step 3: Push + PR**

```bash
git push origin claude/ryder-cup-format-b137cd
```

Verifiser med `git ls-remote origin claude/ryder-cup-format-b137cd` at remote HEAD = lokal HEAD (SSH-push kan dø stille i pre-push).

PR med `gh pr create --base main` (bruk `--body-file`; tittel: `feat(cup): Ryder Cup-skala — hevede tak + matchantall per økt`). Body-krav:
- `Closes #1883` + tagline fra notatfilene.
- «Fordeler/ulemper»-blokk (obligatorisk for feat-PR-er): 2–3 av hver, i produktspråk. Ingen `## Produktvalg`-/`## Alternativ`-heading — alle reelle valg ble tatt av eieren i spec-økta 2026-09-01 (tak-nivå, kun nedjustering, to-etappe-deling), så PR-en er auto-merge-kvalifisert når portene er grønne.

- [ ] **Step 4: Staging-verifisering FØR merge (bruker-synlig endring)**

Kjør `staging-verify`-skillet mot PR-en. Flyten som skal klikkes: opprett/bruk en cup-kladd på staging med klassisk preset → Generer-rommet → del lag → skru ned singler-økta → «Neste» → bekreft at forhåndsvisningen har det nedjusterte antallet matcher → generer og se matchene opprettet. Bevis + `staging-verified`-label på PR-en før merge (#1076).

- [ ] **Step 5: Merge + closing-kommentar**

Etter grønn CI + staging-bevis: `gh pr merge --rebase --delete-branch` (auto-merge-policyen: ingen produktvalg). Deretter closing-kommentar på #1883 (`gh issue comment 1883 --body-file …`) med `## Teknisk` (filer, approach, de to spec-avvikene fra plan-headeren, PR-link + SHA-er) og `## Funksjonell` («Du kan nå …»-språk fra notatfilene).
