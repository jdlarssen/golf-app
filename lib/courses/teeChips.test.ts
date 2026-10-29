import { describe, it, expect } from 'vitest';
import {
  TEE_CHIP_ORDER,
  addCustomTee,
  customNameProblem,
  emptyTee,
  removeCustomTee,
  toggleColorTee,
  type TeeBoxData,
  type TeeRows,
} from './teeChips';
import { TEE_COLORS } from './teeColors';

const NONE: TeeRows = { rows: [], removed: [] };

/** A saved tee (it has an id) with men's numbers. */
function saved(id: string, name: string, color: TeeBoxData['color']): TeeBoxData {
  return { ...emptyTee(name, color), id, slope_mens: '131', course_rating_mens: '71.2' };
}

const names = (s: TeeRows) => s.rows.map((r) => r.name);

describe('TEE_CHIP_ORDER', () => {
  it('is the artboard order and holds exactly the palette', () => {
    expect(TEE_CHIP_ORDER).toEqual(['white', 'yellow', 'blue', 'red', 'orange']);
    expect([...TEE_CHIP_ORDER].sort()).toEqual([...TEE_COLORS].sort());
  });
});

describe('toggleColorTee', () => {
  const seven: TeeRows = {
    rows: ['1', '2', '3', '4', '5', '6', '7'].map((n) => emptyTee(n, null)),
    removed: [],
  };
  const gulSaved = saved('tee-gul', 'Gul', 'yellow');

  it.each<[string, TeeRows, TeeRows]>([
    ['adds an empty row named after the colour', NONE, { rows: [emptyTee('Gul', 'yellow')], removed: [] }],
    ['takes a new row off without remembering it', { rows: [emptyTee('Gul', 'yellow')], removed: [] }, NONE],
    ['remembers a saved row it takes off', { rows: [gulSaved], removed: [] }, { rows: [], removed: [gulSaved] }],
    ['brings a remembered row back with its id and numbers', { rows: [], removed: [gulSaved] }, { rows: [gulSaved], removed: [] }],
    ['adds nothing at seven rows', seven, seven],
  ])('%s', (_label, state, expected) => {
    expect(toggleColorTee(state, 'yellow')).toEqual(expected);
  });

  it('appends after the rows already there', () => {
    const state = toggleColorTee(toggleColorTee(NONE, 'red'), 'white');
    expect(names(state)).toEqual(['Rød', 'Hvit']);
  });
});

describe('addCustomTee', () => {
  const withGul: TeeRows = { rows: [emptyTee('Gul', 'yellow')], removed: [] };
  const six: TeeRows = {
    rows: ['1', '2', '3', '4', '5', '6'].map((n) => emptyTee(n, null)),
    removed: [],
  };

  it.each<[string, TeeRows, string, ReturnType<typeof addCustomTee>]>([
    ['empty', NONE, '   ', { problem: 'empty' }],
    ['duplicate of a colour tee, any case and spaces', withGul, ' gul ', { problem: 'duplicate' }],
    ['duplicate of a named tee', { rows: [emptyTee('57', null)], removed: [] }, '57', { problem: 'duplicate' }],
    ['max at seven', { rows: [...six.rows, emptyTee('7', null)], removed: [] }, '58', { problem: 'max' }],
    ['the seventh tee', six, '58', { rows: [...six.rows, emptyTee('58', null)], removed: [] }],
    ['a trimmed name without a colour', NONE, ' 57 ', { rows: [emptyTee('57', null)], removed: [] }],
    ["a colour's name becomes that colour's tee", NONE, 'blå', { rows: [emptyTee('Blå', 'blue')], removed: [] }],
  ])('%s', (_label, state, name, expected) => {
    expect(addCustomTee(state, name)).toEqual(expected);
  });

  it('brings a remembered named tee back with its id', () => {
    const mens = saved('tee-m1', "Men's I", null);
    expect(addCustomTee({ rows: [], removed: [mens] }, "men's i")).toEqual({
      rows: [mens],
      removed: [],
    });
  });
});

describe('removeCustomTee', () => {
  it.each<[string, TeeRows, TeeRows]>([
    ['forgets a new row', { rows: [emptyTee('57', null)], removed: [] }, NONE],
    [
      'remembers a saved row',
      { rows: [saved('tee-57', '57', null)], removed: [] },
      { rows: [], removed: [saved('tee-57', '57', null)] },
    ],
  ])('%s', (_label, state, expected) => {
    expect(removeCustomTee(state, '57')).toEqual(expected);
  });
});

describe('customNameProblem', () => {
  it.each<[string, string, 'empty' | 'duplicate' | null]>([
    ['', '', 'empty'],
    ['spaces', '  ', 'empty'],
    ['taken, other case', 'GUL', 'duplicate'],
    ['free', '57', null],
  ])('%s', (_label, name, expected) => {
    expect(customNameProblem(name, [emptyTee('Gul', 'yellow')])).toBe(expected);
  });
});
