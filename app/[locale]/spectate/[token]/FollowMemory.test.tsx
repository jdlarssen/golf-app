import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

// Type C behaviour (#2286): what the phone remembers per live link. The
// component renders nothing, so these test its effects, not markup.

const replace = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace }),
}));

import { FollowMemory } from './FollowMemory';

const KEY = 'torny:folg:tok';

beforeEach(() => {
  replace.mockClear();
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FollowMemory', () => {
  it('a follow page stores the id, and a refresh does not store it again', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { rerender } = render(<FollowMemory token="tok" userId="u1" hadFolg />);
    rerender(<FollowMemory token="tok" userId="u1" hadFolg />);

    expect(window.localStorage.getItem(KEY)).toBe('u1');
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it('the plain link with a stored id goes to that player once, unprefixed', () => {
    window.localStorage.setItem(KEY, 'u1');
    const { rerender } = render(<FollowMemory token="tok" userId={null} hadFolg={false} />);
    rerender(<FollowMemory token="tok" userId={null} hadFolg={false} />);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/spectate/tok?folg=u1');
  });

  it('an id that could not be followed forgets the stored one, and stays', () => {
    window.localStorage.setItem(KEY, 'u1');
    render(<FollowMemory token="tok" userId={null} hadFolg />);

    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it('stays on the board when nothing is stored (as «Se hele tavla» leaves it)', () => {
    render(<FollowMemory token="tok" userId={null} hadFolg={false} />);

    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    ['a follow page', { userId: 'u1', hadFolg: true }],
    ['the plain link', { userId: null, hadFolg: false }],
    ['an unknown id', { userId: null, hadFolg: true }],
  ])('%s survives a storage that throws', (_label, props) => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(() => render(<FollowMemory token="tok" {...props} />)).not.toThrow();
    expect(replace).not.toHaveBeenCalled();
  });
});
