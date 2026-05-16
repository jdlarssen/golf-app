# Sideturnering Per-Team-Collapse Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refaktorere sideturnerings-fanen til å vise lag-medlemmer under hver lag-label og erstatte per-kategori-detalj-seksjonen med klikkbar per-team-collapse som lister kategoriene som ga lagets poeng.

**Architecture:** Endring kun i presentasjons-laget: `SideTournamentView` rewrites slik at poeng-tabellen er en liste av `<details>`-elementer (én per lag), og `page.tsx` utvider `members` med `firstName` per spiller. Scoring-modulen i `lib/scoring/sideTournament.ts` røres ikke. Ny helper `lib/leaderboard/formatHolesList.ts` med 3 unit-tester for hull-range-formattering.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind v4 (forest-and-champagne palette), Vitest. Native `<details>`/`<summary>` for collapse (ingen client state, ingen animation-bibliotek).

**Design-doc:** [`docs/plans/2026-05-16-side-tournament-per-team-collapse-design.md`](./2026-05-16-side-tournament-per-team-collapse-design.md)

**Subagent-modell:** Opus for alle subagenter (per memory `feedback_subagent_model_routing`).

---

## Task 1: `formatHolesList`-helper med TDD

Hjelpefunksjon for å formattere hull-nummer-liste til kompakt streng. Sammenhengende → range (`"10–18"`), spredt → komma (`"4, 7, 12"`), blandet → vurder.

**Files:**
- Create: `lib/leaderboard/formatHolesList.ts`
- Create: `lib/leaderboard/formatHolesList.test.ts`

**Step 1: Write failing tests**

Create `lib/leaderboard/formatHolesList.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { formatHolesList } from './formatHolesList';

describe('formatHolesList', () => {
  it('returnerer tom streng for tom liste', () => {
    expect(formatHolesList([])).toBe('');
  });

  it('enkelt hull rendres som "hull N"', () => {
    expect(formatHolesList([7])).toBe('hull 7');
  });

  it('sammenhengende hull rendres som range med en-dash', () => {
    expect(formatHolesList([10, 11, 12, 13, 14, 15, 16, 17, 18])).toBe('hull 10–18');
  });

  it('to sammenhengende hull rendres som range', () => {
    expect(formatHolesList([4, 5])).toBe('hull 4–5');
  });

  it('spredte hull rendres som kommaliste', () => {
    expect(formatHolesList([4, 7, 12])).toBe('hull 4, 7, 12');
  });

  it('blandet (range + spredte) kombineres', () => {
    expect(formatHolesList([1, 2, 3, 7, 10, 11, 15])).toBe('hull 1–3, 7, 10–11, 15');
  });

  it('usortert input sorteres før formattering', () => {
    expect(formatHolesList([12, 4, 7])).toBe('hull 4, 7, 12');
  });

  it('duplikater fjernes', () => {
    expect(formatHolesList([5, 5, 6, 6, 7])).toBe('hull 5–7');
  });
});
```

**Step 2: Run tests — all fail with module-not-found**

```bash
cd /Users/jdl/Dokumenter/GitHub/golf-app/.claude/worktrees/inspiring-wozniak-d6fa1e
npx vitest run lib/leaderboard/formatHolesList.test.ts
```

Expected: 8 tests fail, all on `Cannot find module './formatHolesList'`.

**Step 3: Implement `formatHolesList.ts`**

Create `lib/leaderboard/formatHolesList.ts`:

```ts
/**
 * Format a list of hole numbers (1-18) into a compact, human-readable Norwegian
 * string. Consecutive holes collapse into ranges with en-dash; non-consecutive
 * holes are joined with commas; the two patterns combine.
 *
 *   formatHolesList([10, 11, 12, 13, 14, 15, 16, 17, 18]) → "hull 10–18"
 *   formatHolesList([4, 7, 12]) → "hull 4, 7, 12"
 *   formatHolesList([1, 2, 3, 7, 10, 11, 15]) → "hull 1–3, 7, 10–11, 15"
 *   formatHolesList([]) → ""
 *
 * Used inside the side-tournament per-team breakdown to summarize hole-wins.
 */
export function formatHolesList(holes: number[]): string {
  if (holes.length === 0) return '';

  // De-dupe and sort ascending
  const sorted = Array.from(new Set(holes)).sort((a, b) => a - b);

  // Group consecutive runs
  const runs: Array<[number, number]> = [];
  let runStart = sorted[0]!;
  let runEnd = sorted[0]!;
  for (let i = 1; i < sorted.length; i++) {
    const h = sorted[i]!;
    if (h === runEnd + 1) {
      runEnd = h;
    } else {
      runs.push([runStart, runEnd]);
      runStart = h;
      runEnd = h;
    }
  }
  runs.push([runStart, runEnd]);

  const parts = runs.map(([from, to]) =>
    from === to ? `${from}` : `${from}–${to}`,
  );

  return `hull ${parts.join(', ')}`;
}
```

