import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GameForm, type CourseOption, type PlayerOption } from './GameForm';
import {
  buildEditFormInitialValues,
  type EditGamePlayerRow,
  type EditGameRow,
} from '@/lib/games/editGameInitialValues';
import { buildGameInsertPayload } from '@/lib/games/gamePayload';
import { editedModeConfig } from '@/lib/games/modeConfigEdit';
import { MODE_LABELS, type GameMode, type GameModeConfig } from '@/lib/scoring/modes/types';

// Audit 20.11 (p11): «Rediger spill» on a scheduled game locks the format, and
// a disabled control posts nothing. Every format is saved here as it stands,
// with choices off the default (gross, a stake, a variant, a team size), and
// the save must write back exactly what is stored. The test runs the real
// chain: stored row → edit form → FormData → payload → editedModeConfig.

const COURSES: CourseOption[] = [
  {
    id: 'course-1',
    name: 'Stiklestad GK',
    tee_boxes: [
      { id: 'tee-1', name: 'Gul', has_mens: true, has_ladies: true, has_juniors: false },
    ],
  },
];

const PLAYERS: PlayerOption[] = Array.from({ length: 8 }, (_, i) => ({
  id: `u${i}`,
  name: `Spiller ${i + 1}`,
  nickname: null,
  hcp_index: 18,
  email: `u${i}@example.com`,
  pending: false,
  gender: null,
  level: 'normal',
}));

// 7 days out, so the past-tee-off guard never refuses the save.
const TEE_OFF_ISO = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

type Fixture = {
  mode: GameMode;
  config: GameModeConfig;
  hcp: number;
  /** team_number per player; null = solo. The roster length is the array's. */
  teams: (number | null)[];
};

const solo = (n: number) => Array.from({ length: n }, () => null);

const FIXTURES: Fixture[] = [
  { mode: 'best_ball', config: { kind: 'best_ball', team_size: 2, teams_count: 2 }, hcp: 85, teams: [1, 1, 2, 2] },
  {
    mode: 'stableford',
    config: { kind: 'stableford', team_size: 1, points_table: 'standard' },
    hcp: 90,
    teams: solo(3),
  },
  {
    mode: 'stableford',
    config: { kind: 'stableford', team_size: 2, points_table: 'standard' },
    hcp: 0,
    teams: [1, 1, 2, 2],
  },
  {
    mode: 'modified_stableford',
    config: { kind: 'modified_stableford', team_size: 1, points_table: 'modified' },
    hcp: 0,
    teams: solo(3),
  },
  {
    mode: 'singles_matchplay',
    config: { kind: 'singles_matchplay', team_size: 1, teams_count: 2 },
    hcp: 0,
    teams: [1, 2],
  },
  { mode: 'solo_strokeplay', config: { kind: 'solo_strokeplay', team_size: 1 }, hcp: 0, teams: solo(3) },
  {
    mode: 'texas_scramble',
    config: { kind: 'texas_scramble', team_size: 2, teams_count: 2, team_handicap_pct: 0 },
    hcp: 100,
    teams: [1, 1, 2, 2],
  },
  {
    mode: 'ambrose',
    config: { kind: 'ambrose', team_size: 4, teams_count: 2, team_handicap_pct: 20 },
    hcp: 100,
    teams: [1, 1, 1, 1, 2, 2, 2, 2],
  },
  {
    mode: 'florida_scramble',
    config: { kind: 'florida_scramble', team_size: 3, teams_count: 2, team_handicap_pct: 0 },
    hcp: 100,
    teams: [1, 1, 1, 2, 2, 2],
  },
  {
    mode: 'fourball_matchplay',
    config: { kind: 'fourball_matchplay', team_size: 2, teams_count: 2, allowance_pct: 0 },
    hcp: 100,
    teams: [1, 1, 2, 2],
  },
  {
    mode: 'foursomes_matchplay',
    config: { kind: 'foursomes_matchplay', team_size: 2, teams_count: 2, allowance_pct: 0 },
    hcp: 100,
    teams: [1, 1, 2, 2],
  },
  {
    mode: 'greensome_matchplay',
    config: { kind: 'greensome_matchplay', team_size: 2, teams_count: 2, allowance_pct: 0 },
    hcp: 100,
    teams: [1, 1, 2, 2],
  },
  {
    mode: 'chapman_matchplay',
    config: { kind: 'chapman_matchplay', team_size: 2, teams_count: 2, allowance_pct: 0 },
    hcp: 100,
    teams: [1, 1, 2, 2],
  },
  {
    mode: 'gruesome_matchplay',
    config: { kind: 'gruesome_matchplay', team_size: 2, teams_count: 2, allowance_pct: 0 },
    hcp: 100,
    teams: [1, 1, 2, 2],
  },
  {
    mode: 'wolf',
    config: {
      kind: 'wolf',
      team_size: 1,
      teams_count: 4,
      wolf_scoring: 'gross',
      kr_per_unit: 20,
      wolf_rotation: 'catch_up',
    },
    hcp: 100,
    teams: solo(4),
  },
  {
    mode: 'nassau',
    config: { kind: 'nassau', team_size: 1, nassau_scoring: 'gross', kr_per_unit: 50 },
    hcp: 100,
    teams: solo(2),
  },
  {
    mode: 'skins',
    config: { kind: 'skins', team_size: 1, skins_scoring: 'gross', kr_per_unit: 10 },
    hcp: 100,
    teams: solo(4),
  },
  {
    mode: 'bingo_bango_bongo',
    config: { kind: 'bingo_bango_bongo', team_size: 1, kr_per_unit: 5 },
    hcp: 100,
    teams: solo(4),
  },
  {
    mode: 'nines',
    config: {
      kind: 'nines',
      team_size: 1,
      nines_variant: 'split_sixes',
      nines_scoring: 'gross',
      kr_per_unit: 10,
    },
    hcp: 100,
    teams: solo(3),
  },
  {
    mode: 'round_robin',
    config: { kind: 'round_robin', team_size: 1, teams_count: 4, allowance_pct: 0 },
    hcp: 100,
    teams: solo(4),
  },
  {
    mode: 'acey_deucey',
    config: { kind: 'acey_deucey', team_size: 1, acey_deucey_scoring: 'gross', kr_per_unit: 10 },
    hcp: 100,
    teams: solo(4),
  },
  {
    mode: 'shamble',
    config: {
      kind: 'shamble',
      team_size: 3,
      teams_count: 2,
      shamble_variant: 'champagne',
      shamble_count: 3,
      shamble_scoring: 'gross',
    },
    hcp: 100,
    teams: [1, 1, 1, 2, 2, 2],
  },
  {
    mode: 'patsome',
    config: { kind: 'patsome', team_size: 2, teams_count: 2, patsome_scoring: 'gross' },
    hcp: 100,
    teams: [1, 1, 2, 2],
  },
];

