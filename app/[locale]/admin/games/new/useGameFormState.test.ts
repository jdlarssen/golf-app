import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useGameFormState,
  deriveDefaultGenders,
  validateTeamSizeFormat,
} from './useGameFormState';
import type { CourseOption, PlayerOption } from './GameForm';
import type { TeamSize } from './TeamSizeSelector';
import type { GameMode } from '@/lib/scoring/modes/types';
import { teamGridShape } from '@/lib/games/teamFormatLimits';

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
  // To tee-bokser — brukt av #1059 (auto-velg skal IKKE trigge her)
  {
    id: 'course-e',
    name: 'Bane E',
    tee_boxes: [
      { id: 'tee-e1', name: 'Gul', has_mens: true, has_ladies: true, has_juniors: true },
      { id: 'tee-e2', name: 'Rød', has_mens: true, has_ladies: true, has_juniors: false },
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

    // Bytt til bane B — D-defaulten skal IKKE kollapse til 'M' (regresjon-test
    // fra #92). Bane B sin tee støtter ikke junior (#1059 auto-velger den
    // eneste tee-en og klemmer J → M via samme regel som setTeeBoxId), så det
    // er kun D-verdien denne testen kan verifisere her.
    act(() => {
      result.current.setCourseId('course-b');
    });
    expect(result.current.playerGenders).toEqual({
      'p-mann': 'M',
      'p-dame': 'D',
      'p-junior': 'M',
    });
  });

  it('bytter tee_box_id til banens eneste tee ved bane-bytte (#1059)', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );

    act(() => {
      result.current.setCourseId('course-a');
      result.current.setTeeBoxId('tee-a1');
    });
    expect(result.current.teeBoxId).toBe('tee-a1');

    // Bane B har også bare én tee — auto-velg overstyrer det tidligere
    // valget i stedet for å nullstille det (#1059).
    act(() => {
      result.current.setCourseId('course-b');
    });
    expect(result.current.teeBoxId).toBe('tee-b1');
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

