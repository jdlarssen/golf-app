// #2753 D4: hvilke rader fra terminlista som står under «Klubbturneringer» på Hjem.
import type { AppTerminEntry } from '../../../../lib/games/appTerminView';
import type { AppLeagueSummary } from '../../../../lib/league/appLeagueView';
import { clubRoundsForHome, clubSectionGroups } from './clubRounds';

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

// #2839: klubbligaene du kan melde deg på, filed etter dagen sesongen starter.
describe('clubSectionGroups', () => {
  const league = (id: string, seasonStart: string, name = `Liga ${id}`): AppLeagueSummary => ({
    id,
    name,
    status: 'draft',
    seasonStart,
    openRound: null,
    delivered: false,
    inProgress: false,
    markerCards: [],
  });
  const shape = (groups: ReturnType<typeof clubSectionGroups>) =>
    groups.map((g) =>
      g.kind === 'leagues'
        ? { kind: g.kind, leagues: g.leagues.map((l) => l.id) }
        : g.kind === 'undated'
          ? { kind: g.kind, rounds: g.rounds.map((r) => r.id) }
          : { kind: g.kind, key: g.key, rounds: g.rounds.map((r) => r.id), leagues: g.leagues.map((l) => l.id) },
    );

  it('en liga som starter samme dag som en runde står i samme dagblokk, etter runden', () => {
    const groups = clubSectionGroups([entry('r', { scheduled_tee_off_at: at(14, 9) })], [league('l', '2026-11-14')], NOW);
    expect(shape(groups)).toEqual([{ kind: 'day', key: '2026-11-14', rounds: ['r'], leagues: ['l'] }]);
  });

  it('en liga med en dag uten runder får en egen dagblokk på riktig plass i rekken', () => {
    const groups = clubSectionGroups(
      [entry('a', { scheduled_tee_off_at: at(14, 9) }), entry('b', { scheduled_tee_off_at: at(20, 9) })],
      [league('l', '2026-11-16')],
      NOW,
    );
    expect(shape(groups)).toEqual([
      { kind: 'day', key: '2026-11-14', rounds: ['a'], leagues: [] },
      { kind: 'day', key: '2026-11-16', rounds: [], leagues: ['l'] },
      { kind: 'day', key: '2026-11-20', rounds: ['b'], leagues: [] },
    ]);
    // Overskriften regnes av samme gruppering som rundene: «om 4 dager» fra torsdag 12.
    expect(groups[1]).toMatchObject({ kind: 'day', label: { kind: 'days', days: 4 } });
  });

  it('en liga som starter i dag står under i dag', () => {
    const groups = clubSectionGroups([], [league('l', '2026-11-12')], NOW);
    expect(groups[0]).toMatchObject({ kind: 'day', key: '2026-11-12', label: { kind: 'today' } });
  });

  it('startdagen er gått: ligaen står i blokken «leagues» nederst, etter dagene og runder uten tid', () => {
    const groups = clubSectionGroups(
      [entry('a', { scheduled_tee_off_at: at(14, 9) }), entry('uten', { scheduled_tee_off_at: null })],
      [league('gammel', '2026-11-02', 'B'), league('eldre', '2026-10-01', 'A')],
      NOW,
    );
    expect(shape(groups)).toEqual([
      { kind: 'day', key: '2026-11-14', rounds: ['a'], leagues: [] },
      { kind: 'undated', rounds: ['uten'] },
      { kind: 'leagues', leagues: ['eldre', 'gammel'] },
    ]);
  });

  it('en dag med bare en liga havner før runder uten tid', () => {
    const groups = clubSectionGroups([entry('uten', { scheduled_tee_off_at: null })], [league('l', '2026-11-16')], NOW);
    expect(shape(groups).map((g) => g.kind)).toEqual(['day', 'undated']);
  });

  it('ingen runder og ingen ligaer gir ingen blokker', () => {
    expect(clubSectionGroups([], [], NOW)).toEqual([]);
  });
});
