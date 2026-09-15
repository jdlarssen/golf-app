import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import noMessages from '@/messages/no.json';

vi.mock('@/lib/games/remindUnsubmitted', () => ({
  previewReminder: vi.fn(),
}));

import { previewReminder } from '@/lib/games/remindUnsubmitted';
import { RemindMissing } from './RemindMissing';

const preview = vi.mocked(previewReminder);

const NOBODY_LEFT_OUT = { unfinished: 0, guests: 0, splitDay: 0 };

/**
 * Én render-test for purreknappen (#1889) — de tre presentasjonelle grenene
 * (noen å purre / ingen å purre / nettopp purret), som er hele komponentens
 * oppførsel. De tre avslutt-flatene hadde ingen dekning fra før.
 *
 * Målregelen selv er dekket av Type A-suiten til `lib/games/remindUnsubmitted`;
 * her asserteres bare at tallet i knappen kommer DERFRA og ikke fra kallstedet
 * (det var hele poenget med å hente det fra `previewReminder`), og at knappen
 * forsvinner når det ikke er noen å purre. Copy-en sammenlignes mot katalogen,
 * aldri mot en håndskrevet norsk streng (Type C-disiplin).
 */
describe('RemindMissing (#1889)', () => {
  beforeEach(() => preview.mockReset());

  const t = createTranslator({
    locale: 'no',
    messages: noMessages,
    namespace: 'game.remind',
  });

  const renderBlock = async (justReminded = false) =>
    render(
      (await RemindMissing({
        gameId: 'game-1',
        remindAction: async () => {},
        justReminded,
      })) as React.ReactElement,
    );

  it('viser knappen med antallet previewReminder returnerer', async () => {
    preview.mockResolvedValue({
      ok: true,
      targets: 3,
      targetUserIds: ['a', 'b', 'c'],
      unremindable: NOBODY_LEFT_OUT,
      lastRemindedAt: null,
    });

    await renderBlock();

    expect(preview).toHaveBeenCalledWith('game-1');
    expect(screen.getByRole('button')).toHaveTextContent('3');
    expect(screen.queryByTestId('remind-missing-none')).not.toBeInTheDocument();
  });

  it('bytter knappen mot én setning per grunn når ingen kan purres (#1933)', async () => {
    // To står midt i runden og én er en ferdig gjest. Gjesten skal kalles
    // gjest — ikke en som «ikke har ført alle hullene».
    preview.mockResolvedValue({
      ok: true,
      targets: 0,
      targetUserIds: [],
      unremindable: { unfinished: 2, guests: 1, splitDay: 0 },
      lastRemindedAt: null,
    });

    await renderBlock();

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByTestId('remind-missing-none').textContent).toBe(
      `${t('unfinished', { count: 2 })} ${t('guests', { count: 1 })}`,
    );
    expect(
      screen.queryByText(noMessages.game.remind.sent),
    ).not.toBeInTheDocument();
  });

  it('viser kvitteringen etter purring, med knappen fortsatt der', async () => {
    preview.mockResolvedValue({
      ok: true,
      targets: 2,
      targetUserIds: ['a', 'b'],
      unremindable: NOBODY_LEFT_OUT,
      lastRemindedAt: null,
    });

    await renderBlock(true);

    // Ingen sperre etter purring (eiervalg #1891) — knappen blir stående.
    expect(screen.getByText(noMessages.game.remind.sent)).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveTextContent('2');
  });
});
