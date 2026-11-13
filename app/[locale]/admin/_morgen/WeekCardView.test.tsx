import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/ui/SmartLink', () => ({
  SmartLink: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { WeekCardView } from './WeekCardView';

// One render test for the week card (#2345, Type C): the door to the key
// numbers, the curve as an image with every week's number, and the sentence
// parts that drop when the RPC has no field for them (before migration 0235).
describe('WeekCardView', () => {
  it('links to the key numbers, labels the curve, and drops the parts without data', () => {
    const trend = [6, 8, 7, 9, 11, 8, 10, 14];
    const { rerender } = render(
      <WeekCardView summary={{ finished: 14, diff: 4, byOthers: 9, publicSignups: 3, trend }} />,
    );

    expect(screen.getByRole('link').getAttribute('href')).toBe('/admin/nokkeltall');
    const curve = screen.getByRole('img');
    for (const n of trend) expect(curve.getAttribute('aria-label')).toContain(String(n));
    const full = screen.getByTestId('morning-week-sentence').textContent;
    expect(full).toContain('9');
    expect(full).toContain('3');

    rerender(<WeekCardView summary={{ finished: 14, diff: 4, trend }} />);
    const bare = screen.getByTestId('morning-week-sentence').textContent ?? '';
    expect(bare).not.toContain('9');
    expect(bare).not.toContain('3');
    expect(bare).toContain('4');
    expect(bare.length).toBeLessThan(full!.length);
  });
});
