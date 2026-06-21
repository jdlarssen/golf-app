import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameFormState, deriveDefaultGenders, clampGenderToTee, validateTeamSizeFormat } from './useGameFormState';
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
  // Herre-only tee — brukt av AC1/AC2/AC3/AC5
  {
    id: 'course-c',
    name: 'Bane C',
    tee_boxes: [
      { id: 'tee-c1', name: 'Svart', has_mens: true, has_ladies: false, has_juniors: false },
    ],
  },
  // Multi-kategori tee (herre + dame, ingen junior) — brukt av AC2
  {
    id: 'course-d',
    name: 'Bane D',
    tee_boxes: [
      { id: 'tee-d1', name: 'Blå', has_mens: true, has_ladies: true, has_juniors: false },
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

// #585 — sideturnering tilbys nå for ALLE formater, også matchplay-familien.
// #576 skjulte den for matchplay (duell-kortet manglet en flate); #585 ga
// duell-kortet en kompakt LD/CTP-seksjon, så `sideTournamentSupported` er true
// overalt og det effektive `sideEnabled` følger den rå toggle-staten uten å
// tvinges false ved format-bytte til matchplay.
describe('sideturnering-gating (#585 — på for alle formater)', () => {
  const MATCHPLAY_MODES = [
    'singles_matchplay',
    'fourball_matchplay',
    'foursomes_matchplay',
    'greensome_matchplay',
    'chapman_matchplay',
    'gruesome_matchplay',
  ] as const;

  it.each(MATCHPLAY_MODES)(
    'rapporterer sideTournamentSupported=true for %s',
    (mode) => {
      const { result } = renderHook(() =>
        useGameFormState({ players: PLAYERS, courses: COURSES }),
      );
      act(() => {
        result.current.handleModeChange(mode);
      });
      expect(result.current.sideTournamentSupported).toBe(true);
    },
  );

  it('beholder sideEnabled-toggle på tvers av bytte til matchplay og tilbake', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );

    act(() => {
      result.current.setSideEnabled(true);
    });
    expect(result.current.sideTournamentSupported).toBe(true);
    expect(result.current.sideEnabled).toBe(true);

    // Bytt til matchplay → fortsatt støttet, toggle bevares (ikke tvunget false).
    act(() => {
      result.current.handleModeChange('singles_matchplay');
    });
    expect(result.current.sideTournamentSupported).toBe(true);
    expect(result.current.sideEnabled).toBe(true);

    // Tilbake til et poeng-format → uendret.
    act(() => {
      result.current.handleModeChange('best_ball');
    });
    expect(result.current.sideTournamentSupported).toBe(true);
    expect(result.current.sideEnabled).toBe(true);
  });
});

describe('useGameFormState — klubb-turnering låser registreringsmodus (#643)', () => {
  it('tvinger registrationMode til invite_only når en klubb velges', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );

    // Admin setter modus til 'open' før klubb velges.
    act(() => {
      result.current.setRegistrationMode('open');
    });
    expect(result.current.registrationMode).toBe('open');
    expect(result.current.isClubScoped).toBe(false);

    // Velg en klubb → modus skal låses til invite_only (medlemskap = invitasjon).
    act(() => {
      result.current.setGroupId('club-1');
    });
    expect(result.current.isClubScoped).toBe(true);
    expect(result.current.registrationMode).toBe('invite_only');
  });

  it('normaliserer et pre-fylt klubb-spill med ikke-invite-modus ved mount', () => {
    const { result } = renderHook(() =>
      useGameFormState({
        players: PLAYERS,
        courses: COURSES,
        initialValues: {
          group_id: 'club-1',
          registration_mode: 'open',
        },
      }),
    );

    expect(result.current.isClubScoped).toBe(true);
    expect(result.current.registrationMode).toBe('invite_only');
  });

  it('lar ikke-klubb-spill beholde valgt modus (ingen tvang)', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );

    act(() => {
      result.current.setRegistrationMode('open');
    });
    expect(result.current.isClubScoped).toBe(false);
    expect(result.current.registrationMode).toBe('open');
  });
});

