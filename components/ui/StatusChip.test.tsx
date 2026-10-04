import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusChip } from './StatusChip';
import type { GameStatus } from '@/lib/games/status';
import noMessages from '@/messages/no.json';

const STATUSES: GameStatus[] = ['draft', 'scheduled', 'active', 'finished'];

describe('StatusChip', () => {
  it('shows the gameStatus catalog text for every status, never its own', () => {
    render(
      <>
        {STATUSES.map((s) => (
          <StatusChip key={s} status={s} />
        ))}
      </>,
    );
    for (const s of STATUSES) {
      expect(screen.getByText(noMessages.gameStatus[s])).toBeInTheDocument();
    }
  });
});
