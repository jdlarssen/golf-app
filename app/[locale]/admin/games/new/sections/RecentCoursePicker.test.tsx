import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { RecentCoursePicker } from './RecentCoursePicker';
import type { CourseOption } from '../GameForm';
import type { RecentCourse } from '@/lib/wizard/recentCourseCards';

// Type B (#2448): SIST BRUKT and the search on «Hvor og når?»
// (`Nyttspill-forslag-bane`). Today is Saturday 31 October 2026 (autumn).
const TODAY = '2026-10-31';

const course = (id: string, name: string, nineHoles = false): CourseOption => ({
  id,
  name,
  nineHoles,
  tee_boxes: [],
});
// Alphabetical, as the server sends them.
const COURSES = [
  course('byneset', 'Byneset North'),
  course('granasen', 'Granåsen', true),
  course('stiklestad', 'Stiklestad GK'),
  course('trondheim', 'Trondheim GK'),
];
const RECENT: RecentCourse[] = [
  { courseId: 'byneset', seasonRounds: 3, lastPlayedDay: '2026-10-24' },
  { courseId: 'granasen', seasonRounds: 0, lastPlayedDay: '2025-08-12' },
  { courseId: 'trondheim', seasonRounds: 1, lastPlayedDay: '2026-09-02' },
];

function Harness({ recent = RECENT, initial = '' }: { recent?: RecentCourse[]; initial?: string }) {
  const [courseId, setCourseId] = useState(initial);
  return (
    <RecentCoursePicker
      courses={COURSES}
      recentCourses={recent}
      courseId={courseId}
      onSelect={setCourseId}
      today={TODAY}
    />
  );
}

const cards = () =>
  screen.getAllByTestId('recent-course-card').map((c) => [c.textContent, c.getAttribute('aria-pressed')]);
const options = () => screen.getAllByTestId('course-search-option').map((o) => o.textContent);

describe('RecentCoursePicker (#2448)', () => {
  it('the two courses used last, with the rounds this autumn or the last day', () => {
    render(<Harness />);
    expect(screen.getByText('Sist brukt')).toBeTruthy();
    expect(cards()).toEqual([
      ['Byneset North3 runder i høst', 'false'],
      ['Granåsen9 hull · Sist 12. aug 2025', 'false'],
    ]);
    fireEvent.click(screen.getAllByTestId('recent-course-card')[0]);
    expect(cards()[0][1]).toBe('true');
  });

  it('no history: the kicker says «Bane», and only the search and «Opprett ny bane» stand', () => {
    render(<Harness recent={[]} />);
    expect(screen.getByText('Bane')).toBeTruthy();
    expect(screen.queryByTestId('recent-course-card')).toBeNull();
    expect(screen.getByPlaceholderText('Søk etter en annen bane')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Opprett ny bane' })).toBeTruthy();
  });

  it('the search lists every course on a tap, filters as you type, and says when nothing matches', () => {
    render(<Harness />);
    const search = screen.getByRole('combobox', { name: 'Søk etter en annen bane' });
    fireEvent.focus(search);
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(options()).toEqual([
      'Byneset North',
      'Granåsen · 9 hull, spilles to ganger',
      'Stiklestad GK',
      'Trondheim GK',
    ]);
    fireEvent.change(search, { target: { value: 'GK' } });
    expect(options()).toEqual(['Stiklestad GK', 'Trondheim GK']);
    fireEvent.change(search, { target: { value: 'tikle' } });
    expect(options()).toEqual(['Stiklestad GK']);
    fireEvent.change(search, { target: { value: 'Oslo' } });
    expect(screen.getByText('Ingen baner heter det')).toBeTruthy();
  });

  it('a course from the search stands first as «Valgt», with the newest other beside it', () => {
    render(<Harness />);
    fireEvent.focus(screen.getByTestId('course-search'));
    fireEvent.click(screen.getByRole('option', { name: 'Stiklestad GK' }));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(cards()).toEqual([
      ['Stiklestad GKValgt', 'true'],
      ['Byneset North3 runder i høst', 'false'],
    ]);
  });
});