describe('useGameFormState — auto-velg tee-boks når banen bare har én (#1059)', () => {
  it('velger banens eneste tee automatisk når banen har nøyaktig én tee', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );

    act(() => {
      result.current.setCourseId('course-a');
    });

    expect(result.current.teeBoxId).toBe('tee-a1');
    // Steg 3-gaten (GameWizard canAdvance) er nå tilfredsstillbar uten at
    // brukeren rører tee-select-en.
    expect(result.current.courseId !== '' && result.current.teeBoxId !== '').toBe(true);
  });

  it('nullstiller tee_box_id ved bane-bytte til en bane med FLERE tees (uendret oppførsel)', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );

    act(() => {
      result.current.setCourseId('course-a');
    });
    expect(result.current.teeBoxId).toBe('tee-a1');

    act(() => {
      result.current.setCourseId('course-e');
    });
    expect(result.current.teeBoxId).toBe('');
  });

  it('klemmer kjønn til tilgjengelige kategorier på den auto-valgte tee-en', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );

    // Bane C har en herre-only tee — junior-spilleren skal klemmes til 'M'
    // akkurat som ved et manuelt setTeeBoxId-kall.
    act(() => {
      result.current.setCourseId('course-c');
    });

    expect(result.current.teeBoxId).toBe('tee-c1');
    expect(result.current.playerGenders).toEqual({
      'p-mann': 'M',
      'p-dame': 'M',
      'p-junior': 'M',
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

describe('useGameFormState — Wolf 3-5 spillere (#465, #969)', () => {
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

  it.each([3, 4, 5])('%i spillere → gyldig, orderedPayload har %i rader', (count) => {
    const result = setupWolf(count);
    expect(result.current.isWolf).toBe(true);
    expect(result.current.playersValidForMode).toBe(true);
    expect(result.current.orderedPayload).toHaveLength(count);
  });

  it.each([2, 6])('%i spillere → ugyldig (playersValidForMode false)', (count) => {
    const result = setupWolf(count);
    expect(result.current.playersValidForMode).toBe(false);
  });

  it('orderedPayload emitter null team/flight for alle valgte spillere (#969)', () => {
    const result = setupWolf(5);
    expect(result.current.orderedPayload).toHaveLength(5);
    for (const row of result.current.orderedPayload) {
      expect(row.team_number).toBeNull();
      expect(row.flight_number).toBeNull();
    }
  });

  it('3 spillere: alle rader har null team/flight', () => {
    const result = setupWolf(3);
    expect(result.current.orderedPayload).toHaveLength(3);
    for (const row of result.current.orderedPayload) {
      expect(row.team_number).toBeNull();
      expect(row.flight_number).toBeNull();
    }
  });
});

// #2012: the draw deals teams of the chosen size and refuses instead of
// leaving a leftover. #2148: it deals as many teams as the 40-player cap allows.
describe('useGameFormState — drawRandomTeams følger valgt lagstørrelse (#2012, #2148)', () => {
  const DRAW_PLAYERS: PlayerOption[] = Array.from({ length: 44 }, (_, i) =>
    makePlayer(`d${i + 1}`),
  );

  function setupDraw(mode: GameMode, teamSize: TeamSize, count: number) {
    const { result } = renderHook(() =>
      useGameFormState({ players: DRAW_PLAYERS, courses: COURSES }),
    );
    act(() => {
      result.current.handleModeChange(mode);
    });
    act(() => {
      result.current.handleTeamSizeChange(teamSize);
    });
    act(() => {
      for (let i = 0; i < count; i++) {
        result.current.togglePlayer(`d${i + 1}`);
      }
    });
    return result;
  }

  it.each([
    ['texas_scramble', 3, 12, 4],
    ['ambrose', 3, 12, 4],
    ['florida_scramble', 4, 16, 4],
    ['shamble', 3, 12, 4],
    ['texas_scramble', 4, 40, 10],
    ['texas_scramble', 2, 10, 5],
    ['shamble', 3, 39, 13],
  ] as const)('%s à %i med %i spillere → %i fulle lag', (mode, teamSize, count, teamCount) => {
    const result = setupDraw(mode, teamSize, count);
    expect(result.current.canDrawRandomTeams).toBe(true);

    act(() => {
      result.current.drawRandomTeams();
    });

    for (let team = 1; team <= teamCount; team++) {
      expect(result.current.playersByTeam[team]).toHaveLength(teamSize);
    }
    const teams = Object.values(result.current.teamByPlayer);
    expect(teams).toHaveLength(count);
    expect(Math.max(...teams)).toBe(teamCount);
    expect(result.current.playersValidForMode).toBe(true);
    expect(result.current.orderedPayload).toHaveLength(count);
  });

  it('Texas à 4 med 40 spillere → payloaden har lag 1–10 og flight = lag', () => {
    const result = setupDraw('texas_scramble', 4, 40);
    act(() => {
      result.current.drawRandomTeams();
    });
    const rows = result.current.orderedPayload;
    expect(rows).toHaveLength(40);
    expect([...new Set(rows.map((r) => r.team_number))]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const row of rows) {
      expect(row.flight_number).toBe(row.team_number);
    }
  });

  it('44 spillere à 4 er over taket → knappen er av', () => {
    const result = setupDraw('texas_scramble', 4, 44);
    expect(result.current.canDrawRandomTeams).toBe(false);
  });

  it('10 spillere à 3 går ikke opp → knappen er av og ingen lag endres', () => {
    const result = setupDraw('texas_scramble', 3, 10);
    expect(result.current.canDrawRandomTeams).toBe(false);

    act(() => {
      result.current.drawRandomTeams();
    });

    expect(result.current.teamByPlayer).toEqual({});
    expect(result.current.flightByPlayer).toEqual({});
  });

  it('15 trukket à 3, så byttet til à 4 → knappen er av, ingen kast og lagene står', () => {
    const result = setupDraw('texas_scramble', 3, 15);
    act(() => {
      result.current.drawRandomTeams();
    });
    const drawnAtThree = { ...result.current.teamByPlayer };
    act(() => {
      result.current.handleTeamSizeChange(4);
    });
    expect(result.current.canDrawRandomTeams).toBe(false);

    expect(() =>
      act(() => {
        result.current.drawRandomTeams();
      }),
    ).not.toThrow();

    expect(result.current.teamByPlayer).toEqual(drawnAtThree);
  });

  it('par-stableford med 6 spillere → tre lag à 2', () => {
    const result = setupDraw('stableford', 2, 6);
    expect(result.current.isParStableford).toBe(true);
    expect(result.current.canDrawRandomTeams).toBe(true);

    act(() => {
      result.current.drawRandomTeams();
    });

    expect([1, 2, 3, 4].map((t) => result.current.playersByTeam[t].length)).toEqual([2, 2, 2, 0]);
    expect(result.current.parStablefordPlayersValid).toBe(true);
  });

  it('best ball med 8 spillere → fire lag à 2 med flights, som før', () => {
    const result = setupDraw('best_ball', 2, 8);
    expect(result.current.canDrawRandomTeams).toBe(true);

    act(() => {
      result.current.drawRandomTeams();
    });

    for (const team of [1, 2, 3, 4]) {
      expect(result.current.playersByTeam[team]).toHaveLength(2);
    }
    expect(result.current.teamsComplete).toBe(true);
    expect(result.current.flightsComplete).toBe(true);
  });

  it('best ball med 12 spillere → seks par, flight 1, 1, 2, 2, 3, 3, alle 12 i payloaden (#2148)', () => {
    const result = setupDraw('best_ball', 2, 12);
    expect(result.current.canDrawRandomTeams).toBe(true);

    act(() => {
      result.current.drawRandomTeams();
    });

    expect(result.current.teamsComplete).toBe(true);
    expect(result.current.flightsComplete).toBe(true);
    expect(result.current.playersValidForMode).toBe(true);
    const rows = result.current.orderedPayload;
    expect(rows).toHaveLength(12);
    expect(rows.map((r) => r.team_number)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
    expect(rows.map((r) => r.flight_number)).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]);
  });

  it('best ball med 40 spillere → 20 par, alle 40 i payloaden', () => {
    const result = setupDraw('best_ball', 2, 40);
    act(() => {
      result.current.drawRandomTeams();
    });
    expect(result.current.playersValidForMode).toBe(true);
    expect(result.current.orderedPayload).toHaveLength(40);
    expect(Math.max(...result.current.orderedPayload.map((r) => r.team_number ?? 0))).toBe(20);
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

  // #1400: synlighets-valget er controlled state, ikke en uncontrolled radio.
  // Det er dette som gjør at «Skjul til slutt» overlever en form-action-
  // dispatch (react-dom nullstiller uncontrolled felt ved hver dispatch).
  it('score_visibility fra initialValues restorer state, og setteren oppdaterer den (#1400)', () => {
    const { result } = renderHook(() =>
      useGameFormState({
        players: PLAYERS,
        courses: COURSES,
        initialValues: { score_visibility: 'reveal' },
      }),
    );

    expect(result.current.scoreVisibility).toBe('reveal');

    act(() => result.current.setScoreVisibility('live'));

    expect(result.current.scoreVisibility).toBe('live');
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

describe('useGameFormState — forhåndsvelg arrangøren som spiller ved kompis-intent (#1066)', () => {
  it('setIntent("kompis") preselecter currentUserId når selection er tom', () => {
    const { result } = renderHook(() =>
      useGameFormState({
        players: PLAYERS,
        courses: COURSES,
        currentUserId: 'p-mann',
      }),
    );

    expect(result.current.selectedPlayerIds).toEqual([]);

    act(() => {
      result.current.setIntent('kompis');
    });

    expect(result.current.selectedPlayerIds).toEqual(['p-mann']);
  });

  it('setIntent("klubb") preselecter IKKE arrangøren (sekretariat-caset — organizer spiller ikke alltid)', () => {
    const { result } = renderHook(() =>
      useGameFormState({
        players: PLAYERS,
        courses: COURSES,
        currentUserId: 'p-mann',
      }),
    );

    act(() => {
      result.current.setIntent('klubb');
    });

    expect(result.current.selectedPlayerIds).toEqual([]);
  });

  it('initialValues.players (revansje/cup-prefill) overstyres IKKE av kompis-seedingen', () => {
    const { result } = renderHook(() =>
      useGameFormState({
        players: PLAYERS,
        courses: COURSES,
        currentUserId: 'p-mann',
        initialValues: {
          players: [
            { user_id: 'p-dame', team_number: null, flight_number: null },
            { user_id: 'p-junior', team_number: null, flight_number: null },
          ],
        },
      }),
    );

    expect(result.current.selectedPlayerIds).toEqual(['p-dame', 'p-junior']);

    act(() => {
      result.current.setIntent('kompis');
    });

    // Eksisterende (ikke-tom) seleksjon skal aldri overskrives av seedingen —
    // hverken organizer lagt til eller de eksisterende fjernet.
    expect(result.current.selectedPlayerIds).toEqual(['p-dame', 'p-junior']);
  });

  it('fjerner arrangøren manuelt, bytter til cup og tilbake til kompis → seeder IKKE på nytt (seeder kun når selection er tom idet kompis velges)', () => {
    const { result } = renderHook(() =>
      useGameFormState({
        players: PLAYERS,
        courses: COURSES,
        currentUserId: 'p-mann',
      }),
    );

    act(() => {
      result.current.setIntent('kompis');
    });
    expect(result.current.selectedPlayerIds).toEqual(['p-mann']);

    // Arrangøren fjerner seg selv — "ett tapp for å fjerne" for mindretallet.
    act(() => {
      result.current.togglePlayer('p-mann');
    });
    expect(result.current.selectedPlayerIds).toEqual([]);

    // Bytter til cup og tilbake til kompis. Selection er tom idet vi lander
    // på kompis igjen, så seeding-regelen (seed kun når tom) trigger på nytt —
    // dette er en bevisst konsekvens av den enkle "kun-når-tom"-regelen, ikke
    // et forsøk på å huske et eksplisitt fravalg.
    act(() => {
      result.current.setIntent('cup');
    });
    act(() => {
      result.current.setIntent('kompis');
    });
    expect(result.current.selectedPlayerIds).toEqual(['p-mann']);
  });

  it('ingen currentUserId (tomt fallback) → ingen seeding, ingen krasj', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );

    act(() => {
      result.current.setIntent('kompis');
    });

    expect(result.current.selectedPlayerIds).toEqual([]);
  });
});

// ─── AC3 — clampGenderToTee ──────────────────────────────────────────────────
// Helperen ble løftet til `lib/games/clampGenderToTee.ts` (#1859) fordi appens
// veiviser trenger den også. Casene bor nå i `lib/games/clampGenderToTee.test.ts`.

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
      // course-e har flere tees, så bane-byttet nullstiller teeBoxId til ''
      // (single-tee-baner auto-velger nå sin eneste tee, #1059)
      result.current.setCourseId('course-e');
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
      // Relative future tee-off (1 day out) so the form starts publishable —
      // a hardcoded absolute date time-bombs once it passes (#1000).
      result.current.setScheduledTeeOffAt(
        toDatetimeLocal(new Date(Date.now() + 86_400_000)),
      );
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

// ─── #928 — teeOffInPast / canPublish ────────────────────────────────────────

/** Format a Date as 'YYYY-MM-DDTHH:mm' (browser-local, no timezone suffix). */
function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

describe('useGameFormState — teeOffInPast blocks canPublish (#928)', () => {
  /** Bring a solo-stableford form to a fully publishable state with a FUTURE tee-off. */
  function setupPublishableForm() {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );
    act(() => {
      result.current.handleModeChange('stableford');
      result.current.setCourseId('course-a');
    });
    act(() => {
      result.current.setTeeBoxId('tee-a1');
      result.current.togglePlayer('p-mann');
      // Set a future tee-off (1 day from now) so the form starts publishable.
      result.current.setScheduledTeeOffAt(
        toDatetimeLocal(new Date(Date.now() + 86_400_000)),
      );
    });
    return { result };
  }

  it('canPublish is true and teeOffInPast is false with a future tee-off', () => {
    const { result } = setupPublishableForm();
    expect(result.current.teeOffInPast).toBe(false);
    expect(result.current.canPublish).toBe(true);
  });

  it('canPublish becomes false and teeOffInPast becomes true when tee-off is set to the past', () => {
    const { result } = setupPublishableForm();
    // Switch to a past value (1 day ago — well outside the 5-min grace window).
    act(() => {
      result.current.setScheduledTeeOffAt(
        toDatetimeLocal(new Date(Date.now() - 86_400_000)),
      );
    });
    expect(result.current.teeOffInPast).toBe(true);
    expect(result.current.canPublish).toBe(false);
  });

  it('canPublish recovers to true when tee-off is corrected back to the future', () => {
    const { result } = setupPublishableForm();
    act(() => {
      result.current.setScheduledTeeOffAt(
        toDatetimeLocal(new Date(Date.now() - 86_400_000)),
      );
    });
    expect(result.current.teeOffInPast).toBe(true);
    // Fix the tee-off — canPublish should recover.
    act(() => {
      result.current.setScheduledTeeOffAt(
        toDatetimeLocal(new Date(Date.now() + 86_400_000)),
      );
    });
    expect(result.current.teeOffInPast).toBe(false);
    expect(result.current.canPublish).toBe(true);
  });
});

// ─── #1065 — missingForPublishCodes: locale-uavhengige mangel-koder ──────────
//
// `missingForPublish` er oversatte display-strenger (locale-avhengige).
// Konsumentene som trenger å KLASSIFISERE et mangel-punkt (GameWizard sitt
// steg-4-hint-filter og ReadyStep sin «Gå til spillere»-lenke) leser den
// parallelle `missingForPublishCodes`-listen — samme lengde/rekkefølge, men
// stabile koder som ikke brekker når locale er engelsk.

describe('useGameFormState — missingForPublishCodes (#1065)', () => {
  it('speiler missingForPublish 1:1 og koder course/tee_box/tee_off/players ved tom form', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );
    act(() => {
      result.current.handleModeChange('stableford');
    });

    // Tom form med invite_only-default: bane, tee, tee-off OG spillere mangler.
    expect(result.current.missingForPublishCodes).toEqual([
      'course',
      'tee_box',
      'tee_off',
      'players',
    ]);
    expect(result.current.missingForPublishCodes).toHaveLength(
      result.current.missingForPublish.length,
    );
  });

  it('koder en ugyldig allowance som "allowance" — aldri "players"', () => {
    // Fullt publiserbar solo-stableford, så ugyldig allowance som ENESTE mangel.
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );
    act(() => {
      result.current.handleModeChange('stableford');
      result.current.setCourseId('course-a');
    });
    act(() => {
      result.current.setTeeBoxId('tee-a1');
      result.current.togglePlayer('p-mann');
      result.current.setScheduledTeeOffAt(
        toDatetimeLocal(new Date(Date.now() + 86_400_000)),
      );
    });
    expect(result.current.canPublish).toBe(true);

    act(() => {
      result.current.setHcpAllowance(150); // utenfor 0–100
    });
    expect(result.current.canPublish).toBe(false);
    expect(result.current.missingForPublishCodes).toEqual(['allowance']);
  });

  it('utelater players-koden når selv-påmelding er på (playersStepOptional)', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );
    act(() => {
      result.current.handleModeChange('stableford');
      result.current.setRegistrationMode('open');
    });
    expect(result.current.missingForPublishCodes).not.toContain('players');
  });
});

