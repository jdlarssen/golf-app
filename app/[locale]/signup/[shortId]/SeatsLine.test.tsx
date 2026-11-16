import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SeatsLine } from './SeatsLine';

// Type C (docs/test-discipline.md): the seats over the signup form (#2482).

describe('SeatsLine', () => {
  it('seats left: «X av Y plasser», nothing on the right', () => {
    render(<SeatsLine seats={{ kind: 'capped', cap: 16, held: 12, waitlist: 0 }} />);
    expect(screen.getByTestId('signup-seats')).toHaveTextContent('12 av 16 plasser');
    expect(screen.queryByTestId('signup-seats-full')).toBeNull();
  });

  it('full with a waiting list: «Fullt · N på venteliste»', () => {
    render(<SeatsLine seats={{ kind: 'capped', cap: 16, held: 16, waitlist: 2 }} />);
    expect(screen.getByTestId('signup-seats')).toHaveTextContent('16 av 16 plasser');
    expect(screen.getByTestId('signup-seats-full')).toHaveTextContent('Fullt · 2 på venteliste');
  });

  it('full without a waiting list: «Fullt»', () => {
    render(<SeatsLine seats={{ kind: 'capped', cap: 3, held: 3 }} />);
    expect(screen.getByTestId('signup-seats-full')).toHaveTextContent(/^Fullt$/);
  });
});