**Step 4: Run tests — all pass**

```bash
npx vitest run lib/leaderboard/formatHolesList.test.ts
```

Expected: 8/8 passed.

**Step 5: Typecheck + lint**

```bash
npx tsc --noEmit 2>&1 | grep -v resend | grep formatHolesList || echo "no errors"
npx eslint lib/leaderboard/formatHolesList.ts lib/leaderboard/formatHolesList.test.ts
```

Expected: clean.

**Step 6: Commit**

```bash
git add lib/leaderboard/formatHolesList.ts lib/leaderboard/formatHolesList.test.ts
git commit -m "chore(leaderboard): formatHolesList helper for hole-range formatting

Tar liste av hull-nummer og produserer kompakt visningsstreng:
sammenhengende kjeder kollapser til ranges med en-dash, spredte
hull kommasepareres. Brukes av sideturnerings-per-team-breakdown
i Task 3."
```

`chore(...)` passerer commit-msg-hooken uten version-bump-krav.

---

## Task 2: Utvid `members` med `firstName` i `page.tsx`

`SideTournamentView` trenger fornavn for både team-label-linjen og LD/CTP-vinner-tag. Utvid `sideTeams.members` med et `firstName`-felt.

**Files:**
- Modify: `app/games/[id]/leaderboard/page.tsx` (around lines 413-420)

**Step 1: Read current sideTeams construction**

```bash
grep -n "sideTeams\b" app/games/\[id\]/leaderboard/page.tsx
```

Current (line 413-420):

```ts
const sideTeams: SideTournamentTeam[] = sortedNettoLines.map((line) => ({
  teamId: line.teamNumber,
  label: `Lag ${line.teamNumber}`,
  members: line.players.map((p) => ({
    userId: p.userId,
    displayName: formatRevealName(p.name ?? '', p.nickname),
  })),
}));
```

**Step 2: Add firstName-import**

Find the existing import block at the top of `page.tsx`. Add:

```ts
import { firstName as extractFirstName } from '@/lib/firstName';
```

(Aliased to avoid collision with any local `firstName` variable.)

**Step 3: Extend members construction**

Modify the `sideTeams` construction to include `firstName`:

```ts
const sideTeams: SideTournamentTeam[] = sortedNettoLines.map((line) => ({
  teamId: line.teamNumber,
  label: `Lag ${line.teamNumber}`,
  members: line.players.map((p) => ({
    userId: p.userId,
    displayName: formatRevealName(p.name ?? '', p.nickname),
    // First name only for compact display in the side-tournament tab.
    // Falls back to the nickname-decorated displayName if no parseable name.
    firstName:
      extractFirstName(p.name) ??
      formatRevealName(p.name ?? '', p.nickname) ??
      '?',
  })),
}));
```

The fallback chain: `firstName(p.name)` returns null if name is empty/whitespace; in that edge case (pending invitee that somehow made it through), use the full reveal-name (which may be a nickname); ultimately `'?'`.

**Step 4: Build + tests**

```bash
cd /Users/jdl/Dokumenter/GitHub/golf-app/.claude/worktrees/inspiring-wozniak-d6fa1e
npx tsc --noEmit 2>&1 | grep -v resend | grep -E "(leaderboard/page|firstName)" || echo "no errors"
npx vitest run 2>&1 | tail -5
```

Expected: TypeScript will error on `firstName` not being a field on `SideTournamentTeam.members[N]` yet — that's expected. The error message will guide the next task (the type update lands in Task 3). For now, you can either:

- **Option A:** Add `firstName: string` to the inline `members` type via `as` or `satisfies` — but that desyncs from the source-of-truth type
- **Option B:** Skip the typecheck for this commit (just commit, fix type in Task 3)
- **Option C:** Bundle Task 2 + Task 3 into one commit

Choose **Option C** — these are tightly coupled. Defer the commit to the end of Task 3.

**Step 5: Stage changes but do NOT commit yet**

```bash
git add app/games/[id]/leaderboard/page.tsx
# DO NOT git commit — Task 3 will land in the same commit
```

---

## Task 3: Rewrite `SideTournamentView` to per-team-collapse

Hovedrefaktoreringen. Erstatt poeng-tabellen + master-detalj-seksjonen med en liste av `<details>`-elementer.

**Files:**
- Modify: `app/games/[id]/leaderboard/SideTournamentView.tsx` (major rewrite)

**Step 1: Read existing file to understand current structure**

```bash
cat app/games/\[id\]/leaderboard/SideTournamentView.tsx
```

Confirm:
- `rankByPoints` helper at the bottom — keep
- `CategoryRow`, `HoleWinGrid`, `SlotsSection`, `collectCategoryWinners` — all to be deleted
- `Props` type — extend to include `firstName` on members
- `userDisplayName` helper — adapt or replace

**Step 2: Rewrite the file**

Replace the entire contents with:

```tsx
import type { SideTournamentResult } from '@/lib/scoring/sideTournament';
import { formatHolesList } from '@/lib/leaderboard/formatHolesList';

export type SideTournamentTeam = {
  teamId: number;
  /** Display label, e.g. "Lag 1" */
  label: string;
  members: Array<{
    userId: string;
    /** Full reveal-name (e.g. 'Karl "Knølkis" Jensen') — kept for future surfaces. */
    displayName: string;
    /** First-name-only form used in the compact tab UI. */
    firstName: string;
  }>;
};

type Props = {
  teams: SideTournamentTeam[];
  result: SideTournamentResult;
  ldCount: number;
  ctpCount: number;
  sideWinners: Array<{
    category: 'longest_drive' | 'closest_to_pin';
    position: number;
    winnerUserId: string | null;
  }>;
};

/**
 * Sideturnering — presentational view for the "Sideturnering" tab on the
 * leaderboard. Visible only when game.status === 'finished' AND
 * side_tournament_enabled.
 *
 * Layout: a vertical list of `<details>` elements, one per team, sorted by
 * total side-tournament points descending (dense ranking, ties share rank).
 *
 * Each row's summary shows: medal + "Lag N" + members (first names, joined
 * with " · ") + total points. Click to expand and see that team's awards
 * grouped by category.
 *
 * No realtime, no client state — `result` is precomputed by the server page.
 */
export function SideTournamentView({
  teams,
  result,
  ldCount,
  ctpCount,
  sideWinners,
}: Props) {
  const sorted = rankByPoints(result.teamStandings);
  const teamById = new Map(teams.map((t) => [t.teamId, t]));

  return (
    <div className="space-y-3 px-4">
      {sorted.map((standing) => {
        const team = teamById.get(standing.teamId);
        const label = team?.label ?? `Lag ${standing.teamId}`;
        const memberNames = team?.members.map((m) => m.firstName).join(' · ') ?? '';
        const medal =
          standing.rank === 1
            ? '🥇'
            : standing.rank === 2
              ? '🥈'
              : standing.rank === 3
                ? '🥉'
                : '';

        return (
          <details
            key={standing.teamId}
            className="rounded-md border border-border bg-surface-2"
          >
            <summary className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-2 [&::-webkit-details-marker]:hidden">
              <span className="flex-1 font-serif text-base text-text">
                <span className="mr-2 text-lg">{medal || '·'}</span>
                {label}
                {memberNames && (
                  <span className="ml-2 text-sm text-muted">{memberNames}</span>
                )}
              </span>
              <span className="font-serif text-base text-text tabular-nums">
                {standing.totalPoints}p
              </span>
              <span aria-hidden className="text-muted">▾</span>
            </summary>
            <div className="border-t border-border px-3 py-3 text-sm">
              <TeamAwards
                teamId={standing.teamId}
                standings={sorted}
                ldCount={ldCount}
                ctpCount={ctpCount}
                sideWinners={sideWinners}
                teamById={teamById}
              />
            </div>
          </details>
        );
      })}
    </div>
  );
}

// --- internal helpers ---

/**
 * Dense-rank teams by `totalPoints` descending. Ties share a rank — two teams
 * tied at top both receive rank 1 (and both get the gold medal); next team
 * gets rank 2. Avoids the index-based bug where a tie at top silently demotes
 * one team to silver.
 */
function rankByPoints<T extends { totalPoints: number }>(
  items: T[],
): Array<T & { rank: number }> {
  const sorted = [...items].sort((a, b) => b.totalPoints - a.totalPoints);
  let lastTotal: number | null = null;
  let rank = 0;
  return sorted.map((t) => {
    if (t.totalPoints !== lastTotal) {
      rank += 1;
      lastTotal = t.totalPoints;
    }
    return { ...t, rank };
  });
}

/**
 * Renders one team's awards grouped by category.
 *
 * Each category produces zero or one row depending on whether the team has
 * an award in that category. Hole-wins are aggregated into a single row with
 * a count, total points, and a formatted hole-range. LD/CTP slots are listed
 * per-position with the winner's first name in parens.
 *
 * Tie info on netto categories: if more than one team has the same
 * best_netto_* award, append "(uavgjort med Lag X)" to the row.
 */
function TeamAwards({
  teamId,
  standings,
  ldCount,
  ctpCount,
  sideWinners,
  teamById,
}: {
  teamId: number;
  standings: ReturnType<typeof rankByPoints<SideTournamentResult['teamStandings'][number]>>;
  ldCount: number;
  ctpCount: number;
  sideWinners: Props['sideWinners'];
  teamById: Map<number, SideTournamentTeam>;
}) {
  const myStanding = standings.find((s) => s.teamId === teamId);
  if (!myStanding) return null;

  const awards = myStanding.awards;
  const rows: Array<{ key: string; render: React.ReactNode }> = [];

  // Helper: which OTHER teams share an award in this category?
  const tieMates = (category: string): number[] => {
    return standings
      .filter((s) => s.teamId !== teamId && s.awards.some((a) => a.category === category))
      .map((s) => s.teamId);
  };

  const tieSuffix = (others: number[]): string => {
    if (others.length === 0) return '';
    const labels = others.map((id) => teamById.get(id)?.label ?? `Lag ${id}`);
    if (labels.length === 1) return ` (uavgjort med ${labels[0]})`;
    if (labels.length === 2) return ` (uavgjort med ${labels[0]} og ${labels[1]})`;
    return ` (uavgjort med ${labels.slice(0, -1).join(', ')} og ${labels[labels.length - 1]})`;
  };

  // 1. Best netto 18
  if (awards.some((a) => a.category === 'best_netto_18')) {
    rows.push({
      key: 'best_netto_18',
      render: <>Best netto 18 hull: <Pts n={10} />{tieSuffix(tieMates('best_netto_18'))}</>,
    });
  }
  // 2. Best netto front 9
  if (awards.some((a) => a.category === 'best_netto_front9')) {
    rows.push({
      key: 'best_netto_front9',
      render: <>Best netto front 9: <Pts n={5} />{tieSuffix(tieMates('best_netto_front9'))}</>,
    });
  }
  // 3. Best netto back 9
  if (awards.some((a) => a.category === 'best_netto_back9')) {
    rows.push({
      key: 'best_netto_back9',
      render: <>Best netto back 9: <Pts n={5} />{tieSuffix(tieMates('best_netto_back9'))}</>,
    });
  }
  // 4. Hole-wins (aggregated)
  const holeWinAwards = awards.filter((a) => a.category === 'hole_win');
  if (holeWinAwards.length > 0) {
    const holes = holeWinAwards
      .map((a) => a.holeNumber)
      .filter((h): h is number => typeof h === 'number');
    const totalPts = holeWinAwards.reduce((sum, a) => sum + a.points, 0);
    rows.push({
      key: 'hole_win',
      render: (
        <>
          Hole-wins: <Pts n={totalPts} /> på {holes.length} hull ({formatHolesList(holes)})
        </>
      ),
    });
  }
  // 5. Longest drive — per slot
  if (ldCount > 0) {
    for (let pos = 1; pos <= ldCount; pos++) {
      const w = sideWinners.find(
        (sw) => sw.category === 'longest_drive' && sw.position === pos,
      );
      // Skip if no winner row at all (defensive — shouldn't happen for active games)
      if (!w) continue;
      // Skip if winner isn't on THIS team (this team didn't earn the award)
      const winnerTeamId = w.winnerUserId
        ? findTeamForUser(w.winnerUserId, teamById)
        : null;
      if (winnerTeamId !== teamId) continue;
      const winnerName = firstNameOf(w.winnerUserId, teamById) ?? '?';
      rows.push({
        key: `ld_${pos}`,
        render: <>Longest drive #{pos} ({winnerName}): <Pts n={2} /></>,
      });
    }
  }
  // 6. Closest to pin — per slot
  if (ctpCount > 0) {
    for (let pos = 1; pos <= ctpCount; pos++) {
      const w = sideWinners.find(
        (sw) => sw.category === 'closest_to_pin' && sw.position === pos,
      );
      if (!w) continue;
      const winnerTeamId = w.winnerUserId
        ? findTeamForUser(w.winnerUserId, teamById)
        : null;
      if (winnerTeamId !== teamId) continue;
      const winnerName = firstNameOf(w.winnerUserId, teamById) ?? '?';
      rows.push({
        key: `ctp_${pos}`,
        render: <>Closest to pin #{pos} ({winnerName}): <Pts n={2} /></>,
      });
    }
  }

  if (rows.length === 0) {
    return <div className="text-muted">Ingen poeng denne runden.</div>;
  }

  return (
    <ul className="space-y-1 font-serif text-base text-text">
      {rows.map((r) => (
        <li key={r.key}>{r.render}</li>
      ))}
    </ul>
  );
}

function Pts({ n }: { n: number }) {
  return <span className="tabular-nums">{n}p</span>;
}

function findTeamForUser(
  userId: string,
  teamById: Map<number, SideTournamentTeam>,
): number | null {
  for (const [tid, team] of teamById) {
    if (team.members.some((m) => m.userId === userId)) return tid;
  }
  return null;
}

function firstNameOf(
  userId: string | null,
  teamById: Map<number, SideTournamentTeam>,
): string | null {
  if (!userId) return null;
  for (const team of teamById.values()) {
    const m = team.members.find((mm) => mm.userId === userId);
    if (m) return m.firstName;
  }
  return null;
}
```

