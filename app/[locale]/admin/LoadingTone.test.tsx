import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Type C: the route skeleton's page colour (#2493, owner's answer 05.10). The
// player's room is drawn on the app's background; the Sekretariat and every
// page under /admin keep Klubbhuset's linen. The skeleton has to pick the same
// colour the page will have, so nobody sees it change when the page arrives.
let pathname = '/admin';
vi.mock('@/i18n/navigation', () => ({ usePathname: () => pathname }));

const { LoadingTone } = await import('./LoadingTone');

describe('LoadingTone', () => {
  it.each([
    ['a player on the room', true, '/admin', 'app'],
    ['an admin on the Sekretariat', false, '/admin', 'admin'],
    ['a player on a page under /admin', true, '/admin/cup', 'admin'],
    ['an admin on a page under /admin', false, '/admin/games', 'admin'],
  ] as const)('%s: %s', (_label, isPlayer, path, tone) => {
    pathname = path;
    render(
      <LoadingTone isPlayer={isPlayer}>
        <p>skjelett</p>
      </LoadingTone>,
    );
    const shell = screen.getByTestId('klubbhus-loading');
    expect(shell.dataset.tone).toBe(tone);
    expect(shell.className).toContain(tone === 'app' ? 'bg-bg' : 'bg-admin-bg');
  });
});
