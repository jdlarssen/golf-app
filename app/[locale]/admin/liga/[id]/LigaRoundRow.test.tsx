import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const updateLeagueRound = vi.hoisted(() => vi.fn(async (_fd: FormData) => ({ error: '' })));
vi.mock('@/lib/league/actions', () => ({
  updateLeagueRound,
  overrideRoundWindow: vi.fn(),
  updateRoundSimSettings: vi.fn(),
}));

import { LigaRoundRow } from './LigaRoundRow';
import type { LeagueRoundView } from '@/lib/league/getLigaSnapshot';
import type { CourseOption } from '@/app/[locale]/admin/games/new/GameForm';

const tee = (id: string, name: string) => ({
  id,
  name,
  has_mens: true,
  has_ladies: true,
  has_juniors: false,
});

const courses: CourseOption[] = [
  { id: 'c1', name: 'Bane Ett', tee_boxes: [tee('t1', 'Gul'), tee('t2', 'Hvit')] },
  { id: 'c2', name: 'Bane To', tee_boxes: [tee('t3', 'Rød'), tee('t4', 'Blå')] },
  { id: 'c3', name: 'Bane Tre', tee_boxes: [tee('t5', 'Eneste')] },
];

// #2664: the tee list followed the SAVED course, so a round with no course
// showed an empty list until the admin saved and the page reloaded.
function renderRow(courseId: string | null, teeBoxId: string | null) {
  const round = { id: 'r1', sequence: 1, label: 'Runde 1', courseId, teeBoxId } as LeagueRoundView;
  render(
    <LigaRoundRow
      round={{
        ...round,
        opensAt: '2026-11-01T10:00:00Z',
        closesAt: '2026-11-30T10:00:00Z',
        windowOverriddenAt: null,
        flaggedFlights: 0,
        flightCount: 0,
        overriddenKeys: [],
        settingsLocked: false,
        simSettings: {},
        teeName: null,
      } as unknown as LeagueRoundView}
      leagueId="l1"
      courseScope="multi_course"
      courses={courses}
      isSimulator={false}
    />,
  );
  const selects = screen.getAllByRole('combobox', { hidden: true }) as HTMLSelectElement[];
  const course = selects.find((s) => s.name === 'course_id')!;
  const teeSelect = selects.find((s) => s.name === 'tee_box_id')!;
  const teeNames = () => Array.from(teeSelect.options).map((o) => o.text).slice(1);
  return { course, teeSelect, teeNames };
}

describe('LigaRoundRow — tee list follows the picked course (#2664)', () => {
  it('shows the tees of a course as soon as it is picked, before saving', () => {
    const { course, teeNames } = renderRow(null, null);
    expect(teeNames()).toEqual([]);
    fireEvent.change(course, { target: { value: 'c1' } });
    expect(teeNames()).toEqual(['Gul', 'Hvit']);
  });

  it('clears the tee when the course changes', () => {
    const { course, teeSelect, teeNames } = renderRow('c1', 't2');
    expect(teeSelect.value).toBe('t2');
    fireEvent.change(course, { target: { value: 'c2' } });
    expect(teeNames()).toEqual(['Rød', 'Blå']);
    expect(teeSelect.value).toBe('');
  });

  it('preselects the tee when the new course has only one', () => {
    const { course, teeSelect } = renderRow('c1', 't1');
    fireEvent.change(course, { target: { value: 'c3' } });
    expect(teeSelect.value).toBe('t5');
  });

  it('keeps the picked course and tee after saving (React 19 resets the form after an action)', async () => {
    const { course, teeSelect } = renderRow('c1', 't1');
    fireEvent.change(course, { target: { value: 'c2' } });
    fireEvent.change(teeSelect, { target: { value: 't4' } });
    fireEvent.submit(course.closest('form')!);
    await waitFor(() => expect(updateLeagueRound).toHaveBeenCalled());
    const posted = updateLeagueRound.mock.calls[0][0];
    expect({ course: posted.get('course_id'), tee: posted.get('tee_box_id') }).toEqual({ course: 'c2', tee: 't4' });
    await waitFor(() => expect(screen.getAllByRole('button', { hidden: true }).some((b) => (b as HTMLButtonElement).disabled)).toBe(false));
    expect({ course: course.value, tee: teeSelect.value }).toEqual({ course: 'c2', tee: 't4' });
  });

  it('requires a tee once the course is changed, so the old tee cannot stay behind', () => {
    const { course, teeSelect } = renderRow('c1', 't1');
    expect(teeSelect.required).toBe(false);
    fireEvent.change(course, { target: { value: 'c2' } });
    expect(teeSelect.required).toBe(true);
    fireEvent.change(course, { target: { value: 'c1' } });
    expect(teeSelect.required).toBe(false);
  });
});
