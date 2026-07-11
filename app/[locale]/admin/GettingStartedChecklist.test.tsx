import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GettingStartedChecklist } from './GettingStartedChecklist';

// One render test (Type C) for the «kom i gang»-checklist (#1177). Data injected
// as props into the presentational component; asserts on data-testid / data-done
// / href only, never on Norwegian copy. No Supabase mock — TilesGrid owns the
// derivation.

describe('GettingStartedChecklist (#1177)', () => {
  it('fresh admin (nothing done): 4 steps, only «account» checked, 3 doors to setup', () => {
    render(
      <GettingStartedChecklist hasCourse={false} hasGame={false} hasInvited={false} />,
    );

    const section = screen.getByTestId('getting-started-checklist');
    // Goal-gradient: progress starts above zero (account pre-counted).
    expect(section).toHaveAttribute('data-done-count', '1');

    const steps = screen.getAllByTestId('getting-started-step');
    expect(steps).toHaveLength(4);
    expect(steps[0]).toHaveAttribute('data-done', 'true'); // account: pre-checked head start
    expect(steps[1]).toHaveAttribute('data-done', 'false');
    expect(steps[2]).toHaveAttribute('data-done', 'false');
    expect(steps[3]).toHaveAttribute('data-done', 'false');

    // Pending steps link to the existing doors (one door per room — #344).
    expect(screen.getByTestId('getting-started-link-course')).toHaveAttribute(
      'href',
      '/admin/courses/new',
    );
    expect(screen.getByTestId('getting-started-link-game')).toHaveAttribute(
      'href',
      '/admin/games/new',
    );
    expect(screen.getByTestId('getting-started-link-invite')).toHaveAttribute(
      'href',
      '/admin/spillere',
    );

    // The account row is a status, never a link.
    expect(screen.queryByTestId('getting-started-link-account')).toBeNull();
  });

  it('partial (course done, rest pending): only the done step loses its link', () => {
    render(
      <GettingStartedChecklist hasCourse={true} hasGame={false} hasInvited={false} />,
    );

    expect(screen.getByTestId('getting-started-checklist')).toHaveAttribute(
      'data-done-count',
      '2',
    );
    // Completed data-step becomes a status, not a door.
    expect(screen.queryByTestId('getting-started-link-course')).toBeNull();
    // The remaining steps are still doors.
    expect(screen.getByTestId('getting-started-link-game')).toBeInTheDocument();
    expect(screen.getByTestId('getting-started-link-invite')).toBeInTheDocument();
  });

  it('all three real steps done: the checklist auto-hides (renders nothing)', () => {
    const { container } = render(
      <GettingStartedChecklist hasCourse={true} hasGame={true} hasInvited={true} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('getting-started-checklist')).toBeNull();
  });
});
