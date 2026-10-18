import { describe, it, expect } from 'vitest';
import { buildGameInsertPayload } from '@/lib/games/gamePayload';
import { teamSizesForMode } from '@/lib/games/teamFormatLimits';
import {
  TEAM_HANDICAP_AVERAGE_PCT_MAX,
  averagePctToSumPct,
  isValidTeamHandicapSumPct,
} from '@/lib/games/teamHandicapUnit';
import { ambroseDefaultPct } from '@/lib/scoring';
import { validateTeamSizeFormat } from './useGameFormState';

// Layer agreement for the scramble team handicap cap (#2566, AGENTS.md trap 4).
// The organiser types % of the team average; the app stores % of the sum. The
// cap (0–100 % of the average) has one home in teamHandicapUnit.ts, and the
// server validator (buildGameInsertPayload) and the form's validity
// (validateTeamSizeFormat) must say the same as it for every team size each
// format offers. Lives next to useGameFormState.ts so a lib test never imports
// from app/.

type ScrambleMode = 'texas_scramble' | 'ambrose' | 'florida_scramble';

const FIELD_PREFIX: Record<ScrambleMode, 'texas' | 'ambrose' | 'florida'> = {
  texas_scramble: 'texas',
  ambrose: 'ambrose',
  florida_scramble: 'florida',
};

const MODES: ScrambleMode[] = ['texas_scramble', 'ambrose', 'florida_scramble'];

/** Two full teams of `teamSize`, the roster both layers check against. */
function fullTeams(teamSize: number) {
  const ids = Array.from({ length: 2 * teamSize }, (_, i) => `p${i}`);
  const teamOf = (i: number) => (i < teamSize ? 1 : 2);
  return {
    ids,
    playersByTeam: { 1: ids.slice(0, teamSize), 2: ids.slice(teamSize) },
    teamByPlayer: Object.fromEntries(ids.map((id, i) => [id, teamOf(i)])),
    teamOf,
  };
}

function serverAccepts(mode: ScrambleMode, teamSize: number, sumPct: number) {
  const prefix = FIELD_PREFIX[mode];
  const form = new FormData();
  form.set('name', 'Lagkamp');
  form.set('course_id', 'c1');
  form.set('tee_box_id', 't1');
  form.set('game_mode', mode);
  form.set(`${prefix}_team_size`, String(teamSize));
  form.set(`${prefix}_team_handicap_pct`, String(sumPct));
  const { ids, teamOf } = fullTeams(teamSize);
  ids.forEach((id, i) => {
    form.set(`player_${i}_id`, id);
    form.set(`player_${i}_team`, String(teamOf(i)));
  });
  return buildGameInsertPayload(form, 'publish');
}

function formAccepts(mode: ScrambleMode, teamSize: number, sumPct: number): boolean {
  const { ids, playersByTeam, teamByPlayer } = fullTeams(teamSize);
  return validateTeamSizeFormat({
    mode,
    playersByTeam,
    selectedPlayerIds: ids,
    teamByPlayer,
    teamSize,
    handicapPct: sumPct,
    requireIntegerPct: false,
  }).handicapPctValid;
}

const cases = MODES.flatMap((mode) =>
  teamSizesForMode(mode).map((size) => [mode, size] as const),
);

describe('team handicap cap for Texas 2/3/4, Ambrose 2/3/4 and Florida 3/4: wizard, edit form and validator agree (#2566)', () => {
  it.each(cases)('%s, %i-player teams: every whole average 0–max is accepted by all three', (mode, size) => {
    // Array.from, not a for loop: a missing cap throws here instead of
    // running zero iterations and passing.
    const averages = Array.from({ length: TEAM_HANDICAP_AVERAGE_PCT_MAX + 1 }, (_, i) => i);
    expect(averages).toHaveLength(101);
    for (const avg of averages) {
      const sumPct = averagePctToSumPct(avg, size);
      const payload = serverAccepts(mode, size, sumPct);
      expect(payload.errorCode, `server, ${avg} % of the average`).toBeUndefined();
      expect(payload.mode_config).toMatchObject({ team_handicap_pct: sumPct });
      expect(formAccepts(mode, size, sumPct), `form, ${avg} % of the average`).toBe(true);
      expect(isValidTeamHandicapSumPct(sumPct, size), `helper, ${avg} %`).toBe(true);
    }
  });

  it.each(cases)('%s, %i-player teams: one past the cap is rejected by all three', (mode, size) => {
    const overAverage = averagePctToSumPct(TEAM_HANDICAP_AVERAGE_PCT_MAX + 1, size);
    const overCap = averagePctToSumPct(TEAM_HANDICAP_AVERAGE_PCT_MAX, size) + 0.01;
    for (const sumPct of [overAverage, overCap]) {
      expect(serverAccepts(mode, size, sumPct).errorCode, `server, ${sumPct}`).toBe('bad_allowance');
      expect(formAccepts(mode, size, sumPct), `form, ${sumPct}`).toBe(false);
      expect(isValidTeamHandicapSumPct(sumPct, size), `helper, ${sumPct}`).toBe(false);
    }
  });

  it.each([
    // [format, team size, stored % of the sum]
    ['texas_scramble', 3, 26.67], // 80 % of the average, the #2566 game
    ['texas_scramble', 2, 25],
    ['texas_scramble', 4, 10],
    ['ambrose', 3, ambroseDefaultPct(3)], // 16.666…
    ['ambrose', 4, ambroseDefaultPct(4)], // 12.5
    ['florida_scramble', 4, 10],
  ] as const)('stored value: %s, %i-player teams, %s is accepted by all three', (mode, size, sumPct) => {
    expect(serverAccepts(mode, size, sumPct).errorCode).toBeUndefined();
    expect(formAccepts(mode, size, sumPct)).toBe(true);
    expect(isValidTeamHandicapSumPct(sumPct, size)).toBe(true);
  });
});
