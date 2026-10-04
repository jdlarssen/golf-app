import { describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ResendCountdown, VerifyCodeForm } from './VerifyCodeForm';

// `sendCode` / `verifyCode` are server actions — a no-op reference is enough,
// the render path is what's under test here.
vi.mock('../actions', () => ({
  sendCode: async () => {},
  verifyCode: async () => {},
}));

describe('VerifyCodeForm — change-email link (#1346)', () => {
  it('renders a step-1 link outside both forms, carrying email, next and invite', () => {
    const qs = new URLSearchParams({
      email: 'jorgen+golf@example.com',
      next: '/spill/42',
      invite: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
    render(
      <VerifyCodeForm
        email="jorgen+golf@example.com"
        next="/spill/42"
        invite="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        changeEmailHref={`/login?${qs.toString()}`}
        resendWaitSeconds={0}
        sent=""
      />,
    );

    const link = screen.getByTestId('change-email-link');
    // Nested <form> is the standing trap in this file — the link is a sibling
    // of the verify and resend forms, never inside one.
    expect(link.closest('form')).toBeNull();

    const url = new URL(link.getAttribute('href') ?? '', 'https://tornygolf.no');
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('step')).toBeNull();
    expect(url.searchParams.get('email')).toBe('jorgen+golf@example.com');
    expect(url.searchParams.get('next')).toBe('/spill/42');
    expect(url.searchParams.get('invite')).toBe(
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );

    // #2349 regression lock: the eight boxes are drawn over ONE real field,
    // which keeps the name «Kode» (e2e `signInViaOtpWith`) and iOS's
    // one-time-code autofill.
    const field = screen.getByLabelText('Kode');
    expect(field).toHaveAttribute('autocomplete', 'one-time-code');
  });
});

describe('ResendCountdown (#2349)', () => {
  it('keeps «Send ny kode» off until the wait is over', () => {
    vi.useFakeTimers();
    try {
      render(
        <ResendCountdown
          email="kompis@example.com"
          next=""
          invite=""
          sent="1791108000"
          resendWaitSeconds={42}
        />,
      );
      const button = screen.getByTestId('resend-code-button');
      expect(button).toBeDisabled();
      expect(screen.getByText('Ny kode om 0:42')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(42_000);
      });
      expect(button).toBeEnabled();
      expect(screen.queryByText(/Ny kode om/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts from the server again when a redirect brings a new wait (42 → 0 while counting)', () => {
    vi.useFakeTimers();
    try {
      const props = { email: 'kompis@example.com', next: '', invite: '', sent: '1791108000' };
      const { rerender } = render(<ResendCountdown {...props} resendWaitSeconds={42} />);
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      expect(screen.getByTestId('resend-code-button')).toBeDisabled();

      rerender(<ResendCountdown {...props} resendWaitSeconds={0} />);
      expect(screen.getByTestId('resend-code-button')).toBeEnabled();
      expect(screen.queryByText(/Ny kode om/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
