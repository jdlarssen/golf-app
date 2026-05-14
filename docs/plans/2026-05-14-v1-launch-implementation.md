# v1.0 launch — implementeringsplan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship reveal-mode, scorekort-former og navne-reveal sammen som én MAJOR-bump fra `0.10.22` til `1.0.0`.

**Architecture:** Tre features bygges parallelt på samme worktree-gren `claude/adoring-wilson-21477a`. Reveal-mode er en ny enum-kolonne `games.score_visibility` med per-skjerm `revealState`-respons. Scorekort-former er en frittstående SVG-komponent brukt på 7 skjermer. Navne-reveal er én helper-funksjon brukt på finished-flater. Mye eksisterende infrastruktur gjenbrukes — særlig `lib/leaderboard.ts` (har allerede `LeaderboardMode = 'netto' | 'brutto'`) og leaderboard-state-machine-en (`state3` → `state3.5` → `full`).

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, Supabase Postgres + RLS, Vitest + Testing Library, Playwright.

**Design-referanse:** [docs/plans/2026-05-14-v1-launch-design.md](2026-05-14-v1-launch-design.md)

## Subagent-modell-overstyring

**Bruk Opus for alle builder-subagenter i denne planen.** Standardkonvensjonen i Tørny er sonnet for plan-eksekusjon, men brukeren har eksplisitt bedt om Opus i denne chatten for å minimere risiko for dårlig kode på et release som flytter oss til v1.0. Sett `model: 'opus'` på hver `Agent`-call i `subagent-driven-development`-flyten.

## Commit + push-strategi

- **Worktree-gren:** `claude/adoring-wilson-21477a`. Alle commits her, ingen direkte commit på main.
- **Commit-meldinger:** bruk `chore(scope):` / `refactor(scope):` / `test(scope):` for interne endringer (helpers, tester, refactor som ikke flytter UI). Bruk `feat(scope):` kun når en faktisk bruker-synlig endring lander, og da må commit-msg-hooken være tilfreds: `package.json`-versjon må bumpes (patch) og `CHANGELOG.md` må ha entry.
- **Push-kadens:** push hver `feat()`-commit til main umiddelbart (Vercel deployer auto) slik at brukeren kan teste i prod. `chore()`-commits trenger ikke push før neste `feat()`.
- **Final v1.0.0 bump:** siste oppgave bumper fra siste patch-versjon direkte til `1.0.0` (MAJOR) med samle-CHANGELOG-entry.

## Test-disiplin

- TDD overalt: failing test → minimal impl → green → commit.
- Vitest-fixture i `vitest.setup.ts` mocker `next/navigation` — bruk den i klient-komponent-tester.
- Test-stilen i prosjektet er `describe` + `it` med `expect`-assertions. Følg eksisterende mønster i `lib/scoring/*.test.ts`.
- Etter siste task skal `npm test` rapportere 180+ tester grønne (vi legger til ca. 30 nye).

---

# Fase 1 — Foundation (helpers + tester, ingen UI)

## Task 1: DB-migrasjon `0021_score_visibility.sql`

**Files:**
- Create: `supabase/migrations/0021_score_visibility.sql`

**Step 1: Skriv migrasjons-SQL**

```sql
-- Per-game score visibility. Default 'live' preserves existing behavior;
-- 'reveal' hides netto info during the round and unveils at status='finished'.
alter table public.games
  add column score_visibility text not null default 'live'
  check (score_visibility in ('live', 'reveal'));

comment on column public.games.score_visibility is
  'live = always show netto. reveal = hide netto during active, reveal at finished.';
```

**Step 2: Apply migrasjon via Supabase MCP**

Bruk `mcp__36be25a6-2d72-41c3-a675-2352133ed510__apply_migration` med name=`0021_score_visibility` og query=migrasjons-SQL-en over.

Forventet: «Migration applied successfully».

**Step 3: Regenerer TypeScript-typer**

Bruk `mcp__36be25a6-2d72-41c3-a675-2352133ed510__generate_typescript_types`. Hvis prosjektet har en `lib/database.types.ts` eller lignende, oppdater den. Hvis ikke (sjekk om filen finnes), skip dette steget — typene leses inline i hver fetcher.

**Step 4: Commit**

```bash
git add supabase/migrations/0021_score_visibility.sql
git commit -m "chore(db): add games.score_visibility column for reveal-mode"
```

---

## Task 2: `lib/games/visibility.ts` — RevealState helper

**Files:**
- Create: `lib/games/visibility.ts`
- Create: `lib/games/visibility.test.ts`

**Step 1: Skriv failing test**

```ts
// lib/games/visibility.test.ts
import { describe, it, expect } from 'vitest';
import { revealState, shouldHideNetto, type ScoreVisibility } from './visibility';
import type { GameStatus } from './status';

describe('revealState', () => {
  it('returns live-always for live visibility in any status', () => {
    expect(revealState('live', 'draft')).toBe('live-always');
    expect(revealState('live', 'scheduled')).toBe('live-always');
    expect(revealState('live', 'active')).toBe('live-always');
    expect(revealState('live', 'finished')).toBe('live-always');
  });

  it('returns reveal-active for reveal visibility while game is active', () => {
    expect(revealState('reveal', 'active')).toBe('reveal-active');
    expect(revealState('reveal', 'scheduled')).toBe('reveal-active');
  });

  it('returns reveal-finished for reveal visibility when game is finished', () => {
    expect(revealState('reveal', 'finished')).toBe('reveal-finished');
  });
});

describe('shouldHideNetto', () => {
  it('hides netto only in reveal-active state', () => {
    expect(shouldHideNetto('live-always')).toBe(false);
    expect(shouldHideNetto('reveal-active')).toBe(true);
    expect(shouldHideNetto('reveal-finished')).toBe(false);
  });
});
```

**Step 2: Verifiser failing**

Run: `npm test -- lib/games/visibility.test.ts`
Expected: FAIL — modul ikke funnet.

**Step 3: Skriv minimal implementation**