// ─── #199 — registration_type force-reset ved bytte til mode uten lag ─────────
//
// Dekket tidligere av en GameWizard-render-test som forsvant da påmeldings-
// radioene flyttet til steg 5 (#1065); logikken bor i handleModeChange
// (useGameFormState) og pinnes her på hook-nivå i stedet.

describe('useGameFormState — force-reset av registrationType ved mode uten lag (#199)', () => {
  it('resetter registrationType til solo når admin bytter fra best_ball (lag) til stableford (solo)', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );
    act(() => {
      result.current.handleModeChange('best_ball');
    });
    act(() => {
      result.current.setRegistrationType('team');
    });
    expect(result.current.registrationType).toBe('team');
    expect(result.current.registrationModeSupportsTeams).toBe(true);

    act(() => {
      result.current.handleModeChange('stableford');
    });
    expect(result.current.registrationType).toBe('solo');
    expect(result.current.registrationModeSupportsTeams).toBe(false);
  });
});

// #2148: a saved roster can carry a team number above the grid (the organiser's
// approval picks slots up to 50). That player must show up as unassigned, not
// vanish from the payload while the form reads as valid.
describe('useGameFormState — lagnummer over taket fra et lagret utkast (#2148)', () => {
  it('spiller på lag 21 blir ulagt og synlig, og skjemaet er ikke gyldig', () => {
    const roster = Array.from({ length: 4 }, (_, i) => makePlayer(`r${i + 1}`));
    const { result } = renderHook(() =>
      useGameFormState({
        players: roster,
        courses: COURSES,
        initialValues: {
          game_mode: 'best_ball',
          players: [
            { user_id: 'r1', team_number: 1, flight_number: 1 },
            { user_id: 'r2', team_number: 1, flight_number: 1 },
            { user_id: 'r3', team_number: 2, flight_number: 1 },
            { user_id: 'r4', team_number: 21, flight_number: 11 },
          ],
        },
      }),
    );

    expect(result.current.selectedPlayerIds).toContain('r4');
    expect(result.current.teamByPlayer.r4).toBeUndefined();
    expect(result.current.playersValidForMode).toBe(false);
    expect(result.current.orderedPayload.map((r) => r.user_id)).not.toContain('r4');
  });
});

