import { describe, it, expect } from 'vitest';
import { buildGameInsertPayload } from '@/lib/games/gamePayload';
import { allowedTeamSizes, teamSizesForMode } from '@/lib/games/teamFormatLimits';
import { validateTeamSizeFormat } from './useGameFormState';

// Layer agreement for team sizes (#2569, AGENTS.md trap 4). A team may have
// `team_size` or one fewer where the format has that size, and at least one
// team is full. The rule has one home, `allowedTeamSizes`; the server
// validator (buildGameInsertPayload) and the wizard/edit form
// (validateTeamSizeFormat) must both say what it says, for every format and
// size and every roster of up to three teams. Lives next to
// useGameFormState.ts so a lib test never imports from app/.

type ScrambleMode = 'texas_scramble' | 'ambrose' | 'florida_scramble' | 'shamble';

const SIZE_FIELD: Record<ScrambleMode, string> = {
  texas_scramble: 'texas_team_size',
  ambrose: 'ambrose_team_size',
  florida_scramble: 'florida_team_size',
  shamble: 'shamble_team_size',
};
const PCT_FIELD: Partial<Record<ScrambleMode, string>> = {
  texas_scramble: 'texas_team_handicap_pct',
  ambrose: 'ambrose_team_handicap_pct',
  florida_scramble: 'florida_team_handicap_pct',
};

const MODES: ScrambleMode[] = ['texas_scramble', 'ambrose', 'florida_scramble', 'shamble'];

function rosterOf(teams: number[]) {
  const playersByTeam: Record<number, string[]> = {};
  const teamByPlayer: Record<string, number> = {};
  const ids: string[] = [];
  teams.forEach((count, t) => {
    playersByTeam[t + 1] = [];
    for (let m = 0; m < count; m++) {
      const id = `t${t + 1}-${m}`;
      playersByTeam[t + 1].push(id);
      teamByPlayer[id] = t + 1;
      ids.push(id);
    }
  });
  return { playersByTeam, teamByPlayer, ids };
}

function serverAccepts(mode: ScrambleMode, teamSize: number, teams: number[], count?: number) {
  const form = new FormData();
  form.set('name', 'Lagkamp');
  form.set('course_id', 'c1');
  form.set('tee_box_id', 't1');
  form.set('game_mode', mode);
  form.set(SIZE_FIELD[mode], String(teamSize));
  const pctField = PCT_FIELD[mode];
  if (pctField) form.set(pctField, '0');
  if (count !== undefined) {
    form.set('shamble_variant', 'champagne');
    form.set('shamble_count', String(count));
  }
  rosterOf(teams).ids.forEach((id, i) => {
    form.set(`player_${i}_id`, id);
    form.set(`player_${i}_team`, id.slice(1, id.indexOf('-')));
  });
  const result = buildGameInsertPayload(form, 'publish');
  if (result.errorCode && result.errorCode !== 'team_balance') {
    throw new Error(`unexpected ${result.errorCode} for ${mode} à ${teamSize} ${teams.join('/')}`);
  }
  return result.errorCode === undefined;
}

function formAccepts(mode: ScrambleMode, teamSize: number, teams: number[], count?: number) {
  const { playersByTeam, teamByPlayer, ids } = rosterOf(teams);
  return validateTeamSizeFormat({
    mode,
    shambleCount: count,
    playersByTeam,
    selectedPlayerIds: ids,
    teamByPlayer,
    teamSize,
    handicapPct: PCT_FIELD[mode] ? 0 : undefined,
    requireIntegerPct: false,
  }).playersValid;
}

/** Every roster of one to three teams with 1..teamSize+1 players each. */
function rosters(teamSize: number): number[][] {
  const sizes = Array.from({ length: teamSize + 1 }, (_, i) => i + 1);
  const out: number[][] = [];
  for (const a of sizes) {
    out.push([a]);
    for (const b of sizes) {
      out.push([a, b]);
      for (const c of sizes) out.push([a, b, c]);
    }
  }
  return out;
}