```ts
// lib/games/visibility.ts
import type { GameStatus } from './status';

export type ScoreVisibility = 'live' | 'reveal';

export type RevealState = 'live-always' | 'reveal-active' | 'reveal-finished';

/**
 * Maps (score_visibility, game.status) -> rendering state for every score-aware
 * surface. Centralizes the branching so each screen doesn't reinvent the rule.
 */
export function revealState(
  visibility: ScoreVisibility,
  status: GameStatus,
): RevealState {
  if (visibility === 'live') return 'live-always';
  if (status === 'finished') return 'reveal-finished';
  return 'reveal-active';
}

/**
 * Convenience predicate: should the screen suppress netto-related visuals
 * (handicap-allocation badges, netto columns, netto deltas, netto rankings)?
 * True only when the game is in reveal mode AND not yet finished.
 */
export function shouldHideNetto(state: RevealState): boolean {
  return state === 'reveal-active';
}
```

**Step 4: Verifiser passing**

Run: `npm test -- lib/games/visibility.test.ts`
Expected: PASS, alle 4 tester grønne.

**Step 5: Commit**

```bash
git add lib/games/visibility.ts lib/games/visibility.test.ts
git commit -m "chore(games): add revealState helper + tests"
```

---

## Task 3: `lib/scoring/scoreShape.ts` — shape-mapping

**Files:**
- Create: `lib/scoring/scoreShape.ts`
- Create: `lib/scoring/scoreShape.test.ts`

**Step 1: Skriv failing test**

```ts
// lib/scoring/scoreShape.test.ts
import { describe, it, expect } from 'vitest';
import { scoreShape, type ScoreShape } from './scoreShape';

describe('scoreShape', () => {
  it('returns none for null score', () => {
    expect(scoreShape(null, 4)).toBe('none');
  });

  it('returns none for par', () => {
    expect(scoreShape(4, 4)).toBe('none');
    expect(scoreShape(3, 3)).toBe('none');
    expect(scoreShape(5, 5)).toBe('none');
  });

  it('returns circle for birdie (1 under)', () => {
    expect(scoreShape(3, 4)).toBe('circle');
    expect(scoreShape(2, 3)).toBe('circle');
  });

  it('returns double-circle for eagle or better (2+ under)', () => {
    expect(scoreShape(2, 4)).toBe('double-circle');
    expect(scoreShape(1, 4)).toBe('double-circle');
    expect(scoreShape(1, 5)).toBe('double-circle');
  });

  it('returns square for bogey (1 over)', () => {
    expect(scoreShape(5, 4)).toBe('square');
    expect(scoreShape(4, 3)).toBe('square');
  });

  it('returns double-square for double bogey or worse (2+ over)', () => {
    expect(scoreShape(6, 4)).toBe('double-square');
    expect(scoreShape(8, 4)).toBe('double-square');
    expect(scoreShape(15, 4)).toBe('double-square');
  });
});
```

**Step 2: Verifiser failing**

Run: `npm test -- lib/scoring/scoreShape.test.ts`
Expected: FAIL.

**Step 3: Skriv minimal implementation**

```ts
// lib/scoring/scoreShape.ts
export type ScoreShape =
  | 'none'
  | 'circle'
  | 'double-circle'
  | 'square'
  | 'double-square';

/**
 * Maps a gross score to its scorecard-convention shape decoration:
 *   - eagle or better → double circle
 *   - birdie → circle
 *   - par → no shape
 *   - bogey → square
 *   - double bogey or worse → double square
 *
 * Null score (unset) → no shape. The number itself is rendered as a
 * placeholder (par) elsewhere; the shape stays absent.
 *
 * Capped at double on both ends. Triple/quadruple bogeys still render as
 * double-square — the literal stroke number conveys the rest.
 */
export function scoreShape(score: number | null, par: number): ScoreShape {
  if (score === null) return 'none';
  const diff = score - par;
  if (diff <= -2) return 'double-circle';
  if (diff === -1) return 'circle';
  if (diff === 0) return 'none';
  if (diff === 1) return 'square';
  return 'double-square';
}
```

**Step 4: Verifiser passing**

Run: `npm test -- lib/scoring/scoreShape.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add lib/scoring/scoreShape.ts lib/scoring/scoreShape.test.ts
git commit -m "chore(scoring): add scoreShape mapping with cap-at-double convention"
```

---

## Task 4: `lib/names/formatRevealName.ts` — navne-reveal formatter

**Files:**
- Create: `lib/names/formatRevealName.ts`
- Create: `lib/names/formatRevealName.test.ts`

**Step 1: Skriv failing test**

```ts
// lib/names/formatRevealName.test.ts
import { describe, it, expect } from 'vitest';
import { formatRevealName } from './formatRevealName';

describe('formatRevealName', () => {
  it('returns name unchanged when nickname is null', () => {
    expect(formatRevealName('Karl Jensen', null)).toBe('Karl Jensen');
  });

  it('returns name unchanged when nickname is empty or whitespace', () => {
    expect(formatRevealName('Karl Jensen', '')).toBe('Karl Jensen');
    expect(formatRevealName('Karl Jensen', '   ')).toBe('Karl Jensen');
  });

  it('inserts nickname between first and last word for 2-word name', () => {
    expect(formatRevealName('Karl Jensen', 'Knølkis')).toBe(
      'Karl "Knølkis" Jensen',
    );
  });

  it('inserts nickname between first and last word for 3-word name', () => {
    expect(formatRevealName('Karl Erik Jensen', 'Knølkis')).toBe(
      'Karl "Knølkis" Jensen',
    );
  });

  it('inserts nickname between first and last word for 4-word name', () => {
    expect(formatRevealName('Sondre Reitan Aar Junior', 'Pingvin')).toBe(
      'Sondre "Pingvin" Junior',
    );
  });

  it('appends nickname when name is a single word', () => {
    expect(formatRevealName('Karl', 'Knølkis')).toBe('Karl "Knølkis"');
  });

  it('handles unicode names (Norwegian characters)', () => {
    expect(formatRevealName('Bjørn Åge Østby', 'Knølkis')).toBe(
      'Bjørn "Knølkis" Østby',
    );
  });

  it('trims leading/trailing whitespace from name', () => {
    expect(formatRevealName('  Karl Jensen  ', 'Knølkis')).toBe(
      'Karl "Knølkis" Jensen',
    );
  });

  it('collapses multiple spaces in name', () => {
    expect(formatRevealName('Karl   Jensen', 'Knølkis')).toBe(
      'Karl "Knølkis" Jensen',
    );
  });
});
```

