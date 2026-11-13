import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/components/ui/SmartLink', () => ({
  SmartLink: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} data-testid={(rest as { 'data-testid'?: string })['data-testid']}>
      {children}
    </a>
  ),
}));

import { NeedsYouList, type NeedsYouListRow } from './NeedsYouList';

const rows = (n: number): NeedsYouListRow[] =>
  Array.from({ length: n }, (_, i) => ({
    key: `g${i}`,
    href: `/admin/games/g${i}/status`,
    name: `Runde ${i}`,
    line: 'x',
    warning: i < 2,
    testId: 'morning-needs-you-row',
  }));

// One render test for «Trenger deg»'s cut (#2345, Type C): five rows in the
// open card in the order given, the rest inside the native <details>, and no
// <details> at all when five rows or fewer wait.
describe('NeedsYouList', () => {
  it('shows the first five rows and folds the rest behind «Vis n til»', () => {
    const { container, rerender } = render(<NeedsYouList rows={rows(7)} />);
    const more = container.querySelector('details[data-testid=morning-needs-you-more]');
    const hrefs = (scope: ParentNode, sel: string) =>
      [...scope.querySelectorAll(sel)].map((a) => a.getAttribute('href'));

    expect(hrefs(container, ':scope > div > ul a')).toEqual(
      [0, 1, 2, 3, 4].map((i) => `/admin/games/g${i}/status`),
    );
    expect(more).not.toBeNull();
    expect(more!.getAttribute('data-count')).toBe('2');
    expect(more!.hasAttribute('open')).toBe(false);
    expect(hrefs(more!, 'ul a')).toEqual(['/admin/games/g5/status', '/admin/games/g6/status']);

    rerender(<NeedsYouList rows={rows(5)} />);
    expect(container.querySelector('details')).toBeNull();
    expect(container.querySelectorAll('a')).toHaveLength(5);
  });
});
