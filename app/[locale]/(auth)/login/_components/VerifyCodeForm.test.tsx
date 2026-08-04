import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VerifyCodeForm } from './VerifyCodeForm';

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
  });
});
