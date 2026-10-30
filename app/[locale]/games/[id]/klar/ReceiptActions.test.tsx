import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReceiptActions } from './ReceiptActions';

/**
 * Type C (#2458): the receipt's actions. The share sheet gets the link and
 * the text; closing it copies nothing; without a share sheet the link is
 * copied and the button says so, also to a screen reader. Without a link
 * neither share button is there, and without a tee-off no calendar button.
 */

const URL = 'https://tornygolf.no/signup/abc12345';
const TEXT = 'Bli med på Lørdagsrunden, lørdag 3. okt kl. 09:00';

const writeTextMock = vi.fn<(text: string) => Promise<void>>();
const shareMock = vi.fn<(data: ShareData) => Promise<void>>();

function setShare(fn: typeof shareMock | undefined) {
  Object.defineProperty(navigator, 'share', { value: fn, configurable: true });
}

function renderActions(props: Partial<Parameters<typeof ReceiptActions>[0]> = {}) {
  return render(
    <ReceiptActions
      shareUrl={URL}
      shareText={TEXT}
      calendarHref="/no/games/g1/calendar"
      gameHref="/games/g1"
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  writeTextMock.mockResolvedValue(undefined);
  shareMock.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: writeTextMock },
    configurable: true,
  });
});

afterEach(() => setShare(undefined));

describe('ReceiptActions', () => {
  it('opens the share sheet with the link and the text', async () => {
    setShare(shareMock);
    renderActions();
    fireEvent.click(screen.getByTestId('receipt-share'));
    await waitFor(() => expect(shareMock).toHaveBeenCalledWith({ url: URL, text: TEXT }));
    expect(writeTextMock).not.toHaveBeenCalled();
  });

  it('copies nothing when the share sheet is closed', async () => {
    setShare(shareMock);
    shareMock.mockRejectedValue(Object.assign(new Error('closed'), { name: 'AbortError' }));
    renderActions();
    fireEvent.click(screen.getByTestId('receipt-share'));
    await waitFor(() => expect(shareMock).toHaveBeenCalled());
    expect(writeTextMock).not.toHaveBeenCalled();
  });

  it('copies the link where there is no share sheet, and says so', async () => {
    setShare(undefined);
    renderActions();
    fireEvent.click(screen.getByTestId('receipt-share'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Kopiert!'));
    expect(writeTextMock).toHaveBeenCalledWith(URL);
    expect(screen.getByTestId('receipt-share')).toHaveTextContent('Kopiert!');
  });

  it('«Kopier lenke» copies and says «Kopiert!»', async () => {
    renderActions();
    fireEvent.click(screen.getByTestId('receipt-copy'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Kopiert!'));
    expect(writeTextMock).toHaveBeenCalledWith(URL);
    expect(screen.getByTestId('receipt-copy')).toHaveTextContent('Kopiert!');
  });

  it('says so when copying fails', async () => {
    writeTextMock.mockRejectedValue(new Error('denied'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderActions();
    fireEvent.click(screen.getByTestId('receipt-copy'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('has no share buttons without a link', () => {
    const { container } = renderActions({ shareUrl: null });
    expect(screen.queryByTestId('receipt-share')).toBeNull();
    expect(screen.queryByTestId('receipt-copy')).toBeNull();
    expect(container.innerHTML).not.toContain('signup');
    expect(screen.getByTestId('receipt-calendar')).toHaveAttribute('href', '/no/games/g1/calendar');
  });

  it('has no calendar button without a tee-off', () => {
    renderActions({ calendarHref: null });
    expect(screen.queryByTestId('receipt-calendar')).toBeNull();
    expect(screen.getByTestId('receipt-copy')).toBeInTheDocument();
  });

  it('goes to the game', () => {
    renderActions();
    expect(screen.getByTestId('receipt-go-to-game')).toHaveAttribute('href', '/games/g1');
  });
});