**Step 2: Verifiser failing**

Run: `npm test -- lib/names/formatRevealName.test.ts`
Expected: FAIL.

**Step 3: Skriv minimal implementation**

```ts
// lib/names/formatRevealName.ts

/**
 * Formats a player's display name for the "grand reveal" — when a game's
 * status flips to 'finished' and we surface the full identity behind the
 * playful nickname used during the round.
 *
 * Algorithm: keep the first word and the last word of the legal name, drop
 * any middle words, and embed the nickname (in quotes) between them.
 *
 * Examples:
 *   ("Karl Erik Jensen", "Knølkis")  -> Karl "Knølkis" Jensen
 *   ("Karl Jensen",      "Knølkis")  -> Karl "Knølkis" Jensen
 *   ("Karl",             "Knølkis")  -> Karl "Knølkis"
 *   ("Karl Jensen",      null)       -> Karl Jensen
 *
 * Empty or whitespace-only nickname is treated as no nickname.
 */
export function formatRevealName(
  name: string,
  nickname: string | null,
): string {
  const trimmedNick = nickname?.trim() ?? '';
  if (trimmedNick.length === 0) return name.trim();

  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return `"${trimmedNick}"`;
  if (parts.length === 1) return `${parts[0]} "${trimmedNick}"`;

  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${first} "${trimmedNick}" ${last}`;
}
```

**Step 4: Verifiser passing**

Run: `npm test -- lib/names/formatRevealName.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add lib/names/formatRevealName.ts lib/names/formatRevealName.test.ts
git commit -m "chore(names): add formatRevealName helper for grand-reveal moment"
```

---

# Fase 2 — Visuell komponent (ScoreShape)

## Task 5: `components/scoring/ScoreShape.tsx` — SVG-form rundt tall

**Files:**
- Create: `components/scoring/ScoreShape.tsx`
- Create: `components/scoring/ScoreShape.test.tsx`

**Step 1: Skriv failing test**

```tsx
// components/scoring/ScoreShape.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoreShape } from './ScoreShape';

describe('ScoreShape', () => {
  it('renders just the children when shape is none', () => {
    const { container } = render(
      <ScoreShape shape="none" tone="par">5</ScoreShape>,
    );
    expect(screen.getByText('5')).toBeDefined();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders an SVG ring for circle (birdie)', () => {
    const { container } = render(
      <ScoreShape shape="circle" tone="under">3</ScoreShape>,
    );
    expect(screen.getByText('3')).toBeDefined();
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.querySelectorAll('circle').length).toBe(1);
  });

  it('renders two SVG rings for double-circle (eagle)', () => {
    const { container } = render(
      <ScoreShape shape="double-circle" tone="under">2</ScoreShape>,
    );
    const svg = container.querySelector('svg');
    expect(svg?.querySelectorAll('circle').length).toBe(2);
  });

  it('renders one SVG rect for square (bogey)', () => {
    const { container } = render(
      <ScoreShape shape="square" tone="over1">5</ScoreShape>,
    );
    const svg = container.querySelector('svg');
    expect(svg?.querySelectorAll('rect').length).toBe(1);
  });

  it('renders two SVG rects for double-square (double bogey+)', () => {
    const { container } = render(
      <ScoreShape shape="double-square" tone="over2">6</ScoreShape>,
    );
    const svg = container.querySelector('svg');
    expect(svg?.querySelectorAll('rect').length).toBe(2);
  });

  it('respects size prop (defaults to "lg")', () => {
    const { container, rerender } = render(
      <ScoreShape shape="circle" tone="under" size="sm">3</ScoreShape>,
    );
    const smSvg = container.querySelector('svg');
    const smSize = smSvg?.getAttribute('width');
    rerender(
      <ScoreShape shape="circle" tone="under" size="lg">3</ScoreShape>,
    );
    const lgSvg = container.querySelector('svg');
    const lgSize = lgSvg?.getAttribute('width');
    expect(Number(lgSize)).toBeGreaterThan(Number(smSize));
  });
});
```

**Step 2: Verifiser failing**

Run: `npm test -- components/scoring/ScoreShape.test.tsx`
Expected: FAIL.

**Step 3: Skriv implementasjonen**

```tsx
// components/scoring/ScoreShape.tsx
import type { CSSProperties, JSX, ReactNode } from 'react';
import type { ScoreShape as ShapeKind } from '@/lib/scoring/scoreShape';
import type { ScoreTone } from '@/lib/scoring/scoreTone';

export type ScoreShapeSize = 'sm' | 'md' | 'lg';

export interface ScoreShapeProps {
  shape: ShapeKind;
  tone: ScoreTone;
  size?: ScoreShapeSize;
  children: ReactNode;
}

const SIZE_PX: Record<ScoreShapeSize, number> = {
  sm: 28,
  md: 36,
  lg: 52,
};

const STROKE_BY_SIZE: Record<ScoreShapeSize, number> = {
  sm: 1.25,
  md: 1.5,
  lg: 2,
};

// Stroke colors mirror the existing scoreTone palette in scoreCard.tsx.
const STROKE_COLOR: Record<ScoreTone, string> = {
  unset: '#9A8F7C',
  under: '#2F5A3C',
  par: '#5C5347',
  over1: '#7A5410',
  over2: '#7A2F2A',
};

/**
 * Wraps `children` (typically the gross score number) in a scorecard-style
 * shape: circle for birdie, double-circle for eagle, square for bogey,
 * double-square for double-bogey-or-worse. Par renders just the number.
 *
 * Stroke color follows the existing scoreTone palette.
 */
