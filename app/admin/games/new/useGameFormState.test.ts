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
