import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import en from '@/messages/en.json';
import { formatRelativeLocale } from '@/lib/i18n/format';
import { HandicapConfirmCard } from './HandicapConfirmCard';

// The global stub in vitest.setup.ts renders Norwegian, so this file renders
// English to prove the card follows the page language (#2280).
vi.mock('next-intl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next-intl')>()),
  useLocale: () => 'en',
  useTranslations: (namespace: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createTranslator<any, any>({ locale: 'en', messages: en, namespace }),
}));

vi.mock('@/app/[locale]/games/[id]/actions', () => ({
  confirmHandicap: vi.fn(),
}));

afterEach(() => {
  vi.useRealTimers();
});

describe('HandicapConfirmCard', () => {
  it('#2280: renders in English, relative time included', () => {
    // Fake only Date: faking all timers hangs dynamic import() (#2292).
    vi.useFakeTimers({ toFake: ['Date'] });
    const now = new Date('2026-10-04T12:00:00Z');
    vi.setSystemTime(now);
    // 28 days: stale (≥ 4 weeks) but under the 30-day month step.
    const updatedAt = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString();
    const card = en.game.home.handicapCard;

    render(<HandicapConfirmCard gameId="g1" hcpIndex={12.4} handicapUpdatedAt={updatedAt} />);

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(card.title);
    expect(screen.getByRole('button', { name: card.confirm })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: card.update })).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === 'P')).toHaveTextContent(
      formatRelativeLocale(updatedAt, 'en', now.getTime()),
    );
  });
});