**Step 3: Run tests + typecheck**

```bash
cd /Users/jdl/Dokumenter/GitHub/golf-app/.claude/worktrees/inspiring-wozniak-d6fa1e
npx tsc --noEmit 2>&1 | grep -v resend | grep -E "(leaderboard|SideTournament)" || echo "no errors"
npx vitest run 2>&1 | tail -10
npx eslint app/games/\[id\]/leaderboard/SideTournamentView.tsx app/games/\[id\]/leaderboard/page.tsx
```

Expected: clean. All 271 tests (263 + 8 new formatHolesList) pass.

**Step 4: Build verification**

```bash
npm run build 2>&1 | tail -15
```

Expected: clean build (only pre-existing 3 `resend` errors).

**Step 5: Commit Task 2 + 3 together**

Note: `page.tsx` was staged in Task 2 but not committed. Now both files commit together:

```bash
git add app/games/[id]/leaderboard/page.tsx app/games/[id]/leaderboard/SideTournamentView.tsx
git status  # verify only these two files are staged
git commit -m "feat(side-tournament): per-team-collapse på leaderboard-fanen

Hver lag-rad i sideturnerings-tabellen er na et <details>-element.
Sammenklappet: medal + Lag N + fornavn-medlemmer + total-poeng.
Ekspandert: lagets awards listet per kategori, med tied-info pa
netto-kategoriene og hull-range pa hole-wins.

Erstatter den tidligere per-kategori-detalj-seksjonen
(HoleWinGrid, CategoryRow, SlotsSection) som var info-orientert
heller enn lag-orientert.

Bumper v1.1.0 -> v1.1.1 (PATCH)."
```

NB: dette er en `feat`-commit som krever version-bump + CHANGELOG i samme commit. Hooken vil blokkere uten dem. Task 4 håndterer det — INKLUDER package.json + CHANGELOG.md i commit i Task 4, ikke her.

