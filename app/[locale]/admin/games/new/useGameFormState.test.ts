import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameFormState, deriveDefaultGenders } from './useGameFormState';
import type { CourseOption, PlayerOption } from './GameForm';

const COURSES: CourseOption[] = [
  {
    id: 'course-a',
    name: 'Bane A',
    tee_boxes: [
      { id: 'tee-a1', name: 'Gul', has_mens: true, has_ladies: true, has_juniors: true },
    ],
  },
  {
    id: 'course-b',
    name: 'Bane B',
    tee_boxes: [
      { id: 'tee-b1', name: 'Rød', has_mens: true, has_ladies: true, has_juniors: false },
    ],
  },
];

function makePlayer(
  id: string,
  overrides: Partial<PlayerOption> = {},
): PlayerOption {
  return {
    id,
    name: `Spiller ${id}`,
    nickname: null,
    hcp_index: 18,
    email: `${id}@example.com`,
    pending: false,
    gender: null,
    level: 'normal',
    ...overrides,
  };
}

const PLAYERS: PlayerOption[] = [
  makePlayer('p-mann', { gender: 'mens', level: 'normal' }),
  makePlayer('p-dame', { gender: 'ladies', level: 'normal' }),
  makePlayer('p-junior', { gender: 'mens', level: 'junior' }),
];

// #465 — 6-spiller-roster for Wolf 3-5-tester (trenger flere enn PLAYERS gir).
const WOLF_PLAYERS: PlayerOption[] = [
  makePlayer('w1'),
  makePlayer('w2'),
  makePlayer('w3'),
  makePlayer('w4'),
  makePlayer('w5'),
  makePlayer('w6'),
];

describe('deriveDefaultGenders', () => {
  it('mapper hver spiller til riktig M/D/J basert på profil', () => {
    expect(deriveDefaultGenders(PLAYERS)).toEqual({
      'p-mann': 'M',
      'p-dame': 'D',
      'p-junior': 'J',
    });
  });

  it('returnerer tomt objekt for tom spillerliste', () => {
    expect(deriveDefaultGenders([])).toEqual({});
  });
});

describe('useGameFormState — playerGenders ved bane-bytte (regresjon fra #92)', () => {
  it('beholder profil-deriverte D/J-defaultene når banen byttes', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );

    // Mount: defaults skal være derivert fra profilen.
    expect(result.current.playerGenders).toEqual({
      'p-mann': 'M',
      'p-dame': 'D',
      'p-junior': 'J',
    });

    // Velg bane A.
    act(() => {
      result.current.setCourseId('course-a');
    });
    expect(result.current.playerGenders).toEqual({
      'p-mann': 'M',
      'p-dame': 'D',
      'p-junior': 'J',
    });

    // Bytt til bane B — defaultene skal IKKE kollapse til 'M' (regresjon-test).
    act(() => {
      result.current.setCourseId('course-b');
    });
    expect(result.current.playerGenders).toEqual({
      'p-mann': 'M',
      'p-dame': 'D',
      'p-junior': 'J',
    });
  });

  it('nullstiller tee_box_id ved bane-bytte (uendret oppførsel)', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );

    act(() => {
      result.current.setCourseId('course-a');
      result.current.setTeeBoxId('tee-a1');
    });
    expect(result.current.teeBoxId).toBe('tee-a1');

    act(() => {
      result.current.setCourseId('course-b');
    });
    expect(result.current.teeBoxId).toBe('');
  });

  it('re-deriver også når banen deselectes (tomt course-id)', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );

    act(() => {
      result.current.setCourseId('course-a');
      result.current.setCourseId('');
    });
    expect(result.current.playerGenders).toEqual({
      'p-mann': 'M',
      'p-dame': 'D',
      'p-junior': 'J',
    });
  });
});

describe('useGameFormState — initialValues.player_genders vinner ved mount', () => {
  it('bruker initialValues.player_genders i stedet for derive ved mount', () => {
    const { result } = renderHook(() =>
      useGameFormState({
        players: PLAYERS,
        courses: COURSES,
        initialValues: {
          player_genders: {
            'p-mann': 'D', // overstyrer profil-default 'M'
            'p-dame': 'J', // overstyrer profil-default 'D'
            'p-junior': 'M', // overstyrer profil-default 'J'
          },
        },
      }),
    );

    expect(result.current.playerGenders).toEqual({
      'p-mann': 'D',
      'p-dame': 'J',
      'p-junior': 'M',
    });
  });
});

