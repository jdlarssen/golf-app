// native/app/src/components/AiConsentGate.test.tsx
// #2561 PR B: porten for spørsmålet om AI-tekster (Type C).
//
// Hva porten avgjør (husket, uten nett, feil, tak) er Type A i
// `data/aiConsentGate.test.ts`. Her sjekkes det bare en render kan bekrefte:
// begge knappene finnes, lagrer riktig svar, og slipper spilleren inn i appen.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Text } from 'react-native';
import { AI_CONSENT_TEXT } from '../lib/aiConsentCopy';
import { saveAiConsent } from '../data/aiConsent';
import { aiConsentStepFor, rememberAiConsentAnswered } from '../data/aiConsentGate';
import { AiConsentGate } from './AiConsentGate';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../data/aiConsent', () => ({ saveAiConsent: jest.fn() }));
jest.mock('../data/aiConsentGate', () => ({
  aiConsentStepFor: jest.fn(),
  rememberAiConsentAnswered: jest.fn(),
}));
// Skjermen leser innfellingen. Uten app-rotas SafeAreaProvider gir pakkens
// egen mock innfelling 0, som i `CompleteProfile.test.tsx`.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

describe('AiConsentGate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (aiConsentStepFor as jest.Mock).mockResolvedValue(true);
    (saveAiConsent as jest.Mock).mockResolvedValue({ ok: true });
  });

  it.each([
    { button: 'ai-consent-yes', granted: true },
    { button: 'ai-consent-no', granted: false },
  ])('$button lagrer svaret og slipper spilleren inn, også etter en lagring som feilet', async ({ button, granted }) => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    (saveAiConsent as jest.Mock).mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true });
    await render(
      <AiConsentGate userId="user-me">
        <Text testID="app-stack">Appen</Text>
      </AiConsentGate>,
    );

    await waitFor(() => expect(screen.getByTestId('ai-consent-yes')).toBeTruthy());
    expect(screen.getByTestId('ai-consent-no')).toBeTruthy();

    await fireEvent.press(screen.getByTestId(button));
    // Feilet: skjermen står, sier fra og leser det opp.
    await waitFor(() => expect(screen.getByTestId('ai-consent-error')).toBeTruthy());
    expect(announce).toHaveBeenCalledWith(AI_CONSENT_TEXT.saveFailed);

    await fireEvent.press(screen.getByTestId(button));
    await waitFor(() => expect(screen.getByTestId('app-stack')).toBeTruthy());
    expect(saveAiConsent).toHaveBeenCalledWith('user-me', granted);
    expect(rememberAiConsentAnswered).toHaveBeenCalledWith('user-me');
  });
});
