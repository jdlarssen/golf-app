import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ScrollToAnchorOnStatus } from './ScrollToAnchorOnStatus';

// Én render-test (Type C). Det som MÅ holde: scroller til anker KUN når
// status matcher, og lar DOM-en være urørt (og scroller ikke) ellers.
describe('ScrollToAnchorOnStatus', () => {
  it('scroller til anker når status matcher, men ikke ellers', () => {
    const anchor = document.createElement('div');
    anchor.id = 'leverte-scorekort';
    document.body.appendChild(anchor);
    const scrollIntoViewMock = vi.fn();
    anchor.scrollIntoView = scrollIntoViewMock;

    const { rerender } = render(
      <ScrollToAnchorOnStatus
        status="other_status"
        matchStatus="admin_approved"
        anchorId="leverte-scorekort"
      />,
    );
    expect(scrollIntoViewMock).not.toHaveBeenCalled();

    rerender(
      <ScrollToAnchorOnStatus
        status="admin_approved"
        matchStatus="admin_approved"
        anchorId="leverte-scorekort"
      />,
    );
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: 'start' });

    document.body.removeChild(anchor);
  });
});
