import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CourseCardGrid, type CourseCardGridLabels } from './CourseCardGrid';
import type { PublicCourseHole } from '@/lib/courses/publicCourses';

// ONE render test for the course card's scorecards (#2277, Type C) — labels
// injected as props (no i18n mock). Sums, nines and the hardest hole are Type A
// (lib/courses/courseCard.test.ts); this checks the table structure.

const LABELS: CourseCardGridLabels = {
  hole: 'H',
  par: 'P',
  parLadies: 'PD',
  parJuniors: 'PJ',
  index: 'I',
  out: 'O',
  in: 'N',
  captionOut: 'cap-out',
  captionIn: 'cap-in',
};

const HOLES: PublicCourseHole[] = Array.from({ length: 18 }, (_, i) => ({
  hole_number: i + 1,
  par_mens: 4,
  // Ladies play hole 3 one over the men's par.
  par_ladies: i === 2 ? 5 : 4,
  par_juniors: 4,
  stroke_index: i + 1,
}));

describe('CourseCardGrid (#2277)', () => {
  it('renders out and in as captioned tables with row headers and a ladies\' par row', () => {
    render(<CourseCardGrid holes={HOLES} labels={LABELS} />);

    const tables = screen.getAllByRole('table');
    expect(tables).toHaveLength(2);
    expect(screen.getByRole('table', { name: 'cap-out' })).toBe(tables[0]);
    expect(screen.getByRole('table', { name: 'cap-in' })).toBe(tables[1]);

    for (const table of tables) {
      const rowHeaders = within(table)
        .getAllByRole('rowheader')
        .map((th) => th.textContent);
      expect(rowHeaders).toEqual(['H', 'P', 'PD', 'I']);
      // Nine hole numbers plus the sum column.
      expect(within(table).getAllByRole('columnheader')).toHaveLength(10);
    }
    expect(within(tables[0]).getByRole('columnheader', { name: 'O' })).toBeInTheDocument();
    expect(within(tables[1]).getByRole('columnheader', { name: 'N' })).toBeInTheDocument();
  });
});

describe('CourseCardGrid — 9-hole course played twice (#2484)', () => {
  const ROUND1 = [7, 3, 17, 1, 11, 5, 15, 9, 13];
  const ROUND2 = [8, 4, 18, 2, 12, 6, 16, 10, 14];
  const NINE: PublicCourseHole[] = [...ROUND1, ...ROUND2].map((si, i) => ({
    hole_number: i + 1,
    par_mens: i % 9 === 2 ? 5 : 4,
    par_ladies: i % 9 === 2 ? 5 : 4,
    par_juniors: i % 9 === 2 ? 5 : 4,
    stroke_index: si,
  }));
  const NINE_LABELS = { ...LABELS, indexRound1: 'I1', indexRound2: 'I2', sum: 'S' };

  it('shows one card for holes 1–9 with both index rows and the sum column', () => {
    render(<CourseCardGrid holes={NINE} labels={NINE_LABELS} nineHoles />);

    const tables = screen.getAllByRole('table');
    expect(tables).toHaveLength(1);
    expect(screen.getByRole('table', { name: 'cap-out' })).toBe(tables[0]);
    const rowHeaders = within(tables[0]).getAllByRole('rowheader').map((th) => th.textContent);
    expect(rowHeaders).toEqual(['H', 'P', 'I1', 'I2']);
    const columnHeaders = within(tables[0]).getAllByRole('columnheader').map((th) => th.textContent);
    expect(columnHeaders).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', 'S']);

    const rows = within(tables[0]).getAllByRole('row');
    const cells = (label: string) =>
      within(rows.find((r) => r.querySelector('th')?.textContent === label)!)
        .getAllByRole('cell')
        .map((td) => td.textContent);
    // Nine pars and their sum (one nine, 37).
    expect(cells('P')).toEqual(['4', '4', '5', '4', '4', '4', '4', '4', '4', '37']);
    expect(cells('I1')).toEqual([...ROUND1.map(String), '']);
    expect(cells('I2')).toEqual([...ROUND2.map(String), '']);
  });
});