// ─── AC3 — clampGenderToTee (ren helper) ─────────────────────────────────────

describe('clampGenderToTee — AC3', () => {
  it.each([
    // g, avail, expected
    ['J', { M: true, D: false, J: false }, 'M'],   // junior på herre-only → M
    ['D', { M: true, D: false, J: true }, 'M'],    // dame utilgjengelig, første tilgjengelige er M
    ['M', { M: true, D: true, J: true }, 'M'],     // M tilgjengelig → uendret
    ['J', { M: true, D: true, J: true }, 'J'],     // J tilgjengelig → uendret
    ['D', { M: false, D: true, J: true }, 'D'],    // D tilgjengelig → uendret
    ['J', { M: false, D: true, J: false }, 'D'],   // J utilgjengelig, M utilgjengelig → D
  ] as const)(
    '%s på avail=%o → %s',
    (g, avail, expected) => {
      expect(clampGenderToTee(g, avail)).toBe(expected);
    },
  );
});

// ─── AC1 — teeGenderAvailability derivasjon ───────────────────────────────────

describe('useGameFormState — teeGenderAvailability (AC1)', () => {
  it('default alle-true når ingen tee er valgt', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );
    expect(result.current.teeGenderAvailability).toEqual({ M: true, D: true, J: true });
  });

  it('reflekterer herre-only tee korrekt (course-c tee-c1)', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );
    act(() => {
      result.current.setCourseId('course-c');
      result.current.setTeeBoxId('tee-c1');
    });
    expect(result.current.teeGenderAvailability).toEqual({ M: true, D: false, J: false });
  });

  it('reflekterer multi-kategori tee (course-d tee-d1: M+D, ingen J)', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );
    act(() => {
      result.current.setCourseId('course-d');
      result.current.setTeeBoxId('tee-d1');
    });
    expect(result.current.teeGenderAvailability).toEqual({ M: true, D: true, J: false });
  });

  it('tilbake til alle-true når tee-valget nullstilles (bane-bytte)', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );
    act(() => {
      result.current.setCourseId('course-c');
      result.current.setTeeBoxId('tee-c1');
    });
    act(() => {
      result.current.setCourseId('course-a'); // nullstiller teeBoxId til ''
    });
    expect(result.current.teeGenderAvailability).toEqual({ M: true, D: true, J: true });
  });
});

// ─── AC2 — klem ved tee-bytte ────────────────────────────────────────────────

describe('useGameFormState — klem ved tee-bytte (AC2)', () => {
  it('junior-spiller klemes til M ved bytte til herre-only-tee', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );
    // Legg til junior-spiller og velg herre-only tee
    act(() => {
      result.current.togglePlayer('p-junior');
      result.current.setCourseId('course-c');
      result.current.setTeeBoxId('tee-c1');
    });
    // Junior ble koreografert til M (eneste tilgjengelige)
    expect(result.current.playerGenders['p-junior']).toBe('M');
  });

  it('dame-spiller klemes til M ved bytte til herre-only-tee', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );
    act(() => {
      result.current.togglePlayer('p-dame');
      result.current.setCourseId('course-c');
      result.current.setTeeBoxId('tee-c1');
    });
    expect(result.current.playerGenders['p-dame']).toBe('M');
  });

  it('junior klemes til M på M+D-tee (J utilgjengelig)', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );
    act(() => {
      result.current.togglePlayer('p-junior');
      result.current.setCourseId('course-d');
      result.current.setTeeBoxId('tee-d1');
    });
    expect(result.current.playerGenders['p-junior']).toBe('M');
  });

  it('dame-spiller beholder D på M+D-tee (D tilgjengelig)', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );
    act(() => {
      result.current.togglePlayer('p-dame');
      result.current.setCourseId('course-d');
      result.current.setTeeBoxId('tee-d1');
    });
    expect(result.current.playerGenders['p-dame']).toBe('D');
  });

  it('herrespiller beholder M ved bytte til herre-only-tee', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );
    act(() => {
      result.current.togglePlayer('p-mann');
      result.current.setCourseId('course-c');
      result.current.setTeeBoxId('tee-c1');
    });
    expect(result.current.playerGenders['p-mann']).toBe('M');
  });
});