export function ScoreShape(props: ScoreShapeProps): JSX.Element {
  const { shape, tone, size = 'lg', children } = props;
  if (shape === 'none') {
    return <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{children}</span>;
  }

  const px = SIZE_PX[size];
  const stroke = STROKE_BY_SIZE[size];
  const color = STROKE_COLOR[tone];
  const half = px / 2;
  const inner = half - stroke;
  const innerSquareOffset = stroke / 2;
  const gap = Math.max(3, stroke + 1);

  const wrapStyle: CSSProperties = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: px,
    height: px,
  };

  const svgStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  };

  const numberStyle: CSSProperties = {
    position: 'relative',
    zIndex: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <span style={wrapStyle}>
      <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} style={svgStyle} aria-hidden>
        {shape === 'circle' && (
          <circle cx={half} cy={half} r={inner} fill="none" stroke={color} strokeWidth={stroke} />
        )}
        {shape === 'double-circle' && (
          <>
            <circle cx={half} cy={half} r={inner} fill="none" stroke={color} strokeWidth={stroke} />
            <circle cx={half} cy={half} r={inner - gap} fill="none" stroke={color} strokeWidth={stroke} />
          </>
        )}
        {shape === 'square' && (
          <rect
            x={innerSquareOffset}
            y={innerSquareOffset}
            width={px - stroke}
            height={px - stroke}
            rx={4}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
          />
        )}
        {shape === 'double-square' && (
          <>
            <rect
              x={innerSquareOffset}
              y={innerSquareOffset}
              width={px - stroke}
              height={px - stroke}
              rx={4}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
            />
            <rect
              x={innerSquareOffset + gap}
              y={innerSquareOffset + gap}
              width={px - stroke - 2 * gap}
              height={px - stroke - 2 * gap}
              rx={3}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
            />
          </>
        )}
      </svg>
      <span style={numberStyle}>{children}</span>
    </span>
  );
}
```

**Step 4: Verifiser passing**

Run: `npm test -- components/scoring/ScoreShape.test.tsx`
Expected: PASS, 6 tester grønne.

**Step 5: Commit**

```bash
git add components/scoring/ScoreShape.tsx components/scoring/ScoreShape.test.tsx
git commit -m "chore(scoring): add ScoreShape SVG component for scorecard shapes"
```

---

# Fase 3 — Anvend shapes på hull-skjerm (drop pill)

## Task 6: Apply ScoreShape to `ScoreCard.tsx`, drop the pill

**Files:**
- Modify: `components/hole/ScoreCard.tsx`
- Modify: `components/hole/ScoreCard.test.tsx`

**Step 1: Oppdater testen først**

Test må verifisere at:
- Pill ikke lenger rendres (data-testid="delta-pill" finnes ikke)
- Score-tall er fortsatt synlig (data-testid="score-number")
- For birdie-score (4 strokes, par 5): SVG-sirkel rendres
- For bogey-score (5 strokes, par 4): SVG-firkant rendres
- For par-score: ingen SVG (eller SVG uten kids)

Eksempel-skeleton:
```tsx
it('renders SVG circle for birdie', () => {
  const { container } = render(
    <ScoreCard
      playerId="u1" name="Karl" initial="K" extraStrokes={0}
      score={4} par={5} confirmed={true}
      onSetScore={() => {}} onLongPress={() => {}}
    />,
  );
  expect(container.querySelector('svg circle')).not.toBeNull();
});

it('does not render delta-pill', () => {
  const { queryByTestId } = render(
    <ScoreCard /* same props */ />,
  );
  expect(queryByTestId('delta-pill')).toBeNull();
});
```

**Step 2: Verifiser failing**

Run: `npm test -- components/hole/ScoreCard.test.tsx`
Expected: nye tester FAIL (pill finnes fortsatt, ingen SVG).

**Step 3: Endre `ScoreCard.tsx`**

- Importer `ScoreShape` og `scoreShape`
- Beregn `shape = scoreShape(score, par)`
- Bytt ut `<span data-testid="delta-pill">` med `<ScoreShape shape={shape} tone={tone} size="lg">{displayedNumber}</ScoreShape>` rundt stortallet
- Fjern `pillStyle` og `PILL_COLORS`-mappet (eller behold som dead-code TEMP — vi sletter i Task 7)
- Behold `numberStyle` på selve tallet, men ta vekk `color`-prop på den fordi `ScoreShape` håndterer fargen på streken og tallet beholder default tekstfarge (eller forenkle til `var(--text)`)

**Step 4: Verifiser passing**

Run: `npm test -- components/hole/ScoreCard.test.tsx`
Expected: alle tester grønne.

**Step 5: Bump patch-versjon + CHANGELOG entry**

Dette er første bruker-synlige endring. Bump patch.

```bash
npm version patch --no-git-tag-version
```

Forventet ny versjon: `0.10.23`.

Legg til entry i `CHANGELOG.md` (nyeste øverst, under `## 0.10.x`-serien):

```markdown
### [0.10.23] - 2026-05-14

**Score-tallene på hull-skjermen får scorekort-former rundt seg — sirkel for birdies, firkant for bogeys, dobbel for eagle og double bogey.**

<details>
<summary>Teknisk</summary>

#### Added
- `lib/games/visibility.ts` — `revealState` og `shouldHideNetto` helpers
- `lib/scoring/scoreShape.ts` — mapper score til shape-kategori
- `lib/names/formatRevealName.ts` — full-format navn for grand-reveal
- `components/scoring/ScoreShape.tsx` — SVG-pakker rundt score-tall
- Migrasjon 0021 — `games.score_visibility` enum-kolonne

#### Changed
- `components/hole/ScoreCard.tsx` — delta-pill droppet, erstattet av form rundt stortallet

</details>
```

**Step 6: Commit**

```bash
git add components/hole/ScoreCard.tsx components/hole/ScoreCard.test.tsx package.json package-lock.json CHANGELOG.md
git commit -m "feat(hole): scorecard shapes around gross score, drop delta pill"
```

**Step 7: Push**

```bash
git push origin HEAD:main
```

Brukeren kan se den nye formen i prod på hull-skjermen.