const cases = MODES.flatMap((mode) => {
  const counts = mode === 'shamble' ? [undefined, 1, 2, 3] : [undefined];
  return teamSizesForMode(mode).flatMap((size) => counts.map((count) => [mode, size, count] as const));
});

describe('team sizes: wizard, edit form and validator agree with allowedTeamSizes (#2569)', () => {
  it.each(cases)('%s à %i (count %s): every roster up to three teams', (mode, size, count) => {
    const allowed = allowedTeamSizes(mode, size, count ?? (mode === 'shamble' ? 2 : undefined));
    const all = rosters(size);
    expect(all.length).toBeGreaterThan(10);
    for (const teams of all) {
      const expected = teams.every((n) => allowed.has(n)) && teams.includes(size);
      const label = `${mode} à ${size} ${teams.join('/')}`;
      expect(serverAccepts(mode, size, teams, count), `server ${label}`).toBe(expected);
      expect(formAccepts(mode, size, teams, count ?? (mode === 'shamble' ? 2 : undefined)), `form ${label}`).toBe(expected);
    }
  });

  it('4/4/3 passes and 4/4/2 fails à 4 on both sides', () => {
    expect(serverAccepts('texas_scramble', 4, [4, 4, 3])).toBe(true);
    expect(formAccepts('texas_scramble', 4, [4, 4, 3])).toBe(true);
    expect(serverAccepts('texas_scramble', 4, [4, 4, 2])).toBe(false);
    expect(formAccepts('texas_scramble', 4, [4, 4, 2])).toBe(false);
  });
});

// The pair formats read the same rule (#2569 review): `allowedTeamSizes(mode, 2)`
// is {2}, and the wizard's pair checks go through `validateTeamSizeFormat` with
// team size 2. Best ball, par-stableford and patsome on the server must agree.
type PairMode = 'best_ball' | 'stableford' | 'patsome';

function pairServerAccepts(mode: PairMode, teams: number[]) {
  const form = new FormData();
  form.set('name', 'Parkamp');
  form.set('course_id', 'c1');
  form.set('tee_box_id', 't1');
  form.set('game_mode', mode);
  if (mode === 'stableford') form.set('stableford_team_size', '2');
  rosterOf(teams).ids.forEach((id, i) => {
    const team = id.slice(1, id.indexOf('-'));
    form.set(`player_${i}_id`, id);
    form.set(`player_${i}_team`, team);
    form.set(`player_${i}_flight`, team);
  });
  const result = buildGameInsertPayload(form, 'publish');
  if (result.errorCode && result.errorCode !== 'team_balance') {
    throw new Error(`unexpected ${result.errorCode} for ${mode} ${teams.join('/')}`);
  }
  return result.errorCode === undefined;
}

describe('pair formats: wizard and validator agree with allowedTeamSizes(mode, 2) (#2569)', () => {
  it.each<PairMode>(['best_ball', 'stableford', 'patsome'])('%s: every roster up to three teams', (mode) => {
    const allowed = allowedTeamSizes(mode, 2);
    expect([...allowed]).toEqual([2]);
    // Patsome needs four players before it looks at the teams.
    const all = rosters(2).filter((teams) => mode !== 'patsome' || teams.reduce((a, b) => a + b, 0) >= 4);
    expect(all.length).toBeGreaterThan(5);
    for (const teams of all) {
      const expected = teams.every((n) => allowed.has(n)) && teams.includes(2);
      const { playersByTeam, teamByPlayer, ids } = rosterOf(teams);
      const form = validateTeamSizeFormat({
        mode,
        playersByTeam,
        selectedPlayerIds: ids,
        teamByPlayer,
        teamSize: 2,
        handicapPct: undefined,
        requireIntegerPct: false,
      }).playersValid;
      const label = `${mode} ${teams.join('/')}`;
      expect(pairServerAccepts(mode, teams), `server ${label}`).toBe(expected);
      expect(form, `form ${label}`).toBe(expected);
    }
  });
});
