import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

/**
 * #2746 rule 7, #2332: on liga, cup, kavalkade, påmelding, personvern and
 * slett konto the arrow goes back when you came from a Tørny page, and
 * otherwise to the fixed target.
 *
 * The bug this locks: after a client-side navigation `document.referrer`
 * still names the first page load, which is empty from the home screen or a
 * direct link, so the arrow went to the fixed target instead of back.
 * The Navigation API sees the tab's same-site entries, client-side ones too.
 */

const back = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ back, push }) }));

import { HistoryBackLink } from './HistoryBackLink';

type NavigationLike = { canGoBack: boolean } | undefined;

function setNavigation(navigation: NavigationLike) {
  Object.defineProperty(window, 'navigation', { value: navigation, configurable: true, writable: true });
}

function setReferrer(referrer: string) {
  Object.defineProperty(document, 'referrer', { value: referrer, configurable: true });
}

function pressArrow() {
  render(<HistoryBackLink fallbackHref="/profile" ariaLabel="Tilbake" />);
  fireEvent.click(screen.getByRole('button', { name: 'Tilbake' }));
}

beforeEach(() => {
  back.mockClear();
  push.mockClear();
  setReferrer('');
});

afterEach(() => {
  setNavigation(undefined);
});

describe('HistoryBackLink', () => {
  it('goes back after a client-side navigation from a Tørny page, also with no referrer', () => {
    setNavigation({ canGoBack: true });

    pressArrow();

    expect(back).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('goes to the fixed target on a direct load with no Tørny page before it in the tab', () => {
    setNavigation({ canGoBack: false });
    // A reload keeps the first load's referrer; the tab still has nothing to go back to.
    setReferrer(`${window.location.origin}/`);

    pressArrow();

    expect(push).toHaveBeenCalledWith('/profile');
    expect(back).not.toHaveBeenCalled();
  });

  describe('a browser without the Navigation API', () => {
    it('goes back when the referrer is a Tørny page, as before', () => {
      setNavigation(undefined);
      setReferrer(`${window.location.origin}/profile/konto`);

      pressArrow();

      expect(back).toHaveBeenCalledTimes(1);
    });

    it('goes to the fixed target without a Tørny referrer', () => {
      setNavigation(undefined);
      setReferrer('https://example.com/');

      pressArrow();

      expect(push).toHaveBeenCalledWith('/profile');
    });
  });
});