---

# Fase 4 — Anvend shapes på flere flater (uten reveal-mode)

## Task 7: Apply ScoreShape to scorekort-oversikt

**Files:**
- Modify: `app/games/[id]/scorecard/page.tsx`

**Step 1: Identifiser rendering-stedet**

I `ScorecardTable`-funksjonen, hver `<tr>` rendrer `r.strokes ?? '—'` i Slag-kolonnen. Vi pakker det inn i `<ScoreShape shape={scoreShape(r.strokes, r.par)} tone={scoreTone(r.strokes, r.par)} size="sm">{r.strokes ?? '—'}</ScoreShape>`.

**Step 2: Importer**

```tsx
import { ScoreShape } from '@/components/scoring/ScoreShape';
import { scoreShape } from '@/lib/scoring/scoreShape';
import { scoreTone } from '@/lib/scoring/scoreTone';
```

**Step 3: Erstatt rendering**

I `<td className="score-num px-4 py-2.5 text-right text-text">{r.strokes ?? '—'}</td>`:

```tsx
<td className="score-num px-4 py-2.5 text-right text-text">
  <ScoreShape
    shape={scoreShape(r.strokes, r.par)}
    tone={scoreTone(r.strokes, r.par)}
    size="sm"
  >
    {r.strokes ?? '—'}
  </ScoreShape>
</td>
```

**Step 4: Verifiser visuelt**

Kjør `npm run build` og sjekk at det kompilerer. Eksisterende tester må fortsatt passere: `npm test`.

**Step 5: Bump patch + CHANGELOG**

```bash
npm version patch --no-git-tag-version
```

Ny versjon: `0.10.24`. Legg til entry:

```markdown
### [0.10.24] - 2026-05-14

**Scorekort-oversikten viser nå scorekort-former rundt slag-tallene — samme visuelle språk som hull-skjermen.**

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/scorecard/page.tsx` — Slag-kolonnen pakker tallene i ScoreShape

</details>
```

**Step 6: Commit + push**

```bash
git add app/games/[id]/scorecard/page.tsx package.json package-lock.json CHANGELOG.md
git commit -m "feat(scorecard): scorecard shapes on scorekort-oversikt Slag column"
git push origin HEAD:main
```

---

## Task 8: Apply ScoreShape to lever-skjerm (`/submit`)

**Files:**
- Modify: `app/games/[id]/submit/page.tsx`

**Step 1: Identifiser score-rendering**

Submit-siden rendrer en oversikt med spillerens scorer per hull. Finn der `strokes` rendres som tall.

**Step 2: Anvend `ScoreShape`-mønsteret fra Task 7**

Importer `ScoreShape`, `scoreShape`, `scoreTone`. Wrappe slag-tall.

**Step 3: Bump + CHANGELOG + commit + push** (samme mønster).

Ny versjon: `0.10.25`. CHANGELOG-entry: «Scorekort-former også på lever-skjermen før du sender inn scorekortet.»

```bash
git commit -m "feat(submit): scorecard shapes on submit review page"
git push origin HEAD:main
```

---

## Task 9: Apply ScoreShape to approve-skjerm (`/approve`)

**Files:**
- Modify: `app/games/[id]/approve/page.tsx`

Samme mønster som Task 7 og 8. Bump til `0.10.26`. CHANGELOG-entry: «Scorekort-former også på godkjenningssiden for spillerens scorekort.»

```bash
git commit -m "feat(approve): scorecard shapes on approve screen"
git push origin HEAD:main
```

---

## Task 10: Apply ScoreShape to hull-leaderboard grid

**Files:**
- Modify: `app/games/[id]/leaderboard/holes/page.tsx`

**Step 1: Identifiser celle-rendering**

Hull-leaderboard rendrer en grid av tall (én celle per spiller per hull). Cellen er typisk liten — bruk `size="sm"`.

**Step 2: Pakk tall-cellen i ScoreShape**

For hver celle der `score` rendres som tall: wrap med `<ScoreShape shape={scoreShape(score, par)} tone={scoreTone(score, par)} size="sm">{score}</ScoreShape>`.

**Step 3: Sjekk at grid-cellen ikke kollapser**

Test i nettleser at den nye SVG-en ikke sprenger celle-layouten. Hvis trang, prøv `size="sm"` og evt. egne CSS-justeringer.

**Step 4: Bump + CHANGELOG + commit + push**

Ny versjon: `0.10.27`. CHANGELOG-entry: «Scorekort-former på hull-leaderboardet for hver spillers per-hull-score.»

```bash
git commit -m "feat(leaderboard): scorecard shapes on hole-grid leaderboard"
git push origin HEAD:main
```

---

## Task 11: Apply ScoreShape to leaderboard summary (hvis relevant)

**Files:**
- Modify: `app/games/[id]/leaderboard/page.tsx`

**Step 1: Vurder om leaderboardet rendrer per-hull-tall**

Den nåværende leaderboard-sammendrag-visningen viser typisk lag-totaler + per-spiller-totaler — ikke per-hull-tall direkte. Hvis ja: bruk `ScoreShape`. Hvis nei: skip dette taskt (hopp til Task 12).

**Step 2: Hvis det IKKE er per-hull-tall:**

Bare commit en skip-merknad i CHANGELOG-en for Task 11. Hopp videre.

---

## Task 12: Apply ScoreShape to historikk

**Files:**
- Modify: `app/profile/historikk/page.tsx`

**Step 1: Identifiser score-rendering**

Historikk-siden viser typisk brutto-total per runde, ikke per-hull. Hvis det er en utvidet visning som viser per-hull: anvend `ScoreShape size="sm"`. Hvis bare total: skip.

**Step 2: Bump + CHANGELOG (hvis applisert) + commit + push**

```bash
git commit -m "feat(historikk): scorecard shapes on historikk if applicable"
git push origin HEAD:main
```

Hvis historikk ikke har per-hull-rendering, hopp til Task 13 uten endring her.

---

# Fase 5 — Admin-UI for reveal-mode

## Task 13: Add `score_visibility` til GameForm

**Files:**
- Modify: `app/admin/games/new/GameForm.tsx`
- Modify: `app/admin/games/new/page.tsx` (eller actions.ts hvis det er der server-action ligger)
- Modify: `app/admin/games/[id]/edit/page.tsx` (eller dens form-komponent)

**Step 1: Legg til toggle i UI**

Seksjon i GameForm:

```tsx
<fieldset>
  <legend>Synlighet under runden</legend>
  <label>
    <input type="radio" name="score_visibility" value="live" defaultChecked={mode === 'live'} />
    Vis alt under runden
    <span className="text-muted text-sm">Netto-tall synlige fra hull 1 (standard)</span>
  </label>
  <label>
    <input type="radio" name="score_visibility" value="reveal" defaultChecked={mode === 'reveal'} />
    Avslør på slutten
    <span className="text-muted text-sm">Brutto under runden, netto avsløres når spillet avsluttes</span>
  </label>
  <p className="text-xs text-muted">
    Reveal-modus skjuler handicap-slag og netto-rangering under runden.
    Lag med høyere handicap kan slå brutto-lederen — det blir et virkelig
    spennings-moment når du trykker avslutt.
  </p>
