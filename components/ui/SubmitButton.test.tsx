import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const useFormStatus = vi.fn();
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>();
  return { ...actual, useFormStatus: () => useFormStatus() };
});

import { SubmitButton } from './SubmitButton';

describe('SubmitButton', () => {
  beforeEach(() => useFormStatus.mockReset());

  it('viser children når form ikke er pending', () => {
    useFormStatus.mockReturnValue({ pending: false });
    render(<SubmitButton pendingLabel="Sender …">Send</SubmitButton>);
    const btn = screen.getByRole('button', { name: 'Send' });
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveAttribute('type', 'submit');
  });

  it('er disabled og viser pendingLabel + spinner når form er pending', () => {
    useFormStatus.mockReturnValue({ pending: true });
    render(<SubmitButton pendingLabel="Sender …">Send</SubmitButton>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent('Sender …');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