describe('useGameFormState — Wolf 3-5 spillere (#465)', () => {
  function setupWolf(count: number) {
    const { result } = renderHook(() =>
      useGameFormState({ players: WOLF_PLAYERS, courses: COURSES }),
    );
    act(() => {
      result.current.handleModeChange('wolf');
    });
    act(() => {
      for (let i = 0; i < count; i++) {
        result.current.togglePlayer(`w${i + 1}`);
      }
    });
    return result;
  }

  it.each([3, 4, 5])('%i spillere → gyldig, wolfOrder har %i slots', (count) => {
    const result = setupWolf(count);
    expect(result.current.isWolf).toBe(true);
    expect(result.current.playersValidForMode).toBe(true);
    expect(result.current.wolfOrder).toHaveLength(count);
  });

  it.each([2, 6])('%i spillere → ugyldig (playersValidForMode false)', (count) => {
    const result = setupWolf(count);
    expect(result.current.playersValidForMode).toBe(false);
  });

  it('orderedPayload gir sammenhengende team_number 1..n for 5 spillere', () => {
    const result = setupWolf(5);
    expect(result.current.orderedPayload).toHaveLength(5);
    const teams = result.current.orderedPayload
      .map((p) => p.team_number)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(teams).toEqual([1, 2, 3, 4, 5]);
  });

  it('3 spillere gir team_number 1-3 (ingen tomme slots)', () => {
    const result = setupWolf(3);
    const teams = result.current.orderedPayload
      .map((p) => p.team_number)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(teams).toEqual([1, 2, 3]);
  });
});

describe('useGameFormState — initialValues pre-fyll for setup-step-formater (#322)', () => {
  it('wolf_scoring fra initialValues restorer state korrekt', () => {
    const { result } = renderHook(() =>
      useGameFormState({
        players: PLAYERS,
        courses: COURSES,
        initialValues: { game_mode: 'wolf', wolf_scoring: 'gross' },
      }),
    );

    expect(result.current.wolfScoring).toBe('gross');
    expect(result.current.isWolf).toBe(true);
  });

  it('nassau_scoring fra initialValues restorer state korrekt', () => {
    const { result } = renderHook(() =>
      useGameFormState({
        players: PLAYERS,
        courses: COURSES,
        initialValues: { game_mode: 'nassau', nassau_scoring: 'gross' },
      }),
    );

    expect(result.current.nassauScoring).toBe('gross');
    expect(result.current.isNassau).toBe(true);
  });

  it('skins_scoring fra initialValues restorer state korrekt', () => {
    const { result } = renderHook(() =>
      useGameFormState({
        players: PLAYERS,
        courses: COURSES,
        initialValues: { game_mode: 'skins', skins_scoring: 'gross' },
      }),
    );

    expect(result.current.skinsScoring).toBe('gross');
    expect(result.current.isSkins).toBe(true);
  });

  it('nines_variant og nines_scoring fra initialValues restorer state korrekt', () => {
    const { result } = renderHook(() =>
      useGameFormState({
        players: PLAYERS,
        courses: COURSES,
        initialValues: {
          game_mode: 'nines',
          nines_variant: 'split_sixes',
          nines_scoring: 'gross',
        },
      }),
    );

    expect(result.current.ninesVariant).toBe('split_sixes');
    expect(result.current.ninesScoring).toBe('gross');
    expect(result.current.isNines).toBe(true);
  });

  it('shamble-felt fra initialValues restorer state korrekt', () => {
    const { result } = renderHook(() =>
      useGameFormState({
        players: PLAYERS,
        courses: COURSES,
        initialValues: {
          game_mode: 'shamble',
          team_size: 4,
          shamble_variant: 'champagne',
          shamble_count: 3,
          shamble_scoring: 'gross',
        },
      }),
    );

    expect(result.current.shambleVariant).toBe('champagne');
    expect(result.current.shambleCount).toBe(3);
    expect(result.current.shambleScoring).toBe('gross');
    expect(result.current.teamSize).toBe(4);
    expect(result.current.isShamble).toBe(true);
  });

  it('round_robin_allowance_pct fra initialValues restorer state korrekt (#337)', () => {
    const { result } = renderHook(() =>
      useGameFormState({
        players: PLAYERS,
        courses: COURSES,
        initialValues: { game_mode: 'round_robin', round_robin_allowance_pct: 50 },
      }),
    );

    expect(result.current.roundRobinAllowancePct).toBe(50);
    expect(result.current.isRoundRobin).toBe(true);
  });
});