**Re-vurder:** Hooken sjekker hvilke filer som er staged. Hvis du bare stager `page.tsx` + `SideTournamentView.tsx`, blir det blokkert med en `feat`-melding fordi package.json mangler version-endring.

**Løsning:** Gjør Task 4 først (version bump + CHANGELOG), så commit alle filer sammen i Task 3-commit. Eller: bruk `chore(side-tournament)` prefix her, og lag en separat senere commit som bumper versjonen.

**Endring:** Bytt commit-prefix til `chore(side-tournament)` her — kombinasjons-commit med version-bump kommer i Task 4. Riktig commit-melding:

```bash
git commit -m "chore(side-tournament): per-team-collapse på leaderboard-fanen

Hver lag-rad er na et <details>-element. Sammenklappet: medal + Lag N +
fornavn + poeng. Ekspandert: lagets awards listet per kategori med
tied-info og hull-range. Erstatter per-kategori-detalj-seksjonen.

Version-bump til v1.1.1 + CHANGELOG i pafølgende commit."
```

---

## Task 4: Version-bump v1.1.1 + CHANGELOG

Bumper PATCH, legger til CHANGELOG-entry under 1.1.y-tema-headingen.

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (auto-oppdatert av npm version)
- Modify: `CHANGELOG.md`

**Step 1: Bump version**

```bash
cd /Users/jdl/Dokumenter/GitHub/golf-app/.claude/worktrees/inspiring-wozniak-d6fa1e
npm version patch --no-git-tag-version
grep '"version"' package.json
```

Expected: `"version": "1.1.1"`.

**Step 2: Add CHANGELOG entry**

Read `CHANGELOG.md` to find the `## 1.1.y — Sideturnering` heading. Below the existing `### [1.1.0] - 2026-05-14` entry, add this as the new top-most entry under that minor-series heading (so 1.1.1 appears ABOVE 1.1.0):

```markdown
### [1.1.1] - 2026-05-16

**Sideturneringen viser nå hvem som er på hvert lag, og du kan klikke på et lag for å se hvilke kategorier som ga poengene deres.**

<details><summary>Teknisk</summary>

#### Changed
- `SideTournamentView` refaktorert fra én master-`<details>` (med per-kategori-linjer + hull-grid + LD/CTP-slot-seksjoner) til en liste av per-team-`<details>`-elementer. Hver lag-rad har medal + Lag N + fornavn-rad + total-poeng som summary, og lagets awards listet per kategori som expanded content
- `app/games/[id]/leaderboard/page.tsx` utvider `sideTeams.members` med `firstName` (via `lib/firstName.ts`-helperen) for kompakt visning av spillere-navn

#### Added
- `lib/leaderboard/formatHolesList.ts` — formatterer en hull-liste til kompakt Norwegian-streng (sammenhengende kjeder → range `"10–18"`, spredte → komma `"4, 7, 12"`, blandet kombineres). 8 unit-tester

#### Removed
- `HoleWinGrid`-komponenten (3×6-rutenett over hele runden — kan revurderes i senere iterasjon hvis savnet)
- `CategoryRow`, `SlotsSection`, `collectCategoryWinners` (per-kategori-seksjonen erstattet av per-team-collapse)

</details>
```

**Step 3: Verify changelog structure**

```bash
head -50 CHANGELOG.md
```

Confirm:
- `## 1.1.y — Sideturnering` heading still at top
- `### [1.1.1] - 2026-05-16` is the topmost entry under it (above 1.1.0)
- Tagline starts with bold "Sideturneringen viser nå…"
- Technical section in `<details><summary>Teknisk</summary>` with `#### Changed`, `#### Added`, `#### Removed`

**Step 4: Stage everything for the combined feat-commit**

Now we combine Task 2 + Task 3 + Task 4 into one user-visible feat-commit. Reset Task 3's chore commit if you made one separately (Task 3 instructions said to use chore — undo it and replace with feat).

```bash
# If you already committed Task 3 with chore: soft-reset to merge with Task 4
git log --oneline -3
# If the most recent commit is Task 3's chore commit, soft-reset:
git reset --soft HEAD^
# Now files from Task 3 are staged again, plus Task 4's new files
```

