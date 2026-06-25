import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CoursePerformancePanel } from './CoursePerformancePanel';
import type { CourseStat } from '@/lib/stats/courseStats';

// Type C — én render-test for «Baner»-panelet (#940). Verifiserer struktur
// (én rad per bane, i rekkefølgen den får inn, + tom-tilstand), IKKE tallene —
// de eies av `computeCourseStats` (Type A). Labels sendes inn som props.
const labels = {
  heading: 'Baner',
  subtitle: 'Snitt og beste per bane',
  colRounds: 'Runder',
  colAvg: 'Snitt',
  colBest: 'Beste',
  emptyLabel: 'Spill en komplett 18-hulls-runde for å se snitt og beste per bane.',
};

describe('CoursePerformancePanel', () => {
  it('renders one row per course in order, and the empty state when there are none', () => {
    const courses: CourseStat[] = [
      { courseId: 'c1', courseName: 'Oslo GK', rounds: 3, average: 82, best: 79 },
      { courseId: 'c2', courseName: 'Bergen GK', rounds: 1, average: 90, best: 90 },
    ];
    const { rerender } = render(
      <CoursePerformancePanel courses={courses} {...labels} />,
    );

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Oslo GK');
    expect(rows[1]).toHaveTextContent('Bergen GK');
    expect(screen.queryByText(labels.emptyLabel)).not.toBeInTheDocument();

    rerender(<CoursePerformancePanel courses={[]} {...labels} />);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText(labels.emptyLabel)).toBeInTheDocument();
  });
});