// Solo-formater uten lag (Nassau / Skins / Bingo Bango Bongo) velges via
// wizard-en sin FormatGrid → handleModeChange. De skal alle ende opp som
// team_size=1 (requiresTeams=false), slik at:
//  - «Neste»-knappen (gated på playersValidForMode) lyser når 2-4 er valgt
//  - orderedPayload faktisk inneholder de valgte spillerne (team/flight null)
// Regresjon: BBB manglet både en playersValidForMode-gren OG en
// defaultTeamSizeForMode-entry; Nassau/Skins manglet sistnevnte og publiserte
// derfor 0 spillere fra wizarden. Ingen av modusene var noensinne publisert.
describe('useGameFormState — solo-format wizard-gating (Nassau / Skins / BBB)', () => {
  for (const mode of ['nassau', 'skins', 'bingo_bango_bongo'] as const) {
    it(`${mode}: 2 valgte spillere → team_size 1, gyldig for modus, payload med 2 rader`, () => {
      const { result } = renderHook(() =>
        useGameFormState({ players: PLAYERS, courses: COURSES }),
      );

      act(() => {
        result.current.handleModeChange(mode);
      });
      act(() => {
        result.current.togglePlayer('p-mann');
        result.current.togglePlayer('p-dame');
      });

      // Solo: ingen lag → team_size 1, requiresTeams false.
      expect(result.current.teamSize).toBe(1);
      expect(result.current.requiresTeams).toBe(false);

      // Gating for «Neste» på spiller-steget.
      expect(result.current.playersValidForMode).toBe(true);

      // Payload må faktisk inneholde spillerne (uten lag/flight).
      expect(result.current.orderedPayload).toHaveLength(2);
      for (const row of result.current.orderedPayload) {
        expect(row.team_number).toBeNull();
        expect(row.flight_number).toBeNull();
      }

      // Ingen spiller-relatert mangel når 2 er valgt.
      const playerMissing = result.current.missingForPublish.filter(
        (m) => m.includes('spiller'),
      );
      expect(playerMissing).toEqual([]);
    });

    it(`${mode}: 1 valgt spiller → ikke gyldig (krever minst 2)`, () => {
      const { result } = renderHook(() =>
        useGameFormState({ players: PLAYERS, courses: COURSES }),
      );

      act(() => {
        result.current.handleModeChange(mode);
      });
      act(() => {
        result.current.togglePlayer('p-mann');
      });

      expect(result.current.playersValidForMode).toBe(false);
    });
  }
});

// #576 — sideturnering støttes ikke for matchplay-familien. `sideTournamentSupported`
// er kilden begge UI-stiene skjuler bryteren på (AdvancedSettingsSection +
// BasicsSection gater fieldset-et på den), OG kilden det effektive `sideEnabled`
// tvinges false på, så et stale påslag aldri følger med i payloaden ved format-bytte.
// Vi tester guarden ved kilden i stedet for å assertere på skjult DOM i to seksjoner.
describe('sideturnering-gating for matchplay (#576)', () => {
  const MATCHPLAY_MODES = [
    'singles_matchplay',
    'fourball_matchplay',
    'foursomes_matchplay',
    'greensome_matchplay',
    'chapman_matchplay',
    'gruesome_matchplay',
  ] as const;

  it.each(MATCHPLAY_MODES)(
    'rapporterer sideTournamentSupported=false for %s',
    (mode) => {
      const { result } = renderHook(() =>
        useGameFormState({ players: PLAYERS, courses: COURSES }),
      );
      act(() => {
        result.current.handleModeChange(mode);
      });
      expect(result.current.sideTournamentSupported).toBe(false);
    },
  );

  it('tvinger effektiv sideEnabled=false for matchplay men bevarer rå-valget ved retur til poeng-format', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );

    // Default best_ball → støttet, rå-toggle flyter gjennom.
    act(() => {
      result.current.setSideEnabled(true);
    });
    expect(result.current.sideTournamentSupported).toBe(true);
    expect(result.current.sideEnabled).toBe(true);

    // Bytt til matchplay → ikke støttet, effektiv sideEnabled tvinges false.
    act(() => {
      result.current.handleModeChange('singles_matchplay');
    });
    expect(result.current.sideTournamentSupported).toBe(false);
    expect(result.current.sideEnabled).toBe(false);

    // Tilbake til et poeng-format → rå-valget (true) dukker opp igjen.
    act(() => {
      result.current.handleModeChange('best_ball');
    });
    expect(result.current.sideTournamentSupported).toBe(true);
    expect(result.current.sideEnabled).toBe(true);
  });
});
