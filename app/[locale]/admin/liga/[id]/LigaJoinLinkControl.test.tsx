import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// #2662: the action is the boundary; its modes are covered by joinLink.test.ts.
const setLeagueJoinLink = vi.fn();
vi.mock('@/lib/league/joinLink', () => ({
  setLeagueJoinLink: (...args: unknown[]) => setLeagueJoinLink(...args),
}));

import { LigaJoinLinkControl } from './LigaJoinLinkControl';

/**
 * Type C, one render test (#2662): the control follows the code the action
 * hands back, on → rotate → off.
 */
describe('LigaJoinLinkControl', () => {
  it('shows the link while on, swaps it on «Lag ny lenke» and hides it when switched off', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://tornygolf.no');
    render(<LigaJoinLinkControl leagueId="l1" joinCode="abcd2345" />);
    const link = () => screen.queryByTestId('liga-join-link') as HTMLInputElement | null;
    expect(link()?.value).toBe('https://tornygolf.no/liga/bli-med/abcd2345');

    setLeagueJoinLink.mockResolvedValueOnce({ joinCode: 'new23456' });
    fireEvent.click(screen.getByTestId('liga-join-link-rotate'));
    await waitFor(() => expect(link()?.value).toBe('https://tornygolf.no/liga/bli-med/new23456'));
    expect(setLeagueJoinLink).toHaveBeenLastCalledWith('l1', 'rotate');
    // The new code renders before the transition ends; a click on the still
    // disabled switch would be swallowed (flaked 1 in 6 under load).
    await waitFor(() => expect(screen.getByTestId('liga-join-link-switch')).not.toBeDisabled());

    setLeagueJoinLink.mockResolvedValueOnce({ joinCode: null });
    fireEvent.click(screen.getByTestId('liga-join-link-switch'));
    await waitFor(() => expect(link()).toBeNull());
    expect(setLeagueJoinLink).toHaveBeenLastCalledWith('l1', 'off');
    expect(screen.getByTestId('liga-join-link-switch')).toHaveAttribute('aria-checked', 'false');
    vi.unstubAllEnvs();
  });
});
