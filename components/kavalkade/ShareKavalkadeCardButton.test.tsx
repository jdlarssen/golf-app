import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/no.json';
import { ShareKavalkadeCardButton } from './ShareKavalkadeCardButton';

/**
 * Type C: går fakta-laget (ruta svarer / svarer ikke) riktig ut i UI-et?
 *
 * Selve delelogikken er dekket i `lib/share/useSharePng.test.ts`. Her står to
 * ting: at knappen gater seg selv på 404-en, og at en fullført deling faktisk
 * blir talt.
 */

const logMock = vi.fn(async (_year: number, _kind: string) => ({ ok: true as const }));
vi.mock('@/app/[locale]/kavalkade/shareActions', () => ({
  logKavalkadeShare: (year: number, kind: string) => logMock(year, kind),
}));

function pngResponse(): unknown {
  return {
    ok: true,
    headers: new Headers({ 'content-type': 'image/png' }),
    blob: async () => new Blob(['png'], { type: 'image/png' }),
  };
}

function renderButton() {
  return render(
    <NextIntlClientProvider locale="no" messages={messages}>
      <ShareKavalkadeCardButton year={2026} kind="team" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  URL.createObjectURL = vi.fn(() => 'blob:torny');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ShareKavalkadeCardButton', () => {
  it('viser seg når kortets bilde-rute svarer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => pngResponse()));
    renderButton();

    expect(await screen.findByTestId('share-kavalkade-card-team')).toHaveTextContent(
      'Del kortet',
    );
    expect(fetch).toHaveBeenCalledWith('/kavalkade/2026/card/team');
  });

  it('holder seg skjult når ruta svarer 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, headers: new Headers(), blob: async () => new Blob() })),
    );
    renderButton();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByTestId('share-kavalkade-card-team')).toBeNull();
  });

  it('teller delingen når nedlastingen har startet', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => pngResponse()));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderButton();

    fireEvent.click(await screen.findByTestId('share-kavalkade-card-team'));

    await waitFor(() => expect(logMock).toHaveBeenCalledWith(2026, 'team'));
  });
});