// ─── validateTeamSizeFormat — characterisation tests (TDD for #808 refactor) ─
//
// Pins the truth-table for all 4 scramble-family formats BEFORE the pure helper
// is extracted. Each case maps one scenario to the exact flags the current
// in-hook code produces so the extraction cannot silently flip a flag.
//
// Key differences across formats:
//   Texas    — requireIntegerPct=true  (Number.isInteger check)
//   Ambrose  — requireIntegerPct=false (typeof number + !isNaN)
//   Florida  — requireIntegerPct=false (same as Ambrose)
//   Shamble  — handicapPct=undefined   (no pct validation at all)
describe('validateTeamSizeFormat — pure helper (#808)', () => {
  // ── helpers ────────────────────────────────────────────────────────────────

  /** Build a playersByTeam map from an array of per-team lists. */
  function makeTeams(
    ...slots: Array<string[]>
  ): Record<1 | 2 | 3 | 4, string[]> {
    return {
      1: slots[0] ?? [],
      2: slots[1] ?? [],
      3: slots[2] ?? [],
      4: slots[3] ?? [],
    };
  }

  /** Build teamByPlayer from same slots. */
  function makeTeamByPlayer(
    ...slots: Array<string[]>
  ): Record<string, 1 | 2 | 3 | 4> {
    const out: Record<string, 1 | 2 | 3 | 4> = {};
    slots.forEach((players, idx) => {
      const team = (idx + 1) as 1 | 2 | 3 | 4;
      for (const pid of players) out[pid] = team;
    });
    return out;
  }

  // ── Texas scramble (requireIntegerPct=true, teamSize=2) ───────────────────

  it('Texas valid: 4 spillere, 2 fulle lag á 2, integer pct=50', () => {
    expect(
      validateTeamSizeFormat({
        playersByTeam: makeTeams(['a', 'b'], ['c', 'd']),
        selectedPlayerIds: ['a', 'b', 'c', 'd'],
        teamByPlayer: makeTeamByPlayer(['a', 'b'], ['c', 'd']),
        teamSize: 2,
        handicapPct: 50,
        requireIntegerPct: true,
      }),
    ).toEqual({
      teamsBalanced: true,
      hasAtLeastOneTeam: true,
      handicapPctValid: true,
      playersValid: true,
    });
  });

  it('Texas ugyldig: odde antall spillere (3 valgt, teamSize=2)', () => {
    expect(
      validateTeamSizeFormat({
        playersByTeam: makeTeams(['a', 'b'], ['c']),
        selectedPlayerIds: ['a', 'b', 'c'],
        teamByPlayer: makeTeamByPlayer(['a', 'b'], ['c']),
        teamSize: 2,
        handicapPct: 50,
        requireIntegerPct: true,
      }),
    ).toMatchObject({ playersValid: false });
  });

  it('Texas ugyldig: under-lag (1 spiller < teamSize=2)', () => {
    expect(
      validateTeamSizeFormat({
        playersByTeam: makeTeams(['a']),
        selectedPlayerIds: ['a'],
        teamByPlayer: makeTeamByPlayer(['a']),
        teamSize: 2,
        handicapPct: 50,
        requireIntegerPct: true,
      }),
    ).toMatchObject({ playersValid: false });
  });

  it('Texas ugyldig: ubalansert lag (lag 1 = 1 spiller av 2)', () => {
    expect(
      validateTeamSizeFormat({
        playersByTeam: makeTeams(['a'], ['c', 'd']),
        selectedPlayerIds: ['a', 'c', 'd'],
        teamByPlayer: makeTeamByPlayer(['a'], ['c', 'd']),
        teamSize: 2,
        handicapPct: 50,
        requireIntegerPct: true,
      }),
    ).toMatchObject({ teamsBalanced: false, playersValid: false });
  });

  it('Texas ugyldig: uvalgt spiller (mangler teamByPlayer-inngang)', () => {
    expect(
      validateTeamSizeFormat({
        playersByTeam: makeTeams(['a', 'b'], []),
        selectedPlayerIds: ['a', 'b', 'x'],
        teamByPlayer: makeTeamByPlayer(['a', 'b']),
        teamSize: 2,
        handicapPct: 50,
        requireIntegerPct: true,
      }),
    ).toMatchObject({ playersValid: false });
  });

  it('Texas ugyldig: fraksjonell pct=12.5 (krever heltall)', () => {
    expect(
      validateTeamSizeFormat({
        playersByTeam: makeTeams(['a', 'b'], ['c', 'd']),
        selectedPlayerIds: ['a', 'b', 'c', 'd'],
        teamByPlayer: makeTeamByPlayer(['a', 'b'], ['c', 'd']),
        teamSize: 2,
        handicapPct: 12.5,
        requireIntegerPct: true,
      }),
    ).toMatchObject({ handicapPctValid: false, playersValid: false });
  });

  it('Texas ugyldig: pct utenfor grense (>100)', () => {
    expect(
      validateTeamSizeFormat({
        playersByTeam: makeTeams(['a', 'b'], ['c', 'd']),
        selectedPlayerIds: ['a', 'b', 'c', 'd'],
        teamByPlayer: makeTeamByPlayer(['a', 'b'], ['c', 'd']),
        teamSize: 2,
        handicapPct: 150,
        requireIntegerPct: true,
      }),
    ).toMatchObject({ handicapPctValid: false, playersValid: false });
  });

  // ── Ambrose / Florida (requireIntegerPct=false, aksepterer desimaler) ──────

  it('Ambrose valid: 4 spillere, 2 lag á 2, fraksjonell pct=12.5', () => {
    expect(
      validateTeamSizeFormat({
        playersByTeam: makeTeams(['a', 'b'], ['c', 'd']),
        selectedPlayerIds: ['a', 'b', 'c', 'd'],
        teamByPlayer: makeTeamByPlayer(['a', 'b'], ['c', 'd']),
        teamSize: 2,
        handicapPct: 12.5,
        requireIntegerPct: false,
      }),
    ).toEqual({
      teamsBalanced: true,
      hasAtLeastOneTeam: true,
      handicapPctValid: true,
      playersValid: true,
    });
  });

  it('Ambrose ugyldig: pct=NaN', () => {
    expect(
      validateTeamSizeFormat({
        playersByTeam: makeTeams(['a', 'b'], ['c', 'd']),
        selectedPlayerIds: ['a', 'b', 'c', 'd'],
        teamByPlayer: makeTeamByPlayer(['a', 'b'], ['c', 'd']),
        teamSize: 2,
        handicapPct: NaN,
        requireIntegerPct: false,
      }),
    ).toMatchObject({ handicapPctValid: false, playersValid: false });
  });

  it('Florida valid: 6 spillere, 2 lag á 3, pct=15', () => {
    expect(
      validateTeamSizeFormat({
        playersByTeam: makeTeams(['a', 'b', 'c'], ['d', 'e', 'f']),
        selectedPlayerIds: ['a', 'b', 'c', 'd', 'e', 'f'],
        teamByPlayer: makeTeamByPlayer(['a', 'b', 'c'], ['d', 'e', 'f']),
        teamSize: 3,
        handicapPct: 15,
        requireIntegerPct: false,
      }),
    ).toEqual({
      teamsBalanced: true,
      hasAtLeastOneTeam: true,
      handicapPctValid: true,
      playersValid: true,
    });
  });

  it('Florida ugyldig: fraksjonell pct aksepteres (12.5 er gyldig, ≠ Texas)', () => {
    // Florida and Ambrose share requireIntegerPct=false — 12.5 must be VALID
    expect(
      validateTeamSizeFormat({
        playersByTeam: makeTeams(['a', 'b', 'c'], ['d', 'e', 'f']),
        selectedPlayerIds: ['a', 'b', 'c', 'd', 'e', 'f'],
        teamByPlayer: makeTeamByPlayer(['a', 'b', 'c'], ['d', 'e', 'f']),
        teamSize: 3,
        handicapPct: 12.5,
        requireIntegerPct: false,
      }),
    ).toMatchObject({ handicapPctValid: true, playersValid: true });
  });

  // ── Shamble (ingen handicapPct — undefined) ───────────────────────────────

  it('Shamble valid: 6 spillere, 2 lag á 3, ingen pct-sjekk', () => {
    expect(
      validateTeamSizeFormat({
        playersByTeam: makeTeams(['a', 'b', 'c'], ['d', 'e', 'f']),
        selectedPlayerIds: ['a', 'b', 'c', 'd', 'e', 'f'],
        teamByPlayer: makeTeamByPlayer(['a', 'b', 'c'], ['d', 'e', 'f']),
        teamSize: 3,
        handicapPct: undefined,
        requireIntegerPct: false,
      }),
    ).toEqual({
      teamsBalanced: true,
      hasAtLeastOneTeam: true,
      handicapPctValid: true, // always true when pct=undefined
      playersValid: true,
    });
  });

  it('Shamble valid: 8 spillere, 2 lag á 4', () => {
    expect(
      validateTeamSizeFormat({
        playersByTeam: makeTeams(['a', 'b', 'c', 'd'], ['e', 'f', 'g', 'h']),
        selectedPlayerIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
        teamByPlayer: makeTeamByPlayer(['a', 'b', 'c', 'd'], ['e', 'f', 'g', 'h']),
        teamSize: 4,
        handicapPct: undefined,
        requireIntegerPct: false,
      }),
    ).toMatchObject({ playersValid: true });
  });

  it('Shamble ugyldig: berre 2 spillere valgt (< teamSize=3)', () => {
    expect(
      validateTeamSizeFormat({
        playersByTeam: makeTeams(['a', 'b']),
        selectedPlayerIds: ['a', 'b'],
        teamByPlayer: makeTeamByPlayer(['a', 'b']),
        teamSize: 3,
        handicapPct: undefined,
        requireIntegerPct: false,
      }),
    ).toMatchObject({ playersValid: false });
  });

  // ── hasAtLeastOneTeam detalj ──────────────────────────────────────────────

  it('hasAtLeastOneTeam=false når ingen lag er fullt fylt (tomme lag)', () => {
    expect(
      validateTeamSizeFormat({
        playersByTeam: makeTeams([], [], [], []),
        selectedPlayerIds: [],
        teamByPlayer: {},
        teamSize: 2,
        handicapPct: 50,
        requireIntegerPct: true,
      }),
    ).toMatchObject({ hasAtLeastOneTeam: false, playersValid: false });
  });
});

// ─── AC5 — defensiv publish-guard ────────────────────────────────────────────

describe('useGameFormState — defensiv publish-guard (AC5)', () => {
  it('blokkerer publisering når en spiller tvinges til en kategori tee-en mangler', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );
    // Sett opp en fullt publiserbar solo-stableford på en herre-only tee.
    act(() => {
      result.current.handleModeChange('stableford');
      result.current.setCourseId('course-c');
    });
    act(() => {
      result.current.setTeeBoxId('tee-c1'); // herre-only
      result.current.togglePlayer('p-mann');
      result.current.setScheduledTeeOffAt('2026-07-01T10:00');
    });
    // p-mann (M) er gyldig på herre-only tee → publiserbart.
    expect(result.current.canPublish).toBe(true);
    const baseline = result.current.missingForPublish.length;

    // Tving en ugyldig kombinasjon (UI klemmer normalt; backstop tester kanten).
    act(() => {
      result.current.setPlayerGenders((prev) => ({ ...prev, 'p-mann': 'J' }));
    });
    expect(result.current.canPublish).toBe(false);
    expect(result.current.missingForPublish.length).toBe(baseline + 1);
  });
});