</fieldset>
```

**Step 2: Server-action validering**

I `createGame`- og `updateGame`-actions: les `score_visibility` fra `formData`, valider mot `['live', 'reveal']`, default til `'live'` hvis ugyldig. Save til DB.

**Step 3: Lås mens active/finished**

I edit-flyt: hvis game.status er `'active'` eller `'finished'`, render toggle-en disabled med helper-tekst «Kan ikke endres etter spill-start».

**Step 4: Bump patch + CHANGELOG + commit + push**

Ny versjon: `0.10.28`. CHANGELOG-entry: «Admin kan nå velge reveal-modus for nye spill — netto-tallene skjules under runden og avsløres på slutten.»

```bash
git commit -m "feat(admin): score_visibility toggle in GameForm + edit"
git push origin HEAD:main
```

---

# Fase 6 — Respekt reveal-mode på score-flater

## Task 14: Hide «+N SLAG»-badge i reveal-active på hull-skjerm

**Files:**
- Modify: `app/games/[id]/holes/[holeNumber]/page.tsx`
- Modify: `app/games/[id]/holes/[holeNumber]/HoleClient.tsx`
- Modify: `components/hole/ScoreCard.tsx`

**Step 1: Fetch `score_visibility` i page.tsx**

Legg til `score_visibility` i game-select-en. Bruk `revealState(game.score_visibility, game.status)` for å beregne `state`. Send `hideNetto = shouldHideNetto(state)` til `HoleClient`.

**Step 2: Propager til ScoreCard**

`HoleClient` → `ScoreCard` får ny prop `hideNetto: boolean`. Hvis true, render ikke «+N SLAG»-badge-en uansett `extraStrokes`.

**Step 3: Test**

Oppdater `ScoreCard.test.tsx` med en test som bekrefter at badge ikke vises når `hideNetto=true`.

**Step 4: Verifiser passing**

`npm test` — alt grønt.

**Step 5: Commit** (chore — ingen bruker-synlig endring ennå siden ingen spill har reveal-mode i prod ennå)

```bash
git add app/games/\[id\]/holes/\[holeNumber\]/page.tsx app/games/\[id\]/holes/\[holeNumber\]/HoleClient.tsx components/hole/ScoreCard.tsx components/hole/ScoreCard.test.tsx
git commit -m "chore(hole): respect reveal-mode by hiding +N SLAG badge"
```

Ingen push ennå — vi venter til hele reveal-respekten er på plass.

---

## Task 15: Hide «+slag»-kolonne i reveal-active på scorekort-oversikt

**Files:**
- Modify: `app/games/[id]/scorecard/page.tsx`

**Step 1: Fetch score_visibility + game.status**

Legg til feltet i game-select. Beregn `state` via `revealState`. Lag `showHandicapColumn = !shouldHideNetto(state)`.

**Step 2: Condition rendering av «+slag»-kolonnen**

Wrap både `<th>` og hver `<td>` for «+slag» i `{showHandicapColumn && (...)}`.

**Step 3: Add netto-kolonne ved reveal-finished**

Hvis `state === 'reveal-finished'`, vis også en ny «Netto»-kolonne med `r.strokes - r.extra` (eller `null` hvis strokes er null). Bruk samme `ScoreShape`-pakking — tone basert på `(strokes - extra) vs par`.

**Step 4: Commit (chore)**

```bash
git commit -m "chore(scorecard): respect reveal-mode — hide +slag in reveal-active, add netto in reveal-finished"
```

---

## Task 16: Lever-skjerm reveal-respekt (same as Task 15)

**Files:**
- Modify: `app/games/[id]/submit/page.tsx`

Følg Task 15-mønsteret. Commit som `chore(submit): respect reveal-mode in score review`.

---

## Task 17: Approve-skjerm reveal-respekt

**Files:**
- Modify: `app/games/[id]/approve/page.tsx`

Følg Task 15-mønsteret. Commit som `chore(approve): respect reveal-mode in scorecard approval`.

---

## Task 18: Hull-leaderboard reveal-respekt

**Files:**
- Modify: `app/games/[id]/leaderboard/holes/page.tsx`

**Step 1: Beregn state via revealState**

I page.tsx, fetch `score_visibility` og `status`, beregn `state`.

**Step 2: I reveal-active: tving brutto-modus**

Eksisterende `mode` søkes typisk fra `?mode=` query param. Hvis `state === 'reveal-active'`, overstyr `mode = 'brutto'`. Hvis `state === 'reveal-finished'` eller `'live-always'`: bruk eksisterende parsing.

**Step 3: I reveal-active: skjul netto-fargekoding på celler**

Hvis `state === 'reveal-active'`, gi `ScoreShape` `tone` basert på brutto-vs-par (ikke netto-fargekoding).

**Step 4: Commit (chore)**

```bash
git commit -m "chore(leaderboard): respect reveal-mode in hole-grid leaderboard"
```

---

# Fase 7 — Live brutto leaderboard + reveal-flourish

## Task 19: Reveal-mode-aware leaderboard hovedside

**Files:**
- Modify: `app/games/[id]/leaderboard/page.tsx`

**Step 1: Fetch score_visibility, beregn state**

Legg `score_visibility` til games-select-en. Beregn `state = revealState(score_visibility, status)`.

**Step 2: Utvid view-state-machinen**

Eksisterende `type View = 'state3' | 'state3.5' | 'full'`. Legg til `'reveal-active'` og `'reveal-finished-flourish'`.

Oppdater view-velgeren:

```ts
let view: View;
if (state === 'live-always') {
  view =
    game.status === 'finished'
      ? 'full'
      : !frontNineOpen
        ? 'state3'
        : 'state3.5';
} else if (state === 'reveal-active') {
  view = 'reveal-active';
} else {
  // reveal-finished
  view = 'reveal-finished-flourish';
}
```

**Step 3: Render 'reveal-active' branch**

For 'reveal-active': render et nytt `RevealBruttoView`-component med lag-totaler basert på brutto best-ball. Bruk eksisterende `computeLeaderboard({mode: 'brutto', ...})` — den er allerede der.

UI-skisse (sjekk mot design-doc):

```tsx
function RevealBruttoView(props: { lines: TeamLine[]; spiltHullCount: number }) {
  return (
    <AppShell>
      <BackLink href={...} />
      <Kicker>LIVE LEADERBOARD</Kicker>
      <h1>Brutto · etter {props.spiltHullCount} hull</h1>
      {props.lines.map((line) => (
        <Card key={line.teamNumber}>
          <div>{rankLabel(line.rank)} — Lag {line.teamNumber}</div>
          <div className="score-num">{line.total}</div>
          {line.players.map((p) => (
            <div key={p.userId}>
              <span>{p.nickname ?? p.name}</span>
              <span className="score-num">{playerGrossTotal(p, line)}</span>
            </div>
          ))}
        </Card>
      ))}
      <p className="text-muted text-center">
        🤫 Vinneren avsløres når runden er ferdig
      </p>
    </AppShell>
  );
}
```

**Step 4: Render 'reveal-finished-flourish' branch**

Som eksisterende 'full'-view, MEN:
- Anvend `formatRevealName(name, nickname)` på alle spiller-navn
- Behold `ConfettiBurst` (eksisterende). Vurder en `<Banner>` over leaderboardet som sier «Resultatet er klart!» — subtilt.

**Step 5: Commit (chore — ingen prod-game er i reveal-mode ennå)**

```bash
git commit -m "chore(leaderboard): add reveal-active and reveal-finished-flourish view branches"
```

---

## Task 20: Anvend `formatRevealName` på finished-flater (alle modi)

**Files:**
- Modify: `app/games/[id]/leaderboard/page.tsx` (under 'full' og 'reveal-finished-flourish')
- Modify: `app/games/[id]/leaderboard/holes/page.tsx` (hvis status=finished)
- Modify: `app/profile/historikk/page.tsx`

**Step 1: I full-view-rendering**

På steder der `nickname ?? name` rendres for finished-leaderboard, erstatt med `formatRevealName(name, nickname)`.

**Step 2: I historikk**

På steder der medspiller-navn rendres, bruk `formatRevealName`.

**Step 3: Commit (chore)**

```bash
git commit -m "chore(names): apply formatRevealName on all finished-game surfaces"
```

---

# Fase 8 — Hull-skjerm leaderboard-ikon

## Task 21: Add leaderboard icon to HoleClient header

**Files:**
- Modify: `app/games/[id]/holes/[holeNumber]/HoleClient.tsx`

**Step 1: Skift ut det tomme 34px-span-et**

I header-row (rundt linje 297), erstatt:
```tsx
<span aria-hidden style={{ display: 'inline-block', width: 34 }} />
```

med:
```tsx
<SmartLink
  href={`/games/${gameId}/leaderboard?return=hole&n=${currentHole}`}
  aria-label="Vis leaderboard"
  style={{
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    height: 34,
    color: 'var(--text-muted)',
    textDecoration: 'none',
  }}
