import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AiConsentHomeNudge } from './AiConsentHomeNudge';

// #2561 PR B: the AI question on Home (Type C). Whether the card shows at all
// is the queue (`lib/home/nudgeQueue.test.ts`) and `HomeNudges`; here only
// what a render can confirm.
const setAiConsentMock = vi.fn();
vi.mock('@/app/[locale]/profile/actions', () => ({
  setAiConsent: (granted: boolean) => setAiConsentMock(granted),
}));

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe('AiConsentHomeNudge', () => {
  it.each([
    { button: 'ai-consent-home-yes', granted: true },
    { button: 'ai-consent-home-no', granted: false },
  ])('$button saves the answer; the card stays on a failed save and goes away after one that worked', async ({ button, granted }) => {
    setAiConsentMock.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true });
    render(<AiConsentHomeNudge />);
    expect(screen.getByTestId('ai-consent-home-yes')).toBeInTheDocument();
    expect(screen.getByTestId('ai-consent-home-no')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId(button));
    await waitFor(() => expect(screen.getByTestId('ai-consent-home-error')).toBeInTheDocument());
    expect(screen.getByTestId('ai-consent-home-nudge')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId(button));
    await waitFor(() => expect(screen.queryByTestId('ai-consent-home-nudge')).not.toBeInTheDocument());
    expect(setAiConsentMock).toHaveBeenCalledTimes(2);
    expect(setAiConsentMock).toHaveBeenLastCalledWith(granted);
  });
});
