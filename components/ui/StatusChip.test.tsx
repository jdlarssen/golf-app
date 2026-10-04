import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusChip } from './StatusChip';
import type { GameStatus } from '@/lib/games/status';

// Echo the namespace and key instead of the catalog text, so the test fails if
// the chip ever shows a word from anywhere but `gameStatus` (#2491).
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

const STATUSES: GameStatus[] = ['draft', 'scheduled', 'active', 'finished'];

describe('StatusChip', () => {
  it('reads every status word from the gameStatus namespace', () => {
    render(
      <>
        {STATUSES.map((s) => (
          <StatusChip key={s} status={s} />
        ))}
      </>,
    );
    for (const s of STATUSES) {
      expect(screen.getByText(`gameStatus.${s}`)).toBeInTheDocument();
    }
  });
});