>
  <Laurel size={20} />
</SmartLink>
```

(Importer `Laurel` fra `components/icons/Laurel.tsx`.)

**Step 2: Commit (chore — visuell, ikke nytt feature, men bruker ser et nytt ikon. Egentlig minor visible change — bruk feat() patch.)**

Faktisk: dette er bruker-synlig. Bump.

```bash
npm version patch --no-git-tag-version
```

Ny versjon: `0.10.29`. CHANGELOG-entry: «Liten leaderboard-knapp i hull-skjerm-headeren for rask tilgang til scoring-oversikten.»

```bash
git add app/games/\[id\]/holes/\[holeNumber\]/HoleClient.tsx package.json package-lock.json CHANGELOG.md
git commit -m "feat(hole): leaderboard icon in hole-screen header"
git push origin HEAD:main
```

---

## Task 22: Return-to-hole på leaderboard-back-knapp

**Files:**
- Modify: `app/games/[id]/leaderboard/page.tsx`

**Step 1: Les `return` + `n` fra searchParams**

```ts
const returnTo = sp.return;
const n = sp.n ? Number(Array.isArray(sp.n) ? sp.n[0] : sp.n) : null;
const backHref =
  returnTo === 'hole' && n != null && Number.isInteger(n) && n >= 1 && n <= 18
    ? `/games/${id}/holes/${n}`
    : `/games/${id}`;
```

**Step 2: Send `backHref` til AppShell/TopBar/BackLink**

Hvor enn back-knappen settes i page-en — overstyr med `backHref`.

**Step 3: Commit (chore)**

```bash
git commit -m "chore(leaderboard): respect ?return=hole&n=N for back navigation"
```

---

# Fase 9 — Integration test + smoke

## Task 23: Playwright E2E for reveal-mode happy path

**Files:**
- Create: `tests/reveal-mode.spec.ts` (eller i eksisterende e2e-folder)

**Step 1: Skriv test som dekker hele flyten**

```ts
import { test, expect } from '@playwright/test';

