import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// #2214: the server gate (co_player_locked) is unit-tested in
// lib/league/actions.test.ts. This is the picker's end: a co-player who has
// delivered the round or is playing it cannot be ticked.
vi.mock('@/lib/league/actions', () => ({
  startLeagueRoundFlight: vi.fn(async () => ({ error: '' })),
}));

import { RoundStartClient, type RoundCoPlayer } from './RoundStartClient';

const player = (userId: string, lock: RoundCoPlayer['lock']): RoundCoPlayer => ({
  userId,
  name: userId,
  nickname: null,
  acceptedAt: '2026-06-01T00:00:00Z',
  hasPlayed: false,
  lock,
});

describe('RoundStartClient — locked co-players (#2214)', () => {
  it('marks delivered and in-progress co-players as locked and never selects them', () => {
    render(
      <RoundStartClient
        roundId="r1"
        coPlayers={[player('FREE', null), player('DONE', 'delivered'), player('BUSY', 'in_progress')]}
      />,
    );
    const row = (id: string) => screen.getByTestId(`liga-round-start-player-${id}`);
    const box = (id: string) => row(id).querySelector('input') as HTMLInputElement;

    fireEvent.click(row('DONE'));
    fireEvent.click(row('BUSY'));
    fireEvent.click(row('FREE'));

    expect({
      free: [row('FREE').getAttribute('aria-disabled'), row('FREE').getAttribute('data-locked'), box('FREE').checked],
      done: [row('DONE').getAttribute('aria-disabled'), row('DONE').getAttribute('data-locked'), box('DONE').checked],
      busy: [row('BUSY').getAttribute('aria-disabled'), row('BUSY').getAttribute('data-locked'), box('BUSY').checked],
    }).toEqual({
      free: [null, null, true],
      done: ['true', 'delivered', false],
      busy: ['true', 'in_progress', false],
    });
  });
});
