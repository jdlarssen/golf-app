import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SendCodeForm } from './SendCodeForm';

// `sendCode` is a server action — for unit purposes we only need a no-op
// reference; the form behaviour we exercise here is purely the render path.
vi.mock('../actions', () => ({
  sendCode: async () => {},
}));

const SELF_REG_COPY =
  'Skriv inn e-posten din. Er du ny her, lager vi en konto til deg.';

describe('SendCodeForm — self-registration sub-text', () => {
  it('hides the sub-text by default (flag off)', () => {
    render(<SendCodeForm defaultEmail="" next="" />);

    expect(screen.queryByText(SELF_REG_COPY)).toBeNull();
  });

  it('shows the sub-text when allowSelfRegistration is true', () => {
    render(
      <SendCodeForm
        defaultEmail=""
        next=""
        allowSelfRegistration
      />,
    );

    expect(screen.getByText(SELF_REG_COPY)).toBeTruthy();
  });

  it('renders the e-post input + Send-knapp on both flag states', () => {
    const { rerender } = render(
      <SendCodeForm defaultEmail="" next="" />,
    );
    expect(screen.getByLabelText('E-post')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Send meg kode' }),
    ).toBeTruthy();

    rerender(
      <SendCodeForm defaultEmail="" next="" allowSelfRegistration />,
    );
    expect(screen.getByLabelText('E-post')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Send meg kode' }),
    ).toBeTruthy();
  });
});