test('reveal-mode hides netto during active, shows full reveal at finished', async ({ page }) => {
  // Sett opp en test-game med reveal-mode (fixtures eller seed)
  // ... (sett opp via Supabase MCP eller fixtures)

  // Bekreft hull-skjerm: ingen +N SLAG badge
  await page.goto(`/games/${gameId}/holes/1`);
  await expect(page.locator('[data-testid="extra-strokes-badge"]')).toHaveCount(0);

  // Naviger til leaderboard
  await page.click('[aria-label="Vis leaderboard"]');
  await expect(page).toHaveURL(/return=hole&n=1/);

  // Bekreft brutto-totaler vises, ingen netto-tall
  await expect(page.locator('text=Brutto')).toBeVisible();
  await expect(page.locator('text=Vinneren avsløres')).toBeVisible();

  // Back-knapp → tilbake til hull 1
  await page.click('[aria-label="Tilbake"]');
  await expect(page).toHaveURL(/\/holes\/1$/);

  // Admin avslutter spillet (via fixture-helper)
  await endGameAsAdmin(gameId);

  // Re-load leaderboard
  await page.goto(`/games/${gameId}/leaderboard`);

  // Bekreft full-format navn vises
  await expect(page.locator('text=Karl "Knølkis" Jensen')).toBeVisible();

  // Bekreft confetti rendres
  await expect(page.locator('[data-confetti]')).toBeVisible();
});
```

**Step 2: Kjør testen**

```bash
npm run e2e -- tests/reveal-mode.spec.ts
```

Forventet: PASS.

**Step 3: Commit (test)**

```bash
git add tests/reveal-mode.spec.ts
git commit -m "test(reveal): e2e for reveal-mode happy path"
```

---

## Task 24: Final test-pass

**Step 1: Kjør hele test-suite**

```bash
npm test
```

Forventet: 200+ tester grønne (180 eksisterende + 20-30 nye).

**Step 2: Kjør lint**

```bash
npm run lint
```

Forventet: ingen feil.

**Step 3: Kjør build**

```bash
npm run build
```

Forventet: PASS.

**Step 4: Commit hvis det er småfikser**

Hvis testene avdekket feil — fiks og commit som `fix(scope): ...` (med bump + CHANGELOG hvis bruker-synlig) eller `chore(scope): ...`.

---

# Fase 10 — MAJOR-bump til v1.0.0

## Task 25: Bump v1.0.0 + samle-CHANGELOG-entry

**Files:**
- Modify: `package.json` (bump version)
- Modify: `CHANGELOG.md`

**Step 1: Bump til 1.0.0**

```bash
npm version major --no-git-tag-version
```

Verifiser at `package.json` viser `"version": "1.0.0"`.

**Step 2: Skriv samle-CHANGELOG-entry**

På toppen av `CHANGELOG.md`, før `## 0.10.x`-serien, legg til en NY minor-serie-header:

```markdown
## 1.0.0 — Første stabile release

Den første versjonen vi kaller stabil. Tre nye featurer kobles sammen
til v1.0.

### [1.0.0] - 2026-05-XX

**Tørny er nå stabil. Tre nye featurer som markerer at appen er klar
for ekte bruk: reveal-modus for kompis-gjenger som vil ha drama,
scorekort-former som premium visuell touch, og navne-reveal når spillet
er ferdig.**

<details>
<summary>Teknisk</summary>

#### Added
- `games.score_visibility` enum-kolonne (live/reveal) med lås ved status=active
- Reveal-mode i admin-UI (`/admin/games/new` + edit) for å skjule netto-info under runden
- `lib/games/visibility.ts`, `lib/scoring/scoreShape.ts`, `lib/names/formatRevealName.ts`
- `components/scoring/ScoreShape.tsx` SVG-form rundt score-tall (sirkel/firkant/dobbel)
- Live brutto leaderboard for reveal-mode aktiv
- Hull-skjerm leaderboard-ikon med return-to-hole nav
- Reveal-flourish ved status=finished i reveal-mode

#### Changed
- Score-tall pakkes i ScoreShape på hull-skjerm, scorekort-oversikt, lever, approve, hull-leaderboard
- Spillere vises som `Karl "Knølkis" Jensen` på alle finished-flater (leaderboard, historikk)
- Delta-pill på hull-skjerm fjernet (form erstatter)

#### Removed
- Opprinnelig planlagt per-bruker `display_pref`-toggle strykes (erstattet av navne-reveal-mekanikken)

</details>
```

Wrap 0.10.x-serien i `<details>` etter den nye 1.0.0-serien er åpen, slik at tre nyeste minor-serier holdes åpne og eldre kollapses (per CLAUDE.md-regelen).

**Step 3: Commit**

Dette er den eneste `feat()`-commit-en for v1.0-leveransen som ikke trigger en patch-bump (vi har bumpet til 1.0.0). Commit-msg-hooken må være tilfreds: package.json er endret (version 0.10.29 → 1.0.0) og CHANGELOG har entry.

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "feat(release): v1.0.0 — første stabile release"
```

**Step 4: Push**

```bash
git push origin HEAD:main
```

**Step 5: Verifiser i prod**

Vent ~30 sek på Vercel-deploy. Sjekk `tornygolf.no`. AppVersionFooter skal vise `v1.0.0`.

---

# Out-of-scope (eksplisitt UT av denne planen)

Disse er deferred til senere milestones:

- E-lite-stack med netto under brutto på hull-skjerm i live-mode
- Netto-kolonne på scorekort-oversikt i live-mode
- Brutto/netto toggle på leaderboard i live-mode
- Per-bruker navn/kallenavn-preferanse (kansellert helt)
- Andre spillmoduser (stableford, scramble, matchplay)
- Fjerning av `console.time/timeEnd`-instrumenteringen i hull-page + game-home

# Lykke til 🏌️

Sluttilstand: `v1.0.0` i prod, 200+ tester grønne, ingen out-of-scope-arbeid sneket inn. Pilot kan kjøre runde nummer to med reveal-mode aktivert.
