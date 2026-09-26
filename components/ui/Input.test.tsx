import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from './Input';

describe('Input', () => {
  it('kobler meldingen til feltet og markerer feil som ugyldig', () => {
    const { rerender } = render(
      <Input id="name" label="Name" hint="hint-text" error="error-text" />,
    );
    const input = screen.getByLabelText('Name');
    expect(input).toHaveAccessibleDescription('error-text');
    expect(input).toHaveAttribute('aria-invalid', 'true');

    rerender(<Input id="name" label="Name" hint="hint-text" />);
    expect(input).toHaveAccessibleDescription('hint-text');
    expect(input).not.toHaveAttribute('aria-invalid');
  });
});
