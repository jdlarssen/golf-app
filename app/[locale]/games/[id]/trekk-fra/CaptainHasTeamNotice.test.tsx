import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CaptainHasTeamNotice } from './CaptainHasTeamNotice';

// Type C render-test (#2358): a captain whose teammates have said yes is sent
// to the team page to hand the captaincy on, not offered a withdraw button the
// server refuses.

describe('CaptainHasTeamNotice', () => {
  it('links to the team page of this game', async () => {
    render(await CaptainHasTeamNotice({ shortId: 'abc12345' }));

    expect(screen.getByTestId('captain-has-team-link')).toHaveAttribute(
      'href',
      '/signup/abc12345/team',
    );
  });
});