function storedRow(f: Fixture): EditGameRow {
  return {
    id: 'game-1',
    name: 'Lørdagsrunden',
    courses: { name: 'Stiklestad GK' },
    status: 'scheduled',
    course_id: 'course-1',
    tee_box_id: 'tee-1',
    scheduled_tee_off_at: TEE_OFF_ISO,
    start_type: 'first_tee',
    hcp_allowance_pct: f.hcp,
    require_peer_approval: true,
    score_visibility: 'live',
    side_tournament_enabled: false,
    side_ld_count: 0,
    side_ctp_count: 0,
    side_ld_holes: null,
    side_ctp_holes: null,
    side_disabled_categories: [],
    game_mode: f.mode,
    mode_config: f.config,
    registration_mode: 'invite_only',
    registration_type: 'solo',
    let_friends_skip_gate: false,
    entry_fee_kr: 0,
    payment_link: null,
    registration_cap: null,
    signup_deadline: null,
    waitlist_enabled: true,
    prizes: [],
    repeat_weekly: false,
    tee_interval_minutes: null,
    group_id: null,
    tournament_id: null,
    league_round_id: null,
    source_game_id: null,
  };
}

function storedRoster(f: Fixture): EditGamePlayerRow[] {
  return f.teams.map((team, i) => ({
    user_id: `u${i}`,
    team_number: team,
    flight_number: 1,
    tee_gender: 'mens',
  }));
}

function saveAsItStands(f: Fixture) {
  const row = storedRow(f);
  const { container } = render(
    <GameForm
      courses={COURSES}
      players={PLAYERS}
      initialValues={buildEditFormInitialValues(row, storedRoster(f))}
      mode={{ kind: 'edit-scheduled', gameId: 'game-1', updateAction: async () => {} }}
    />,
  );
  const form = container.querySelector('form') as HTMLFormElement;
  const payload = buildGameInsertPayload(new FormData(form), 'publish', {
    clubScoped: false,
    repeatAllowed: true,
    teeIntervalAllowed: true,
  });
  return { row, payload };
}

describe('«Rediger spill» keeps a scheduled game as it is (audit 20.11, p11)', () => {
  it('covers every format', () => {
    const covered = new Set(FIXTURES.map((f) => f.mode));
    // MODE_LABELS is a Record<GameMode, string>, so the compiler keeps it
    // complete: a new format without a fixture here turns this test red.
    const all = Object.keys(MODE_LABELS) as GameMode[];
    expect(all.filter((m) => !covered.has(m))).toEqual([]);
  });

  it.each(FIXTURES.map((f) => [`${f.mode} (team ${f.config.team_size})`, f] as const))(
    '%s: a save without changes writes back the stored format and handicap',
    (_label, f) => {
      const { row, payload } = saveAsItStands(f);
      expect(payload.errorCode).toBeUndefined();
      expect(payload.game_mode).toBe(row.game_mode);
      expect(editedModeConfig(row.mode_config, payload.mode_config)).toEqual(row.mode_config);
      expect(payload.hcp_allowance_pct).toBe(row.hcp_allowance_pct);
    },
  );
});
