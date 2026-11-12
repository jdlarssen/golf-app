// #2753 D4: hvilke rader fra terminlista som står under «Klubbturneringer» på Hjem.
import type { AppTerminEntry } from '../../../../lib/games/appTerminView';
import { clubRoundsForHome } from './clubRounds';

const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0).toISOString();

function entry(id: string, over: Partial<AppTerminEntry> = {}): AppTerminEntry {
  return {
    id,
    name: `Runde ${id}`,
    short_id: `short-${id}`,
    scheduled_tee_off_at: at(14, 9),
    course_name: 'Byneset North',
    game_mode: 'stableford',
    mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' },
    hole_segment: 'full',
    start_type: 'first_tee',
    source: 'club',
    cta: 'direct',
    capacity: null,
    full: false,
    modeLabel: 'Stableford',
    teamSize: 1,
    socialProof: null,
    clubName: 'Byneset GK',
    ...over,
  };
}

const NOW = new Date(2026, 10, 12, 18, 0);

describe('clubRoundsForHome', () => {
  it('tar bare klubbrundene', () => {
    const rows = clubRoundsForHome(
      [entry('a'), entry('b', { source: 'friend', clubName: null }), entry('c', { source: 'open', clubName: null })],
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual(['a']);
  });

  it('fra og med i dag: en runde tidligere i dag står, i går gjør det ikke', () => {
    const rows = clubRoundsForHome(
      [entry('i-dag', { scheduled_tee_off_at: at(12, 8) }), entry('i-gar', { scheduled_tee_off_at: at(11, 9) })],
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual(['i-dag']);
  });

  it('sortert på tee-off, og en runde uten tid står sist', () => {
    const rows = clubRoundsForHome(
      [entry('sen', { scheduled_tee_off_at: at(20, 9) }), entry('uten', { scheduled_tee_off_at: null }), entry('tidlig')],
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual(['tidlig', 'sen', 'uten']);
  });

  it('tom liste gir ingen rader', () => {
    expect(clubRoundsForHome([], NOW)).toEqual([]);
  });
});
