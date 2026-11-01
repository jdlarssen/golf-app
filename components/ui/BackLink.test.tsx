import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BackLink } from './BackLink';
import { LeaderboardBackLink } from './LeaderboardBackLink';

const { routerReplace, routerRefresh } = vi.hoisted(() => ({
  routerReplace: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace, refresh: routerRefresh, prefetch: vi.fn() }),
}));

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
  routerReplace.mockClear();
  routerRefresh.mockClear();
  vi.unstubAllGlobals();
});

describe('tilbake-pila (#2746)', () => {
  it('med et mål i historikken: går dit, og lenka følges ikke', () => {
    const traverseTo = fakeNavigation(['/', '/games/x/approve', '/games/x']);
    render(<BackLink href="/fallback">Tilbake</BackLink>);
    expect(followed(screen.getByRole('link', { name: 'Tilbake' }))).toBe(false);
    expect(traverseTo).toHaveBeenCalledWith('k0');
  });

  // `traverseTo` viser siden fra Next sin hurtigbuffer for tilbake og fram. Slag går
  // gjennom klient-synken og tømmer den ikke, så spillets knapp ville stått på
  // «Start runden» etter fem hull.
  it('henter siden på nytt når traverseringen er ferdig, ikke før', async () => {
    let finish!: () => void;
    fakeNavigation(['/', '/games/x'], {
      traverseTo: () => ({ finished: new Promise<void>((resolve) => { finish = resolve; }) }),
    });
    render(<BackLink href="/fallback">Tilbake</BackLink>);
    followed(screen.getByRole('link', { name: 'Tilbake' }));
    expect(routerRefresh).not.toHaveBeenCalled();
    finish();
    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalledTimes(1));
  });

  it('henter ikke på nytt når traverseringen avvises', async () => {
    fakeNavigation(['/', '/games/x'], {
      traverseTo: () => ({ finished: Promise.reject(new DOMException('nei', 'InvalidStateError')) }),
    });
    render(<BackLink href="/fallback">Tilbake</BackLink>);
    followed(screen.getByRole('link', { name: 'Tilbake' }));
    await vi.waitFor(() => expect(routerReplace).toHaveBeenCalledWith('/fallback'));
    expect(routerRefresh).not.toHaveBeenCalled();
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

  // Reserven legger ikke til noe. Gjorde den det, ville neste pil gått tilbake
  // hit, og pila ville gått i ring mellom to sider (løkka fra #121).
  it('med bare én oppføring: pila erstatter siden med lenkas mål', () => {
    const traverseTo = fakeNavigation(['/games/x']);
    render(<BackLink href="/fallback">Tilbake</BackLink>);
    expect(followed(screen.getByRole('link', { name: 'Tilbake' }))).toBe(false);
    expect(routerReplace).toHaveBeenCalledWith('/fallback');
    expect(traverseTo).not.toHaveBeenCalled();
  });

  it('med bare et godkjent kort bak deg: pila erstatter siden med lenkas mål', () => {
    const traverseTo = fakeNavigation(['/games/x/approve', '/games/x']);
    render(<BackLink href="/fallback">Tilbake</BackLink>);
    expect(followed(screen.getByRole('link', { name: 'Tilbake' }))).toBe(false);
    expect(routerReplace).toHaveBeenCalledWith('/fallback');
    expect(traverseTo).not.toHaveBeenCalled();
  });

  // `?vis=utkast` og `?del=…` er undervisninger. «Tidligste kopi» ville hoppet
  // over forelderen de peker på.
  it('på en undervisning: pila går opp til forelderen den peker på', () => {
    const traverseTo = fakeNavigation(['/', '/klubbhuset', '/klubbhuset?vis=utkast']);
    render(<BackLink href="/klubbhuset">Tilbake</BackLink>);
    expect(followed(screen.getByRole('link', { name: 'Tilbake' }))).toBe(false);
    expect(routerReplace).toHaveBeenCalledWith('/klubbhuset');
    expect(traverseTo).not.toHaveBeenCalled();
  });

  it('veiviseren → ny bane → pil: tilbake til veiviseren', () => {
    const traverseTo = fakeNavigation(['/profile', '/opprett-spill?step=2', '/opprett-bane']);
    render(<BackLink href="/opprett-spill?step=2">Tilbake</BackLink>);
    expect(followed(screen.getByRole('link', { name: 'Tilbake' }))).toBe(false);
    expect(traverseTo).toHaveBeenCalledWith('k1');
  });

  // Kvitteringen for ny bane: lenka bærer `bane=`, som den gamle oppføringen mangler.
  it('mangler oppføringen det pila bærer, følger pila lenka', () => {
    const traverseTo = fakeNavigation(['/profile', '/opprett-spill?step=3', '/opprett-bane?status=created']);
    render(<BackLink href="/opprett-spill?step=3&bane=b">Tilbake</BackLink>);
    expect(followed(screen.getByRole('link', { name: 'Tilbake' }))).toBe(false);
    expect(routerReplace).toHaveBeenCalledWith('/opprett-spill?step=3&bane=b');
    expect(traverseTo).not.toHaveBeenCalled();
  });

  it('en pil som peker på seg selv, går tilbake i lista, ikke ingen steder', () => {
    const traverseTo = fakeNavigation(['/games/x', '/en/spectate/t']);
    render(<BackLink href="/spectate/t">Tilbake</BackLink>);
    expect(followed(screen.getByRole('link', { name: 'Tilbake' }))).toBe(false);
    expect(traverseTo).toHaveBeenCalledWith('k0');
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('delvis støtte (Safari 26.2): uten `entries` følges lenka', () => {
    const traverseTo = fakeNavigation(['/', '/games/x'], { entries: undefined });
    render(<BackLink href="/fallback">Tilbake</BackLink>);
    expect(followed(screen.getByRole('link', { name: 'Tilbake' }))).toBe(true);
    expect(traverseTo).not.toHaveBeenCalled();
  });

  it('delvis støtte (Safari 26.2): uten `traverseTo` følges lenka', () => {
    fakeNavigation(['/', '/games/x'], { traverseTo: undefined });
    render(<BackLink href="/fallback">Tilbake</BackLink>);
    expect(followed(screen.getByRole('link', { name: 'Tilbake' }))).toBe(true);
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it.each(['metaKey', 'ctrlKey', 'shiftKey', 'altKey'])('«åpne i ny fane» (%s) er lenka', (modifier) => {
    const traverseTo = fakeNavigation(['/', '/games/x']);
    render(<BackLink href="/fallback">Tilbake</BackLink>);
    expect(followed(screen.getByRole('link', { name: 'Tilbake' }), { [modifier]: true })).toBe(true);
    expect(traverseTo).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('avvises traverseringen, går pila til lenka i stedet for å stå død', async () => {
    fakeNavigation(['/', '/games/x'], {
      traverseTo: () => ({ finished: Promise.reject(new DOMException('nei', 'InvalidStateError')) }),
    });
    render(<BackLink href="/fallback">Tilbake</BackLink>);
    followed(screen.getByRole('link', { name: 'Tilbake' }));
    await vi.waitFor(() => expect(routerReplace).toHaveBeenCalledWith('/fallback'));
  });

  it('en ny navigasjon som avbryter traverseringen, sender deg ikke videre', async () => {
    fakeNavigation(['/', '/games/x'], {
      traverseTo: () => ({ finished: Promise.reject(new DOMException('avbrutt', 'AbortError')) }),
    });
    render(<BackLink href="/fallback">Tilbake</BackLink>);
    followed(screen.getByRole('link', { name: 'Tilbake' }));
    await new Promise((resolve) => setTimeout(resolve));
    expect(routerReplace).not.toHaveBeenCalled();
  });
});

// #2746: den første gjennomgangen fant fem piler uten regelen, fordi den bare
// lette etter `‹`. En ny pil skal ikke kunne gli ut igjen.
describe('alle piler', () => {
  const ARROW = /‹|M15 18l-6-6 6-6/;
  /** Tegner en pil, men er ingen lenke: skjeletter og stand-ins. */
  const NOT_LINKS = /(^|\/)(loading\.tsx|LeaderboardSkeleton\.tsx)$/;

  function tsxFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return tsxFiles(path);
      return entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx') ? [path] : [];
    });
  }

  it('tegnes med BackNavLink', () => {
    const offenders = ['app', 'components'].flatMap(tsxFiles).filter((path) => {
      if (NOT_LINKS.test(path)) return false;
      const source = readFileSync(path, 'utf8');
      // Bare koden: en kommentar kan nevne glyfen.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      return ARROW.test(code) && !code.includes('BackNavLink');
    });
    expect(offenders).toEqual([]);
  });
});
