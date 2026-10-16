import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AiConsentToggle } from './AiConsentToggle';

// #2561 PR B: the AI switch on Profil (Type C). The write itself (upsert, row
// read back) is `setAiConsent`; here only what a render can confirm.
const setAiConsentMock = vi.fn();
vi.mock('./actions', () => ({
  setAiConsent: (granted: boolean) => setAiConsentMock(granted),
}));

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe('AiConsentToggle', () => {
  it('shows the answer, locks while saving, rolls back with a line on failure, and follows the server', async () => {
    let finishFirst: (value: { ok: boolean }) => void = () => {};
    setAiConsentMock
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
      .mockResolvedValueOnce({ ok: false });
    const { rerender } = render(<AiConsentToggle initialGranted={false} />);
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    // Saving: the switch says so, stays focusable, and ignores a second click.
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-disabled', 'true'));
    expect(toggle).not.toBeDisabled();
    fireEvent.click(toggle);
    expect(setAiConsentMock).toHaveBeenCalledTimes(1);
    finishFirst({ ok: true });
    await waitFor(() => expect(toggle).not.toHaveAttribute('aria-disabled'));
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    // A failed save rolls back and says so.
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByTestId('ai-consent-toggle-error')).toBeInTheDocument());
    expect(setAiConsentMock).toHaveBeenLastCalledWith(false);
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    // #2561: the server answer changes (the save above, then an answer given
    // elsewhere in the same visit); the switch takes it instead of its own.
    rerender(<AiConsentToggle initialGranted={true} />);
    rerender(<AiConsentToggle initialGranted={false} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });
});
