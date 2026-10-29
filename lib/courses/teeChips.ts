/**
 * The tee chips on the course form (#2486): which tees the course has, as the
 * rows of the slope table. Pure, so CourseForm keeps the state and this only
 * says what a tap does.
 *
 * A row taken off that was already saved (it has an id) is remembered in
 * `removed` for as long as the form is open. Tapped on again, it comes back
 * with its id and numbers, so a slip on the edit page never turns a saved tee
 * into a new one (updateCourse archives or deletes a tee whose id is gone).
 */
import { MAX_TEE_BOXES } from '@/app/[locale]/admin/courses/constants';
import { TEE_COLOR_NAMES, type TeeColor } from './teeColors';

// Numeric fields are strings so a controlled input keeps an unfinished entry
// like "72." until the next digit; the server action reads them with Number().
export type TeeBoxData = {
  id?: string;
  name: string;
  color: TeeColor | null;
  length_meters: string;
  slope_mens: string;
  course_rating_mens: string;
  slope_ladies: string;
  course_rating_ladies: string;
  slope_juniors: string;
  course_rating_juniors: string;
};

export type TeeRows = { rows: TeeBoxData[]; removed: TeeBoxData[] };

/** The artboard's order: Hvit, Gul, Blå, Rød, Oransje. */
export const TEE_CHIP_ORDER: readonly TeeColor[] = ['white', 'yellow', 'blue', 'red', 'orange'];

export function emptyTee(name: string, color: TeeColor | null): TeeBoxData {
  return {
    name,
    color,
    length_meters: '',
    slope_mens: '',
    course_rating_mens: '',
    slope_ladies: '',
    course_rating_ladies: '',
    slope_juniors: '',
    course_rating_juniors: '',
  };
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// A colour tee is known by its colour, any other tee by its name.
function isTee(tee: TeeBoxData, color: TeeColor | null, name: string) {
  return color ? tee.color === color : tee.color === null && sameName(tee.name, name);
}

function take(state: TeeRows, color: TeeColor | null, name: string): TeeRows {
  const row = state.rows.find((r) => isTee(r, color, name));
  if (!row) return state;
  return {
    rows: state.rows.filter((r) => r !== row),
    removed: row.id ? [...state.removed, row] : state.removed,
  };
}

function put(state: TeeRows, color: TeeColor | null, name: string): TeeRows {
  const remembered = state.removed.find((r) => isTee(r, color, name));
  return {
    rows: [...state.rows, remembered ?? emptyTee(name, color)],
    removed: remembered ? state.removed.filter((r) => r !== remembered) : state.removed,
  };
}

/** A tap on a colour chip: takes that tee off, or puts it on unless the course is full. */
export function toggleColorTee(state: TeeRows, color: TeeColor): TeeRows {
  if (state.rows.some((r) => r.color === color)) return take(state, color, '');
  if (state.rows.length >= MAX_TEE_BOXES) return state;
  return put(state, color, TEE_COLOR_NAMES[color]);
}

/** What stops a name typed under «+ Annen»: nothing typed, or a tee that already has it. */
export function customNameProblem(
  name: string,
  rows: readonly TeeBoxData[],
): 'empty' | 'duplicate' | null {
  if (name.trim() === '') return 'empty';
  return rows.some((r) => sameName(r.name, name)) ? 'duplicate' : null;
}

/**
 * «+ Annen» with a name: a tee without a colour, or the colour's own tee when
 * the name is one of the colours, so the course never has a colourless «Gul».
 */
export function addCustomTee(
  state: TeeRows,
  rawName: string,
): TeeRows | { problem: 'empty' | 'duplicate' | 'max' } {
  const problem = customNameProblem(rawName, state.rows);
  if (problem) return { problem };
  if (state.rows.length >= MAX_TEE_BOXES) return { problem: 'max' };
  const name = rawName.trim();
  const color = (Object.keys(TEE_COLOR_NAMES) as TeeColor[]).find((c) =>
    sameName(TEE_COLOR_NAMES[c], name),
  );
  return color ? put(state, color, TEE_COLOR_NAMES[color]) : put(state, null, name);
}

/** A tap on a named tee's chip: takes it off. */
export function removeCustomTee(state: TeeRows, name: string): TeeRows {
  return take(state, null, name);
}
