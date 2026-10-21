// #1954 D3: felles stand-in for `react-native-safe-area-context` i skjermtestene.
//
// Skjermene leser `useSafeAreaInsets()` for bunnluften over systemlinja
// (hjemindikatoren på iPhone, navigasjonslinja på Android). Uten navigatorens
// SafeAreaProvider kaster den ekte hooken, og pakkens egen mock gir alltid 0.
// Denne gir pakkens mock med én innfelling testen selv styrer:
//
//   jest.mock('react-native-safe-area-context', () =>
//     require('../test/safeAreaMock').safeAreaMock(),
//   );
//
// og i testen `setBottomInset(48)` (Android med tre knapper) før render.
/* eslint-disable @typescript-eslint/no-require-imports -- kalles fra jest.mock-fabrikker, som heises over importene */
import { StyleSheet } from 'react-native';
import { screen } from '@testing-library/react-native';

const insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Fabrikken til `jest.mock('react-native-safe-area-context', …)`. */
export function safeAreaMock(): Record<string, unknown> {
  return {
    ...(require('react-native-safe-area-context/jest/mock') as { default: Record<string, unknown> }).default,
    useSafeAreaInsets: () => insets,
  };
}

/** Systemlinjas høyde i bunnen. Sett den tilbake til 0 etter testen. */
export function setBottomInset(bottom: number): void {
  insets.bottom = bottom;
}

/**
 * Bunnluften i en ScrollView: `paddingBottom`, eller `padding` når den ikke er
 * satt (`ui.scroll` setter bare `padding: 20`).
 */
export function bottomPadding(testID: string): unknown {
  const style = StyleSheet.flatten(screen.getByTestId(testID).props.contentContainerStyle) as {
    paddingBottom?: unknown;
    padding?: unknown;
  };
  return style.paddingBottom ?? style.padding;
}
