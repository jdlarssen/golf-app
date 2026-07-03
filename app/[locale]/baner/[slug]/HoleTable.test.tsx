import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HoleTable, type HoleTableLabels } from './HoleTable';
import type { PublicCourseHole } from '@/lib/courses/publicCourses';

// ONE render test for the public hole table (#1023, Type C discipline) —
// labels injected as props (no i18n mock), asserting structure via testid
// and rendered numbers, never Norwegian copy.

const LABELS: HoleTableLabels = {
  colHole: 'H',
  colPar: 'P',
  colIndex: 'I',
  genderMens: 'M',
  genderLadies: 'D',
  genderJuniors: 'J',
};

const HOLES: PublicCourseHole[] = [
  { hole_number: 1, par_mens: 5, par_ladies: 5, par_juniors: 5, stroke_index: 7 },
  { hole_number: 2, par_mens: 3, par_ladies: 3, par_juniors: 3, stroke_index: 13 },
  { hole_number: 3, par_mens: 4, par_ladies: 4, par_juniors: 4, stroke_index: 5 },
];

describe('HoleTable (#1023)', () => {
  it('renders one row per hole with par + stroke index, collapsing identical gender pars to one column', () => {
    render(<HoleTable holes={HOLES} labels={LABELS} />);

    const table = screen.getByTestId('hole-table');
    expect(table).toHaveClass('tabular-nums');

    const rows = table.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(3);
    // All gender pars identical → single Par column: hole, par, index.
    expect(rows[0].querySelectorAll('td')).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('1');
    expect(rows[0]).toHaveTextContent('5');
    expect(rows[0]).toHaveTextContent('7');
    expect(rows[1]).toHaveTextContent('13');
  });
});
