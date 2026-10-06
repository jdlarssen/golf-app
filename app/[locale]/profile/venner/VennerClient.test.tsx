import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { GetTheGangCard, ShareLinkButton } from './VennerClient';

/**
 * Type C (#2267): the green «Få med gjengen» card and its share button. One
 * test per component; structure and roles only, no Norwegian copy.
 */

const TEXT = {
  title: 'title',
  shareLine: 'share-line',
  emailLine: 'email-line',
  shareButton: 'share',
  emailButton: 'email',
  copied: 'copied',
  promptFallback: 'prompt',
  emailLabel: 'email-label',
  emailPlaceholder: 'placeholder',
  emailPending: 'pending',
  emailAdd: 'add',
};

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'share');
});

describe('GetTheGangCard', () => {
  it.each([
    { label: 'with a friend code', sharePath: '/venner/legg-til/KODE', shareButtons: 1 },
    { label: 'without a friend code', sharePath: null, shareButtons: 0 },
  ])('$label: «På e-post» folds the field out inside the card and focuses it', async ({ sharePath, shareButtons }) => {
    render(
      <GetTheGangCard
        ownInitials="SA"
        sharePath={sharePath}
        emailOpenAtStart={false}
        addByEmailAction={vi.fn()}
        text={TEXT}
      />,
    );
    const card = screen.getByTestId('friends-hero');
    expect(within(card).queryAllByTestId('friends-share-link')).toHaveLength(shareButtons);
    expect(within(card).getByRole('heading', { level: 2 })).toBeTruthy();

    const toggle = within(card).getByTestId('friends-email-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(within(card).queryByRole('textbox')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const region = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(card.contains(region)).toBe(true);
    const field = within(region).getByRole('textbox');
    await waitFor(() => expect(document.activeElement).toBe(field));

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(within(card).queryByRole('textbox')).toBeNull();
  });
});

describe('ShareLinkButton', () => {
  it.each([
    { label: 'opens the share sheet with only the link', hasShare: true },
    { label: 'copies the link without a share sheet', hasShare: false },
  ])('$label', async ({ hasShare }) => {
    const share = vi.fn(async (_data: ShareData) => undefined);
    const writeText = vi.fn(async (_text: string) => undefined);
    if (hasShare) Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    vi.stubGlobal('navigator', Object.assign(navigator, { clipboard: { writeText } }));

    render(<ShareLinkButton path="/venner/legg-til/KODE" label="share" copiedLabel="copied" promptFallback="prompt" />);
    fireEvent.click(screen.getByTestId('friends-share-link'));

    const url = `${window.location.origin}/venner/legg-til/KODE`;
    if (hasShare) {
      await waitFor(() => expect(share).toHaveBeenCalledWith({ url }));
      expect(writeText).not.toHaveBeenCalled();
    } else {
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(url));
      expect(screen.getByRole('status').textContent).toBe('copied');
    }
  });
});
