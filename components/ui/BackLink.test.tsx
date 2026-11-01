import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BackLink } from './BackLink';
import { LeaderboardBackLink } from './LeaderboardBackLink';

// #2746: pila bruker nettleserens historikkliste når den har noe å gå til, og er
// en vanlig lenke ellers. Type B.

const ORIGIN = window.location.origin;

function fakeNavigation(paths: string[], overrides: Record<string, unknown> = {}) {
  const entries = paths.map((path, index) => ({ key: `k${index}`, url: `${ORIGIN}${path}`, index }));
  const traverseTo = vi.fn(() => ({ finished: Promise.resolve() }));
  Object.defineProperty(window, 'navigation', {
    configurable: true,
    value: { entries: () => entries, currentEntry: entries.at(-1), traverseTo, ...overrides },
  });
  return traverseTo;
}

/** `fireEvent` gir `false` når noen kalte `preventDefault`: da følges ikke lenka. */
const followed = (link: HTMLElement, init?: MouseEventInit) => fireEvent.click(link, init);

afterEach(() => {
  delete (window as unknown as { navigation?: unknown }).navigation;
});

describe('tilbake-pila (#2746)', () => {
  it('med et mål i historikken: går dit, og lenka følges ikke', () => {
    const traverseTo = fakeNavigation(['/', '/games/x/submit', '/games/x']);
    render(<BackLink href="/fallback">Tilbake</BackLink>);
    expect(followed(screen.getByRole('link', { name: 'Tilbake' }))).toBe(false);
    expect(traverseTo).toHaveBeenCalledWith('k0');
  });

  it('tavlas pil gjør det samme', () => {
    const traverseTo = fakeNavigation(['/historikk', '/games/x/leaderboard']);
    render(<LeaderboardBackLink href="/games/x" label="Tilbake" />);
    expect(followed(screen.getByRole('link', { name: 'Tilbake' }))).toBe(false);
    expect(traverseTo).toHaveBeenCalledWith('k0');
  });

  it('uten Navigation API: lenka følges', () => {
    render(<BackLink href="/fallback">Tilbake</BackLink>);
    const link = screen.getByRole('link', { name: 'Tilbake' });
    expect(link).toHaveAttribute('href', '/fallback');
    expect(followed(link)).toBe(true);
  });

  it('med bare én oppføring: lenka følges', () => {
    const traverseTo = fakeNavigation(['/games/x']);
    render(<BackLink href="/fallback">Tilbake</BackLink>);
    expect(followed(screen.getByRole('link', { name: 'Tilbake' }))).toBe(true);
    expect(traverseTo).not.toHaveBeenCalled();
  });

  it('delvis støtte (Safari 26.2): uten `entries` følges lenka', () => {
    const traverseTo = fakeNavigation(['/', '/games/x'], { entries: undefined });
    render(<BackLink href="/fallback">Tilbake</BackLink>);
    expect(followed(screen.getByRole('link', { name: 'Tilbake' }))).toBe(true);
    expect(traverseTo).not.toHaveBeenCalled();
  });

  it('«åpne i ny fane» er lenka', () => {
    const traverseTo = fakeNavigation(['/', '/games/x']);
    render(<BackLink href="/fallback">Tilbake</BackLink>);
    expect(followed(screen.getByRole('link', { name: 'Tilbake' }), { metaKey: true })).toBe(true);
    expect(traverseTo).not.toHaveBeenCalled();
  });

  it('avvises traverseringen, går pila til lenka i stedet for å stå død', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign, origin: ORIGIN });
    fakeNavigation(['/', '/games/x'], {
      traverseTo: () => ({ finished: Promise.reject(new DOMException('nei', 'InvalidStateError')) }),
    });
    render(<BackLink href="/fallback">Tilbake</BackLink>);
    followed(screen.getByRole('link', { name: 'Tilbake' }));
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith(expect.stringContaining('/fallback')));
    vi.unstubAllGlobals();
  });

  it('en ny navigasjon som avbryter traverseringen, sender deg ikke videre', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign, origin: ORIGIN });
    fakeNavigation(['/', '/games/x'], {
      traverseTo: () => ({ finished: Promise.reject(new DOMException('avbrutt', 'AbortError')) }),
    });
    render(<BackLink href="/fallback">Tilbake</BackLink>);
    followed(screen.getByRole('link', { name: 'Tilbake' }));
    await new Promise((resolve) => setTimeout(resolve));
    expect(assign).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
