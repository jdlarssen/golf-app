// native/app/src/components/WebLinkButton.test.tsx
// Native #1891: den ene render-testen (Type C) for lenke-knappen.
//
// Alt som kan svares av en ren funksjon står i `lib/webLink.test.ts` —
// sti-sammensettingen, env-fella og at `openWeb` ikke kaster. Ingenting av det
// gjentas her.
//
// Igjen står de to koblingene ingen ren funksjon kan bekrefte:
//
//  1. **Trykket åpner den stien knappen lovet.** Knappen tar en sti og en
//     etikett fra kallstedet; går de fra hverandre, sender vi arrangøren til
//     feil side uten at noe feiler.
//  2. **En feil blir SYNLIG.** Hele grunnen til at knappen finnes er at en
//     setning uten vei videre er en blindvei. En knapp som ikke åpner noe og
//     heller ikke sier fra, er den samme blindveien med et trykk i.
import { Linking } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { WEB_LINK_TEXT } from '../lib/webLink';
import { WebLinkButton } from './WebLinkButton';

const BASE_URL = 'https://staging.example';

describe('WebLinkButton', () => {
  // Samme forbehold som i `webLink.test.ts`: `Linking.openURL` er alt en
  // jest-expo-mock, og `restoreAllMocks` gir den ikke tilbake — spionen tas
  // her og nullstilles eksplisitt.
  let openURL: jest.SpyInstance<Promise<boolean>, [string]>;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_WEB_BASE_URL = BASE_URL;
    openURL = jest.spyOn(Linking, 'openURL');
    openURL.mockReset();
    openURL.mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.EXPO_PUBLIC_WEB_BASE_URL;
  });

  it('åpner stien den fikk, og sier ifra når bygget mangler adressen', async () => {
    const { rerender } = await render(
      <WebLinkButton
        label="Lever lagkortet på nettsiden"
        path="/games/game-1/submit"
        testID="web-link-submit"
      />,
    );

    // Underteksten står FØR trykket: innloggingen på andre siden skal ikke
    // være en overraskelse.
    expect(screen.getByText(WEB_LINK_TEXT.hint)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('web-link-submit'));
    await waitFor(() => {
      expect(openURL).toHaveBeenCalledWith(`${BASE_URL}/games/game-1/submit`);
    });
    expect(screen.queryByText(WEB_LINK_TEXT.missingBaseUrl)).toBeNull();

    // Bygget uten server-adresse: knappen står der, men kan ikke åpne noe.
    // Da skal den si det — aldri gjøre ingenting i stillhet.
    delete process.env.EXPO_PUBLIC_WEB_BASE_URL;
    openURL.mockClear();
    await rerender(
      <WebLinkButton
        label="Lever lagkortet på nettsiden"
        path="/games/game-1/submit"
        testID="web-link-submit"
      />,
    );
    await fireEvent.press(screen.getByTestId('web-link-submit'));

    await waitFor(() => {
      expect(screen.getByText(WEB_LINK_TEXT.missingBaseUrl)).toBeTruthy();
    });
    expect(openURL).not.toHaveBeenCalled();
  });
});