// #2079: changing the grid's shape (team size, format, selected players) never
// leaves an assigned player without a visible slot. Players who no longer fit
// are released from their team; the rest of the assignment stands.
describe('useGameFormState — endret lagstørrelse eller format skjuler ingen spiller (#2079)', () => {
  const GRID_PLAYERS: PlayerOption[] = Array.from({ length: 16 }, (_, i) =>
    makePlayer(`g${i + 1}`),
  );

  type Hook = { current: ReturnType<typeof useGameFormState> };

  function setup(mode: GameMode, teamSize: TeamSize, count: number) {
    const { result } = renderHook(() =>
      useGameFormState({ players: GRID_PLAYERS, courses: COURSES }),
    );
    act(() => {
      result.current.handleModeChange(mode);
    });
    act(() => {
      result.current.handleTeamSizeChange(teamSize);
    });
    act(() => {
      for (let i = 0; i < count; i++) {
        result.current.togglePlayer(`g${i + 1}`);
      }
    });
    act(() => {
      result.current.drawRandomTeams();
    });
    return result;
  }

  function assigned(result: Hook): string[] {
    return result.current.selectedPlayerIds.filter(
      (pid) => result.current.teamByPlayer[pid] !== undefined,
    );
  }

  /** The issue's requirement: every assigned player has a slot the grid draws. */
  function expectEveryAssignedPlayerVisible(result: Hook) {
    const { gameMode, teamSize, selectedPlayerIds, teamByPlayer, playersByTeam } =
      result.current;
    const shape = teamGridShape(
      gameMode,
      teamSize,
      selectedPlayerIds.length,
      Math.max(0, ...Object.values(teamByPlayer)),
    );
    for (const pid of assigned(result)) {
      const team = teamByPlayer[pid];
      expect(team).toBeLessThanOrEqual(shape.teamCount);
      expect(playersByTeam[team].indexOf(pid)).toBeLessThan(shape.slotsPerTeam);
    }
  }

  it('Texas à 3 med 12 trukket, så byttet til par → åtte står, fire løses', () => {
    const result = setup('texas_scramble', 3, 12);
    act(() => {
      result.current.handleTeamSizeChange(2);
    });

    for (const team of [1, 2, 3, 4, 5, 6]) {
      expect(result.current.playersByTeam[team].length).toBeLessThanOrEqual(2);
    }
    expect(assigned(result)).toHaveLength(8);
    expect(result.current.selectedPlayerIds).toHaveLength(12);
    expectEveryAssignedPlayerVisible(result);
  });

  it('løste spillere har heller ingen startgruppe', () => {
    const result = setup('texas_scramble', 3, 12);
    act(() => {
      result.current.handleTeamSizeChange(2);
    });

    const released = result.current.selectedPlayerIds.filter(
      (pid) => result.current.teamByPlayer[pid] === undefined,
    );
    expect(released).toHaveLength(4);
    for (const pid of released) {
      expect(result.current.flightByPlayer[pid]).toBeUndefined();
    }
  });

  it('Texas à 3 med 12 trukket, så byttet til best ball → ingen lag har over to', () => {
    const result = setup('texas_scramble', 3, 12);
    act(() => {
      result.current.handleModeChange('best_ball');
    });

    expect(result.current.teamSize).toBe(2);
    for (const team of [1, 2, 3, 4]) {
      expect(result.current.playersByTeam[team].length).toBeLessThanOrEqual(2);
    }
    expect(assigned(result)).toHaveLength(8);
    expectEveryAssignedPlayerVisible(result);
  });

  it('Texas à 2 med fire par, så byttet til fourball → bare side 1 og 2 står', () => {
    const result = setup('texas_scramble', 2, 8);
    act(() => {
      result.current.handleModeChange('fourball_matchplay');
    });

    expect(assigned(result)).toHaveLength(4);
    for (const pid of assigned(result)) {
      expect(result.current.teamByPlayer[pid]).toBeLessThanOrEqual(2);
    }
    expectEveryAssignedPlayerVisible(result);
  });

  it('Texas à 2 med seks par, så byttet til à 4 → ingen spiller står på et skjult lag', () => {
    const result = setup('texas_scramble', 2, 12);
    act(() => {
      result.current.handleTeamSizeChange(4);
    });

    expect(assigned(result)).toHaveLength(12);
    expectEveryAssignedPlayerVisible(result);
  });

  it('seks par, to spillere fjernet fra lag 1 → ingen spiller står på et skjult lag', () => {
    const result = setup('texas_scramble', 2, 12);
    const teamOne = [...result.current.playersByTeam[1]];
    act(() => {
      for (const pid of teamOne) result.current.togglePlayer(pid);
    });

    expect(result.current.selectedPlayerIds).toHaveLength(10);
    expect(assigned(result)).toHaveLength(10);
    expectEveryAssignedPlayerVisible(result);
  });

  it('bytte som passer (fire par → à 4) lar lagene stå urørt', () => {
    const result = setup('texas_scramble', 2, 8);
    const before = result.current.teamByPlayer;
    act(() => {
      result.current.handleTeamSizeChange(4);
    });

    expect(result.current.teamByPlayer).toBe(before);
  });
});