Stage everything:

```bash
git add app/games/[id]/leaderboard/page.tsx app/games/[id]/leaderboard/SideTournamentView.tsx package.json package-lock.json CHANGELOG.md
git status  # verify only these 5 files are staged
```

**Step 5: Commit as feat with version bump**

```bash
git commit -m "feat(side-tournament): per-team-collapse + medlems-navn

Sideturneringen viser na hvem som er pa hvert lag (fornavn-rad
under Lag N) og hvert lag er en klikkbar collapse som lister
lagets awards per kategori. Tied-info pa netto-kategoriene
(\"uavgjort med Lag X\"), hull-range pa hole-wins
(\"hull 10-18\" eller \"hull 4, 7, 12\").

Bytter ut HoleWinGrid + CategoryRow + SlotsSection
(info-orientert per-kategori-seksjon) med per-team-collapse
(lag-orientert).

Bumper v1.1.0 -> v1.1.1 (PATCH-bump for design-polish)."
```

Expected: commit-msg-hook passes (package.json version diff present + CHANGELOG.md staged).

If hook blocks: investigate (verify package.json has the version change staged, verify CHANGELOG.md is also staged). Do NOT use `--no-verify`.

**Step 6: Verify**

```bash
git log -1 --format='%s%n%n%b'
git show HEAD --stat
```

Confirm:
- One commit
- `feat(side-tournament)` prefix
- 5 files: SideTournamentView.tsx, page.tsx, formatHolesList.ts, formatHolesList.test.ts, CHANGELOG.md, package.json, package-lock.json
- Wait — 7 files actually, including Task 1's formatHolesList files. Those were already committed in Task 1 — so they're NOT in this commit.

Verify only 5 files in this commit: `page.tsx`, `SideTournamentView.tsx`, `package.json`, `package-lock.json`, `CHANGELOG.md`.

---

## Task 5: Push til main + Vercel-deploy

Per memory `feedback_production_only_testing`: bruker tester i prod, push til main etter hver endring som default.

**Step 1: Push branch til main**

```bash
cd /Users/jdl/Dokumenter/GitHub/golf-app/.claude/worktrees/inspiring-wozniak-d6fa1e
git push origin claude/inspiring-wozniak-d6fa1e:main
```

If non-fast-forward (origin/main har bevegd seg): fall back to rebase:

```bash
git fetch origin main
git rebase origin/main
git push origin claude/inspiring-wozniak-d6fa1e:main
```

**Step 2: Verify Vercel deployment**

Load `mcp__3cf899ed-9e2a-439d-993a-9be7b39814d4__list_deployments` via ToolSearch.

List recent deployments for the golf-app project. Find the one matching the most recent commit SHA. Wait up to 60 seconds for status to flip to `READY`.

Per memory `reference_vercel_resend_coordinates`: use the established project/team IDs.

**Step 3: Verify in prod**

Tagline-test:
- Open `tornygolf.no` in a logged-in browser (admin or player)
- Go to a finished game with side-tournament enabled
- Click "Sideturnering" tab
- Confirm: each team row shows "Lag N — Karl · Per" + total points
- Click a team — confirm details expand showing awards
- Confirm hole-win-aggregation reads correctly ("Hole-wins: 18p på 9 hull (hull 10–18)")
- Confirm tied-info works ("uavgjort med Lag X")

**Step 4: Report**

Report:
- Commit SHA for the merged feat-commit
- Push fast-forward / rebase outcome
- Vercel deployment URL + status
- Footer-version i prod (skal være v1.1.1)

---

## Verification-sjekkliste før push (Task 5)

- [ ] 8 nye `formatHolesList`-tester passerer
- [ ] Alle 271 tester passerer totalt
- [ ] `npm run build` lykkes (kun pre-existing resend-errors)
- [ ] `npx tsc --noEmit` clean på alle endrede filer
- [ ] `npx eslint` ingen nye warnings
- [ ] CHANGELOG har 1.1.1-entry under 1.1.y-heading
- [ ] `package.json` viser `"version": "1.1.1"`
- [ ] Commit-msg-hook ikke omgått med `--no-verify`
- [ ] Bare 2 commits totalt (Task 1 + Task 2/3/4-bundled)
