import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TeeButtons } from './TeeButtons';
import type { CourseOption } from '../GameForm';

// Type B (#2448): the TEE buttons on «Hvor og når?» (`Nyttspill-forslag-bane`).
const TEES: CourseOption['tee_boxes'] = [
  { id: 't-gul', name: 'Gul', color: null, has_mens: true, has_ladies: true, has_juniors: false },
  { id: 't-red', name: 'Rød', color: 'red', has_mens: false, has_ladies: true, has_juniors: true },
  { id: 't-mens', name: "Men's III", color: null, has_mens: true, has_ladies: false, has_juniors: false },
];

const buttons = () =>
  screen.getAllByTestId('tee-button').map((b) => ({
    text: b.textContent,
    dot: b.querySelector('[data-tee-dot]')?.getAttribute('data-tee-dot'),
    pressed: b.getAttribute('aria-pressed'),
  }));

describe('TeeButtons (#2448)', () => {
  it('one button per tee: the dot, the name and who it is rated for', () => {
    render(<TeeButtons tees={TEES} hasCourse teeBoxId="t-red" onSelect={() => {}} />);
    expect(screen.getByText('Tee')).toBeTruthy();
    expect(buttons()).toEqual([
      { text: 'Gulherre · dame', dot: 'yellow', pressed: 'false' },
      { text: 'Røddame · junior', dot: 'red', pressed: 'true' },
      { text: "Men's IIIherre", dot: 'none', pressed: 'false' },
    ]);
  });

  it('a press chooses the tee', () => {
    const onSelect = vi.fn();
    render(<TeeButtons tees={TEES} hasCourse teeBoxId="" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /^Men's III/ }));
    expect(onSelect).toHaveBeenCalledWith('t-mens');
  });

  it('without a course there are no buttons, and the kicker says why', () => {
    render(<TeeButtons tees={[]} hasCourse={false} teeBoxId="" onSelect={() => {}} />);
    expect(screen.queryByTestId('tee-button')).toBeNull();
    expect(screen.getByText('Velg bane først')).toBeTruthy();
  });
});