// #1999: «navnet er skrevet av et menneske» hadde to hjem — verdien lå i
// hooken, flagget i GameWizard, og bare ETT kallsted (ReadyStep) husket å
// melde fra. Flagget bor nå i hooken sammen med verdien: `setName` er
// menneske-inngangen og setter flagget, `applySuggestedName` er maskin-
// inngangen og lar det stå. Da kan ikke et nytt navnefelt glemme regelen.
describe('useGameFormState — nameTouched (#1999)', () => {
  it('A1: setName markerer navnet som rørt', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );

    expect(result.current.nameTouched).toBe(false);

    act(() => {
      result.current.setName('Torsdagsgolf');
    });

    expect(result.current.name).toBe('Torsdagsgolf');
    expect(result.current.nameTouched).toBe(true);
  });

  it('A2: applySuggestedName endrer navnet uten å markere det som rørt', () => {
    const { result } = renderHook(() =>
      useGameFormState({ players: PLAYERS, courses: COURSES }),
    );

    act(() => {
      result.current.applySuggestedName('Byneset North 6. september');
    });

    expect(result.current.name).toBe('Byneset North 6. september');
    expect(result.current.nameTouched).toBe(false);
  });

  it('A3a: initialValues.name med innhold seeder nameTouched = true', () => {
    const { result } = renderHook(() =>
      useGameFormState({
        players: PLAYERS,
        courses: COURSES,
        initialValues: { name: 'Klubbmesterskapet' },
      }),
    );

    expect(result.current.nameTouched).toBe(true);
  });

  it('A3b: tomt eller whitespace-navn seeder nameTouched = false', () => {
    const { result } = renderHook(() =>
      useGameFormState({
        players: PLAYERS,
        courses: COURSES,
        initialValues: { name: '   ' },
      }),
    );

    expect(result.current.nameTouched).toBe(false);
  });

  it('A3c: initialNameTouched vinner over navne-seeden (utkast-gjenopptak)', () => {
    // Utkastet bærer sitt eget flagg: et forslag-navn som ALDRI ble rørt skal
    // fortsatt kunne oppdateres av forslaget etter en reload.
    const { result } = renderHook(() =>
      useGameFormState({
        players: PLAYERS,
        courses: COURSES,
        initialValues: { name: 'Bane A 6. september' },
        initialNameTouched: false,
      }),
    );

    expect(result.current.nameTouched).toBe(false);
  });

  it('A3d: initialNameTouched = true vinner over et tomt navn', () => {
    const { result } = renderHook(() =>
      useGameFormState({
        players: PLAYERS,
        courses: COURSES,
        initialValues: { name: '' },
        initialNameTouched: true,
      }),
    );

    expect(result.current.nameTouched).toBe(true);
  });
});
