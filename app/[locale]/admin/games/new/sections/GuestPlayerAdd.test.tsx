import { describe, it, expect } from 'vitest';
import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { CourseOption } from '../GameForm';
import { useGameFormState } from '../useGameFormState';
import { GuestPlayerFields } from './GuestPlayerAdd';

// One Type C render test (#2437): the guest card offers only the categories
// the chosen tee rates. The rest are disabled, and the card starts on one the
// tee has. «Legg til gjest» is never pressed, so the server action never runs.

const COURSES: CourseOption[] = [
  {
    id: 'course-d',
    name: 'Bane D',
    tee_boxes: [
      { id: 'tee-d1', name: 'Blå', has_mens: true, has_ladies: true, has_juniors: false },
    ],
  },
];

function Harness() {
  const state = useGameFormState({ players: [], courses: COURSES });
  const { setCourseId, setTeeBoxId } = state;
  useEffect(() => {
    setCourseId('course-d');
    setTeeBoxId('tee-d1');
    // Mount only: pick the course and tee once, as the organiser would on step 3.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <GuestPlayerFields state={state} />;
}

describe('GuestPlayerFields', () => {
  it('a tee without a junior rating: «Junior» is disabled and «Herre» is selected', () => {
    render(<Harness />);

    expect(screen.getByRole('radio', { name: 'Junior' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Dame' })).not.toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Herre' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
