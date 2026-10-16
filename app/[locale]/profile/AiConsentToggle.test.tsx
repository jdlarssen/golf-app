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
  it('shows the answer, saves a flip, and rolls back with a line when the save fails', async () => {
    setAiConsentMock.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false });
    render(<AiConsentToggle initialGranted={false} />);
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle);
    await waitFor(() => expect(setAiConsentMock).toHaveBeenCalledWith(true));
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByTestId('ai-consent-toggle-error')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByTestId('ai-consent-toggle-error')).toBeInTheDocument());
    expect(setAiConsentMock).toHaveBeenLastCalledWith(false);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });
});
